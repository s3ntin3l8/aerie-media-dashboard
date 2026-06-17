// ============================================================
// AERIE — service registry (server-only)
// Reads service config + decrypted secrets from the DB. Returns empty
// results when the DB is unavailable (no mock fallback).
// ============================================================
import "server-only";
import { eq, and, isNotNull, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { ensureDb } from "@/lib/db/bootstrap";
import { decrypt } from "@/lib/crypto";
import { hashPassword } from "@/lib/auth/password";
import { matchPreset } from "@/lib/servicePresets";
import type { Category, DashboardStore } from "@/lib/types";

export interface ServiceConfig {
  id: string;
  name: string;
  cat: Category;
  icon: string;
  logoSlug: string | null;
  embeddable: boolean;
  central: boolean;
  centralLabel: string | null;
  host: string;
  baseUrl: string;
  /** optional internal/LAN URL for server-side API calls; null → use baseUrl */
  internalUrl: string | null;
  version: string | null;
  note: string | null;
  sortOrder: number;
  monitoringKey: string | null;
  /** optional LogQL stream selector for the admin Loki logs viewer; null → inferred {container="<id>"} */
  lokiQuery: string | null;
  /** skip TLS cert verification for this service's server-side API calls (self-signed LAN hosts) */
  insecureTls: boolean;
  /** false → fully disabled: hidden from every end-user surface and never polled (config kept) */
  active: boolean;
  /** true → keep the embeddable iframe mounted (hidden) after first open to preserve in-app state */
  keepAlive: boolean;
}

export async function getServiceConfigs(): Promise<ServiceConfig[]> {
  try {
    await ensureDb();
    const rows = await db.select().from(schema.services).orderBy(schema.services.sortOrder);
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      cat: r.cat as Category,
      icon: r.icon,
      logoSlug: r.logoSlug,
      embeddable: r.embeddable,
      central: r.central,
      centralLabel: r.centralLabel,
      host: r.host,
      baseUrl: r.baseUrl || `https://${r.host}`,
      internalUrl: r.internalUrl ?? null,
      version: r.version,
      note: r.note,
      sortOrder: r.sortOrder,
      monitoringKey: r.monitoringKey ?? null,
      lokiQuery: r.lokiQuery ?? null,
      insecureTls: r.insecureTls,
      active: r.active,
      keepAlive: r.keepAlive,
    }));
  } catch {
    return [];
  }
}

/** Decrypted secret for a service, or null if none / DB unavailable. */
export async function getServiceSecret(serviceId: string, kind = "apiKey"): Promise<string | null> {
  try {
    await ensureDb();
    const rows = await db
      .select()
      .from(schema.serviceSecrets)
      .where(and(eq(schema.serviceSecrets.serviceId, serviceId), eq(schema.serviceSecrets.kind, kind)))
      .limit(1);
    if (rows.length === 0) return null;
    const row = rows[0];
    return decrypt({ iv: row.iv, authTag: row.authTag, ciphertext: row.ciphertext });
  } catch {
    return null;
  }
}

/**
 * Batch read of every stored secret of a given kind → `Map<serviceId, decrypted value>`.
 * One DB round-trip instead of one `getServiceSecret()` per service — the data facade calls
 * this once per poll for both `apiKey` and `forwardAuth` kinds rather than walking each config.
 * Rows that fail to decrypt are skipped (treated as absent, matching `getServiceSecret`'s
 * null-on-error contract). Returns an empty map when the DB is unavailable.
 */
export async function getAllServiceSecrets(kind = "apiKey"): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  try {
    await ensureDb();
    const rows = await db.select().from(schema.serviceSecrets).where(eq(schema.serviceSecrets.kind, kind));
    for (const row of rows) {
      try {
        out.set(row.serviceId, decrypt({ iv: row.iv, authTag: row.authTag, ciphertext: row.ciphertext }));
      } catch {
        /* skip undecryptable row — same as getServiceSecret returning null */
      }
    }
  } catch {
    /* DB unavailable → empty map */
  }
  return out;
}

export interface ServiceCredentials {
  baseUrl: string;
  apiKey: string | null;
  /** skip TLS cert verification for this service (self-signed LAN hosts) */
  insecureTls: boolean;
}

