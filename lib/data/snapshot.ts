// ============================================================
// AERIE — data facade (server-only)
// Aggregates every upstream into one Snapshot. Each section shows
// real upstream data, or an empty state when its service is
// unconfigured or erroring — a dead upstream only degrades its own
// panel. Live calls only fire for services that have a stored secret.
// ============================================================
import "server-only";
import type { LibraryStat, MediaRequest, NowPlaying, QueueItem, RecentItem, Service, User, StorageMount, IssueItem, HealthIssue, UpcomingItem, DownloadEvent, TopStats } from "@/lib/types";
import { getServiceConfigs, getServiceSecret, getGroups, getVisibility, getMembers, getDeploymentSetting, type GroupRow, type VisibilityRow } from "@/lib/integrations/registry";
import {
  gatusHealth,
  tautulliActivity,
  jellyfinNowPlaying,
  jellyfinLibraries,
  jellyfinRecentlyAdded,
  overseerrRequests,
  overseerrUsers,
  overseerrVersion,
  arrQueue,
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
  type ServiceHealth,
  type NodeMetrics,
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
}

async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

function padBeats(beats: number[]): number[] {
  if (beats.length >= 30) return beats.slice(-30);
  return [...Array(30 - beats.length).fill(1), ...beats];
}

export async function getSnapshot(): Promise<Snapshot> {
  const [configs, groups, visibility] = await Promise.all([getServiceConfigs(), getGroups(), getVisibility()]);

  // Which services have a stored secret → eligible for a live call.
  // Gatus and Prometheus only need a baseUrl (API key is optional), so gate them on config
  // existence rather than has() — using has() would silently skip no-auth deployments.
  const has = async (id: string) => (await getServiceSecret(id)) != null;
  const gatusOn = configs.some((c) => c.id === "gatus");
  const promOn = configs.some((c) => c.id === "prometheus");
  // Beszel can't run no-auth (PocketBase needs a token), so gate it on a stored
  // secret rather than config existence — an unconfigured row never goes live.
  const [ttOn, jfOn, osOn, sonarrOn, radarrOn, beszelOn] = await Promise.all([
    has("tautulli"),
    has("jellyfin"),
    has("overseerr"),
    has("sonarr"),
    has("radarr"),
    has("beszel"),
  ]);

  // Active metrics source: honour the stored preference when its source is live,
  // otherwise fall back to whichever of Prometheus / Beszel is configured.
  const [metricsSourceSetting, beszelSystemSetting] = await Promise.all([
    getDeploymentSetting("metricsSource"),
    getDeploymentSetting("beszelSystem"),
  ]);
  const metricsSource: "prometheus" | "beszel" =
    metricsSourceSetting === "beszel" && beszelOn ? "beszel"
    : promOn ? "prometheus"
    : beszelOn ? "beszel"
    : "prometheus";
  const beszelSystemId = beszelSystemSetting && beszelSystemSetting.trim() ? beszelSystemSetting.trim() : null;

  const [
    health, ttAct, jfNow, osReq, osUsers, sonarrQ, radarrQ, ttLibs, ttRecent, ttPlays, members, metricsResult,
    sonarrDisk, radarrDisk, sonarrHealth, radarrHealth, osIssues, sonarrCal, radarrCal, sonarrHist, radarrHist, ttTop,
    jfLibs, jfRecent, osVersion,
  ] = await Promise.all([
    gatusOn ? safe(gatusHealth) : Promise.resolve(null),
    ttOn ? safe(tautulliActivity) : Promise.resolve(null),
    jfOn ? safe(jellyfinNowPlaying) : Promise.resolve(null),
    osOn ? safe(overseerrRequests) : Promise.resolve(null),
    osOn ? safe(overseerrUsers) : Promise.resolve(null),
    sonarrOn ? safe(() => arrQueue("sonarr")) : Promise.resolve(null),
    radarrOn ? safe(() => arrQueue("radarr")) : Promise.resolve(null),
    ttOn ? safe(tautulliLibraries) : Promise.resolve(null),
    ttOn ? safe(tautulliRecentlyAdded) : Promise.resolve(null),
    ttOn ? safe(tautulliPlays24h) : Promise.resolve(null),
    getMembers(),
    // Only the active source makes a live call — Beszel implies beszelOn (see resolution above).
    metricsSource === "beszel" ? safe(beszelMetrics) : promOn ? safe(prometheusMetrics) : Promise.resolve(null),
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
  ]);

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
    central: c.central,
    centralLabel: c.centralLabel ?? undefined,
    host: c.host,
    scheme: c.baseUrl?.startsWith("http:") ? "http" : "https",
    internalUrl: c.internalUrl ?? undefined,
    version: (c.id === "overseerr" && osVersion) ? osVersion : (c.version ?? ""),
    note: c.note ?? "",
    monitoringKey: c.monitoringKey ?? undefined,
    ...healthFor(c.id, c.name, c.monitoringKey),
  }));

  const nowPlaying: NowPlaying[] = [...(ttAct?.sessions ?? []), ...(jfNow ?? [])];
  const queue: QueueItem[] = [...(sonarrQ ?? []), ...(radarrQ ?? [])];
  const bandwidth = ttAct ? { totalMbps: ttAct.totalKbps / 1000, wanMbps: ttAct.wanKbps / 1000 } : null;

  // ── Overseerr identity join: attribute each request to the portal account that
  // owns the same email. Overseerr requests carry the requester's email; portal
  // members carry theirs. Match case-insensitively, in-memory (no DB writes). ──
  const emailToPortalId = new Map<string, string>();
  for (const m of members) {
    const key = m.email?.trim().toLowerCase();
    if (key) emailToPortalId.set(key, m.id);
  }
  const requests: MediaRequest[] = (osReq ?? []).map((r) => ({
    ...r,
    portalUser: r.requesterEmail ? emailToPortalId.get(r.requesterEmail.trim().toLowerCase()) : undefined,
  }));

  // Portal ids whose email resolves to a real Overseerr account → "linked".
  const overseerrEmails = new Set((osUsers ?? []).map((u) => u.email?.trim().toLowerCase()).filter(Boolean) as string[]);

  // ── members: DB-mirrored, with reqUsed/watching/groups derived from live data ──
  const users: User[] = members.map((m) => ({
    id: m.id,
    name: m.name,
    handle: m.email.split("@")[0] || m.id,
    role: m.role,
    email: m.email,
    // "linked" = the member's email resolves to an Overseerr account (or a manual DB link).
    linked: overseerrEmails.has(m.email?.trim().toLowerCase()) || m.linked,
    groups: m.role === "admin" ? [env.adminGroup] : ["friends"],
    // reqUsed counts the member's Overseerr requests (within the last 50 fetched — see overseerrRequests take=50).
    reqUsed: requests.filter((r) => r.portalUser === m.id).length,
    reqQuota: m.reqQuota,
    watching: nowPlaying.find((np) => np.user === m.id)?.id ?? null,
  }));

  // ── library: Tautulli (Plex) sections win; fall back to Jellyfin so a Jellyfin-only
  // deployment still gets library counts. 24h-plays row is Tautulli-only. ──
  const baseLibs = ttLibs && ttLibs.length > 0 ? ttLibs : (jfLibs ?? []);
  const library: LibraryStat[] =
    baseLibs.length > 0
      ? ttLibs && ttLibs.length > 0
        ? [...baseLibs, { id: "plays", label: "Plays 24h", count: (ttPlays?.total ?? 0).toLocaleString("en-US"), icon: "play_arrow", delta: `${nowPlaying.length} active now` }]
        : baseLibs
      : [];

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

  const arrHealthIssues: HealthIssue[] = [...(sonarrHealth ?? []), ...(radarrHealth ?? [])];
  const issues = osIssues ?? null;

  const upcoming: UpcomingItem[] = [...(sonarrCal ?? []), ...(radarrCal ?? [])].sort(
    (a, b) => Date.parse(a.when) - Date.parse(b.when),
  );
  const downloads: DownloadEvent[] = [...(sonarrHist ?? []), ...(radarrHist ?? [])]
    .sort((a, b) => Date.parse(b.when) - Date.parse(a.when))
    .slice(0, 30);
  const topStats: TopStats | null = ttTop ?? null;

  return {
    services, nowPlaying, requests, users, library, recent, queue, plays24h, bandwidth,
    storage, issues, arrHealth: arrHealthIssues, upcoming, downloads, topStats,
    groups, visibility, adminGroup: env.adminGroup, metrics: metricsResult ?? null,
    metricsSource, prometheusConfigured: promOn, beszelConfigured: beszelOn, beszelSystemId,
  };
}
