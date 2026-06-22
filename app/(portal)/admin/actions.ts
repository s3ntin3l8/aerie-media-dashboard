"use server";
// ============================================================
// AERIE — admin mutations (server actions). Admin-guarded.
// ============================================================
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { ensureDb } from "@/lib/db/bootstrap";
import { encrypt } from "@/lib/crypto";
import { parseForwardAuthConfig, getForwardAuthConfig, type ForwardAuthConfig } from "@/lib/integrations/forwardAuth";
import { getSessionUser } from "@/lib/session";
import { setDeploymentSetting, getDeploymentSetting, invalidateRegistryCache, getServiceConfigs, getServiceSecret, configMatchesLogo } from "@/lib/integrations/registry";
import { prometheusInstances, beszelSystems, detectVersion, probeVersion, overseerrUsers, overseerrUpdateUserQuota, matchOverseerrUserId, portainerEndpoints, portainerContainers, portainerRestartContainer } from "@/lib/integrations/clients";
import type { OverseerrQuotaSettings } from "@/lib/integrations/clients";

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
  invalidateRegistryCache();
  revalidatePath("/admin");
}

/** Write a member's movie + TV request quotas to Overseerr. */
export async function setUserOverseerrQuota(userId: string, settings: OverseerrQuotaSettings) {
  await requireAdmin();
  await ensureDb();
  const rows = await db.select({ email: schema.users.email }).from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  const email = rows[0]?.email;
  if (!email) throw new Error("User not found");
  const oUsers = await overseerrUsers();
  const oUserId = matchOverseerrUserId(oUsers, email);
  if (oUserId == null) throw new Error("User has no Overseerr account");
  await overseerrUpdateUserQuota(oUserId, settings);
  revalidatePath("/admin");
}

/** Store (encrypted) or clear a service's API key. */
export async function setServiceSecret(serviceId: string, plaintext: string) {
  await requireAdmin();
  await ensureDb();
  if (!plaintext) {
    await db
      .delete(schema.serviceSecrets)
      .where(and(eq(schema.serviceSecrets.serviceId, serviceId), eq(schema.serviceSecrets.kind, "apiKey")));
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
  invalidateRegistryCache();
  revalidatePath("/admin");
}

/** Store (encrypted) a service's authentik forward-auth config — a separate `forwardAuth`-kind
 *  secret, so it coexists with the service's own apiKey. (Clearing is a distinct action below,
 *  so no caller-controlled value decides write-vs-delete.) */
export async function setServiceForwardAuth(serviceId: string, config: ForwardAuthConfig) {
  await requireAdmin();
  await ensureDb();
  const json = JSON.stringify(config);
  if (!parseForwardAuthConfig(json)) throw new Error("Invalid forward-auth config");
  const enc = encrypt(json);
  await db
    .insert(schema.serviceSecrets)
    .values({ serviceId, kind: "forwardAuth", iv: enc.iv, authTag: enc.authTag, ciphertext: enc.ciphertext, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [schema.serviceSecrets.serviceId, schema.serviceSecrets.kind],
      set: { iv: enc.iv, authTag: enc.authTag, ciphertext: enc.ciphertext, updatedAt: new Date() },
    });
  invalidateRegistryCache();
  revalidatePath("/admin");
}

/** A forward-auth config as entered in the Admin edit form: same shape as ForwardAuthConfig but
 *  the password may be blank, meaning "keep the currently stored password". */
export type ForwardAuthInput =
  | { method: "basic"; username: string; password: string }
  | { method: "bearer"; tokenUrl: string; clientId: string; username: string; password: string; scope?: string };

/** Write a service's forward-auth config from the edit form, preserving the stored password when
 *  the admin leaves the password field blank (so editing a non-secret field — username, token URL —
 *  doesn't require re-typing the secret). Throws if the password is blank and nothing is stored. */
export async function mergeServiceForwardAuth(serviceId: string, input: ForwardAuthInput) {
  await requireAdmin();
  await ensureDb();
  let password = input.password;
  if (!password.trim()) {
    const existing = await getForwardAuthConfig(serviceId);
    if (!existing) throw new Error("Forward-auth password is required");
    password = existing.password;
  }
  const config = { ...input, password } as ForwardAuthConfig;
  await setServiceForwardAuth(serviceId, config);
}

/** Remove a service's stored authentik forward-auth config. */
export async function clearServiceForwardAuth(serviceId: string) {
  await requireAdmin();
  await ensureDb();
  await db
    .delete(schema.serviceSecrets)
    .where(and(eq(schema.serviceSecrets.serviceId, serviceId), eq(schema.serviceSecrets.kind, "forwardAuth")));
  invalidateRegistryCache();
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
  internalUrl?: string | null;
  embeddable?: boolean;
  central?: boolean;
  centralLabel?: string | null;
  version?: string | null;
  note?: string | null;
  monitoringKey?: string | null;
  lokiQuery?: string | null;
  containerName?: string | null;
  portainerEndpointId?: string | null;
  insecureTls?: boolean;
  active?: boolean;
  keepAlive?: boolean;
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
    internalUrl: input.internalUrl?.trim() || null,
    embeddable: input.embeddable ?? false,
    central: input.central ?? false,
    centralLabel: input.centralLabel ?? null,
    version: input.version ?? null,
    note: input.note ?? null,
    monitoringKey: input.monitoringKey ?? null,
    lokiQuery: input.lokiQuery?.trim() || null,
    containerName: input.containerName?.trim() || null,
    portainerEndpointId: input.portainerEndpointId?.trim() || null,
    insecureTls: input.insecureTls ?? false,
    active: input.active ?? true,
    keepAlive: input.keepAlive ?? false,
  };
  await db
    .insert(schema.services)
    .values(values)
    .onConflictDoUpdate({ target: schema.services.id, set: values });
  invalidateRegistryCache();
  revalidatePath("/admin");
}

