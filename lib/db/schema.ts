// ============================================================
// AERIE — SQLite schema (Drizzle)
// Stores portal *config* (services, visibility, links, prefs).
// Runtime health/stats are read live from monitoring, never stored.
// ============================================================
import { sqliteTable, text, integer, primaryKey, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// Service registry (config only; status/uptime come from Gatus at runtime).
export const services = sqliteTable("services", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  cat: text("cat").notNull(), // stream | request | automation | monitor | infra
  icon: text("icon").notNull(),
  logoSlug: text("logo_slug"),
  embeddable: integer("embeddable", { mode: "boolean" }).notNull().default(false),
  central: integer("central", { mode: "boolean" }).notNull().default(false),
  centralLabel: text("central_label"),
  host: text("host").notNull(),
  /** public base URL (scheme + host) — used for the iframe embed / launch link (defaults to https://host) */
  baseUrl: text("base_url"),
  /** optional internal/LAN URL the server uses for API calls; falls back to baseUrl when null */
  internalUrl: text("internal_url"),
  version: text("version"),
  note: text("note"),
  sortOrder: integer("sort_order").notNull().default(0),
  monitoringKey: text("monitoring_key"),
  /** optional LogQL stream selector for the admin Loki logs viewer; blank → inferred {container="<id>"} */
  lokiQuery: text("loki_query"),
  /** skip TLS cert verification for this service's server-side API calls (self-signed LAN hosts, e.g. Unraid) */
  insecureTls: integer("insecure_tls", { mode: "boolean" }).notNull().default(false),
  /** false → service is fully disabled: hidden from every end-user surface and never polled (config kept) */
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  /** true → keep this embeddable service's iframe mounted (hidden) after first open, so switching
   *  between services preserves its in-app state instead of reloading. No-op for non-embeddable services. */
  keepAlive: integer("keep_alive", { mode: "boolean" }).notNull().default(false),
});

// Encrypted per-service secrets (API keys/tokens). AES-256-GCM at rest.
export const serviceSecrets = sqliteTable("service_secrets", {
  serviceId: text("service_id")
    .notNull()
    .references(() => services.id, { onDelete: "cascade" }),
  kind: text("kind").notNull().default("apiKey"), // apiKey | token | password
  iv: text("iv").notNull(),
  authTag: text("auth_tag").notNull(),
  ciphertext: text("ciphertext").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
}, (t) => [primaryKey({ columns: [t.serviceId, t.kind] })]);

// Authentik groups mirrored for the visibility matrix.
export const groups = sqliteTable("groups", {
  name: text("name").primaryKey(),
  label: text("label"),
});

// Which group can see which service.
export const serviceVisibility = sqliteTable("service_visibility", {
  serviceId: text("service_id")
    .notNull()
    .references(() => services.id, { onDelete: "cascade" }),
  groupName: text("group_name")
    .notNull()
    .references(() => groups.name, { onDelete: "cascade" }),
  visible: integer("visible", { mode: "boolean" }).notNull().default(true),
}, (t) => [primaryKey({ columns: [t.serviceId, t.groupName] })]);

// Portal users. Mirrored from the OIDC provider, or created locally
// (with a password hash) via the first-run admin setup when OIDC is off.
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  role: text("role").notNull().default("user"),
  passwordHash: text("password_hash"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
// Expression index: LOWER(email) matches getUserByEmail()'s WHERE clause so the
// lookup is index-backed even when OIDC emails are stored in mixed case.
}, (t) => [index("users_email_idx").on(sql`lower(${t.email})`)]);

// Maps a portal user to their identity in each upstream (keyed by upstream
// user IDs, NOT email — see plan §Identity linking).
export const accountLinks = sqliteTable("account_links", {
  portalUserId: text("portal_user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  plexUserId: text("plex_user_id"),
  jellyfinUserId: text("jellyfin_user_id"),
  overseerrUserId: text("overseerr_user_id"),
  tautulliUserId: text("tautulli_user_id"),
  linked: integer("linked", { mode: "boolean" }).notNull().default(false),
});

// Per-user UI preferences.
export const preferences = sqliteTable("preferences", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  theme: text("theme").notNull().default("dark"),
  favorites: text("favorites"), // JSON array of service ids
  dashboards: text("dashboards"), // JSON { admin: Tile[], user: Tile[] } — modular homescreen layout per role
});

// Deployment-wide key-value settings (not per-user).
export const deploymentSettings = sqliteTable("deployment_settings", {
  key:   text("key").primaryKey(),
  value: text("value").notNull(),
});

export type ServiceRow = typeof services.$inferSelect;
export type UserRow = typeof users.$inferSelect;
export type AccountLinkRow = typeof accountLinks.$inferSelect;
export type DeploymentSettingRow = typeof deploymentSettings.$inferSelect;
