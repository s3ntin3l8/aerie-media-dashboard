// ============================================================
// AERIE — runtime DB bootstrap (server-only)
// Lazily applies migrations and seeds from mock data on first use,
// so a fresh deployment has a working config DB without manual steps.
// Runs once per process.
// ============================================================
import "server-only";
import { migrate } from "drizzle-orm/libsql/migrator";
import { db, schema } from "./client";
import { seed } from "./seed";

let ready: Promise<void> | null = null;

async function init(): Promise<void> {
  await migrate(db, { migrationsFolder: "drizzle" });
  const existing = await db.select({ id: schema.services.id }).from(schema.services).limit(1);
  if (existing.length === 0) await seed(db);
}

/** Ensure the schema exists and is seeded. Cached after first success. */
export function ensureDb(): Promise<void> {
  if (!ready) {
    ready = init().catch((e) => {
      ready = null; // allow retry on next call
      throw e;
    });
  }
  return ready;
}