/** Flip a service active/inactive without opening the edit modal (inline Admin toggle). */
export async function setServiceActive(id: string, active: boolean) {
  await requireAdmin();
  await ensureDb();
  await db.update(schema.services).set({ active }).where(eq(schema.services.id, id));
  invalidateRegistryCache();
  revalidatePath("/admin");
}

/** Flip a service's keep-alive flag without opening the edit modal (inline Admin toggle).
 *  When on, EmbedHost keeps the embeddable service's iframe mounted (hidden) after first open. */
export async function setServiceKeepAlive(id: string, keepAlive: boolean) {
  await requireAdmin();
  await ensureDb();
  await db.update(schema.services).set({ keepAlive }).where(eq(schema.services.id, id));
  invalidateRegistryCache();
  revalidatePath("/admin");
}

/** True if a service id already exists (used to guard add-mode slug collisions). */
export async function serviceExists(id: string): Promise<boolean> {
  await requireAdmin();
  await ensureDb();
  const rows = await db.select({ id: schema.services.id }).from(schema.services).where(eq(schema.services.id, id)).limit(1);
  return rows.length > 0;
}

/** Remove a service (secrets + visibility cascade via FK). */
export async function deleteService(id: string) {
  await requireAdmin();
  await ensureDb();
  await db.delete(schema.services).where(eq(schema.services.id, id));
  invalidateRegistryCache();
  revalidatePath("/admin");
}

/**
 * Restart a service's container via Portainer (admin-only). Resolves the single configured
 * Portainer instance (an active service carrying the `portainer` logo + a stored token), then
 * the container + endpoint, and calls Portainer's proxied Docker restart endpoint. The control
 * plane is never in the client bundle — this is a server action, not a route — and admin is
 * re-checked here (defence in depth), not just hidden in the UI. AERIE never mounts the Docker
 * socket; everything goes through the stored Portainer token.
 *
 * Zero-config by default: the container name falls back to the service **id** (the common compose
 * convention where the container is named after the slug), and when the endpoint isn't pinned we
 * search every endpoint for a container whose Docker name matches (case-insensitively) and restart
 * it by its **exact** name on the endpoint that actually hosts it. This makes the multi-endpoint
 * (Portainer agent) topology work without pinning an endpoint per service, and corrects case
 * (e.g. "jellyfin" → "Jellyfin"). An explicit container name overrides the id (e.g. overseerr's
 * container is "seerr"); pinning both the name and the endpoint takes a direct fast path.
 *
 * Throws a human-readable Error on any gap (no Portainer, container not found) so the caller can
 * surface it in a toast.
 */
