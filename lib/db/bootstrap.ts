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
import { loadServiceConfigFile } from "@/lib/config/services";
import { applyServiceConfig } from "@/lib/config/apply";

let ready: Promise<void> | null = null;

async function init(): Promise<void> {
  await migrate(db, { migrationsFolder: "drizzle" });

  // Apply the declarative config file first (gap-fill, never overwrites
  // existing rows). A failure here must not brick bootstrap.
  const cfg = loadServiceConfigFile();
  if (cfg) {
    try {
      await applyServiceConfig(db, cfg);
    } catch (e) {
      console.warn(`[config] failed to apply service config: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Fall back to the mock seed only when nothing else populated the table.
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
