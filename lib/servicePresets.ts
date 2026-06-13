// ============================================================
// AERIE — Known service presets (client-safe; NO "server-only")
// Single source of truth for per-service-type metadata shared by the
// Admin view (which services need a key → #36 smart-warn) and the
// service add/edit modal (secret-field label/hint/placeholder → #37).
// ============================================================

/** The shape of the value stored in a service's secret field (drives the modal's field
 *  label/hint/placeholder and the colon-pair format validation):
 *  - "apiKey"   → a single token (the default for any service without an explicit kind)
 *  - "userpass" → a colon-separated pair stored in the same field (user:password / email:password) */
export type SecretKind = "apiKey" | "userpass";

export interface ServicePreset {
  cat: string;
  icon: string;
  logoSlug: string;
  /** Optional secret-field descriptor. Absent → a plain required "apiKey".
   *  `optional: true` → the service can run without a stored secret (no-auth / optional auth),
   *  so the Admin "configured" indicator stays neutral instead of warning. Note this is
   *  orthogonal to `kind`: NZBGet is `userpass` *and* optional. */
  secret?: { kind: SecretKind; optional?: boolean; label?: string; hint?: string; placeholder?: string };
}

const USERPASS_EMAIL: ServicePreset["secret"] = {
  kind: "userpass",
  label: "Credentials",
  hint: "format: email:password",
  placeholder: "email:password",
};
const USERPASS_USER: ServicePreset["secret"] = {
  kind: "userpass",
  label: "Credentials",
  hint: "format: username:password",
  placeholder: "username:password",
};
// Token-based but auth is optional (these run no-auth too) → never warn on a missing key.
const OPTIONAL_APIKEY: ServicePreset["secret"] = { kind: "apiKey", optional: true };
// Plex: panels are fed by Tautulli/Overseerr; the only direct call is the unauthenticated
// /identity version probe. A token is accepted (future-proofing) but never required → optional.
const PLEX_TOKEN: ServicePreset["secret"] = {
  kind: "apiKey",
  optional: true,
  label: "Plex token",
  hint: "optional — Plex data comes via Tautulli/Overseerr",
  placeholder: "X-Plex-Token (optional)",
};

// Known service presets applied to blank fields when the name matches.
export const SERVICE_PRESETS: Record<string, ServicePreset> = {
  jellyfin:      { cat: "stream",     icon: "smart_display", logoSlug: "jellyfin" },
  emby:          { cat: "stream",     icon: "smart_display", logoSlug: "emby" },
  plex:          { cat: "stream",     icon: "smart_display", logoSlug: "plex", secret: PLEX_TOKEN },
  tautulli:      { cat: "monitor",    icon: "bar_chart",     logoSlug: "tautulli" },
  overseerr:     { cat: "request",    icon: "add_circle",    logoSlug: "overseerr" },
  jellyseerr:    { cat: "request",    icon: "add_circle",    logoSlug: "jellyseerr" },
  sonarr:        { cat: "automation", icon: "live_tv",       logoSlug: "sonarr" },
  radarr:        { cat: "automation", icon: "movie",         logoSlug: "radarr" },
  lidarr:        { cat: "automation", icon: "library_music", logoSlug: "lidarr" },
  readarr:       { cat: "automation", icon: "menu_book",     logoSlug: "readarr" },
  listenarr:     { cat: "automation", icon: "headphones",    logoSlug: "listenarr" },
  prowlarr:      { cat: "automation", icon: "search",        logoSlug: "prowlarr" },
  nzbget:        { cat: "automation", icon: "download",      logoSlug: "nzbget", secret: { ...USERPASS_USER, optional: true } },
  qbittorrent:   { cat: "automation", icon: "downloading",   logoSlug: "qbittorrent", secret: USERPASS_USER },
  nzbhydra:      { cat: "automation", icon: "manage_search", logoSlug: "nzbhydra2" },
  nzbhydra2:     { cat: "automation", icon: "manage_search", logoSlug: "nzbhydra2" },
  bazarr:        { cat: "automation", icon: "subtitles",     logoSlug: "bazarr" },
  whisparr:      { cat: "automation", icon: "movie",         logoSlug: "whisparr" },
  agregarr:      { cat: "automation", icon: "collections",   logoSlug: "agregarr" },
  wizarr:        { cat: "automation", icon: "person_add",    logoSlug: "wizarr" },
  audiobookshelf:{ cat: "stream",     icon: "headphones",    logoSlug: "audiobookshelf" },
  beszel:        { cat: "infra",      icon: "home",          logoSlug: "beszel", secret: USERPASS_EMAIL },
  gatus:         { cat: "monitor",    icon: "monitor_heart", logoSlug: "gatus", secret: OPTIONAL_APIKEY },
  prometheus:    { cat: "infra",      icon: "query_stats",   logoSlug: "prometheus", secret: OPTIONAL_APIKEY },
  grafana:       { cat: "infra",      icon: "monitoring",    logoSlug: "grafana" },
  portainer:     { cat: "infra",      icon: "dns",           logoSlug: "portainer" },
  traefik:       { cat: "infra",      icon: "router",        logoSlug: "traefik", secret: { ...USERPASS_USER, optional: true } },
  nextcloud:     { cat: "infra",      icon: "cloud",         logoSlug: "nextcloud" },
  homeassistant: { cat: "infra",      icon: "home",          logoSlug: "home-assistant" },
  uptimekuma:    { cat: "monitor",    icon: "monitor_heart", logoSlug: "uptime-kuma" },
};

/** Match a service name or id (normalized: lowercased, separators stripped) to a known preset. */
export function matchPreset(nameOrId: string): ServicePreset | null {
  const key = nameOrId.toLowerCase().replace(/[\s\-_.]/g, "");
  return SERVICE_PRESETS[key] ?? null;
}

/** True when a service's type is expected to have a stored key/credential.
 *  Services flagged `optional` (no-auth / optional auth) return false; unknown/custom
 *  services default to true (assume a key is wanted). */
export function serviceRequiresKey(nameOrId: string): boolean {
  return matchPreset(nameOrId)?.secret?.optional !== true;
}
