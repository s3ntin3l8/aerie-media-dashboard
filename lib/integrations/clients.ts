// ============================================================
// AERIE — upstream integration clients (server-only)
// Each function fetches + normalizes one upstream. They throw on
// missing config / errors; the data facade catches and falls back
// to mock so a dead or unconfigured upstream only degrades its panel.
// ============================================================
import "server-only";
import { fetchJson, IntegrationError } from "./http";
import { getServiceCredentials, getDeploymentSetting } from "./registry";
import { env } from "@/lib/env";
import type { MediaKind, NowPlaying, MediaRequest, QueueItem, ServiceStatus, LibraryStat, RecentItem, DiscoverItem, RequestStatus } from "@/lib/types";

async function creds(serviceId: string): Promise<{ baseUrl: string; apiKey: string }> {
  const c = await getServiceCredentials(serviceId);
  if (!c || !c.apiKey) throw new IntegrationError(serviceId, "not configured (no API key)");
  return { baseUrl: c.baseUrl.replace(/\/$/, ""), apiKey: c.apiKey };
}

// ── Gatus — per-service health + heartbeat ─────────────────
export interface ServiceHealth {
  key: string; // matched to our service id where possible
  name: string;
  group?: string;
  status: ServiceStatus;
  ms: number;
  uptime: number; // %
  beats: number[]; // 1/0.5/0
}

interface GatusResult {
  status: number;
  success: boolean;
  duration: number; // ns
  timestamp: string;
}
interface GatusEndpoint {
  name: string;
  group?: string;
  key: string;
  results?: GatusResult[];
}

export async function gatusHealth(): Promise<ServiceHealth[]> {
  const c = await getServiceCredentials("gatus");
  if (!c) throw new IntegrationError("gatus", "not configured");
  const base = c.baseUrl.replace(/\/$/, "");
  const data = await fetchJson<GatusEndpoint[]>(`${base}/api/v1/endpoints/statuses`, {
    service: "gatus",
    headers: c.apiKey ? { Authorization: `Bearer ${c.apiKey}` } : {},
  });
  return data.map((ep) => {
    const results = ep.results ?? [];
    const last = results[results.length - 1];
    const beats = results.slice(-30).map((r) => (r.success ? 1 : 0));
    const okCount = results.filter((r) => r.success).length;
    const uptime = results.length ? (okCount / results.length) * 100 : 100;
    const ms = last ? Math.round(last.duration / 1e6) : 0;
    const status: ServiceStatus = !last ? "up" : last.success ? "up" : "down";
    return { key: ep.name.toLowerCase(), name: ep.name, group: ep.group, status, ms, uptime, beats };
  });
}

// ── Tautulli — Plex now-playing + library counts ───────────
interface TautulliSession {
  session_key: string;
  full_title: string;
  title: string;
  media_type: string;
  year?: string;
  parent_title?: string;
  grandparent_title?: string;
  user: string;
  user_id?: number;
  player: string;
  video_full_resolution?: string;
  transcode_decision?: string;
  stream_bitrate?: string;
  video_codec?: string;
  progress_percent?: string;
  duration?: string;
  state?: string;
  thumb?: string;
  grandparent_thumb?: string;
}

