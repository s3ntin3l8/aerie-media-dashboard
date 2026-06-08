// ============================================================
// AERIE — data facade (server-only)
// Aggregates every upstream into one Snapshot. Each section shows
// real upstream data, or an empty state when its service is
// unconfigured or erroring — a dead upstream only degrades its own
// panel. Live calls only fire for services that have a stored secret.
// ============================================================
import "server-only";
import type { LibraryStat, MediaRequest, NowPlaying, QueueItem, NzbgetStatus, QbittorrentStats, QueueSource, RecentItem, Service, User, StorageMount, IssueItem, HealthIssue, UpcomingItem, DownloadEvent, TopStats, DiscoverItem } from "@/lib/types";
import { getServiceConfigs, getServiceSecret, getGroups, getVisibility, getMembers, getDeploymentSetting, type GroupRow, type VisibilityRow } from "@/lib/integrations/registry";
import {
  gatusHealth,
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
  type ServiceHealth,
  type NodeMetrics,
  type WizarrStats,
  type ProwlarrStats,
  type AgregarrStatus,
  type BazarrWanted,
  type Nzbhydra2Stats,
} from "@/lib/integrations/clients";
import { env } from "@/lib/env";

export interface Snapshot {
  services: Service[];
  nowPlaying: NowPlaying[];
  requests: MediaRequest[];
  users: User[];
  library: LibraryStat[];
  recent: RecentItem[];
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
}

async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
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

function padBeats(beats: number[]): number[] {
  if (beats.length >= 30) return beats.slice(-30);
  return [...Array(30 - beats.length).fill(1), ...beats];
}