export async function getServiceCredentials(serviceId: string): Promise<ServiceCredentials | null> {
  const configs = await getServiceConfigs();
  const cfg = configs.find((c) => c.id === serviceId);
  if (!cfg) return null;
  const apiKey = await getServiceSecret(serviceId);
  // Server-side API calls prefer the internal/LAN URL when set; the public baseUrl
  // (used for the iframe embed) is the fallback.
  return { baseUrl: cfg.internalUrl || cfg.baseUrl, apiKey, insecureTls: cfg.insecureTls };
}

/** A service can be queried for live data only once a secret is stored. */
export async function isConfigured(serviceId: string): Promise<boolean> {
  return (await getServiceSecret(serviceId)) != null;
}

/** True when a config is an instance of a given preset logo — by its stored `logoSlug`
 *  or by its id/name resolving to that preset. Lets multiple renamed instances of one
 *  service type (e.g. `traefik-unraid`, `traefik-dockerhost`) be recognised as that type. */
export function configMatchesLogo(c: { id: string; name: string; logoSlug: string | null }, slug: string): boolean {
  if (c.logoSlug === slug) return true;
  return (matchPreset(c.id) ?? matchPreset(c.name))?.logoSlug === slug;
}

/** All service configs that are an instance of the given preset logo slug. */
export async function getServiceConfigsByLogo(slug: string): Promise<ServiceConfig[]> {
  const configs = await getServiceConfigs();
  return configs.filter((c) => configMatchesLogo(c, slug));
}

/** Per-user pinned-favorite service ids. Returns [] on no row / parse error / DB unavailable. */
export async function getFavorites(userId: string): Promise<string[]> {
  try {
    await ensureDb();
    const rows = await db.select({ favorites: schema.preferences.favorites }).from(schema.preferences).where(eq(schema.preferences.userId, userId)).limit(1);
    if (rows.length === 0 || !rows[0].favorites) return [];
    const parsed = JSON.parse(rows[0].favorites);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Persist a user's pinned favorites. Targeted upsert so `theme` (NOT NULL) is never clobbered. */
export async function setFavorites(userId: string, ids: string[]): Promise<void> {
  await ensureDb();
  const favorites = JSON.stringify(ids);
  await db
    .insert(schema.preferences)
    .values({ userId, favorites })
    .onConflictDoUpdate({ target: schema.preferences.userId, set: { favorites } });
}

/** Per-user modular-homescreen layouts (`{ admin?, user? }`). Returns null on no row / parse error / DB unavailable. */
export async function getDashboards(userId: string): Promise<DashboardStore | null> {
  try {
    await ensureDb();
    const rows = await db.select({ dashboards: schema.preferences.dashboards }).from(schema.preferences).where(eq(schema.preferences.userId, userId)).limit(1);
    if (rows.length === 0 || !rows[0].dashboards) return null;
    const parsed = JSON.parse(rows[0].dashboards);
    return parsed && typeof parsed === "object" ? (parsed as DashboardStore) : null;
  } catch {
    return null;
  }
}

/** Persist a user's per-role layouts. Targeted upsert so `theme` (NOT NULL) is never clobbered. */
export async function setDashboards(userId: string, store: DashboardStore): Promise<void> {
  await ensureDb();
  const dashboards = JSON.stringify(store);
  await db
    .insert(schema.preferences)
    .values({ userId, dashboards })
    .onConflictDoUpdate({ target: schema.preferences.userId, set: { dashboards } });
}

/** Read a deployment-wide setting. Returns null if the key has no row (not the same as ""). */
export async function getDeploymentSetting(key: string): Promise<string | null> {
  try {
    await ensureDb();
    const rows = await db.select().from(schema.deploymentSettings).where(eq(schema.deploymentSettings.key, key)).limit(1);
    return rows.length > 0 ? rows[0].value : null;
  } catch {
    return null;
  }
}

/** Upsert a deployment-wide setting. */
export async function setDeploymentSetting(key: string, value: string): Promise<void> {
  await ensureDb();
  await db.insert(schema.deploymentSettings).values({ key, value })
    .onConflictDoUpdate({ target: schema.deploymentSettings.key, set: { value } });
}

export interface GroupRow {
  name: string;
  label: string | null;
}
export interface VisibilityRow {
  serviceId: string;
  groupName: string;
  visible: boolean;
}

export async function getGroups(): Promise<GroupRow[]> {
  try {
    await ensureDb();
    return await db.select().from(schema.groups);
  } catch {
    return [];
  }
}

export async function getVisibility(): Promise<VisibilityRow[]> {
  try {
    await ensureDb();
    const rows = await db.select().from(schema.serviceVisibility);
    return rows.map((r) => ({ serviceId: r.serviceId, groupName: r.groupName, visible: r.visible }));
  } catch {
    return [];
  }
}

export interface MemberRow {
  id: string;
  name: string;
  email: string;
  role: "admin" | "user";
  linked: boolean;
}

/** Portal members mirrored from the DB. */
export async function getMembers(): Promise<MemberRow[]> {
  try {
    await ensureDb();
    const rows = await db
      .select({
        id: schema.users.id,
        name: schema.users.name,
        email: schema.users.email,
        role: schema.users.role,
        linked: schema.accountLinks.linked,
      })
      .from(schema.users)
      .leftJoin(schema.accountLinks, eq(schema.users.id, schema.accountLinks.portalUserId));
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      role: (r.role as "admin" | "user") ?? "user",
      linked: Boolean(r.linked),
    }));
  } catch {
    return [];
  }
}

