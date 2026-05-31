// ============================================================
// AERIE — seed the config DB from the design's mock data.
// Pure (no server-only) so it runs from both the CLI seed script
// and the runtime bootstrap. Idempotent via onConflictDoNothing.
// ============================================================
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema";
import { SERVICES, USERS } from "../mock/data";
import type { Service } from "../types";

type DB = LibSQLDatabase<typeof schema>;

const GROUPS: [string, string][] = [
  ["admins", "Admins"],
  ["friends", "Friends"],
  ["guests", "Guests"],
];

// Default visibility rules mirrored from the design's Admin matrix.
const VIS: Record<string, (s: Service) => boolean> = {
  admins: () => true,
  friends: (s) => s.cat !== "infra" && s.id !== "prometheus",
  guests: (s) => s.cat === "stream" || s.id === "overseerr",
};

export async function seed(db: DB): Promise<void> {
  await db
    .insert(schema.groups)
    .values(GROUPS.map(([name, label]) => ({ name, label })))
    .onConflictDoNothing();

  await db
    .insert(schema.services)
    .values(
      SERVICES.map((s, i) => ({
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
      })),
    )
    .onConflictDoNothing();

  const visRows = SERVICES.flatMap((s) => GROUPS.map(([g]) => ({ serviceId: s.id, groupName: g, visible: VIS[g](s) })));
  await db.insert(schema.serviceVisibility).values(visRows).onConflictDoNothing();

  const now = new Date();
  await db
    .insert(schema.users)
    .values(USERS.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, reqQuota: u.reqQuota, createdAt: now })))
    .onConflictDoNothing();

  await db
    .insert(schema.accountLinks)
    .values(USERS.map((u) => ({ portalUserId: u.id, linked: u.linked })))
    .onConflictDoNothing();
}
