// ============================================================
// AERIE — data facade (server-only)
// Aggregates every upstream into one Snapshot. Each section shows
// real upstream data, or an empty state when its service is
// unconfigured or erroring — a dead upstream only degrades its own
// panel. Live calls only fire for services that have a stored secret.
// ============================================================
import "server-only";
import type { LibraryStat, MediaRequest, NowPlaying, QueueItem, NzbgetStatus, QbittorrentStats, QueueSource, RecentItem, Service, TraefikRoute, TraefikInstance, AuthentikAccess, User, StorageMount, IssueItem, HealthIssue, UpcomingItem, DownloadEvent, TopStats, DiscoverItem } from "@/lib/types";
import { getServiceConfigs, getAllServiceSecrets, getGroups, getVisibility, getMembers, getDeploymentSetting, updateServiceVersion, configMatchesLogo, type GroupRow, type VisibilityRow } from "@/lib/integrations/registry";
import { isTraefikSource } from "@/lib/servicePresets";
import { parseForwardAuthConfig } from "@/lib/integrations/forwardAuth";
import {
  gatusHealth,
  traefikRoutes,
  traefikInstances,
  authentikApps,
  tautulliActivity,
  tautulliUsers,
  jellyfinNowPlaying,
  audiobookshelfNowPlaying,
  jellyfinLibraries,
  jellyfinRecentlyAdded,
  overseerrRequests,
  overseerrUsers,
  overseerrUserQuota,
  overseerrVersion,
  overseerrTrending,
  overseerrPopularMovies,
  overseerrPopularTv,
  overseerrUpcomingMovies,
  overseerrWatchlist,
  overseerrRequestCounts,
  matchOverseerrUserId,
  arrQueue,
  nzbgetQueue,
  nzbgetStatus,
  arrDiskSpace,
  arrHealth,
  arrCalendar,
  arrHistory,
  overseerrIssues,
  tautulliLibraries,
  tautulliRecentlyAdded,
  tautulliPlays24h,
  tautulliHomeStats,
  prometheusMetrics,
  beszelMetrics,
  wizarrStats,
  prowlarrStats,
  agregarrStatus,
  bazarrWanted,
  nzbhydra2Stats,
  lazylibrarianStats,
  lazylibrarianLibraryStats,
  type LazyLibrarianStats,
  listenarrQueue,
  listenarrHistory,
  listenarrHealth,
  listenarrStats,
  listenarrLibraryStats,
  type ListenarrStats,
  qbittorrentQueue,
  qbittorrentStats,
  detectVersion,
  type ServiceHealth,
  type NodeMetrics,
  type WizarrStats,
  type ProwlarrStats,
  type AgregarrStatus,
  type BazarrWanted,
  type Nzbhydra2Stats,
} from "@/lib/integrations/clients";
import { env } from "@/lib/env";
import { buildLibrary, buildRecent, buildMetricsBySource } from "@/lib/data/assemble";

