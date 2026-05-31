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
  host: string;
  baseUrl?: string;
  embeddable?: boolean;
  central?: boolean;
  centralLabel?: string | null;
  version?: string | null;
  note?: string | null;
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
    host: input.host,
    baseUrl: input.baseUrl || `https://${input.host}`,
    embeddable: input.embeddable ?? false,
    central: input.central ?? false,
    centralLabel: input.centralLabel ?? null,
    version: input.version ?? null,
    note: input.note ?? null,
  };
  await db
    .insert(schema.services)
    .values(values)
    .onConflictDoUpdate({ target: schema.services.id, set: values });
  revalidatePath("/admin");
}