export async function tautulliNowPlaying(): Promise<NowPlaying[]> {
  const { baseUrl, apiKey } = await creds("tautulli");
  const data = await fetchJson<{ response: { data: { sessions: TautulliSession[] } } }>(
    `${baseUrl}/api/v2?apikey=${apiKey}&cmd=get_activity`,
    { service: "tautulli" },
  );
  const sessions = data.response?.data?.sessions ?? [];
  return sessions.map((s) => {
    const kind: MediaKind = s.media_type === "episode" ? "series" : s.media_type === "track" ? "track" : "movie";
    const thumb = kind === "series" ? s.grandparent_thumb || s.thumb : s.thumb;
    return {
      id: `tt-${s.session_key}`,
      title: kind === "series" ? s.grandparent_title || s.full_title : s.title || s.full_title,
      kind,
      year: s.year ? Number(s.year) : undefined,
      ep: kind === "series" ? s.title : undefined,
      user: s.user,
      src: "plex",
      device: s.player,
      res: s.video_full_resolution || "—",
      play: s.transcode_decision === "transcode" ? "transcode" : "direct",
      bitrate: s.stream_bitrate ? (Number(s.stream_bitrate) / 1000).toFixed(1) : "0",
      codec: s.video_codec?.toUpperCase() || "—",
      pos: s.progress_percent ? Number(s.progress_percent) / 100 : 0,
      dur: s.duration ? Math.round(Number(s.duration) / 60000) : 0,
      paused: s.state === "paused",
      art: thumb ? `/api/artwork?svc=tautulli&ref=${encodeURIComponent(thumb)}` : undefined,
    };
  });
}

// ── Tautulli — library counts ──────────────────────────────
interface TautulliLibrary {
  section_type: string; // movie | show | artist
  section_name: string;
  count?: string | number;
  parent_count?: string | number;
  child_count?: string | number;
}

const n = (v: string | number | undefined) => (v == null ? 0 : Number(v));
const fmt = (v: number) => v.toLocaleString("en-US");

export async function tautulliLibraries(): Promise<LibraryStat[]> {
  const { baseUrl, apiKey } = await creds("tautulli");
  const data = await fetchJson<{ response: { data: TautulliLibrary[] } }>(`${baseUrl}/api/v2?apikey=${apiKey}&cmd=get_libraries`, { service: "tautulli" });
  const libs = data.response?.data ?? [];
  const out: LibraryStat[] = [];
  const movie = libs.find((l) => l.section_type === "movie");
  const show = libs.find((l) => l.section_type === "show");
  const artist = libs.find((l) => l.section_type === "artist");
  if (movie) out.push({ id: "movies", label: "Movies", count: fmt(n(movie.count)), icon: "movie", delta: `${fmt(n(movie.count))} titles` });
  if (show) out.push({ id: "shows", label: "TV Shows", count: fmt(n(show.count)), icon: "live_tv", delta: `${fmt(n(show.child_count))} episodes` });
  if (artist) out.push({ id: "music", label: "Music", count: fmt(n(artist.child_count)), icon: "library_music", delta: `${fmt(n(artist.parent_count))} albums` });
  return out;
}

/** Total play count in the last 24h (Tautulli history `recordsFiltered`). */
export async function tautulliPlaysToday(): Promise<number> {
  const { baseUrl, apiKey } = await creds("tautulli");
  const after = new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10);
  const data = await fetchJson<{ response: { data: { recordsFiltered?: number } } }>(
    `${baseUrl}/api/v2?apikey=${apiKey}&cmd=get_history&after=${after}&length=0`,
    { service: "tautulli" },
  );
  return data.response?.data?.recordsFiltered ?? 0;
}

// ── Tautulli — recently added ──────────────────────────────
interface TautulliRecent {
  title: string;
  year?: string;
  media_type: string;
  thumb?: string;
  parent_thumb?: string;
  grandparent_thumb?: string;
}

export async function tautulliRecentlyAdded(count = 6): Promise<RecentItem[]> {
  const { baseUrl, apiKey } = await creds("tautulli");
  const data = await fetchJson<{ response: { data: { recently_added: TautulliRecent[] } } }>(
    `${baseUrl}/api/v2?apikey=${apiKey}&cmd=get_recently_added&count=${count}`,
    { service: "tautulli" },
  );
  const items = data.response?.data?.recently_added ?? [];
  return items.map((it, i) => {
    const kind: MediaKind = it.media_type === "movie" ? "movie" : it.media_type === "track" || it.media_type === "album" ? "track" : "series";
    const thumb = it.grandparent_thumb || it.parent_thumb || it.thumb;
    return {
      id: `ra-${i}`,
      title: it.title,
      kind,
      year: it.year ? Number(it.year) : 0,
      cat: "stream" as const,
      art: thumb ? `/api/artwork?svc=tautulli&ref=${encodeURIComponent(thumb)}` : undefined,
    };
  });
}

