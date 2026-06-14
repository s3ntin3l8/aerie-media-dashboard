// ============================================================
// AERIE — apply the declarative service config into the DB (server-only)
// Gap-fill only: every insert uses onConflictDoNothing, so anything that
// already exists in the DB (mock seed or a UI edit) wins and is left
// untouched. This makes the apply idempotent and safe to run on every
// boot — adding a new entry to the file makes it appear; existing rows
// are never overwritten.
// ============================================================
import "server-only";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "@/lib/db/schema";
import { encrypt } from "@/lib/crypto";
import type { ServiceConfigFile } from "./services";

type DB = LibSQLDatabase<typeof schema>;

export async function applyServiceConfig(db: DB, cfg: ServiceConfigFile): Promise<void> {
  if (cfg.groups?.length) {
    await db
      .insert(schema.groups)
      .values(cfg.groups.map((g) => ({ name: g.name, label: g.label ?? null })))
      .onConflictDoNothing();
  }

  if (cfg.services.length) {
    // Continue sortOrder after any services already present in the DB.
    const existing = await db.select({ id: schema.services.id }).from(schema.services);
    const base = existing.length;

    await db
      .insert(schema.services)
      .values(
        cfg.services.map((s, i) => ({
          id: s.id,
          name: s.name,
          cat: s.cat,
          icon: s.icon,
          logoSlug: s.logoSlug ?? null,
          embeddable: s.embeddable ?? false,
          keepAlive: s.keepAlive ?? false,
          active: s.active ?? true,
          central: s.central ?? false,
          centralLabel: s.centralLabel ?? null,
          host: s.host,
          baseUrl: s.baseUrl || `https://${s.host}`,
          internalUrl: s.internalUrl ?? null,
          version: s.version ?? null,
          note: s.note ?? null,
          monitoringKey: s.monitoringKey ?? null,
          lokiQuery: s.lokiQuery ?? null,
          sortOrder: base + i,
        })),
      )
      .onConflictDoNothing();

    // Encrypt + store API keys for services that resolved a non-empty value.
    const now = new Date();
    const secrets = cfg.services
      .filter((s) => s.apiKey && s.apiKey.trim())
      .map((s) => {
        const enc = encrypt(s.apiKey!.trim());
        return { serviceId: s.id, kind: "apiKey", iv: enc.iv, authTag: enc.authTag, ciphertext: enc.ciphertext, updatedAt: now };
      });
    if (secrets.length) {
      await db.insert(schema.serviceSecrets).values(secrets).onConflictDoNothing();
    }
  }

  if (cfg.visibility?.length) {
    await db.insert(schema.serviceVisibility).values(cfg.visibility).onConflictDoNothing();
  }
}
