// ============================================================
// AERIE — widget capability → data-source map
// A "capability" is a function a widget performs (now-playing, library
// counts, download queue, host metrics, …). Several upstream providers can
// satisfy the same capability; this module maps each capability to the
// candidate sources and resolves which are actually configured so a widget
// can offer a per-tile source picker (see the "source" WidgetSettingSpec).
//
// Pure + isomorphic (no server-only, no DB) — imported by both the client
// widget catalog and the server snapshot facade.
// ============================================================

export type Capability =
  | "nowPlaying"
  | "library"
  | "recent"
  | "queue"
  | "metrics"
  | "indexers"
  | "books";

export interface SourceDef {
  /** The tag stored on each item / the value persisted in widget settings. */
  value: string;
  /** Human label shown in the picker. */
  label: string;
  /** Service ids that, if any is configured/active, make this source available. */
  services: string[];
}

/**
 * Candidate sources per capability, in priority order (first = the default the
 * server "Auto" cascade prefers). `value` is the tag the data layer stamps on
 * each item (`NowPlaying.src`, `LibraryStat.source`, …) and the value a widget
 * persists in its `source` setting.
 */
export const CAPABILITY_SOURCES: Record<Capability, SourceDef[]> = {
  nowPlaying: [
    { value: "plex", label: "Plex", services: ["plex", "tautulli"] },
    { value: "jellyfin", label: "Jellyfin", services: ["jellyfin"] },
    { value: "audiobookshelf", label: "Audiobookshelf", services: ["audiobookshelf"] },
  ],
  library: [
    { value: "tautulli", label: "Plex (Tautulli)", services: ["tautulli", "plex"] },
    { value: "jellyfin", label: "Jellyfin", services: ["jellyfin"] },
    { value: "lazylibrarian", label: "Books (LazyLibrarian)", services: ["lazylibrarian"] },
    { value: "listenarr", label: "Audiobooks (Listenarr)", services: ["listenarr"] },
  ],
  recent: [
    { value: "tautulli", label: "Plex (Tautulli)", services: ["tautulli", "plex"] },
    { value: "jellyfin", label: "Jellyfin", services: ["jellyfin"] },
  ],
  queue: [
    { value: "arr", label: "Sonarr / Radarr", services: ["sonarr", "radarr", "listenarr"] },
    { value: "nzbget", label: "NZBGet", services: ["nzbget"] },
    { value: "qbittorrent", label: "qBittorrent", services: ["qbittorrent"] },
  ],
  metrics: [
    { value: "prometheus", label: "Prometheus", services: ["prometheus"] },
    { value: "beszel", label: "Beszel", services: ["beszel"] },
  ],
  indexers: [
    { value: "prowlarr", label: "Prowlarr", services: ["prowlarr"] },
    { value: "nzbhydra", label: "NZBHydra2", services: ["nzbhydra"] },
  ],
  books: [
    { value: "lazylibrarian", label: "LazyLibrarian", services: ["lazylibrarian"] },
    { value: "listenarr", label: "Listenarr", services: ["listenarr"] },
  ],
};

/** The ordered list of source `value`s for a capability (no config filtering). */
export function capabilitySources(capability: Capability): string[] {
  return (CAPABILITY_SOURCES[capability] ?? []).map((d) => d.value);
}

/**
 * Options for a widget's source `<select>`: an "Auto" entry plus every source
 * whose backing service is present in `services` (the configured/active set).
 * If nothing is configured, only "Auto" is returned.
 */
export function sourceOptions(
  capability: Capability,
  services: { id: string }[],
): { value: string; label: string }[] {
  const ids = new Set(services.map((s) => s.id));
  const avail = (CAPABILITY_SOURCES[capability] ?? []).filter((d) =>
    d.services.some((s) => ids.has(s)),
  );
  return [{ value: "", label: "Auto (all sources)" }, ...avail.map((d) => ({ value: d.value, label: d.label }))];
}