export async function restartServiceContainer(serviceId: string): Promise<void> {
  await requireAdmin();
  const configs = await getServiceConfigs();
  const target = configs.find((c) => c.id === serviceId);
  if (!target) throw new Error("Service not found");
  // Default the container name to the service id — the common compose convention — so a service
  // whose container matches its slug is restartable with zero per-service config.
  const wantName = target.containerName?.trim() || target.id;

  // The Portainer instance: an active service carrying the portainer logo WITH a stored token
  // (same gate as the snapshot's `portainerOn`, so the button and the action agree — a tokenless
  // portainer-logo service sorted first never shadows a configured one).
  const portainerCandidates = configs.filter((c) => c.active && configMatchesLogo(c, "portainer"));
  let portainerCfg: (typeof portainerCandidates)[number] | undefined;
  let token: string | null = null;
  for (const c of portainerCandidates) {
    const t = await getServiceSecret(c.id);
    if (t) { portainerCfg = c; token = t; break; }
  }
  if (!portainerCfg || !token) {
    throw new Error(portainerCandidates.length ? "Portainer API token is not set" : "Portainer is not configured");
  }

  const pinnedEndpoint = target.portainerEndpointId?.trim() || "";

  // Fast path: admin pinned BOTH an explicit container name and the endpoint → trust it and
  // restart directly (exact intent, one call, no container listing).
  if (target.containerName?.trim() && pinnedEndpoint) {
    await portainerRestartContainer(portainerCfg.id, pinnedEndpoint, wantName);
    return;
  }

  // Otherwise resolve by listing containers: across the pinned endpoint, or every endpoint when
  // none is pinned. Match the wanted name case-insensitively, then restart by the container's
  // EXACT Docker name on the endpoint that hosts it.
  const endpointIds = pinnedEndpoint
    ? [pinnedEndpoint]
    : (await portainerEndpoints(portainerCfg.id)).map((e) => String(e.Id));
  if (endpointIds.length === 0) throw new Error("No Portainer endpoints found");

  const wantLc = wantName.toLowerCase();
  for (const endpointId of endpointIds) {
    const containers = await portainerContainers(portainerCfg.id, endpointId).catch(() => []);
    const match = containers.find((c) => c.Names.some((n) => n.replace(/^\//, "").toLowerCase() === wantLc));
    if (match) {
      const exactName = (match.Names[0] ?? wantName).replace(/^\//, "");
      await portainerRestartContainer(portainerCfg.id, endpointId, exactName);
      return;
    }
  }
  throw new Error(
    pinnedEndpoint
      ? `Container "${wantName}" not found on the pinned Portainer endpoint`
      : `Container "${wantName}" not found on any Portainer endpoint`,
  );
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
    invalidateRegistryCache();
    revalidatePath("/admin");
  }
  return version;
}

/**
 * Transient version probe using explicit credentials — no DB reads or writes.
 * Used by the add-service modal before the service is saved.
 */
export async function probeServiceVersion(baseUrl: string, apiKey: string, idHint: string, insecureTls = false): Promise<string | null> {
  await requireAdmin();
  return probeVersion(baseUrl, apiKey, idHint, insecureTls);
}

/**
 * Test the stored connection for a service without modifying any data.
 * Returns the detected version string on success, null on failure.
 */
export async function testStoredConnection(serviceId: string): Promise<string | null> {
  await requireAdmin();
  const version = await detectVersion(serviceId);
  if (version) {
    await ensureDb();
    await db.update(schema.services).set({ version }).where(eq(schema.services.id, serviceId));
    invalidateRegistryCache();
    revalidatePath("/admin");
  }
  return version;
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
  revalidatePath("/admin");
}

/** Parse the persisted Traefik dismissed-hosts list (lowercased). Tolerant of malformed JSON. */
async function readTraefikDismissed(): Promise<string[]> {
  try {
    const raw = await getDeploymentSetting("traefikDismissed");
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string").map((h) => h.toLowerCase()) : [];
  } catch {
    return [];
  }
}

/** Hide a Traefik-discovered host from the "Discovered" suggestions panel (persisted, idempotent). */
export async function dismissTraefikHost(host: string): Promise<void> {
  await requireAdmin();
  const h = host.trim().toLowerCase();
  if (!h) return;
  const current = await readTraefikDismissed();
  if (!current.includes(h)) current.push(h);
  await setDeploymentSetting("traefikDismissed", JSON.stringify(current));
  revalidatePath("/admin");
}

/** Restore a previously dismissed Traefik host so it can reappear as a suggestion. */
export async function restoreTraefikHost(host: string): Promise<void> {
  await requireAdmin();
  const h = host.trim().toLowerCase();
  const current = (await readTraefikDismissed()).filter((x) => x !== h);
  await setDeploymentSetting("traefikDismissed", JSON.stringify(current));
  revalidatePath("/admin");
}

/** Select which source fills the System Status metric cards (when both are configured). */
export async function setMetricsSource(source: "prometheus" | "beszel"): Promise<void> {
  await requireAdmin();
  if (source !== "prometheus" && source !== "beszel") throw new Error(`Unknown metrics source: ${source}`);
  await setDeploymentSetting("metricsSource", source);
  revalidatePath("/status");
  revalidatePath("/admin");
}

/** Select which source fills the Download Queue panel. */
export async function setQueueSource(source: "arr" | "nzbget" | "qbittorrent"): Promise<void> {
  await requireAdmin();
  if (source !== "arr" && source !== "nzbget" && source !== "qbittorrent") throw new Error(`Unknown queue source: ${source}`);
  await setDeploymentSetting("queueSource", source);
  revalidatePath("/");
}

/**
 * Persist which Beszel system the metric cards display (stores the system id).
 * null → write the sentinel ("") so the picker falls back to the first system.
 */
export async function setBeszelSystem(systemId: string | null): Promise<void> {
  await requireAdmin();
  if (systemId) {
    const known = await beszelSystems().catch(() => null);
    if (known && !known.some((s) => s.id === systemId)) throw new Error(`Unknown Beszel system: ${systemId}`);
  }
  await setDeploymentSetting("beszelSystem", systemId ?? "");
  revalidatePath("/status");
  revalidatePath("/admin");
}
