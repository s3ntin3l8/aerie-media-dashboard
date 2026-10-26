/**
 * The demo's `aerie.yaml`: which services Aerie knows about and where their (fake)
 * upstreams live. Server-side calls go to `internalUrl`, a loopback path on the
 * fake upstream (./upstream.mjs); `host` is only what the dashboard displays, so no
 * request ever leaves the machine. Services with no `apiKey` are launch-only tiles.
 * Written once per run into the scratch dir and read by Aerie's bootstrap.
 */

/** @typedef {{ id: string, name: string, cat: "stream" | "request" | "automation" | "monitor" | "infra", icon: string, version: string, note: string, apiKey?: string, central?: boolean, centralLabel?: string, logoSlug?: string }} DemoService */

/** @type {DemoService[]} */
export const SERVICES = [
  { id: "plex", name: "Plex", cat: "stream", icon: "play_circle", logoSlug: "plex", version: "1.42.1", note: "External · launch only", central: true, centralLabel: "Stream" },
  { id: "audiobookshelf", name: "Audiobookshelf", cat: "stream", icon: "headphones", logoSlug: "audiobookshelf", version: "2.19.4", note: "External · launch only", central: true, centralLabel: "Audiobooks" },
  { id: "overseerr", name: "Overseerr", cat: "request", icon: "playlist_add", logoSlug: "overseerr", version: "1.34.0", note: "Per-user requests", apiKey: "demo-overseerr-key", central: true, centralLabel: "Requests" },
  { id: "sonarr", name: "Sonarr", cat: "automation", icon: "tv", logoSlug: "sonarr", version: "4.0.14", note: "TV automation", apiKey: "demo-sonarr-key" },
  { id: "radarr", name: "Radarr", cat: "automation", icon: "movie", logoSlug: "radarr", version: "5.21.1", note: "Movie automation", apiKey: "demo-radarr-key" },
  { id: "prowlarr", name: "Prowlarr", cat: "automation", icon: "travel_explore", logoSlug: "prowlarr", version: "1.32.2", note: "Indexer manager" },
  { id: "nzbget", name: "NZBGet", cat: "automation", icon: "download", logoSlug: "nzbget", version: "24.5", note: "Usenet downloader" },
  { id: "tautulli", name: "Tautulli", cat: "monitor", icon: "monitoring", logoSlug: "tautulli", version: "2.15.1", note: "Plex stats", apiKey: "demo-tautulli-key" },
  { id: "gatus", name: "Gatus", cat: "monitor", icon: "favorite", logoSlug: "gatus", version: "5.16.0", note: "Status engine" },
  { id: "prometheus", name: "Prometheus", cat: "monitor", icon: "query_stats", logoSlug: "prometheus", version: "3.2.1", note: "Metrics · admin" },
];

/** Gatus endpoint names: the service names, so Aerie matches them to rows by name. */
export const GATUS_NAMES = SERVICES.map((s) => s.name);

const q = (value) => JSON.stringify(value);

/**
 * The YAML text. Strings are JSON-quoted (valid YAML), and `upstreamUrl` is the base
 * URL of the fake upstream, e.g. http://127.0.0.1:3931.
 */
export function aerieYaml(upstreamUrl) {
  const base = upstreamUrl.replace(/\/$/, "");
  const entries = SERVICES.map((s) =>
    [
      `  - id: ${q(s.id)}`,
      `    name: ${q(s.name)}`,
      `    cat: ${s.cat}`,
      `    icon: ${q(s.icon)}`,
      `    logoSlug: ${q(s.logoSlug)}`,
      `    host: ${q(`${s.id}.aerie.example`)}`,
      `    internalUrl: ${q(`${base}/${s.id}`)}`,
      `    embeddable: false`,
      `    central: ${Boolean(s.central)}`,
      ...(s.centralLabel ? [`    centralLabel: ${q(s.centralLabel)}`] : []),
      `    version: ${q(s.version)}`,
      `    note: ${q(s.note)}`,
      ...(s.apiKey ? [`    apiKey: ${q(s.apiKey)}`] : []),
    ].join("\n"),
  );
  return `# Generated for the throwaway demo instance; see scripts/demo/config.mjs.\nservices:\n${entries.join("\n")}\n`;
}