// ── Jellyfin — now-playing sessions ────────────────────────
interface JellyfinSession {
  Id: string;
  UserId: string;
  UserName: string;
  DeviceName: string;
  NowPlayingItem?: {
    Id: string;
    Name: string;
    Type: string;
    ProductionYear?: number;
    SeriesName?: string;
    SeriesId?: string;
    RunTimeTicks?: number;
  };
  PlayState?: { IsPaused?: boolean; PositionTicks?: number };
}

export async function jellyfinNowPlaying(): Promise<NowPlaying[]> {
  const { baseUrl, apiKey } = await creds("jellyfin");
  const data = await fetchJson<JellyfinSession[]>(`${baseUrl}/Sessions`, {
    service: "jellyfin",
    headers: { Authorization: `MediaBrowser Token="${apiKey}"` },
  });
  return data
    .filter((s) => s.NowPlayingItem)
    .map((s) => {
      const item = s.NowPlayingItem!;
      const kind: MediaKind = item.Type === "Episode" ? "series" : item.Type === "Audio" ? "track" : "movie";
      const durMin = item.RunTimeTicks ? Math.round(item.RunTimeTicks / 600_000_000) : 0;
      const pos = item.RunTimeTicks && s.PlayState?.PositionTicks ? s.PlayState.PositionTicks / item.RunTimeTicks : 0;
      return {
        id: `jf-${s.Id}`,
        title: kind === "series" ? item.SeriesName || item.Name : item.Name,
        kind,
        year: item.ProductionYear,
        ep: kind === "series" ? item.Name : undefined,
        user: s.UserId,
        src: "jellyfin",
        device: s.DeviceName,
        res: "—",
        play: "direct",
        bitrate: "0",
        codec: "—",
        pos,
        dur: durMin,
        paused: Boolean(s.PlayState?.IsPaused),
        art: item.Id ? `/api/artwork?svc=jellyfin&ref=${encodeURIComponent(kind === "series" && item.SeriesId ? item.SeriesId : item.Id)}` : undefined,
      } satisfies NowPlaying;
    });
}

// ── Overseerr — requests ───────────────────────────────────
interface OverseerrRequest {
  id: number;
  type: "movie" | "tv";
  status: number; // 1 pending, 2 approved, 3 declined
  media?: { status?: number; tmdbId?: number; mediaType?: string };
  requestedBy?: { id: number; displayName?: string; plexUsername?: string; email?: string };
  createdAt?: string;
}

interface OverseerrMediaDetails {
  title?: string;       // movies
  name?: string;        // tv shows
  posterPath?: string;
  releaseDate?: string;  // movies
  firstAirDate?: string; // tv shows
}

// Cache enriched media details by "type:tmdbId".
// Titles and poster paths are effectively immutable — 1h TTL is fine.
// Module scope persists across snapshot polls within the same server process.
interface EnrichedDetails {
  title: string;
  posterPath?: string;
  year?: number;
  cachedAt: number;
}
const enrichCache = new Map<string, EnrichedDetails>();
const ENRICH_TTL = 60 * 60 * 1000;
// On failed fetch, retry after 30s to avoid hammering a slow upstream.
const ENRICH_RETRY = 30 * 1000;