export interface Snapshot {
  services: Service[];
  nowPlaying: NowPlaying[];
  requests: MediaRequest[];
  users: User[];
  /** Auto-resolved library cards (Tautulli/Plex wins for media; books appended). */
  library: LibraryStat[];
  /** Every configured source's library cards, tagged with `source` (for per-widget source picking). */
  libraryAll: LibraryStat[];
  /** Auto-resolved recently-added (Tautulli/Plex wins, else Jellyfin). */
  recent: RecentItem[];
  /** Every configured source's recently-added items, tagged with `source`. */
  recentAll: RecentItem[];
  queue: QueueItem[];
  plays24h: number[];
  /** aggregate live streaming bandwidth (Mbps), or null when Tautulli is unconfigured */
  bandwidth: { totalMbps: number; wanMbps: number } | null;
  /** storage mounts from *arr (de-duplicated by path) */
  storage: StorageMount[];
  /** Overseerr open-issue count + sample, or null when unconfigured */
  issues: { open: number; items: IssueItem[] } | null;
  /** *arr health warnings/errors */
  arrHealth: HealthIssue[];
  /** upcoming releases from *arr calendars (next 7 days, sorted by date) */
  upcoming: UpcomingItem[];
  /** recently grabbed/imported downloads from *arr history */
  downloads: DownloadEvent[];
  /** which source fills `queue` */
  queueSource: QueueSource;
  /** Sonarr or Radarr has a stored secret (drives the queue source toggle's visibility) */
  arrQueueConfigured: boolean;
  /** NZBGet has a stored secret */
  nzbgetConfigured: boolean;
  /** NZBGet global rate/remaining/paused — null unless NZBGet is the active queue source */
  nzbgetStatus: NzbgetStatus | null;
  /** qBittorrent has a stored secret */
  qbittorrentConfigured: boolean;
  /** qBittorrent global transfer stats — null when unconfigured */
  qbittorrent: QbittorrentStats | null;
  /** weekly Tautulli leaderboard, or null when unconfigured */
  topStats: TopStats | null;
  groups: GroupRow[];
  visibility: VisibilityRow[];
  /** the group name that maps to the admin role (locked "always" in visibility) */
  adminGroup: string;
  metrics: NodeMetrics | null;
  /** host metrics per source (Auto = the active metricsSource), for a per-tile Host Stats source pick */
  metricsBySource: { prometheus: NodeMetrics | null; beszel: NodeMetrics | null };
  /** which source fills `metrics` (the active source; toggle when both are configured) */
  metricsSource: "prometheus" | "beszel";
  /** Prometheus service exists in config (drives the source toggle's visibility) */
  prometheusConfigured: boolean;
  /** Beszel service has a stored secret (it can't run no-auth, so gate on the secret) */
  beszelConfigured: boolean;
  /** persisted Beszel system id (null → the picker defaults to the first system) */
  beszelSystemId: string | null;
  /** Overseerr discover feeds — null when Overseerr not configured */
  discover: { trending: DiscoverItem[]; popularMovies: DiscoverItem[]; popularTv: DiscoverItem[]; upcomingMovies: DiscoverItem[]; watchlist: DiscoverItem[] } | null;
  /** Authoritative request counts from Overseerr — null when unconfigured */
  requestCounts: { total: number; pending: number; approved: number; processing: number; failed: number; available: number } | null;
  /** Wizarr invite/user stats — null when unconfigured */
  wizarr: WizarrStats | null;
  /** Prowlarr indexer health + grab/query stats — null when unconfigured */
  prowlarr: ProwlarrStats | null;
  /** Agregarr collections sync status — null when unconfigured */
  agregarr: AgregarrStatus | null;
  /** Bazarr wanted (missing) subtitle counts — null when unconfigured */
  bazarrWanted: BazarrWanted | null;
  /** NZBHydra2 indexer health — null when unconfigured */
  nzbhydra: Nzbhydra2Stats | null;
  /** LazyLibrarian book/audiobook stats — null when unconfigured */
  lazylibrarian: LazyLibrarianStats | null;
  /** Listenarr audiobook library stats — null when unconfigured */
  listenarr: ListenarrStats | null;
  /** Traefik service exists + active in config (drives the route indicators' visibility). Per-service
   *  route detail rides on each `Service.route`; this just gates whether the UI renders that column. */
  traefikConfigured: boolean;
  /** Traefik routers whose host matches no configured AERIE service — suggestions for one-click add in
   *  Admin (deduped by host, https preferred). Self-clearing: once added, the host matches and drops out.
   *  Excludes hosts in `traefikDismissed`. */
  traefikDiscovered: TraefikRoute[];
  /** Hosts the admin has dismissed from the discovered panel (lowercased) — surfaced so Admin can
   *  offer a restore affordance. */
  traefikDismissed: string[];
  /** Traefik node health from the aggregator, scoped to only the nodes that route at least one
   *  configured AERIE service (unrelated infra nodes are excluded). Empty unless an aggregator source
   *  is active. Each node's `serves` lists the configured service ids it routes. */
  traefikInstances: TraefikInstance[];
  /** Authentik service has a stored token + is active (drives the access-badge visibility). Per-service
   *  access detail rides on each `Service.authentik`. */
  authentikConfigured: boolean;
  /** An active Loki source exists (by logo "loki") — drives whether Admin shows the per-service
   *  "Logs" button. The logs themselves are fetched on-demand (admin-only), never on the snapshot. */
  lokiConfigured: boolean;
  /** An active Portainer instance has a stored token — drives whether the Admin edit form shows the
   *  container-name / endpoint fields. Per-service restartability rides on each `Service.canRestart`. */
  portainerConfigured: boolean;
}

export async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

// Opt-in perf tracing (AERIE_PERF_LOG=1). Times individual upstream calls and the
// snapshot's phase boundaries so we can see which section dominates a cold load.
// Off by default → zero overhead in normal runs.
const PERF = process.env.AERIE_PERF_LOG === "1" || process.env.AERIE_PERF_LOG === "true";
function perf<T>(label: string, p: Promise<T>): Promise<T> {
  if (!PERF) return p;
  const t0 = Date.now();
  return p.finally(() => console.log(`[perf] ${label}: ${Date.now() - t0}ms`));
}

export function padBeats(beats: number[]): number[] {
  if (beats.length >= 30) return beats.slice(-30);
  return [...Array(30 - beats.length).fill(1), ...beats];
}

/** Scope aggregator Traefik nodes to only those that route at least one configured service.
 *  Maps each service's correlated `route.instance` → service ids, then keeps only the nodes that
 *  serve ≥1 of them, attaching the served ids as `serves`. Unrelated infra nodes drop out. */
export function scopeTraefikInstances(
  instances: TraefikInstance[],
  services: { id: string; route?: TraefikRoute }[],
): TraefikInstance[] {
  const servesByNode = new Map<string, string[]>();
  for (const s of services) {
    const node = s.route?.instance;
    if (!node) continue;
    const list = servesByNode.get(node) ?? [];
    list.push(s.id);
    servesByNode.set(node, list);
  }
  return instances.flatMap((n) => {
    const serves = servesByNode.get(n.name);
    return serves?.length ? [{ ...n, serves }] : [];
  });
}