// The most recent fully-assembled snapshot, kept in-process so the shell can render
// instantly even when a fresh getSnapshot() would be slow (cold upstream after idle).
let lastSnapshot: Snapshot | null = null;

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
  const [configs, groups, visibility] = await Promise.all([getServiceConfigs(), getGroups(), getVisibility()]);

  // Which services are eligible for a live call. A service marked inactive is fully
  // disabled — never polled — so isActive() gates every live call below (folded into
  // has()/gatusOn/promOn, from which all the per-service *On flags derive).
  // Footgun by design: marking the *gatus* row inactive stops ALL heartbeats portal-wide,
  // and disabling *prometheus*/*beszel* stops the System Status metrics cards — that's the
  // intended "fully disable" behaviour for those infra rows.
  const isActive = (id: string) => configs.some((c) => c.id === id && c.active);
  // Gatus and Prometheus only need a baseUrl (API key is optional), so gate them on config
  // existence rather than has() — using has() would silently skip no-auth deployments.
  const has = async (id: string) => isActive(id) && (await getServiceSecret(id)) != null;
  const gatusOn = configs.some((c) => c.id === "gatus" && c.active);
  const promOn = configs.some((c) => c.id === "prometheus" && c.active);
  // Beszel can't run no-auth (PocketBase needs a token), so gate it on a stored
  // secret rather than config existence — an unconfigured row never goes live.
  const [ttOn, jfOn, absOn, osOn, sonarrOn, radarrOn, beszelOn, wizarrOn, prowlarrOn, agregarrOn, bazarrOn, nzbhydraOn, llOn, nzbgetOn, listenarrOn, qbitOn] = await Promise.all([
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
  ]);

  // Active metrics source: honour the stored preference when its source is live,
  // otherwise fall back to whichever of Prometheus / Beszel is configured.
  const [metricsSourceSetting, beszelSystemSetting, queueSourceSetting] = await Promise.all([
    getDeploymentSetting("metricsSource"),
    getDeploymentSetting("beszelSystem"),
    getDeploymentSetting("queueSource"),
  ]);
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
    qbitQ, qbStats,
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
    queueSource === "nzbget" ? perf("live:nzbgetStatus", safe(nzbgetStatus)) : Promise.resolve(null),
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
  ]);
  if (PERF) console.log(`[perf] wave-1 (all upstreams Promise.all): ${Date.now() - tWave}ms`);

  // services: DB config merged with live Gatus health. Without a Gatus
  // reading we have no real health data → an honest "unknown" status
  // (beats of -1 render as a neutral "no data" baseline). We never
  // fabricate an "up / 100%" reading for an unmonitored service.
  const healthFor = (id: string, name: string, monitoringKey: string | null): Pick<Service, "status" | "ms" | "uptime" | "beats" | "lastIncidentAt" | "msHistory"> => {
    if (health) {
      const h: ServiceHealth | undefined = monitoringKey
        ? health.find((x) => x.key === monitoringKey)
        : health.find((x) => x.key === id || x.name.toLowerCase() === name.toLowerCase());
      if (h) return { status: h.status, ms: h.ms, uptime: h.uptime, beats: padBeats(h.beats), lastIncidentAt: h.lastIncidentAt, msHistory: h.msHistory };
    }
    return { status: "unknown", ms: 0, uptime: 0, beats: new Array(30).fill(-1), msHistory: [] };
  };

  const services: Service[] = configs.map((c) => ({
    id: c.id,
    name: c.name,
    cat: c.cat,
    icon: c.icon,
    logoSlug: c.logoSlug ?? undefined,
    embeddable: c.embeddable,
    active: c.active,
    central: c.central,
    centralLabel: c.centralLabel ?? undefined,
    host: c.host,
    scheme: c.baseUrl?.startsWith("http:") ? "http" : "https",
    internalUrl: c.internalUrl ?? undefined,
    insecureTls: c.insecureTls,
    version: (c.id === "overseerr" && osVersion) ? osVersion : (c.version ?? ""),
    note: c.note ?? "",
    monitoringKey: c.monitoringKey ?? undefined,
    ...healthFor(c.id, c.name, c.monitoringKey),
  }));

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

  // ── library: Tautulli (Plex) sections win; fall back to Jellyfin so a Jellyfin-only
  // deployment still gets library counts. 24h-plays row is Tautulli-only. ──
  const baseLibs = ttLibs && ttLibs.length > 0 ? ttLibs : (jfLibs ?? []);
  const mediaLibs: LibraryStat[] =
    baseLibs.length > 0
      ? ttLibs && ttLibs.length > 0
        ? [...baseLibs, { id: "plays", label: "Plays 24h", count: (ttPlays?.total ?? 0).toLocaleString("en-US"), icon: "play_arrow", delta: `${nowPlaying.length} active now` }]
        : baseLibs
      : [];
  // Append LazyLibrarian on-disk counts (audiobooks/ebooks) and Listenarr's library count so
  // a books deployment still gets library cards; the headline totals / wanted / authors live
  // in the dedicated LazyLibrarian / Listenarr widgets.
  const library: LibraryStat[] = [
    ...mediaLibs,
    ...(llStats ? lazylibrarianLibraryStats(llStats) : []),
    ...(listenarrData ? listenarrLibraryStats(listenarrData) : []),
  ];

  // recent: prefer Tautulli (Plex); fall back to Jellyfin when Plex has none.
  const recent: RecentItem[] = ttRecent && ttRecent.length > 0 ? ttRecent : (jfRecent ?? []);

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

  const snapshot: Snapshot = {
    services, nowPlaying, requests, users, library, recent, queue, plays24h, bandwidth,
    storage, issues, arrHealth: arrHealthIssues, upcoming, downloads, topStats,
    groups, visibility, adminGroup: env.adminGroup, metrics: metricsResult ?? null,
    metricsSource, prometheusConfigured: promOn, beszelConfigured: beszelOn, beszelSystemId,
    queueSource, arrQueueConfigured: arrQueueOn, nzbgetConfigured: nzbgetOn, nzbgetStatus: nzbgetStat ?? null,
    qbittorrentConfigured: qbitOn, qbittorrent: qbStats ?? null,
    discover, requestCounts: osRequestCounts ?? null,
    wizarr: wizarrData ?? null, prowlarr: prowlarrData ?? null,
    agregarr: agregarrData ?? null, bazarrWanted: bazarrData ?? null,
    nzbhydra: nzbhydraData ?? null,
    lazylibrarian: llStats ?? null,
    listenarr: listenarrData ?? null,
  };
  lastSnapshot = snapshot;
  return snapshot;
}