async function enrichMedia(baseUrl: string, apiKey: string, type: "movie" | "tv", tmdbId: number): Promise<EnrichedDetails> {
  const cacheKey = `${type}:${tmdbId}`;
  const cached = enrichCache.get(cacheKey);
  if (cached) {
    const ttl = cached.title ? ENRICH_TTL : ENRICH_RETRY;
    if (Date.now() - cached.cachedAt < ttl) return cached;
  }
  try {
    const details = await fetchJson<OverseerrMediaDetails>(
      `${baseUrl}/api/v1/${type}/${tmdbId}`,
      { service: "overseerr", headers: { "X-Api-Key": apiKey }, timeoutMs: 15000 },
    );
    const dateStr = details.releaseDate || details.firstAirDate || "";
    const result: EnrichedDetails = {
      title: details.title || details.name || "",
      posterPath: details.posterPath ?? undefined,
      year: dateStr ? Number(dateStr.slice(0, 4)) : undefined,
      cachedAt: Date.now(),
    };
    enrichCache.set(cacheKey, result);
    return result;
  } catch {
    const fallback: EnrichedDetails = { title: "", cachedAt: Date.now() };
    enrichCache.set(cacheKey, fallback);
    return fallback;
  }
}

const OVERSEERR_STATUS: Record<number, MediaRequest["status"]> = { 1: "pending", 2: "approved", 3: "declined" };

