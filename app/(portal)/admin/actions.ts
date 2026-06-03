"use server";
// ============================================================
// AERIE — admin mutations (server actions). Admin-guarded.
// ============================================================
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { ensureDb } from "@/lib/db/bootstrap";
import { encrypt } from "@/lib/crypto";
import { getSessionUser } from "@/lib/session";
import { setDeploymentSetting } from "@/lib/integrations/registry";
import { prometheusInstances, detectVersion, probeVersion } from "@/lib/integrations/clients";

async function requireAdmin() {
  const user = await getSessionUser();
  if (user.role !== "admin") throw new Error("forbidden");
}

/** Toggle whether a group can see a service. */
export async function setVisibility(serviceId: string, groupName: string, visible: boolean) {
  await requireAdmin();
  await ensureDb();
  await db
    .insert(schema.serviceVisibility)
    .values({ serviceId, groupName, visible })
    .onConflictDoUpdate({ target: [schema.serviceVisibility.serviceId, schema.serviceVisibility.groupName], set: { visible } });
  revalidatePath("/admin");
}

/** Set a member's request quota (portal-side cap). */
export async function setUserQuota(userId: string, quota: number) {
  await requireAdmin();
  await ensureDb();
  const n = Math.max(0, Math.floor(Number(quota) || 0));
  await db.update(schema.users).set({ reqQuota: n }).where(eq(schema.users.id, userId));
  revalidatePath("/admin");
}

/** Store (encrypted) or clear a service's API key. */
export async function setServiceSecret(serviceId: string, plaintext: string) {
  await requireAdmin();
  await ensureDb();
  if (!plaintext) {
    await db.delete(schema.serviceSecrets).where(eq(schema.serviceSecrets.serviceId, serviceId));
  } else {
    const enc = encrypt(plaintext);
    await db
      .insert(schema.serviceSecrets)
      .values({ serviceId, kind: "apiKey", iv: enc.iv, authTag: enc.authTag, ciphertext: enc.ciphertext, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: [schema.serviceSecrets.serviceId, schema.serviceSecrets.kind],
        set: { iv: enc.iv, authTag: enc.authTag, ciphertext: enc.ciphertext, updatedAt: new Date() },
      });
  }
  revalidatePath("/admin");
}

export interface ServiceInput {
  id: string;
  name: string;
  cat: string;
  icon: string;
  logoSlug?: string | null;
  host: string;
  baseUrl?: string;
  embeddable?: boolean;
  central?: boolean;
  centralLabel?: string | null;
  version?: string | null;
  note?: string | null;
  monitoringKey?: string | null;
}

/** Create or update a service registry entry. */
export async function upsertService(input: ServiceInput) {
  await requireAdmin();
  await ensureDb();
  const values = {
    id: input.id,
    name: input.name,
    cat: input.cat,
    icon: input.icon,
    logoSlug: input.logoSlug ?? null,
    host: input.host,
    baseUrl: input.baseUrl || `https://${input.host}`,
    embeddable: input.embeddable ?? false,
    central: input.central ?? false,
    centralLabel: input.centralLabel ?? null,
    version: input.version ?? null,
    note: input.note ?? null,
    monitoringKey: input.monitoringKey ?? null,
  };
  await db
    .insert(schema.services)
    .values(values)
    .onConflictDoUpdate({ target: schema.services.id, set: values });
  revalidatePath("/admin");
}

/** True if a service id already exists (used to guard add-mode slug collisions). */
export async function serviceExists(id: string): Promise<boolean> {
  await ensureDb();
  const rows = await db.select({ id: schema.services.id }).from(schema.services).where(eq(schema.services.id, id)).limit(1);
  return rows.length > 0;
}

/** Remove a service (secrets + visibility cascade via FK). */
export async function deleteService(id: string) {
  await requireAdmin();
  await ensureDb();
  await db.delete(schema.services).where(eq(schema.services.id, id));
  revalidatePath("/admin");
}

/**
 * Detect a service's version from its upstream API using the stored credentials.
 * Writes the result to the DB if found. Returns the detected version or null.
 */
export async function detectServiceVersion(serviceId: string): Promise<string | null> {
  await requireAdmin();
  const version = await detectVersion(serviceId);
  if (version) {
    await ensureDb();
    await db.update(schema.services).set({ version }).where(eq(schema.services.id, serviceId));
    revalidatePath("/admin");
  }
  return version;
}

/**
 * Transient version probe using explicit credentials — no DB reads or writes.
 * Used by the add-service modal before the service is saved.
 */
export async function probeServiceVersion(baseUrl: string, apiKey: string, idHint: string): Promise<string | null> {
  await requireAdmin();
  return probeVersion(baseUrl, apiKey, idHint);
}

/**
 * Test the stored connection for a service without modifying any data.
 * Returns the detected version string on success, null on failure.
 */
export async function testStoredConnection(serviceId: string): Promise<string | null> {
  await requireAdmin();
  return detectVersion(serviceId);
}

/**
 * Persist the deployment-wide Prometheus instance filter.
 * null → write the all-nodes sentinel ("") which suppresses the env fallback.
 */
export async function setPrometheusInstance(instance: string | null): Promise<void> {
  await requireAdmin();
  if (instance !== null && instance !== "") {
    const known = await prometheusInstances().catch(() => null);
    if (known && !known.includes(instance)) throw new Error(`Unknown Prometheus instance: ${instance}`);
  }
  await setDeploymentSetting("prometheusInstance", instance ?? "");
  revalidatePath("/status");
}