// The most recent fully-assembled snapshot, kept in-process so the shell can render
// instantly even when a fresh getSnapshot() would be slow (cold upstream after idle).
let lastSnapshot: Snapshot | null = null;

// Per-service timestamp of the last version-refresh attempt. Governs how often the
// snapshot triggers a background version check without blocking the response.
const versionLastScheduled = new Map<string, number>();
const VERSION_REFRESH_INTERVAL = 60 * 60 * 1000; // 1 hour

function scheduleVersionRefresh(serviceId: string): void {
  const last = versionLastScheduled.get(serviceId) ?? 0;
  if (Date.now() - last < VERSION_REFRESH_INTERVAL) return;
  versionLastScheduled.set(serviceId, Date.now()); // stamp before the async call to prevent concurrent double-fires
  void detectVersion(serviceId)
    .then((version) => version ? updateServiceVersion(serviceId, version) : Promise.resolve())
    .catch(() => {}); // silent — stale version stays until next successful check
}

/**
 * Snapshot for the blocking shell render: race a fresh getSnapshot() against a short
 * deadline. If it wins (the common warm/stale case, ~75ms) the shell gets live data; if
 * it's slow (a cold upstream like Overseerr after idle), fall back to the last good
 * snapshot so the shell never blocks — the fresh one keeps running in the background and
 * repopulates the caches + lastSnapshot for the next load. Only a true cold start (no
 * prior snapshot yet) awaits the full fetch, rather than render an empty shell.
 * `stale` tells the client to refetch promptly so the served-stale data catches up.
 */
export async function getSnapshotFast(deadlineMs = 600): Promise<{ snapshot: Snapshot; stale: boolean }> {
  const t0 = Date.now();
  const full = getSnapshot();
  full.catch(() => {}); // the losing branch is un-awaited; don't let it reject unhandled
  const fresh = await Promise.race([
    full.then((s) => ({ snapshot: s, stale: false })),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), deadlineMs)),
  ]);
  if (fresh) {
    if (process.env.AERIE_PERF_LOG) console.log(`[perf] getSnapshotFast: fresh in ${Date.now() - t0}ms`);
    return fresh;
  }
  if (lastSnapshot) {
    if (process.env.AERIE_PERF_LOG) console.log(`[perf] getSnapshotFast: served STALE after ${Date.now() - t0}ms deadline (fresh loading in background)`);
    return { snapshot: lastSnapshot, stale: true };
  }
  if (process.env.AERIE_PERF_LOG) console.log(`[perf] getSnapshotFast: cold start, awaiting full snapshot`);
  return { snapshot: await full, stale: false };
}

