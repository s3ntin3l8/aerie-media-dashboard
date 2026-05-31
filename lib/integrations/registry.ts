// ============================================================
// AERIE — service registry (server-only)
// Reads service config + decrypted secrets from the DB, falling
// back to the design's mock services when the DB is unavailable.
// ============================================================
import "server-only";
import { eq, and } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { ensureDb } from "@/lib/db/bootstrap";
import { decrypt } from "@/lib/crypto";
import { SERVICES as MOCK_SERVICES } from "@/lib/mock/data";
import type { Category } from "@/lib/types";

export interface ServiceConfig {
  id: string;
  name: string;
  cat: Category;
  icon: string;
  embeddable: boolean;
  central: boolean;
  centralLabel: string | null;
  host: string;
  baseUrl: string;
  version: string | null;
  note: string | null;
  sortOrder: number;
}

function mockConfigs(): ServiceConfig[] {
  return MOCK_SERVICES.map((s, i) => ({
    id: s.id,
    name: s.name,
    cat: s.cat,
    icon: s.icon,
    embeddable: s.embeddable,
    central: Boolean(s.central),
    centralLabel: s.centralLabel ?? null,
    host: s.host,
    baseUrl: `https://${s.host}`,
    version: s.version,
    note: s.note,
    sortOrder: i,
  }));
}

export async function getServiceConfigs(): Promise<ServiceConfig[]> {
  try {
    await ensureDb();
    const rows = await db.select().from(schema.services).orderBy(schema.services.sortOrder);
    if (rows.length === 0) return mockConfigs();
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      cat: r.cat as Category,
      icon: r.icon,
      embeddable: r.embeddable,
      central: r.central,
      centralLabel: r.centralLabel,
      host: r.host,
      baseUrl: r.baseUrl || `https://${r.host}`,
      version: r.version,
      note: r.note,
      sortOrder: r.sortOrder,
    }));
  } catch {
    return mockConfigs();
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

export interface ServiceCredentials {
  baseUrl: string;
  apiKey: string | null;
}

export async function getServiceCredentials(serviceId: string): Promise<ServiceCredentials | null> {
  const configs = await getServiceConfigs();
  const cfg = configs.find((c) => c.id === serviceId);
  if (!cfg) return null;
  const apiKey = await getServiceSecret(serviceId);
  return { baseUrl: cfg.baseUrl, apiKey };
}

/** A service can be queried for live data only once a secret is stored. */
export async function isConfigured(serviceId: string): Promise<boolean> {
  return (await getServiceSecret(serviceId)) != null;
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

const MOCK_GROUPS: GroupRow[] = [
  { name: "admins", label: "Admins" },
  { name: "friends", label: "Friends" },
  { name: "guests", label: "Guests" },
];
const MOCK_VIS_RULE: Record<string, (cat: string, id: string) => boolean> = {
  admins: () => true,
  friends: (cat, id) => cat !== "infra" && id !== "prometheus",
  guests: (cat, id) => cat === "stream" || id === "overseerr",
};

export async function getGroups(): Promise<GroupRow[]> {
  try {
    await ensureDb();
    const rows = await db.select().from(schema.groups);
    return rows.length ? rows : MOCK_GROUPS;
  } catch {
    return MOCK_GROUPS;
  }
}

export async function getVisibility(): Promise<VisibilityRow[]> {
  try {
    await ensureDb();
    const rows = await db.select().from(schema.serviceVisibility);
    if (rows.length) return rows.map((r) => ({ serviceId: r.serviceId, groupName: r.groupName, visible: r.visible }));
  } catch {
    /* fall through to mock */
  }
  const configs = await getServiceConfigs();
  return configs.flatMap((c) => MOCK_GROUPS.map((g) => ({ serviceId: c.id, groupName: g.name, visible: MOCK_VIS_RULE[g.name](c.cat, c.id) })));
}

export interface MemberRow {
  id: string;
  name: string;
  email: string;
  role: "admin" | "user";
  reqQuota: number;
  linked: boolean;
}

/** Portal members mirrored from the DB. Empty array → facade falls back to mock. */
export async function getMembers(): Promise<MemberRow[]> {
  try {
    await ensureDb();
    const rows = await db
      .select({
        id: schema.users.id,
        name: schema.users.name,
        email: schema.users.email,
        role: schema.users.role,
        reqQuota: schema.users.reqQuota,
        linked: schema.accountLinks.linked,
      })
      .from(schema.users)
      .leftJoin(schema.accountLinks, eq(schema.users.id, schema.accountLinks.portalUserId));
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      role: (r.role as "admin" | "user") ?? "user",
      reqQuota: r.reqQuota,
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
      .values({ id: u.id, name: u.name, email: u.email, role: u.role, reqQuota: 5, createdAt: new Date() })
      .onConflictDoUpdate({ target: schema.users.id, set: { name: u.name, email: u.email, role: u.role } });
    await db.insert(schema.accountLinks).values({ portalUserId: u.id, linked: false }).onConflictDoNothing();
  } catch {
    /* mirroring is best-effort */
  }
}