export async function overseerrRequests(): Promise<MediaRequest[]> {
  const { baseUrl, apiKey } = await creds("overseerr");
  const data = await fetchJson<{ results: OverseerrRequest[] }>(`${baseUrl}/api/v1/request?take=50&sort=added`, {
    service: "overseerr",
    headers: { "X-Api-Key": apiKey },
    timeoutMs: 10000,
  });
  const results = data.results ?? [];

  // Enrich in parallel; cache means only new/uncached requests touch the upstream.
  const enriched = await Promise.all(
    results.map((r) =>
      r.media?.tmdbId
        ? enrichMedia(baseUrl, apiKey!, r.type, r.media.tmdbId)
        : Promise.resolve<EnrichedDetails>({ title: "", cachedAt: 0 }),
    ),
  );

  return results.map((r, i) => {
    const { title, posterPath, year } = enriched[i];
    const fallbackYear = r.createdAt ? new Date(r.createdAt).getFullYear() : 0;
    return {
      id: `os-${r.id}`,
      title: title || `Request ${r.id}`,
      kind: r.type === "tv" ? "series" : "movie",
      year: year ?? fallbackYear,
      user: String(r.requestedBy?.id ?? "unknown"),
      status: r.media?.status === 5 ? "available" : (OVERSEERR_STATUS[r.status] ?? "pending"),
      requested: r.createdAt ? new Date(r.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "",
      art: posterPath ? `/api/artwork?svc=overseerr&ref=${encodeURIComponent(posterPath)}` : undefined,
      requesterName: r.requestedBy?.displayName || r.requestedBy?.plexUsername || r.requestedBy?.email?.split("@")[0],
    };
  });
}

// ── Overseerr — discover/search + request create/approve/decline ──
interface OverseerrSearchResult {
  id: number;
  mediaType: "movie" | "tv" | "person";
  title?: string;
  name?: string;
  releaseDate?: string;
  firstAirDate?: string;
  voteAverage?: number;
  overview?: string;
  mediaInfo?: { status?: number };
}

// Overseerr MediaStatus → our request state.
function mediaStatusToState(status?: number): RequestStatus | null {
  if (status === 5 || status === 4) return "available";
  if (status === 3) return "approved";
  if (status === 2) return "pending";
  return null;
}

export async function overseerrSearch(query: string): Promise<DiscoverItem[]> {
  const { baseUrl, apiKey } = await creds("overseerr");
  const data = await fetchJson<{ results: OverseerrSearchResult[] }>(
    `${baseUrl}/api/v1/search?query=${encodeURIComponent(query || "a")}&page=1&language=en`,
    { service: "overseerr", headers: { "X-Api-Key": apiKey } },
  );
  return (data.results ?? [])
    .filter((r) => r.mediaType === "movie" || r.mediaType === "tv")
    .slice(0, 20)
    .map((r) => {
      const date = r.releaseDate || r.firstAirDate || "";
      return {
        id: String(r.id), // tmdbId
        title: r.title || r.name || `#${r.id}`,
        kind: r.mediaType === "tv" ? "series" : "movie",
        year: date ? Number(date.slice(0, 4)) : 0,
        rating: r.voteAverage ? Math.round(r.voteAverage * 10) / 10 : 0,
        // season count isn't in search results → leave undefined (picker hidden, submit = all)
        state: mediaStatusToState(r.mediaInfo?.status),
        overview: r.overview || "",
      } satisfies DiscoverItem;
    });
}

export async function overseerrCreateRequest(input: { tmdbId: number; mediaType: "movie" | "tv"; seasons?: number[]; userId?: number }): Promise<void> {
  const { baseUrl, apiKey } = await creds("overseerr");
  const body: Record<string, unknown> = { mediaType: input.mediaType, mediaId: input.tmdbId };
  if (input.mediaType === "tv") body.seasons = input.seasons && input.seasons.length ? input.seasons : "all";
  if (input.userId) body.userId = input.userId;
  await fetchJson(`${baseUrl}/api/v1/request`, { service: "overseerr", method: "POST", headers: { "X-Api-Key": apiKey }, body });
}

export async function overseerrReview(requestId: number, action: "approve" | "decline"): Promise<void> {
  const { baseUrl, apiKey } = await creds("overseerr");
  await fetchJson(`${baseUrl}/api/v1/request/${requestId}/${action}`, { service: "overseerr", method: "POST", headers: { "X-Api-Key": apiKey } });
}

// ── *arr (Sonarr / Radarr) — download queue ────────────────
interface ArrQueueRecord {
  title: string;
  size?: number;
  sizeleft?: number;
  timeleft?: string;
  status?: string;
}

export async function arrQueue(serviceId: "sonarr" | "radarr"): Promise<QueueItem[]> {
  const { baseUrl, apiKey } = await creds(serviceId);
  const data = await fetchJson<{ records: ArrQueueRecord[] }>(`${baseUrl}/api/v3/queue?pageSize=20`, {
    service: serviceId,
    headers: { "X-Api-Key": apiKey },
  });
  return (data.records ?? []).map((r, i) => {
    const pct = r.size && r.sizeleft != null ? Math.round(((r.size - r.sizeleft) / r.size) * 100) : 0;
    return { id: `${serviceId}-${i}`, title: r.title, svc: serviceId, pct, eta: r.timeleft || "—", speed: "" };
  });
}

// ── Prometheus — generic instant query ─────────────────────
export async function prometheusQuery(query: string): Promise<number | null> {
  const c = await getServiceCredentials("prometheus");
  if (!c) throw new IntegrationError("prometheus", "not configured");
  const base = c.baseUrl.replace(/\/$/, "");
  const data = await fetchJson<{ data: { result: { value: [number, string] }[] } }>(
    `${base}/api/v1/query?query=${encodeURIComponent(query)}`,
    { service: "prometheus", headers: c.apiKey ? { Authorization: `Bearer ${c.apiKey}` } : {} },
  );
  const v = data.data?.result?.[0]?.value?.[1];
  return v != null ? Number(v) : null;
}

// ── Prometheus — range query (returns `points` floats) ─────
export async function prometheusRange(query: string, points = 40, stepSec = 60): Promise<number[]> {
  try {
    const c = await getServiceCredentials("prometheus");
    if (!c) return Array<number>(points).fill(0);
    const base = c.baseUrl.replace(/\/$/, "");
    const now = Math.floor(Date.now() / 1000);
    const start = now - points * stepSec;
    const data = await fetchJson<{ data: { result: { values: [number, string][] }[] } }>(
      `${base}/api/v1/query_range?query=${encodeURIComponent(query)}&start=${start}&end=${now}&step=${stepSec}`,
      { service: "prometheus", headers: c.apiKey ? { Authorization: `Bearer ${c.apiKey}` } : {} },
    );
    const raw = (data.data?.result?.[0]?.values ?? []).map(([, v]) => Number(v));
    if (raw.length === 0) return Array<number>(points).fill(0);
    // Pad from the front if fewer points were returned than requested.
    return raw.length >= points ? raw.slice(-points) : [...Array<number>(points - raw.length).fill(raw[0]), ...raw];
  } catch {
    return Array<number>(points).fill(0);
  }
}

// ── Prometheus — list scraped node_exporter instances ──────
export async function prometheusInstances(): Promise<string[]> {
  const c = await getServiceCredentials("prometheus");
  if (!c) throw new IntegrationError("prometheus", "not configured");
  const base = c.baseUrl.replace(/\/$/, "");
  const data = await fetchJson<{ data: string[] }>(
    `${base}/api/v1/label/instance/values?match[]=node_uname_info`,
    { service: "prometheus", headers: c.apiKey ? { Authorization: `Bearer ${c.apiKey}` } : {} },
  );
  return data.data ?? [];
}

// ── Version detection ──────────────────────────────────────

type ServiceKind = "jellyfin" | "overseerr" | "arr" | "tautulli" | "prometheus";

function serviceKind(id: string): ServiceKind | null {
  const l = id.toLowerCase();
  if (l.includes("jellyfin") || l.includes("emby")) return "jellyfin";
  if (l.includes("overseerr") || l.includes("jellyseerr") || l.includes("seerr")) return "overseerr";
  if (l.includes("sonarr") || l.includes("radarr") || l.includes("lidarr") ||
      l.includes("readarr") || l.includes("prowlarr") || l.includes("whisparr") || l.includes("bazarr")) return "arr";
  if (l.includes("tautulli")) return "tautulli";
  if (l.includes("prometheus")) return "prometheus";
  return null;
}

/** Strip a leading "v"/"V" so stored versions are bare (the UI prepends its own "v"). */
function normalizeVersion(v: string | undefined | null): string | null {
  if (!v) return null;
  return v.trim().replace(/^v/i, "") || null;
}

async function fetchServiceVersion(base: string, apiKey: string, kind: ServiceKind): Promise<string | null> {
  const b = base.replace(/\/$/, "");
  if (kind === "jellyfin") {
    const d = await fetchJson<{ Version?: string }>(`${b}/System/Info`, {
      service: "version-detect",
      headers: apiKey ? { Authorization: `MediaBrowser Token="${apiKey}"` } : {},
    });
    return normalizeVersion(d.Version);
  }
  if (kind === "overseerr") {
    const d = await fetchJson<{ version?: string }>(`${b}/api/v1/status`, {
      service: "version-detect",
      headers: apiKey ? { "X-Api-Key": apiKey } : {},
    });
    return normalizeVersion(d.version);
  }
  if (kind === "arr") {
    const d = await fetchJson<{ version?: string }>(`${b}/api/v3/system/status`, {
      service: "version-detect",
      headers: apiKey ? { "X-Api-Key": apiKey } : {},
    });
    return normalizeVersion(d.version);
  }
  if (kind === "tautulli") {
    const d = await fetchJson<{ response?: { data?: { tautulli_version?: string } } }>(
      `${b}/api/v2?apikey=${encodeURIComponent(apiKey)}&cmd=get_tautulli_info`,
      { service: "version-detect" },
    );
    return normalizeVersion(d.response?.data?.tautulli_version);
  }
  // prometheus
  const d = await fetchJson<{ data?: { version?: string } }>(`${b}/api/v1/status/buildinfo`, {
    service: "version-detect",
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
  });
  return normalizeVersion(d.data?.version);
}

/** Detect version for a saved service using its stored credentials. Returns null on failure or unknown type. */
export async function detectVersion(serviceId: string): Promise<string | null> {
  try {
    const kind = serviceKind(serviceId);
    if (!kind) return null;
    const c = await getServiceCredentials(serviceId);
    if (!c) return null;
    return await fetchServiceVersion(c.baseUrl, c.apiKey ?? "", kind);
  } catch {
    return null;
  }
}

/** Probe a version endpoint with explicit (transient) credentials — no DB access. */
export async function probeVersion(baseUrl: string, apiKey: string, idHint: string): Promise<string | null> {
  try {
    const kind = serviceKind(idHint);
    if (!kind) return null;
    return await fetchServiceVersion(baseUrl, apiKey, kind);
  } catch {
    return null;
  }
}

// ── Prometheus — node_exporter metrics bundle ───────────────
export interface NodeMetrics {
  instance: string | null;
  cpuPct: number | null;
  cpuHistory: number[];
  memUsedBytes: number | null;
  memTotalBytes: number | null;
  memHistory: number[];
  netOutBps: number | null;
  netHistory: number[];
  netInBps: number | null;
  netInHistory: number[];
  diskUsedBytes: number | null;
  diskTotalBytes: number | null;
  diskHistory: number[];
  sysLoad: number | null;
  sysLoadHistory: number[];
}

export async function prometheusMetrics(): Promise<NodeMetrics> {
  // null (no DB row) → use env fallback. "" (sentinel) → all nodes. "x" → filter to "x".
  const stored = await getDeploymentSetting("prometheusInstance");
  const inst = stored === null ? (env.prometheusInstance ?? null) : (stored || null);
  // iq: comma-prefixed label appended inside an existing {…} selector
  // isq: standalone selector (curly-brace pair) for metrics with no other labels
  const iq = inst ? `,instance="${inst}"` : "";
  const isq = inst ? `{instance="${inst}"}` : "{}";
  // Exclude fuse aggregate mounts (shfs = Unraid array, fuse.* = mergerfs / sshfs / etc.)
  // so the query only sums underlying block-device filesystems and avoids double-counting.
  const diskFilter = `{fstype!~"tmpfs|overlay|squashfs|ramfs|shfs|fuse.*"${iq}}`;

  const safe = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
    try { return await fn(); } catch { return fallback; }
  };

  const [cpuHistory, memHistory, memTotal, netHistory, netInHistory, diskHistory, diskTotal, sysLoadHistory] = await Promise.all([
    safe(() => prometheusRange(`100 - (avg(rate(node_cpu_seconds_total{mode="idle"${iq}}[5m])) * 100)`), Array<number>(40).fill(0)),
    safe(() => prometheusRange(`node_memory_MemTotal_bytes${isq} - node_memory_MemAvailable_bytes${isq}`), Array<number>(40).fill(0)),
    safe(() => prometheusQuery(`node_memory_MemTotal_bytes${isq}`), null),
    safe(() => prometheusRange(`sum(rate(node_network_transmit_bytes_total{device!~"lo|veth.*|docker.*|br.*"${iq}}[5m])) * 8`), Array<number>(40).fill(0)),
    safe(() => prometheusRange(`sum(rate(node_network_receive_bytes_total{device!~"lo|veth.*|docker.*|br.*"${iq}}[5m])) * 8`), Array<number>(40).fill(0)),
    safe(() => prometheusRange(`sum(max by(instance, device) (node_filesystem_size_bytes${diskFilter} - node_filesystem_avail_bytes${diskFilter}))`), Array<number>(40).fill(0)),
    safe(() => prometheusQuery(`sum(max by(instance, device) (node_filesystem_size_bytes${diskFilter}))`), null),
    safe(() => prometheusRange(`node_load1${isq}`), Array<number>(40).fill(0)),
  ]);

  const last = (h: number[]) => (h.length ? h[h.length - 1] : null);
  const finite = (v: number | null) => (v != null && isFinite(v) ? v : null);

  return {
    instance: inst,
    cpuPct: finite(last(cpuHistory)),
    cpuHistory,
    memUsedBytes: finite(last(memHistory)),
    memTotalBytes: memTotal,
    memHistory,
    netOutBps: finite(last(netHistory)),
    netHistory,
    netInBps: finite(last(netInHistory)),
    netInHistory,
    diskUsedBytes: finite(last(diskHistory)),
    diskTotalBytes: diskTotal,
    diskHistory,
    sysLoad: finite(last(sysLoadHistory)),
    sysLoadHistory,
  };
}