export async function getSnapshot(): Promise<Snapshot> {
  const tStart = Date.now();
  // One batched read of every stored secret per kind (apiKey + forwardAuth) instead of a
  // per-service getServiceSecret()/getForwardAuthConfig() round-trip. has(), configuredIds and
  // faConfigs below all derive from these two maps — no further secret awaits in this function.
  const [configs, groups, visibility, apiKeySecrets, faSecrets] = await Promise.all([
    getServiceConfigs(),
    getGroups(),
    getVisibility(),
    getAllServiceSecrets("apiKey"),
    getAllServiceSecrets("forwardAuth"),
  ]);

  // Which services are eligible for a live call. A service marked inactive is fully
  // disabled — never polled — so isActive() gates every live call below (folded into
  // has()/gatusOn/promOn, from which all the per-service *On flags derive).
  // Footgun by design: marking the *gatus* row inactive stops ALL heartbeats portal-wide,
  // and disabling *prometheus*/*beszel* stops the System Status metrics cards — that's the
  // intended "fully disable" behaviour for those infra rows.
  const isActive = (id: string) => configs.some((c) => c.id === id && c.active);
  // Gatus and Prometheus only need a baseUrl (API key is optional), so gate them on config
  // existence rather than has() — using has() would silently skip no-auth deployments.
  const has = (id: string) => isActive(id) && apiKeySecrets.has(id);
  const gatusOn = configs.some((c) => c.id === "gatus" && c.active);
  const promOn = configs.some((c) => c.id === "prometheus" && c.active);
  // Traefik's API can run open or behind basicAuth, so (like Gatus/Prometheus) gate on the row
  // being active rather than on a stored secret — a baseUrl is enough to read its API.
  // Multi-instance: any active service that reads as a Traefik counts — by logo OR id/name (see
  // isTraefikSource), so renamed instances (traefik-unraid / traefik-dockerhost) and a
  // traefik-dashboard-aggregator are all sources, and the cosmetic icon never gates discovery.
  // raw-vs-aggregator and the aggregator-only node-health are resolved per-source by probing
  // /api/snapshot inside traefikRoutes() / traefikInstances(), not from the logo here.
  const traefikOn = configs.some((c) => c.active && isTraefikSource(c));
  // Authentik's API requires a token, so gate on a stored secret (like Beszel).
  const authentikOn = has("authentik");
  // Loki: an active source (by logo "loki") gates the admin per-service "Logs" button. The log
  // tail is fetched on-demand via /api/loki/logs, so this is only a cheap config check (no network).
  const lokiOn = configs.some((c) => c.active && configMatchesLogo(c, "loki"));
  // Portainer: an active service carrying the portainer logo WITH a stored token gates the
  // admin-only container-restart control. Config-only presence check — no Portainer probe on
  // the snapshot path (the endpoint-resolution call happens only at restart time).
  const portainerOn = configs.some((c) => c.active && configMatchesLogo(c, "portainer") && apiKeySecrets.has(c.id));
  // Beszel can't run no-auth (PocketBase needs a token), so gate it on a stored
  // secret rather than config existence — an unconfigured row never goes live.
  const [ttOn, jfOn, absOn, osOn, sonarrOn, radarrOn, beszelOn, wizarrOn, prowlarrOn, agregarrOn, bazarrOn, nzbhydraOn, llOn, nzbgetOn, listenarrOn, qbitOn] = [
    has("tautulli"),
    has("jellyfin"),
    has("audiobookshelf"),
    has("overseerr"),
    has("sonarr"),
    has("radarr"),
    has("beszel"),
    has("wizarr"),
    has("prowlarr"),
    has("agregarr"),
    has("bazarr"),
    has("nzbhydra"),
    has("lazylibrarian"),
    isActive("nzbget"), // NZBGet can run without credentials (auth disabled)
    has("listenarr"),
    has("qbittorrent"),
  ];

  // Active metrics source: honour the stored preference when its source is live,
  // otherwise fall back to whichever of Prometheus / Beszel is configured.
  const [metricsSourceSetting, beszelSystemSetting, queueSourceSetting, traefikDismissedSetting] = await Promise.all([
    getDeploymentSetting("metricsSource"),
    getDeploymentSetting("beszelSystem"),
    getDeploymentSetting("queueSource"),
    getDeploymentSetting("traefikDismissed"),
  ]);
  // Hosts the admin has dismissed from the discovered-routers panel (JSON array of lowercased
  // hosts). Malformed JSON degrades to "nothing dismissed".
  const traefikDismissed = new Set<string>(
    (() => {
      try {
        const parsed = traefikDismissedSetting ? JSON.parse(traefikDismissedSetting) : [];
        return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string").map((h) => h.toLowerCase()) : [];
      } catch {
        return [];
      }
    })(),
  );
  const metricsSource: "prometheus" | "beszel" =
    metricsSourceSetting === "beszel" && beszelOn ? "beszel"
    : promOn ? "prometheus"
    : beszelOn ? "beszel"
    : "prometheus";
  const beszelSystemId = beszelSystemSetting && beszelSystemSetting.trim() ? beszelSystemSetting.trim() : null;

  // Active queue source: the *arr clients, NZBGet, and qBittorrent all surface download
  // progress, so only one feeds the Download Queue panel at a time.
  // Same resolution shape as metricsSource above.
  const arrQueueOn = sonarrOn || radarrOn || listenarrOn;
  const queueSource: QueueSource =
    queueSourceSetting === "nzbget" && nzbgetOn ? "nzbget"
    : queueSourceSetting === "qbittorrent" && qbitOn ? "qbittorrent"
    : arrQueueOn ? "arr"
    : nzbgetOn ? "nzbget"
    : qbitOn ? "qbittorrent"
    : "arr";

  if (PERF) console.log(`[perf] pre-wave (DB config/secret/settings): ${Date.now() - tStart}ms`);
  const tWave = Date.now();
  const [
    health, ttAct, jfNow, osReq, osUsers, sonarrQ, radarrQ, nzbgetQ, nzbgetStat, ttLibs, ttRecent, ttPlays, members, metricsResult,
    sonarrDisk, radarrDisk, sonarrHealth, radarrHealth, osIssues, sonarrCal, radarrCal, sonarrHist, radarrHist, ttTop,
    jfLibs, jfRecent, osVersion,
    osTrending, osPopularMovies, osPopularTv, osUpcomingMovies, osWatchlist, osRequestCounts,
    wizarrData, prowlarrData, agregarrData, bazarrData, nzbhydraData,
    ttUsers, absNow, llStats,
    listenarrQ, listenarrHist, listenarrHealthIssues, listenarrData,
    qbitQ, qbStats, altMetricsResult, traefikRoutesData, traefikInstancesData, authentikData,
  ] = await Promise.all([
    gatusOn ? perf("live:gatusHealth", safe(gatusHealth)) : Promise.resolve(null),
    ttOn ? perf("live:tautulliActivity", safe(tautulliActivity)) : Promise.resolve(null),
    jfOn ? perf("live:jellyfinNowPlaying", safe(jellyfinNowPlaying)) : Promise.resolve(null),
    osOn ? perf("live:overseerrRequests", safe(overseerrRequests)) : Promise.resolve(null),
    osOn ? safe(overseerrUsers) : Promise.resolve(null),
    // Only the active queue source makes live queue calls (see resolution above).
    queueSource === "arr" && sonarrOn ? perf("live:arrQueue(sonarr)", safe(() => arrQueue("sonarr"))) : Promise.resolve(null),
    queueSource === "arr" && radarrOn ? perf("live:arrQueue(radarr)", safe(() => arrQueue("radarr"))) : Promise.resolve(null),
    queueSource === "nzbget" ? perf("live:nzbgetQueue", safe(nzbgetQueue)) : Promise.resolve(null),
    // Status fires whenever NZBGet is configured (not just when it's the active queue source) so the
    // Download Client widget can show NZBGet stats regardless of the queue source — like qbittorrentStats.
    nzbgetOn ? perf("live:nzbgetStatus", safe(nzbgetStatus)) : Promise.resolve(null),
    ttOn ? safe(tautulliLibraries) : Promise.resolve(null),
    ttOn ? safe(tautulliRecentlyAdded) : Promise.resolve(null),
    ttOn ? safe(tautulliPlays24h) : Promise.resolve(null),
    getMembers(),
    // Only the active source makes a live call — Beszel implies beszelOn (see resolution above).
    metricsSource === "beszel" ? perf("live:beszelMetrics", safe(beszelMetrics)) : promOn ? perf("live:prometheusMetrics", safe(prometheusMetrics)) : Promise.resolve(null),
    // Tier 1/2 enrichments (cached upstream-side; safe to fetch every poll)
    sonarrOn ? safe(() => arrDiskSpace("sonarr")) : Promise.resolve(null),
    radarrOn ? safe(() => arrDiskSpace("radarr")) : Promise.resolve(null),
    sonarrOn ? safe(() => arrHealth("sonarr")) : Promise.resolve(null),
    radarrOn ? safe(() => arrHealth("radarr")) : Promise.resolve(null),
    osOn ? safe(overseerrIssues) : Promise.resolve(null),
    sonarrOn ? safe(() => arrCalendar("sonarr")) : Promise.resolve(null),
    radarrOn ? safe(() => arrCalendar("radarr")) : Promise.resolve(null),
    sonarrOn ? safe(() => arrHistory("sonarr")) : Promise.resolve(null),
    radarrOn ? safe(() => arrHistory("radarr")) : Promise.resolve(null),
    ttOn ? safe(tautulliHomeStats) : Promise.resolve(null),
    jfOn ? safe(jellyfinLibraries) : Promise.resolve(null),
    jfOn ? safe(jellyfinRecentlyAdded) : Promise.resolve(null),
    osOn ? safe(overseerrVersion) : Promise.resolve(null),
    // Discover feeds (Overseerr → TMDB) — cached 1h inside the functions
    osOn ? safe(overseerrTrending) : Promise.resolve(null),
    osOn ? safe(overseerrPopularMovies) : Promise.resolve(null),
    osOn ? safe(overseerrPopularTv) : Promise.resolve(null),
    osOn ? safe(overseerrUpcomingMovies) : Promise.resolve(null),
    osOn ? safe(overseerrWatchlist) : Promise.resolve(null),
    osOn ? safe(overseerrRequestCounts) : Promise.resolve(null),
    wizarrOn ? safe(wizarrStats) : Promise.resolve(null),
    prowlarrOn ? safe(prowlarrStats) : Promise.resolve(null),
    agregarrOn ? safe(agregarrStatus) : Promise.resolve(null),
    bazarrOn ? safe(bazarrWanted) : Promise.resolve(null),
    nzbhydraOn ? safe(nzbhydra2Stats) : Promise.resolve(null),
    ttOn ? safe(tautulliUsers) : Promise.resolve(null),
    absOn ? perf("live:absNowPlaying", safe(audiobookshelfNowPlaying)) : Promise.resolve(null),
    llOn ? safe(lazylibrarianStats) : Promise.resolve(null),
    queueSource === "arr" && listenarrOn ? perf("live:listenarrQueue", safe(listenarrQueue)) : Promise.resolve(null),
    listenarrOn ? safe(listenarrHistory) : Promise.resolve(null),
    listenarrOn ? safe(listenarrHealth) : Promise.resolve(null),
    listenarrOn ? safe(listenarrStats) : Promise.resolve(null),
    // qBittorrent: only the active queue source fires the torrent list; stats always fire when configured.
    queueSource === "qbittorrent" ? perf("live:qbittorrentQueue", safe(qbittorrentQueue)) : Promise.resolve(null),
    qbitOn ? perf("live:qbittorrentStats", safe(qbittorrentStats)) : Promise.resolve(null),
    // Per-widget Host Stats source pick: fetch the OTHER configured metrics source too (the
    // active one comes via metricsResult). Bounded to one extra call, only when both are set up.
    (metricsSource === "beszel" ? promOn : beszelOn)
      ? perf("live:metrics(alt)", safe(metricsSource === "beszel" ? prometheusMetrics : beszelMetrics))
      : Promise.resolve(null),
    traefikOn ? perf("live:traefikRoutes", safe(traefikRoutes)) : Promise.resolve(null),
    // Node-health runs for any active Traefik source; it returns [] for genuinely-raw sources
    // (only those that probe as an aggregator contribute nodes).
    traefikOn ? perf("live:traefikInstances", safe(traefikInstances)) : Promise.resolve(null),
    authentikOn ? perf("live:authentikApps", safe(authentikApps)) : Promise.resolve(null),
  ]);
  if (PERF) console.log(`[perf] wave-1 (all upstreams Promise.all): ${Date.now() - tWave}ms`);

  // services: DB config merged with live Gatus health. Without a Gatus
  // reading we have no real health data → an honest "unknown" status
  // (beats of -1 render as a neutral "no data" baseline). We never
  // fabricate an "up / 100%" reading for an unmonitored service.
  const healthFor = (id: string, name: string, monitoringKey: string | null): Pick<Service, "status" | "ms" | "uptime" | "uptime24h" | "beats" | "lastIncidentAt" | "msHistory"> => {
    if (health) {
      const h: ServiceHealth | undefined = monitoringKey
        ? health.find((x) => x.key === monitoringKey)
        : health.find((x) => x.key === id || x.name.toLowerCase() === name.toLowerCase());
      if (h) return { status: h.status, ms: h.ms, uptime: h.uptime, uptime24h: h.uptime24h, beats: padBeats(h.beats), lastIncidentAt: h.lastIncidentAt, msHistory: h.msHistory };
    }
    return { status: "unknown", ms: 0, uptime: 0, beats: new Array(30).fill(-1), msHistory: [] };
  };

  // Which services have a secret stored (encrypted) — surfaced to the client as a boolean only
  // (never the value) so the Admin UI can distinguish configured from unconfigured services.
  const configuredIds = new Set(configs.filter((c) => apiKeySecrets.has(c.id)).map((c) => c.id));

  // Non-secret forward-auth config per service (method + account, never the password), so the
  // Admin edit form can reflect what's stored instead of defaulting to "keep current". Parsed
  // from the batched forwardAuth secrets read at the top — no per-service DB round-trip.
  const faConfigs = new Map(
    configs.map((c) => {
      const fa = parseForwardAuthConfig(faSecrets.get(c.id) ?? null);
      if (!fa) return [c.id, undefined] as const;
      // Surface only the non-secret fields — the password never leaves the server.
      const rest: Service["forwardAuthConfig"] =
        fa.method === "bearer"
          ? { method: "bearer", username: fa.username, tokenUrl: fa.tokenUrl, clientId: fa.clientId, scope: fa.scope }
          : { method: "basic", username: fa.username };
      return [c.id, rest] as const;
    }),
  );

  // Correlate Traefik routers to services by host (the only reliable join). First match wins.
  const routeByHost = new Map<string, TraefikRoute>();
  for (const r of traefikRoutesData ?? []) {
    for (const h of r.hosts) if (!routeByHost.has(h)) routeByHost.set(h, r);
  }
  const routeFor = (c: { id: string; host: string }): TraefikRoute | undefined => {
    const r = routeByHost.get(c.host.toLowerCase());
    return r ? { ...r, serviceId: c.id } : undefined;
  };
  // Authentik apps correlated to services by launch-URL host (same join as Traefik).
  const accessByHost = new Map<string, AuthentikAccess>();
  for (const a of authentikData ?? []) if (!accessByHost.has(a.host)) accessByHost.set(a.host, a);
  // Forward-auth proxy outposts protect a whole parent domain (e.g. an app launching at
  // `unraid.in.example.com` covers `sonarr.unraid.in.example.com`). Restrict the parent-domain
  // fallback to *proxy* providers (not OAuth2 apps, which are per-host) and prefer the most specific
  // (longest host) outpost. Exact-host matches always win over an inherited outpost.
  const proxyOutposts = (authentikData ?? [])
    .filter((a) => /proxy/i.test(a.providerType ?? ""))
    .sort((x, y) => y.host.length - x.host.length);
  const accessFor = (c: { id: string; host: string }): AuthentikAccess | undefined => {
    const host = c.host.toLowerCase();
    const exact = accessByHost.get(host);
    if (exact) return { ...exact, serviceId: c.id };
    const outpost = proxyOutposts.find((a) => host === a.host || host.endsWith(`.${a.host}`));
    return outpost ? { ...outpost, serviceId: c.id, inheritedFrom: outpost.appName } : undefined;
  };
  // Routers whose host matches no configured service → "discovered" suggestions for Admin
  // (deduped by host; prefer the https/TLS router when a host has both http + https routers).
  const configuredHosts = new Set(configs.map((c) => c.host.toLowerCase()));
  const discoveredByHost = new Map<string, TraefikRoute>();
  for (const r of traefikRoutesData ?? []) {
    if (r.hosts.some((h) => configuredHosts.has(h))) continue;
    // Hosts the admin dismissed never reappear as suggestions.
    if (r.hosts.some((h) => traefikDismissed.has(h.toLowerCase()))) continue;
    const key = r.hosts[0];
    const existing = discoveredByHost.get(key);
    if (!existing || (r.tls && !existing.tls)) discoveredByHost.set(key, r);
  }
  const traefikDiscovered = [...discoveredByHost.values()].sort((a, b) =>
    a.hosts[0].localeCompare(b.hosts[0]),
  );

  const services: Service[] = configs.map((c) => ({
    id: c.id,
    name: c.name,
    cat: c.cat,
    icon: c.icon,
    logoSlug: c.logoSlug ?? undefined,
    embeddable: c.embeddable,
    active: c.active,
    keepAlive: c.keepAlive,
    central: c.central,
    centralLabel: c.centralLabel ?? undefined,
    host: c.host,
    scheme: c.baseUrl?.startsWith("http:") ? "http" : "https",
    internalUrl: c.internalUrl ?? undefined,
    insecureTls: c.insecureTls,
    version: (c.id === "overseerr" && osVersion) ? osVersion : (c.version ?? ""),
    note: c.note ?? "",
    monitoringKey: c.monitoringKey ?? undefined,
    lokiQuery: c.lokiQuery ?? undefined,
    containerName: c.containerName ?? undefined,
    portainerEndpointId: c.portainerEndpointId ?? undefined,
    // Restartable for any active service once a Portainer instance is configured. The container name
    // defaults to the service id (the restart action resolves it across endpoints, case-insensitively),
    // so no per-service config is needed when the container is named after the slug; a wrong guess
    // just fails-soft with a toast. An explicit containerName overrides the id.
    canRestart: c.active && portainerOn,
    hasSecret: configuredIds.has(c.id),
    forwardAuthConfig: faConfigs.get(c.id),
    route: routeFor(c),
    authentik: accessFor(c),
    ...healthFor(c.id, c.name, c.monitoringKey),
  }));

  // Traefik node health, scoped to only the nodes that route a configured service (uses the
  // per-service `route.instance` just correlated above). Empty unless an aggregator source is active.
  const traefikInstancesScoped = scopeTraefikInstances(traefikInstancesData ?? [], services);

  // Background version refresh — does not block this response; DB is updated asynchronously
  // and the new version is served by the next snapshot poll (≤12 s later).
  for (const c of configs) {
    if (c.active) scheduleVersionRefresh(c.id);
  }

  const nowPlaying: NowPlaying[] = [...(ttAct?.sessions ?? []), ...(jfNow ?? []), ...(absNow ?? [])];
  // Only the active queue source fetched (the others resolved null), so this stays single-source.
  const queue: QueueItem[] = [...(sonarrQ ?? []), ...(radarrQ ?? []), ...(listenarrQ ?? []), ...(nzbgetQ ?? []), ...(qbitQ ?? [])];
  const bandwidth = ttAct ? { totalMbps: ttAct.totalKbps / 1000, wanMbps: ttAct.wanKbps / 1000 } : null;

  // ── Overseerr identity join: attribute each request to the portal account that
  // owns the same email. Overseerr requests carry the requester's email; portal
  // members carry theirs. Match case-insensitively, in-memory (no DB writes). ──
  const emailToPortalId = new Map<string, string>();
  for (const m of members) {
    const key = m.email?.trim().toLowerCase();
    if (key) emailToPortalId.set(key, m.id);
  }

  // ── Plex avatars: Tautulli `get_users` gives every Plex user a `user_thumb`.
  // Index by email + username + friendly_name so we can attach a real profile
  // photo to portal users and request requesters anywhere they appear. ──
  const avatarByEmail = new Map<string, string>();
  const avatarByName = new Map<string, string>();
  for (const p of ttUsers ?? []) {
    if (!p.avatar) continue;
    if (p.email) avatarByEmail.set(p.email.trim().toLowerCase(), p.avatar);
    if (p.username) avatarByName.set(p.username.trim().toLowerCase(), p.avatar);
    if (p.friendlyName) avatarByName.set(p.friendlyName.trim().toLowerCase(), p.avatar);
  }
  const avatarFor = (email?: string, name?: string): string | undefined =>
    (email ? avatarByEmail.get(email.trim().toLowerCase()) : undefined) ??
    (name ? avatarByName.get(name.trim().toLowerCase()) : undefined);

  const requests: MediaRequest[] = (osReq ?? []).map((r) => ({
    ...r,
    portalUser: r.requesterEmail ? emailToPortalId.get(r.requesterEmail.trim().toLowerCase()) : undefined,
    requesterAvatar: r.requesterAvatar ?? avatarFor(r.requesterEmail, r.requesterName),
  }));

  // Portal ids whose email resolves to a real Overseerr account → "linked".
  const overseerrEmails = new Set((osUsers ?? []).map((u) => u.email?.trim().toLowerCase()).filter(Boolean) as string[]);

  // ── members: DB-mirrored, quota fetched live from Overseerr (cached 3 min per user) ──
  const tQuota = Date.now();
  const users: User[] = await Promise.all(
    members.map(async (m) => {
      const oUserId = matchOverseerrUserId(osUsers ?? [], m.email);
      const quota = oUserId != null ? await safe(() => overseerrUserQuota(oUserId)) : null;
      return {
        id: m.id,
        name: m.name,
        handle: m.email.split("@")[0] || m.id,
        role: m.role,
        email: m.email,
        linked: overseerrEmails.has(m.email?.trim().toLowerCase()) || m.linked,
        avatar: avatarFor(m.email, m.name),
        groups: m.role === "admin" ? [env.adminGroup] : ["friends"],
        movieQuota: quota?.movie ?? null,
        tvQuota: quota?.tv ?? null,
        watching: nowPlaying.find((np) => np.user === m.id)?.id ?? null,
      };
    }),
  );
  if (PERF) console.log(`[perf] quota-wave (${members.length} members): ${Date.now() - tQuota}ms | getSnapshot TOTAL: ${Date.now() - tStart}ms`);

  // ── library / recent: collect every configured source (tagged with `source` so a
  // widget can pick one); `library`/`recent` are the Auto-resolved views (Tautulli/Plex
  // wins for media, books/audiobooks always appended). See buildLibrary/buildRecent. ──
  const { libraryAll, library } = buildLibrary({
    tautulli: ttLibs,
    jellyfin: jfLibs,
    lazylibrarian: llStats ? lazylibrarianLibraryStats(llStats) : null,
    listenarr: listenarrData ? listenarrLibraryStats(listenarrData) : null,
    playsCard: ttLibs && ttLibs.length > 0
      ? { id: "plays", label: "Plays 24h", count: (ttPlays?.total ?? 0).toLocaleString("en-US"), icon: "play_arrow", delta: `${nowPlaying.length} active now` }
      : null,
  });
  const { recentAll, recent } = buildRecent(ttRecent, jfRecent);

  // Rolling 24h play activity, bucketed hourly by Tautulli history (empty until configured).
  const plays24h: number[] = ttPlays?.hourly ?? [];

  // ── Tier 1/2 assembly ──
  // storage: combine *arr disk reports, de-duplicate by path (sonarr+radarr usually share mounts).
  const storageByPath = new Map<string, StorageMount>();
  for (const m of [...(sonarrDisk ?? []), ...(radarrDisk ?? [])]) {
    if (!storageByPath.has(m.path)) storageByPath.set(m.path, m);
  }
  const storage: StorageMount[] = [...storageByPath.values()].sort((a, b) => b.totalBytes - a.totalBytes);

  const arrHealthIssues: HealthIssue[] = [...(sonarrHealth ?? []), ...(radarrHealth ?? []), ...(listenarrHealthIssues ?? [])];
  const issues = osIssues ?? null;

  const upcoming: UpcomingItem[] = [...(sonarrCal ?? []), ...(radarrCal ?? [])].sort(
    (a, b) => Date.parse(a.when) - Date.parse(b.when),
  );
  const downloads: DownloadEvent[] = [...(sonarrHist ?? []), ...(radarrHist ?? []), ...(listenarrHist ?? [])]
    .sort((a, b) => Date.parse(b.when) - Date.parse(a.when))
    .slice(0, 30);
  // Attach Plex avatars to the "top viewers" leaderboard (names are Plex
  // friendly names → match the avatar roster built above).
  const topStats: TopStats | null = ttTop
    ? { ...ttTop, users: ttTop.users.map((u) => ({ ...u, avatar: avatarFor(undefined, u.name) })) }
    : null;

  const discover = osOn && (osTrending || osPopularMovies || osPopularTv || osUpcomingMovies || osWatchlist)
    ? {
        trending: osTrending ?? [],
        popularMovies: osPopularMovies ?? [],
        popularTv: osPopularTv ?? [],
        upcomingMovies: osUpcomingMovies ?? [],
        watchlist: osWatchlist ?? [],
      }
    : null;

  // Host metrics per source, so a Host Stats tile can pick Prometheus or Beszel
  // (Auto = the active metricsSource). The active source is metricsResult; the
  // other configured source (if any) is altMetricsResult.
  const metricsBySource = buildMetricsBySource(metricsSource, metricsResult ?? null, altMetricsResult ?? null);

  const snapshot: Snapshot = {
    services, nowPlaying, requests, users, library, libraryAll, recent, recentAll, queue, plays24h, bandwidth,
    storage, issues, arrHealth: arrHealthIssues, upcoming, downloads, topStats,
    groups, visibility, adminGroup: env.adminGroup, metrics: metricsResult ?? null, metricsBySource,
    metricsSource, prometheusConfigured: promOn, beszelConfigured: beszelOn, beszelSystemId,
    queueSource, arrQueueConfigured: arrQueueOn, nzbgetConfigured: nzbgetOn, nzbgetStatus: nzbgetStat ?? null,
    qbittorrentConfigured: qbitOn, qbittorrent: qbStats ?? null,
    discover, requestCounts: osRequestCounts ?? null,
    wizarr: wizarrData ?? null, prowlarr: prowlarrData ?? null,
    agregarr: agregarrData ?? null, bazarrWanted: bazarrData ?? null,
    nzbhydra: nzbhydraData ?? null,
    lazylibrarian: llStats ?? null,
    listenarr: listenarrData ?? null,
    traefikConfigured: traefikOn,
    traefikDiscovered,
    traefikDismissed: [...traefikDismissed],
    traefikInstances: traefikInstancesScoped,
    authentikConfigured: authentikOn,
    lokiConfigured: lokiOn,
    portainerConfigured: portainerOn,
  };
  lastSnapshot = snapshot;
  return snapshot;
}
