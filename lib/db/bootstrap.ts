// ============================================================
// AERIE — runtime DB bootstrap (server-only)
// Lazily applies migrations, then the declarative YAML config, then
// seeds the minimal structural defaults (visibility groups). Services
// and users come from the YAML config + the Admin UI, not a mock seed.
// Runs once per process.
// ============================================================
import "server-only";
import { migrate } from "drizzle-orm/libsql/migrator";
import { db } from "./client";
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

  // Ensure the default visibility groups exist (idempotent).
  await seed(db);
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
