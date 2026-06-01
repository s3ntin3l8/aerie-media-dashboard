// ============================================================
// AERIE — declarative service config file loader (server-only)
// Lets a deployment define services / visibility / secrets in a YAML
// file instead of (or alongside) the Admin UI. Secrets are referenced
// as ${ENV_VAR} and resolved from process.env at load time, so the
// file never holds plaintext keys. A missing or malformed file is not
// fatal — the loader returns null and the app falls back to its normal
// mock-seed / UI behaviour (graceful degradation).
// ============================================================
import "server-only";
import { existsSync, readFileSync } from "node:fs";
import { parse } from "yaml";
import { z } from "zod";
import { env } from "@/lib/env";

const CATEGORIES = ["stream", "request", "automation", "monitor", "infra"] as const;

const serviceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  cat: z.enum(CATEGORIES),
  icon: z.string().min(1),
  host: z.string().min(1),
  baseUrl: z.string().optional(),
  embeddable: z.boolean().optional(),
  central: z.boolean().optional(),
  centralLabel: z.string().nullish(),
  version: z.string().nullish(),
  note: z.string().nullish(),
  logoSlug: z.string().optional(),
  /** API key/token, typically a ${ENV_VAR} reference resolved at load time. */
  apiKey: z.string().optional(),
  monitoringKey: z.string().nullish(),
});

const fileSchema = z.object({
  services: z.array(serviceSchema).default([]),
  groups: z.array(z.object({ name: z.string().min(1), label: z.string().optional() })).optional(),
  visibility: z
    .array(z.object({ serviceId: z.string().min(1), groupName: z.string().min(1), visible: z.boolean() }))
    .optional(),
});

export type ConfigService = z.infer<typeof serviceSchema>;
export type ServiceConfigFile = z.infer<typeof fileSchema>;

// Replace ${VAR} tokens in every string with process.env[VAR] (trimmed).
// Unresolved tokens become "" — for a secret that means "skip" downstream.
const ENV_REF = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
function interpolate(value: unknown): unknown {
  if (typeof value === "string") return value.replace(ENV_REF, (_, name) => (process.env[name] ?? "").trim());
  if (Array.isArray(value)) return value.map(interpolate);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, interpolate(v)]));
  }
  return value;
}

/**
 * Load + validate the service config file (path from AERIE_CONFIG_FILE).
 * Returns null when the file is absent, empty, or invalid — never throws.
 */
export function loadServiceConfigFile(): ServiceConfigFile | null {
  const path = env.configFile;
  try {
    if (!existsSync(path)) return null;
    const raw = parse(readFileSync(path, "utf8"));
    if (raw == null) return null; // empty file

    const parsed = fileSchema.safeParse(interpolate(raw));
    if (!parsed.success) {
      const detail = parsed.error.issues.map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`).join("; ");
      console.warn(`[config] ${path}: invalid, ignoring — ${detail}`);
      return null;
    }

    const ids = parsed.data.services.map((s) => s.id);
    const dupes = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
    if (dupes.length) {
      console.warn(`[config] ${path}: duplicate service ids, ignoring file — ${dupes.join(", ")}`);
      return null;
    }

    return parsed.data;
  } catch (e) {
    console.warn(`[config] failed to load ${path}: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}
