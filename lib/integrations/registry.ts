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