/** Upsert the signed-in user into the members table (called on each request). */
export async function mirrorUser(u: { id: string; name: string; email: string; role: "admin" | "user" }): Promise<void> {
  try {
    await ensureDb();
    await db
      .insert(schema.users)
      .values({ id: u.id, name: u.name, email: u.email, role: u.role, createdAt: new Date() })
      .onConflictDoUpdate({ target: schema.users.id, set: { name: u.name, email: u.email, role: u.role } });
    await db.insert(schema.accountLinks).values({ portalUserId: u.id, linked: false }).onConflictDoNothing();
  } catch {
    /* mirroring is best-effort */
  }
}

// ── Local-credentials accounts (fallback when OIDC is not configured) ──

export interface LocalUser {
  id: string;
  name: string;
  email: string;
  role: "admin" | "user";
  passwordHash: string | null;
}

/** Look up a user (incl. password hash) by email, case-insensitively. */
export async function getUserByEmail(email: string): Promise<LocalUser | null> {
  try {
    await ensureDb();
    const target = email.trim().toLowerCase();
    const rows = await db
      .select({
        id: schema.users.id,
        name: schema.users.name,
        email: schema.users.email,
        role: schema.users.role,
        passwordHash: schema.users.passwordHash,
      })
      .from(schema.users)
      .where(sql`LOWER(${schema.users.email}) = ${target}`);
    const row = rows[0];
    if (!row) return null;
    return { id: row.id, name: row.name, email: row.email, role: (row.role as "admin" | "user") ?? "user", passwordHash: row.passwordHash };
  } catch {
    return null;
  }
}

/** True once at least one local admin account (password set) exists. */
export async function localAdminExists(): Promise<boolean> {
  try {
    await ensureDb();
    const rows = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(and(eq(schema.users.role, "admin"), isNotNull(schema.users.passwordHash)))
      .limit(1);
    return rows.length > 0;
  } catch {
    return false;
  }
}

/** Create the first-run local admin account. Caller must enforce the setup guard. */
export async function createLocalAdmin(u: { name: string; email: string; password: string }): Promise<boolean> {
  await ensureDb();
  const id = u.email.trim().toLowerCase();
  await db
    .insert(schema.users)
    .values({ id, name: u.name, email: id, role: "admin", passwordHash: hashPassword(u.password), createdAt: new Date() })
    .onConflictDoNothing();
  const [row] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.id, id)).limit(1);
  if (!row) return false;
  await db.insert(schema.accountLinks).values({ portalUserId: id, linked: false }).onConflictDoNothing();
  return true;
}

/** Persist a freshly-detected version string for a service. */
export async function updateServiceVersion(serviceId: string, version: string): Promise<void> {
  await ensureDb();
  await db.update(schema.services).set({ version }).where(eq(schema.services.id, serviceId));
}

