// ============================================================
// AERIE — upstream integration clients (server-only)
// Barrel re-export: every client module is imported here so existing
// `import { … } from "@/lib/integrations/clients"` calls remain unchanged.
// The individual modules live under ./clients/ and carry `import "server-only"`.
// ============================================================

// — TTL cache infrastructure —
export { cached, bustCache, clearTtlCache } from "./clients/cache";

// — Shared helpers —
export { tmdbFromGuids, n, fmt, cleanLayout, fmtEtaSeconds } from "./clients/ui-helpers";

// — Gatus —
export type { ServiceHealth } from "./clients/gatus";
export { gatusHealth } from "./clients/gatus";

// — Traefik —
export { hostsFromRule, parseCertMetric, traefikRoutesFromAggregator, traefikInstances, traefikRoutesFor, traefikRoutes } from "./clients/traefik";

// — Authentik —
export { appHost, resolveAccess, authentikApps } from "./clients/authentik";

// — Loki —
export { lokiSelectorFor, lokiTail } from "./clients/loki";

// — Tautulli —
export type { TautulliActivity, PlexUserAvatar, TautulliPlays } from "./clients/tautulli";
export { tautulliActivity, tautulliUsers, tautulliLibraries, tautulliPlays24h, tautulliStreamHistory, tautulliRecentlyAdded, tautulliShowTmdb, tautulliHomeStats } from "./clients/tautulli";

// — Jellyfin —
export { jellyfinNowPlaying, jellyfinLibraries, jellyfinRecentlyAdded } from "./clients/jellyfin";

// — Audiobookshelf —
export { audiobookshelfNowPlaying } from "./clients/audiobookshelf";

// — *arr (Sonarr / Radarr) —
export { arrQueue, arrDiskSpace, arrHealth, arrCalendar, arrHistory, radarrMovieMeta, sonarrSeriesMeta, sonarrSeasonQuality, arrMovieIndexes, arrQualityProfileMap } from "./clients/arr";

// — Overseerr —
export type { OverseerrRequestDetails, OverseerrUser, OverseerrQuotaSettings, RequestCounts } from "./clients/overseerr";
export { overseerrMovieProfiles, overseerrTvProfiles, overseerrRequests, overseerrMediaByTmdb, overseerrSearch, overseerrTrending, overseerrPopularMovies, overseerrPopularTv, overseerrUpcomingMovies, overseerrDeleteRequest, overseerrRequestDetails, overseerrEditRequest, overseerrRequestCounts, overseerrWatchlist, overseerrCreateRequest, overseerrReview, overseerrComment, overseerrUsers, overseerrIssues, overseerrVersion, matchOverseerrUserId, overseerrUserQuota, overseerrUpdateUserQuota, clearEnrichCache } from "./clients/overseerr";

// — Download clients (NZBGet + qBittorrent) —
export { nzbgetQueue, nzbgetStatus, qbittorrentQueue, qbittorrentStats, splitQbitCreds } from "./clients/download";

// — Monitoring (Prometheus + Beszel) —
export type { NodeMetrics } from "./clients/monitoring";
export { prometheusQuery, prometheusQueryAll, prometheusRange, prometheusInstances, prometheusMetrics, beszelSystems, beszelMetrics, splitBeszelCreds } from "./clients/monitoring";

// — Service metadata (Wizarr, Prowlarr, Agregarr, Bazarr, NZBHydra2, LazyLibrarian, Listenarr) —
export type { WizarrStats, ProwlarrStats, AgregarrStatus, BazarrWanted, Nzbhydra2Stats, LazyLibrarianStats, ListenarrStats } from "./clients/service-meta";
export { wizarrStats, prowlarrStats, agregarrStatus, bazarrWanted, nzbhydra2Stats, lazylibrarianStats, lazylibrarianLibraryStats, listenarrQueue, listenarrHistory, listenarrHealth, listenarrStats, listenarrLibraryStats } from "./clients/service-meta";

// — Version detection —
export { detectVersion, probeVersion } from "./clients/version";

// — Plex admin maintenance —
export type { PlexSection, PlexButlerTask } from "./clients/plex";
export { plexSections, plexButlerTasks, plexScanSection, plexAnalyzeSection, plexEmptyTrash, plexCleanBundles, plexOptimizeDb, plexRunButlerTask } from "./clients/plex";

// — Portainer container control (admin-only restart) —
export type { PortainerEndpoint, PortainerContainer } from "./clients/portainer";
export { portainerEndpoints, portainerContainers, portainerRestartContainer } from "./clients/portainer";

// — Compose clearCache to clear both TTL and enrich caches (tests use this between cases) —
import { clearTtlCache } from "./clients/cache";
import { clearEnrichCache } from "./clients/overseerr";

/** Drop every cached entry (TTL + Overseerr enrich). Tests use this between cases. */
export function clearCache(): void {
  clearTtlCache();
  clearEnrichCache();
}