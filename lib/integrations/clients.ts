// ============================================================
// AERIE — upstream integration clients (server-only)
// Each function fetches + normalizes one upstream. They throw on
// missing config / errors; the data facade catches and falls back
// to mock so a dead or unconfigured upstream only degrades its panel.
// ============================================================
import "server-only";
import { fetchJson, fetchJson as fetchJsonRaw, IntegrationError, type HttpOpts } from "./http";
import { getServiceCredentials, getDeploymentSetting } from "./registry";
import { env } from "@/lib/env";
import type { MediaKind, NowPlaying, StreamGeo, StreamHistoryItem, MediaRequest, QueueItem, ServiceStatus, LibraryStat, RecentItem, DiscoverItem, RequestStatus, StorageMount, IssueItem, HealthIssue, UpcomingItem, DownloadEvent, TopStats, OverseerrQuota, QualityProfile, FileInfo } from "@/lib/types";

async function creds(serviceId: string): Promise<{ baseUrl: string; apiKey: string }> {
  const c = await getServiceCredentials(serviceId);
  if (!c || !c.apiKey) throw new IntegrationError(serviceId, "not configured (no API key)");
  return { baseUrl: c.baseUrl.replace(/\/$/, ""), apiKey: c.apiKey };
}

// Generic module-scope TTL cache for slow-changing upstream reads. getSnapshot()
// polls every 3–12s, but disk space / calendars / leaderboards / issues change on
// the order of minutes-to-hours — caching avoids hammering self-hosted upstreams.
// Only successful results are cached (fn throws before we store), so a transient
// failure (turned into null by the facade's safe()) retries on the next poll.
const ttlCache = new Map<string, { at: number; value: unknown }>();
const ttlInflight = new Map<string, Promise<unknown>>();
async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = ttlCache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  // Coalesce concurrent refreshes so overlapping polls don't stack duplicate upstream calls.
  let refresh = ttlInflight.get(key) as Promise<T> | undefined;
  if (!refresh) {
    refresh = fn()
      .then((value) => {
        ttlCache.set(key, { at: Date.now(), value });
        return value;
      })
      .finally(() => ttlInflight.delete(key));
    ttlInflight.set(key, refresh);
  }
  // Stale-while-revalidate: serve a stale value instantly and refresh in the background,
  // so an upstream that's slow only when cold (e.g. Overseerr after idle) never blocks the
  // snapshot. Only a true cold miss (no prior value) awaits the fetch. On error the stale
  // value is kept and retried next poll (a cold miss rejects → caller's safe() → null).
  if (hit) {
    void refresh.catch(() => {});
    return hit.value as T;
  }
  return refresh;
}
export function bustCache(key: string): void {
  ttlCache.delete(key);
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
  /** ISO timestamp of the most recent failed result in the window, if any */
  lastIncidentAt?: string;
  /** last ≤30 response times in ms, for a latency trend sparkline */
  msHistory: number[];
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
    const msHistory = results.slice(-30).map((r) => Math.round(r.duration / 1e6));
    const okCount = results.filter((r) => r.success).length;
    const uptime = results.length ? (okCount / results.length) * 100 : 100;
    const ms = last ? Math.round(last.duration / 1e6) : 0;
    const status: ServiceStatus = !last ? "up" : last.success ? "up" : "down";
    // Most recent failure in the window → "last incident" age. Undefined when all-clear.
    let lastIncidentAt: string | undefined;
    for (let i = results.length - 1; i >= 0; i--) {
      if (!results[i].success) { lastIncidentAt = results[i].timestamp; break; }
    }
    return { key: ep.name.toLowerCase(), name: ep.name, group: ep.group, status, ms, uptime, beats, msHistory, lastIncidentAt };
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
  // — wide art / metadata —
  art?: string;
  grandparent_art?: string;
  summary?: string;
  media_index?: string | number;
  parent_media_index?: string | number;
  originally_available_at?: string;
  content_rating?: string;
  genres?: string[];
  user_thumb?: string;
  // — client / app —
  platform?: string;
  platform_version?: string;
  product?: string;
  product_version?: string;
  device?: string;
  quality_profile?: string;
  // — network —
  location?: string;
  ip_address_public?: string;
  secure?: string | number;
  relayed?: string | number;
  local?: string | number;
  bandwidth?: string | number;
  // — transcode detail —
  video_decision?: string;
  audio_decision?: string;
  subtitle_decision?: string;
  transcode_hw_decoding?: string | number;
  transcode_hw_encoding?: string | number;
  transcode_throttled?: string | number;
  transcode_speed?: string | number;
  transcode_progress?: string | number;
  // — stream specs —
  video_dynamic_range?: string;
  video_framerate?: string;
  container?: string;
  stream_container?: string;
  bitrate?: string; // source bitrate (kbps)
  stream_video_codec?: string;
  audio_codec?: string;
  stream_audio_codec?: string;
  audio_channels?: string | number;
  stream_audio_channels?: string | number;
  audio_channel_layout?: string;
  subtitles?: string | number;
  subtitle_codec?: string;
  subtitle_language?: string;
}

/** Tautulli encodes booleans as "1"/"0" (sometimes numeric). */
const ttBool = (v: string | number | undefined): boolean => v === "1" || v === 1;
/** Strip channel-layout qualifiers, e.g. "5.1(side)" → "5.1". */
const cleanLayout = (v: string | undefined): string | undefined => v?.replace(/\s*\([^)]*\)\s*/g, "").trim() || undefined;

/** Parse a Tautulli numeric-ish field to a number, or undefined when empty. */
const ttNum = (v: string | number | undefined): number | undefined => (v != null && v !== "" ? n(v) : undefined);

function mapTautulliSession(s: TautulliSession): NowPlaying {
  const kind: MediaKind = s.media_type === "episode" ? "series" : s.media_type === "track" ? "track" : "movie";
  const thumb = kind === "series" ? s.grandparent_thumb || s.thumb : s.thumb;
  // Wide backdrop/fanart: series art lives on the grandparent (show), movies on the item.
  const wideArt = kind === "series" ? s.grandparent_art || s.art : s.art;
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
    backdrop: wideArt ? `/api/artwork?svc=tautulli&kind=backdrop&ref=${encodeURIComponent(wideArt)}` : undefined,
    // — title detail —
    summary: s.summary || undefined,
    season: kind === "series" ? ttNum(s.parent_media_index) : undefined,
    episode: kind === "series" ? ttNum(s.media_index) : undefined,
    airDate: s.originally_available_at || undefined,
    contentRating: s.content_rating || undefined,
    genres: Array.isArray(s.genres) && s.genres.length ? s.genres : undefined,
    userAvatar: s.user_thumb ? `/api/artwork?svc=tautulli&kind=avatar&ref=${encodeURIComponent(s.user_thumb)}` : undefined,
    // — client / app —
    platform: s.platform || undefined,
    platformVersion: s.platform_version || undefined,
    product: s.product || undefined,
    productVersion: s.product_version || undefined,
    devicePlatform: s.device || undefined,
    qualityProfile: s.quality_profile || undefined,
    // — network —
    location: s.location || undefined,
    ipPublic: s.ip_address_public || undefined,
    secure: ttBool(s.secure),
    relayed: ttBool(s.relayed),
    local: ttBool(s.local),
    sessionKbps: s.bandwidth != null && s.bandwidth !== "" ? n(s.bandwidth) : undefined,
    // — transcode detail —
    videoDecision: s.video_decision || undefined,
    audioDecision: s.audio_decision || undefined,
    subtitleDecision: s.subtitle_decision || undefined,
    hwTranscode: ttBool(s.transcode_hw_decoding) || ttBool(s.transcode_hw_encoding),
    transcodeThrottled: ttBool(s.transcode_throttled),
    transcodeSpeed: s.transcode_speed != null && s.transcode_speed !== "" ? n(s.transcode_speed) : undefined,
    transcodeProgress: s.transcode_progress != null && s.transcode_progress !== "" ? n(s.transcode_progress) : undefined,
    // — stream specs —
    dynamicRange: s.video_dynamic_range || undefined,
    framerate: s.video_framerate || undefined,
    sourceContainer: s.container || undefined,
    streamContainer: s.stream_container || undefined,
    sourceKbps: s.bitrate != null && s.bitrate !== "" ? n(s.bitrate) : undefined,
    streamCodec: s.stream_video_codec?.toUpperCase() || undefined,
    audioCodec: s.audio_codec?.toUpperCase() || undefined,
    streamAudioCodec: s.stream_audio_codec?.toUpperCase() || undefined,
    audioChannels: s.audio_channels != null && s.audio_channels !== "" ? n(s.audio_channels) : undefined,
    streamAudioChannels: s.stream_audio_channels != null && s.stream_audio_channels !== "" ? n(s.stream_audio_channels) : undefined,
    audioLayout: cleanLayout(s.audio_channel_layout),
    subtitle: ttBool(s.subtitles)
      ? { codec: s.subtitle_codec?.toUpperCase() || undefined, language: s.subtitle_language || undefined, transcode: s.subtitle_decision === "transcode" || s.subtitle_decision === "burn" }
      : undefined,
  };
}

export interface TautulliActivity {
  sessions: NowPlaying[];
  /** aggregate stream bandwidth across all sessions (kbps) */
  totalKbps: number;
  /** WAN-only portion of that bandwidth (kbps) */
  wanKbps: number;
}

/**
 * Resolve a public IP to a city/country via Tautulli's `get_geoip_lookup`
 * (requires the MaxMind GeoLite2 DB in Tautulli — returns undefined if absent
 * or on any error). Cached per-IP for 6h: IP→geo is stable and getSnapshot()
 * polls every few seconds, so we must not re-look-up on every poll. Note this
 * intentionally caches the failure (undefined) too — unlike the codebase's usual
 * "cache successes only" pattern — so a missing GeoLite2 DB doesn't get re-probed
 * every poll forever (the inner fn catches rather than throws).
 */
async function tautulliGeoIp(ip: string): Promise<StreamGeo | undefined> {
  return cached(`tautulli:geoip:${ip}`, 6 * 60 * 60 * 1000, async () => {
    try {
      const { baseUrl, apiKey } = await creds("tautulli");
      const r = await fetchJson<{ response: { result?: string; data?: { city?: string; region?: string; country?: string; code?: string; latitude?: number; longitude?: number } } }>(
        `${baseUrl}/api/v2?apikey=${apiKey}&cmd=get_geoip_lookup&ip_address=${encodeURIComponent(ip)}`,
        { service: "tautulli" },
      );
      if (r.response?.result !== "success" || !r.response.data) return undefined;
      const g = r.response.data;
      if (!g.city && !g.country && !g.code) return undefined;
      return { city: g.city, region: g.region, country: g.country, code: g.code, lat: g.latitude, lon: g.longitude };
    } catch {
      return undefined;
    }
  });
}

/** Now-playing sessions + aggregate bandwidth from a single `get_activity` call. */
export async function tautulliActivity(): Promise<TautulliActivity> {
  const { baseUrl, apiKey } = await creds("tautulli");
  const data = await fetchJson<{ response: { data: { sessions: TautulliSession[]; total_bandwidth?: number | string; wan_bandwidth?: number | string } } }>(
    `${baseUrl}/api/v2?apikey=${apiKey}&cmd=get_activity`,
    { service: "tautulli" },
  );
  const d = data.response?.data;
  const sessions = (d?.sessions ?? []).map(mapTautulliSession);

  // Tier-2 geo: resolve distinct non-LAN public IPs (cached per-IP). Best-effort —
  // a failed lookup just leaves `geo` undefined and the card omits the location line.
  const ips = [...new Set(sessions.filter((s) => !s.local && s.ipPublic).map((s) => s.ipPublic as string))];
  if (ips.length) {
    const geos = new Map<string, StreamGeo | undefined>();
    await Promise.all(ips.map(async (ip) => geos.set(ip, await tautulliGeoIp(ip))));
    for (const s of sessions) if (s.ipPublic && geos.get(s.ipPublic)) s.geo = geos.get(s.ipPublic);
  }

  return {
    sessions,
    totalKbps: n(d?.total_bandwidth),
    wanKbps: n(d?.wan_bandwidth),
  };
}

// ── Tautulli — all Plex users + their avatars (for avatars everywhere) ──
interface TautulliUser {
  user_id?: number;
  username?: string;
  friendly_name?: string;
  email?: string;
  user_thumb?: string;
  thumb?: string;
}
/** A Plex identity → proxied avatar, used to attach profile photos to portal
 *  users and request requesters (not just active streamers). */
export interface PlexUserAvatar {
  email?: string;
  username?: string;
  friendlyName?: string;
  /** proxied avatar URL (/api/artwork?…&kind=avatar), or undefined */
  avatar?: string;
}
/** `get_users` returns every Plex user with a `user_thumb` avatar. The roster
 *  changes rarely and getSnapshot() polls every few seconds, so cache 30 min. */
export async function tautulliUsers(): Promise<PlexUserAvatar[]> {
  return cached("tautulli:users", 30 * 60 * 1000, async () => {
    const { baseUrl, apiKey } = await creds("tautulli");
    const data = await fetchJson<{ response: { data?: TautulliUser[] } }>(
      `${baseUrl}/api/v2?apikey=${apiKey}&cmd=get_users`,
      { service: "tautulli" },
    );
    return (data.response?.data ?? []).map((u) => {
      const thumb = u.user_thumb || u.thumb;
      return {
        email: u.email || undefined,
        username: u.username || undefined,
        friendlyName: u.friendly_name || undefined,
        avatar: thumb ? `/api/artwork?svc=tautulli&kind=avatar&ref=${encodeURIComponent(thumb)}` : undefined,
      };
    });
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
  // Library counts change rarely → cache to avoid a fetch on every 3–12s poll.
  return cached("tautulli:libraries", 10 * 60 * 1000, async () => {
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
  });
}

export interface TautulliPlays {
  /** total plays in the last 24h (Tautulli history `recordsFiltered`) */
  total: number;
  /** 24 hourly buckets (oldest→newest, ending at the current hour) for a rolling sparkline */
  hourly: number[];
}

/**
 * Plays in the rolling last 24h — a single `get_history` fetch serves both the
 * total count and an hourly-bucketed sparkline. `after` is a date (so it covers
 * a little over 24h); we bucket precisely from each record's start timestamp.
 */
export async function tautulliPlays24h(): Promise<TautulliPlays> {
  // Cached: this pulls up to 1000 history rows, and an hourly-bucketed 24h
  // histogram doesn't change between 3–12s polls. 60s keeps it near-live without
  // re-fetching the full history every poll (now-playing stays live via tautulliActivity).
  return cached("tautulli:plays24h", 60 * 1000, async () => {
    const { baseUrl, apiKey } = await creds("tautulli");
    const sinceMs = Date.now() - 24 * 3600 * 1000;
    const afterDate = new Date(sinceMs).toISOString().slice(0, 10);
    const data = await fetchJson<{ response: { data: { recordsFiltered?: number; data?: { date?: number; started?: number }[] } } }>(
      `${baseUrl}/api/v2?apikey=${apiKey}&cmd=get_history&after=${afterDate}&length=1000`,
      { service: "tautulli" },
    );
    const d = data.response?.data;
    const records = d?.data ?? [];
    const hourly = new Array<number>(24).fill(0);
    const sinceSec = Math.floor(sinceMs / 1000);
    const nowSec = Math.floor(Date.now() / 1000);
    for (const r of records) {
      const t = r.started ?? r.date;
      if (t == null || t < sinceSec || t > nowSec) continue;
      const hoursAgo = Math.min(23, Math.floor((nowSec - t) / 3600));
      hourly[23 - hoursAgo] += 1;
    }
    return { total: d?.recordsFiltered ?? records.length, hourly };
  });
}

// ── Tautulli — stream history ──────────────────────────────
interface TautulliHistoryRecord {
  row_id?: number;
  title?: string;
  parent_title?: string;
  grandparent_title?: string;
  media_type?: string;
  year?: number;
  rating_key?: number | string;
  thumb?: string;
  parent_thumb?: string;
  grandparent_thumb?: string;
  friendly_name?: string;
  user_id?: number;
  started?: number;
  stopped?: number;
  duration?: number;
  paused_counter?: number;
  platform?: string;
  player?: string;
  ip_address?: string;
  bitrate?: number;
  media_index?: number;
  parent_media_index?: number;
  transcode_decision?: string;
  watched_status?: number;
}

export async function tautulliStreamHistory(days = 7, limit = 200): Promise<StreamHistoryItem[]> {
  return cached("tautulli:history", 5 * 60 * 1000, async () => {
    const { baseUrl, apiKey } = await creds("tautulli");
    const afterDate = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const data = await fetchJson<{ response: { data: { data?: TautulliHistoryRecord[] } } }>(
      `${baseUrl}/api/v2?apikey=${apiKey}&cmd=get_history&after=${afterDate}&length=${limit}&order_column=date&order_dir=desc`,
      { service: "tautulli" },
    );
    const records = data.response?.data?.data ?? [];
    return records.map((r): StreamHistoryItem => {
      const kind: "movie" | "episode" | "track" =
        r.media_type === "movie" ? "movie" : r.media_type === "track" ? "track" : "episode";
      const thumb = r.grandparent_thumb || r.parent_thumb || r.thumb;
      return {
        id: r.row_id ?? 0,
        title: r.title ?? "",
        parentTitle: r.parent_title || undefined,
        grandparentTitle: r.grandparent_title || undefined,
        kind,
        year: r.year || undefined,
        thumb: thumb || undefined,
        ratingKey: r.rating_key ? Number(r.rating_key) : undefined,
        user: r.friendly_name ?? "",
        userId: r.user_id,
        started: r.started ?? 0,
        stopped: r.stopped,
        duration: r.duration ?? 0,
        pausedCounter: r.paused_counter,
        platform: r.platform || undefined,
        player: r.player || undefined,
        ipAddress: r.ip_address || undefined,
        bitrate: r.bitrate || undefined,
        mediaIndex: r.media_index,
        parentMediaIndex: r.parent_media_index,
        transcodeDecision: (r.transcode_decision === "direct play" || r.transcode_decision === "copy" || r.transcode_decision === "transcode")
          ? r.transcode_decision : undefined,
        watchedStatus: r.watched_status ?? 0,
      };
    });
  });
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
  // Recently-added changes only when new media lands → short cache, not every poll.
  return cached(`tautulli:recent:${count}`, 3 * 60 * 1000, async () => {
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
  });
}

// ── Tautulli — weekly leaderboard (cached) ─────────────────
interface TautulliHomeStatRow {
  title?: string;
  friendly_name?: string;
  user?: string;
  total_plays?: number;
  thumb?: string;
  grandparent_thumb?: string;
}
interface TautulliHomeStat {
  stat_id: string;
  rows?: TautulliHomeStatRow[];
}

export async function tautulliHomeStats(): Promise<TopStats> {
  return cached("tautulli:homestats", 10 * 60 * 1000, async () => {
    const { baseUrl, apiKey } = await creds("tautulli");
    const data = await fetchJson<{ response: { data: TautulliHomeStat[] } }>(
      `${baseUrl}/api/v2?apikey=${apiKey}&cmd=get_home_stats&time_range=7&stats_count=5`,
      { service: "tautulli" },
    );
    const stats = data.response?.data ?? [];
    const rowsOf = (id: string) => stats.find((s) => s.stat_id === id)?.rows ?? [];
    const users = rowsOf("top_users")
      .map((r) => ({ name: r.friendly_name || r.user || "Unknown", plays: n(r.total_plays) }))
      .slice(0, 5);
    const media = [...rowsOf("top_movies"), ...rowsOf("top_tv")]
      .map((r) => {
        const thumb = r.grandparent_thumb || r.thumb;
        return { title: r.title || "Untitled", plays: n(r.total_plays), art: thumb ? `/api/artwork?svc=tautulli&ref=${encodeURIComponent(thumb)}` : undefined };
      })
      .sort((a, b) => b.plays - a.plays)
      .slice(0, 5);
    return { users, media };
  });
}

// ── Jellyfin — now-playing sessions ────────────────────────
interface JellyfinMediaStream {
  Type: string; // "Video" | "Audio" | "Subtitle"
  Codec?: string;
  Height?: number;
  Width?: number;
  BitRate?: number; // bits/s
  Channels?: number;
  ChannelLayout?: string;
  VideoRange?: string; // "SDR" | "HDR"
  VideoRangeType?: string; // "SDR" | "HDR10" | "DOVI" | …
  RealFrameRate?: number;
  AverageFrameRate?: number;
  Language?: string;
}
interface JellyfinSession {
  Id: string;
  UserId: string;
  UserName: string;
  DeviceName: string;
  Client?: string;
  ApplicationVersion?: string;
  RemoteEndPoint?: string;
  /** present when the user has a profile photo */
  UserPrimaryImageTag?: string;
  NowPlayingItem?: {
    Id: string;
    Name: string;
    Type: string;
    ProductionYear?: number;
    SeriesName?: string;
    SeriesId?: string;
    ParentBackdropItemId?: string;
    RunTimeTicks?: number;
    Height?: number;
    Container?: string;
    Overview?: string;
    IndexNumber?: number;
    ParentIndexNumber?: number;
    PremiereDate?: string;
    OfficialRating?: string;
    Genres?: string[];
    MediaStreams?: JellyfinMediaStream[];
  };
  PlayState?: { IsPaused?: boolean; PositionTicks?: number; PlayMethod?: string };
  TranscodingInfo?: {
    Bitrate?: number;
    VideoCodec?: string;
    AudioCodec?: string;
    Container?: string;
    IsVideoDirect?: boolean;
    IsAudioDirect?: boolean;
    AudioChannels?: number;
    Framerate?: number;
    CompletionPercentage?: number;
    HardwareAccelerationType?: string;
  };
}

/** Channel count → friendly layout label (2→"2.0", 6→"5.1", 8→"7.1"). */
function chLayout(ch: number | undefined): string | undefined {
  if (!ch) return undefined;
  if (ch === 1) return "1.0";
  if (ch === 2) return "2.0";
  if (ch === 6) return "5.1";
  if (ch === 8) return "7.1";
  return `${ch}ch`;
}

/** Is an IP address in a private/LAN range? (handles IPv4-mapped IPv6.) */
function isLanIp(ip: string | undefined): boolean {
  if (!ip) return false;
  const v4 = ip.replace(/^::ffff:/i, "");
  return /^(10\.|127\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(v4) || v4 === "::1" || v4.startsWith("fc") || v4.startsWith("fd");
}

/** Map a pixel height to a friendly resolution label. */
function heightToRes(h: number | undefined): string {
  if (!h) return "—";
  if (h >= 2160) return "4K";
  if (h >= 1440) return "1440p";
  if (h >= 1080) return "1080p";
  if (h >= 720) return "720p";
  return `${h}p`;
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
      const video = item.MediaStreams?.find((m) => m.Type === "Video");
      const audio = item.MediaStreams?.find((m) => m.Type === "Audio");
      const sub = item.MediaStreams?.find((m) => m.Type === "Subtitle");
      const ti = s.TranscodingInfo;
      const method = s.PlayState?.PlayMethod;
      const transcoding = method === "Transcode";
      const bps = transcoding ? ti?.Bitrate : video?.BitRate;
      const codec = (transcoding ? ti?.VideoCodec : video?.Codec)?.toUpperCase();
      // Decisions: DirectPlay → "direct play", DirectStream → "copy" (remux),
      // Transcode → per-track direct flags decide copy vs transcode.
      const trackDecision = (direct: boolean | undefined): string =>
        method === "DirectPlay" ? "direct play" : !transcoding ? "copy" : direct ? "copy" : "transcode";
      const range = video?.VideoRangeType || video?.VideoRange;
      const fps = video?.RealFrameRate ?? video?.AverageFrameRate;
      const ip = s.RemoteEndPoint?.replace(/:\d+$/, "").replace(/^::ffff:/i, "");
      const lan = isLanIp(s.RemoteEndPoint);
      // Episodes rarely carry their own backdrop — it lives on the parent series.
      const backdropId = kind === "series" ? item.ParentBackdropItemId || item.SeriesId : item.Id;
      return {
        id: `jf-${s.Id}`,
        title: kind === "series" ? item.SeriesName || item.Name : item.Name,
        kind,
        year: item.ProductionYear,
        ep: kind === "series" ? item.Name : undefined,
        user: s.UserName || s.UserId,
        src: "jellyfin",
        device: s.DeviceName,
        res: heightToRes(video?.Height ?? item.Height),
        play: transcoding ? "transcode" : "direct",
        bitrate: bps ? (bps / 1_000_000).toFixed(1) : "0",
        codec: codec || "—",
        pos,
        dur: durMin,
        paused: Boolean(s.PlayState?.IsPaused),
        art: item.Id ? `/api/artwork?svc=jellyfin&ref=${encodeURIComponent(kind === "series" && item.SeriesId ? item.SeriesId : item.Id)}` : undefined,
        backdrop: backdropId ? `/api/artwork?svc=jellyfin&kind=backdrop&ref=${encodeURIComponent(backdropId)}` : undefined,
        // — title detail —
        summary: item.Overview || undefined,
        season: kind === "series" ? item.ParentIndexNumber : undefined,
        episode: kind === "series" ? item.IndexNumber : undefined,
        airDate: item.PremiereDate ? item.PremiereDate.slice(0, 10) : undefined,
        contentRating: item.OfficialRating || undefined,
        genres: item.Genres && item.Genres.length ? item.Genres : undefined,
        userAvatar: s.UserPrimaryImageTag ? `/api/artwork?svc=jellyfin&kind=avatar&ref=${encodeURIComponent(s.UserId)}` : undefined,
        // — client / app —
        product: s.Client || undefined,
        productVersion: s.ApplicationVersion || undefined,
        devicePlatform: s.DeviceName || undefined,
        // — network —
        location: lan ? "lan" : "wan",
        ipPublic: ip || undefined,
        local: lan,
        // — transcode detail —
        videoDecision: trackDecision(ti?.IsVideoDirect),
        audioDecision: trackDecision(ti?.IsAudioDirect),
        hwTranscode: Boolean(ti?.HardwareAccelerationType),
        transcodeProgress: ti?.CompletionPercentage != null ? Math.round(ti.CompletionPercentage) : undefined,
        // — stream specs —
        dynamicRange: range || undefined,
        framerate: fps ? `${Math.round(fps)}p` : undefined,
        sourceContainer: item.Container || undefined,
        streamContainer: ti?.Container || undefined,
        streamCodec: ti?.VideoCodec?.toUpperCase() || undefined,
        audioCodec: audio?.Codec?.toUpperCase() || undefined,
        streamAudioCodec: ti?.AudioCodec?.toUpperCase() || undefined,
        audioChannels: audio?.Channels,
        streamAudioChannels: ti?.AudioChannels,
        audioLayout: cleanLayout(audio?.ChannelLayout) || chLayout(audio?.Channels),
        subtitle: sub ? { codec: sub.Codec?.toUpperCase() || undefined, language: sub.Language || undefined, transcode: transcoding } : undefined,
      } satisfies NowPlaying;
    });
}

// ── Audiobookshelf — now playing ───────────────────────────
// ABS exposes active listening via GET /api/users/online (admin-only): each online user carries
// their open `session` (User.toJSONForPublic → PlaybackSession.toJSONForClient) or null when idle.
// duration/currentTime are in SECONDS (not Jellyfin ticks). Books and podcasts both map to "track".
interface AbsSession {
  id: string;
  mediaType?: "book" | "podcast";
  displayTitle?: string;
  displayAuthor?: string;
  libraryItemId?: string;
  duration?: number; // seconds
  currentTime?: number; // seconds
  playMethod?: number; // 0 directPlay, 1 directStream, 2 transcode, 3 local
  mediaPlayer?: string;
  deviceInfo?: { deviceName?: string; clientName?: string; clientVersion?: string; osName?: string };
  audioTracks?: { codec?: string }[];
  chapters?: { id: number; start: number; end: number; title?: string }[]; // seconds
  mediaMetadata?: {
    narrators?: string[];
    genres?: string[];
    publishedYear?: string | number | null;
  };
}
interface AbsOnlineUser {
  id: string;
  username?: string;
  session?: AbsSession | null;
}

function mapAbsSession(u: AbsOnlineUser): NowPlaying {
  const s = u.session!;
  const dur = s.duration ?? 0;
  const t = s.currentTime ?? 0;
  const meta = s.mediaMetadata;
  // Current chapter at snapshot time (chapter bounds are in seconds, like currentTime).
  const chIdx = s.chapters?.findIndex((c) => t >= c.start && t < c.end) ?? -1;
  const chapter = s.chapters?.length && chIdx >= 0
    ? { title: s.chapters[chIdx].title || undefined, index: chIdx + 1, count: s.chapters.length }
    : undefined;
  return {
    id: `abs-${s.id}`,
    title: s.displayTitle || "—",
    kind: "track",
    year: Number(meta?.publishedYear) || undefined,
    ep: s.displayAuthor || undefined,
    user: u.username || "—",
    src: "audiobookshelf",
    device: s.deviceInfo?.deviceName || s.deviceInfo?.clientName || "—",
    res: "—",
    play: s.playMethod === 2 ? "transcode" : "direct",
    bitrate: "0", // ABS exposes no stream bitrate; "0" renders as absent
    codec: "—", // no video — the audio codec lives in audioCodec (StreamTech's Audio row)
    pos: dur ? t / dur : 0,
    dur: Math.round(dur / 60),
    paused: false,
    art: s.libraryItemId ? `/api/artwork?svc=audiobookshelf&ref=${encodeURIComponent(s.libraryItemId)}` : undefined,
    // — title detail —
    genres: meta?.genres?.length ? meta.genres : undefined,
    narrator: meta?.narrators?.length ? meta.narrators.join(", ") : undefined,
    chapter,
    // — client / app —
    product: s.mediaPlayer || undefined,
    platform: s.deviceInfo?.osName || undefined,
    productVersion: s.deviceInfo?.clientVersion || undefined,
    // — stream specs —
    audioCodec: (s.audioTracks?.[0]?.codec || "").toUpperCase() || undefined,
    audioDecision: s.playMethod === 2 ? "transcode" : "direct play",
  } satisfies NowPlaying;
}

export async function audiobookshelfNowPlaying(): Promise<NowPlaying[]> {
  const { baseUrl, apiKey } = await creds("audiobookshelf");
  const data = await fetchJson<{ usersOnline?: AbsOnlineUser[] }>(`${baseUrl}/api/users/online`, {
    service: "audiobookshelf",
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  return (data.usersOnline ?? []).filter((u) => u.session).map((u) => mapAbsSession(u));
}

// ── Jellyfin — library counts (cached) ─────────────────────
export async function jellyfinLibraries(): Promise<LibraryStat[]> {
  return cached("jellyfin:libraries", 10 * 60 * 1000, async () => {
    const { baseUrl, apiKey } = await creds("jellyfin");
    const d = await fetchJson<{ MovieCount?: number; SeriesCount?: number; EpisodeCount?: number; AlbumCount?: number; SongCount?: number }>(
      `${baseUrl}/Items/Counts`,
      { service: "jellyfin", headers: { Authorization: `MediaBrowser Token="${apiKey}"` } },
    );
    const out: LibraryStat[] = [];
    if (d.MovieCount) out.push({ id: "movies", label: "Movies", count: fmt(d.MovieCount), icon: "movie", delta: `${fmt(d.MovieCount)} titles` });
    if (d.SeriesCount) out.push({ id: "shows", label: "TV Shows", count: fmt(d.SeriesCount), icon: "live_tv", delta: `${fmt(d.EpisodeCount ?? 0)} episodes` });
    if (d.AlbumCount) out.push({ id: "music", label: "Music", count: fmt(d.AlbumCount), icon: "library_music", delta: `${fmt(d.SongCount ?? 0)} tracks` });
    return out;
  });
}

// ── Jellyfin — recently added (cached) ─────────────────────
interface JellyfinItem {
  Id: string;
  Name: string;
  Type: string;
  ProductionYear?: number;
  SeriesName?: string;
  SeriesId?: string;
}

export async function jellyfinRecentlyAdded(count = 6): Promise<RecentItem[]> {
  return cached("jellyfin:recent", 3 * 60 * 1000, async () => {
    const { baseUrl, apiKey } = await creds("jellyfin");
    const data = await fetchJson<{ Items?: JellyfinItem[] }>(
      `${baseUrl}/Items?SortBy=DateCreated&SortOrder=Descending&Recursive=true&Limit=${count}&IncludeItemTypes=Movie,Episode,Audio&Fields=ProductionYear`,
      { service: "jellyfin", headers: { Authorization: `MediaBrowser Token="${apiKey}"` } },
    );
    return (data.Items ?? []).map((it) => {
      const kind: MediaKind = it.Type === "Episode" ? "series" : it.Type === "Audio" ? "track" : "movie";
      const ref = kind === "series" && it.SeriesId ? it.SeriesId : it.Id;
      return {
        id: `jf-${it.Id}`,
        title: kind === "series" ? it.SeriesName || it.Name : it.Name,
        kind,
        year: it.ProductionYear ?? 0,
        cat: "stream" as const,
        art: ref ? `/api/artwork?svc=jellyfin&ref=${encodeURIComponent(ref)}` : undefined,
      };
    });
  });
}

// ── Overseerr — requests ───────────────────────────────────
interface OverseerrRequest {
  id: number;
  type: "movie" | "tv";
  status: number; // 1 pending, 2 approved, 3 declined, 4 failed
  media?: { id?: number; status?: number; tmdbId?: number; mediaType?: string };
  requestedBy?: { id: number; displayName?: string; plexUsername?: string; email?: string };
  createdAt?: string;
  updatedAt?: string;
  seasons?: Array<{ seasonNumber: number }>;
  profileId?: number;
}

export interface OverseerrRequestDetails {
  id: number;
  requesterId?: number;
  requesterEmail?: string;
  status: MediaRequest["status"];
  seasons?: number[];
}

interface OverseerrMediaDetails {
  title?: string;       // movies
  name?: string;        // tv shows
  posterPath?: string;
  releaseDate?: string;  // movies
  firstAirDate?: string; // tv shows
  overview?: string;
}

// Cache enriched media details by "type:tmdbId".
// Titles and poster paths are effectively immutable — 1h TTL is fine.
// Module scope persists across snapshot polls within the same server process.
interface EnrichedDetails {
  title: string;
  posterPath?: string;
  year?: number;
  overview?: string;
  cachedAt: number;
}
const enrichCache = new Map<string, EnrichedDetails>();
const ENRICH_TTL = 60 * 60 * 1000;
// On failed fetch, retry after 30s to avoid hammering a slow upstream.
const ENRICH_RETRY = 30 * 1000;

// Coalesce concurrent enrichment fetches for the same title. The cold-cache window
// gets polled every 3s; without this, each poll re-issues the same TMDB roundtrips.
const enrichInflight = new Map<string, Promise<EnrichedDetails>>();

// Synchronous, read-only cache peek: returns a still-valid enrichment or undefined.
// Lets overseerrRequests serve the list immediately and background-fill misses.
function enrichPeek(type: "movie" | "tv", tmdbId: number): EnrichedDetails | undefined {
  const cached = enrichCache.get(`${type}:${tmdbId}`);
  if (cached) {
    const ttl = cached.title ? ENRICH_TTL : ENRICH_RETRY;
    if (Date.now() - cached.cachedAt < ttl) return cached;
  }
  return undefined;
}

async function enrichMedia(baseUrl: string, apiKey: string, type: "movie" | "tv", tmdbId: number): Promise<EnrichedDetails> {
  const cacheKey = `${type}:${tmdbId}`;
  const peek = enrichPeek(type, tmdbId);
  if (peek) return peek;
  const existing = enrichInflight.get(cacheKey);
  if (existing) return existing;
  const p = (async () => {
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
        overview: details.overview || undefined,
        cachedAt: Date.now(),
      };
      enrichCache.set(cacheKey, result);
      return result;
    } catch {
      const fallback: EnrichedDetails = { title: "", cachedAt: Date.now() };
      enrichCache.set(cacheKey, fallback);
      return fallback;
    } finally {
      enrichInflight.delete(cacheKey);
    }
  })();
  enrichInflight.set(cacheKey, p);
  return p;
}

// Bounded background enrichment: a cold request list can have hundreds of uncached
// items. Rather than fire them all at once (a burst that can overwhelm Overseerr,
// especially right after a DNS/upstream hiccup), drain the misses through a small
// worker pool. Deduped against in-flight + already-queued keys so repeated polls
// during the cold window don't stack duplicate work.
const ENRICH_CONCURRENCY = 6;
const enrichQueue: Array<() => Promise<unknown>> = [];
const enrichQueued = new Set<string>();
let enrichActive = 0;
function pumpEnrichQueue(): void {
  while (enrichActive < ENRICH_CONCURRENCY && enrichQueue.length > 0) {
    const job = enrichQueue.shift()!;
    enrichActive++;
    void job().finally(() => {
      enrichActive--;
      pumpEnrichQueue();
    });
  }
}
function queueEnrich(baseUrl: string, apiKey: string, type: "movie" | "tv", tmdbId: number): void {
  const key = `${type}:${tmdbId}`;
  if (enrichQueued.has(key) || enrichInflight.has(key)) return; // already pending
  enrichQueued.add(key);
  enrichQueue.push(() => enrichMedia(baseUrl, apiKey, type, tmdbId).finally(() => enrichQueued.delete(key)));
  pumpEnrichQueue();
}

const OVERSEERR_STATUS: Record<number, MediaRequest["status"]> = { 1: "pending", 2: "approved", 3: "declined", 4: "failed" };

// Cache resolved quality profile names (profileId → name) for 1 hour.
// Radarr (movies) and Sonarr (TV) have independent profile ID spaces so we keep
// separate maps and select by request type when resolving a name.
interface QualityProfileMaps { movie: Record<number, string>; tv: Record<number, string> }
let qualityProfilesCache: { at: number; maps: QualityProfileMaps } | null = null;
const QUALITY_PROFILES_TTL = 60 * 60 * 1000;

async function arrQualityProfileMap(serviceId: "radarr" | "sonarr"): Promise<Record<number, string>> {
  const { baseUrl, apiKey } = await creds(serviceId);
  type ArrProfile = { id: number; name: string };
  const profiles = await fetchJson<ArrProfile[]>(`${baseUrl}/api/v3/qualityprofile`, {
    service: serviceId,
    headers: { "X-Api-Key": apiKey },
    timeoutMs: 5000,
  });
  const m: Record<number, string> = {};
  for (const p of profiles) if (p.id != null && p.name) m[p.id] = p.name;
  return m;
}

async function overseerrQualityProfiles(baseUrl: string, apiKey: string): Promise<QualityProfileMaps> {
  if (qualityProfilesCache && Date.now() - qualityProfilesCache.at < QUALITY_PROFILES_TTL) {
    return qualityProfilesCache.maps;
  }

  // Primary: call Radarr/Sonarr directly — gets ALL profiles, not just the active one.
  // Falls back to Overseerr settings (active profile only) if *arr isn't configured in AERIE.
  const [movieMap, tvMap] = await Promise.all([
    arrQualityProfileMap("radarr").catch(async () => {
      // Fallback: Overseerr settings knows the active profile without pinging *arr.
      type S = { activeProfileId?: number; activeProfileName?: string };
      const h = { "X-Api-Key": apiKey };
      const rows = await fetchJson<S[]>(`${baseUrl}/api/v1/settings/radarr`, { service: "overseerr", headers: h, timeoutMs: 5000 }).catch(() => [] as S[]);
      const m: Record<number, string> = {};
      for (const e of rows) if (e.activeProfileId != null && e.activeProfileName) m[e.activeProfileId] = e.activeProfileName;
      return m;
    }),
    arrQualityProfileMap("sonarr").catch(async () => {
      type S = { activeProfileId?: number; activeProfileName?: string };
      const h = { "X-Api-Key": apiKey };
      const rows = await fetchJson<S[]>(`${baseUrl}/api/v1/settings/sonarr`, { service: "overseerr", headers: h, timeoutMs: 5000 }).catch(() => [] as S[]);
      const m: Record<number, string> = {};
      for (const e of rows) if (e.activeProfileId != null && e.activeProfileName) m[e.activeProfileId] = e.activeProfileName;
      return m;
    }),
  ]);

  const maps: QualityProfileMaps = { movie: movieMap, tv: tvMap };
  qualityProfilesCache = { at: Date.now(), maps };
  return maps;
}

// Per-type profile caches (movie = Radarr, TV = Sonarr) for the client-facing fetch.
let movieProfilesCache: { at: number; profiles: QualityProfile[] } | null = null;
let tvProfilesCache: { at: number; profiles: QualityProfile[] } | null = null;

async function fetchServiceProfiles(baseUrl: string, apiKey: string, arr: "radarr" | "sonarr"): Promise<QualityProfile[]> {
  const DEFAULT: QualityProfile = { id: "default", label: "Default", sub: "Overseerr default", icon: "auto_awesome", def: true };

  // Primary: call *arr directly — fast, full list, no Overseerr service-proxy ping.
  const direct = await arrQualityProfileMap(arr).catch(() => null);
  if (direct && Object.keys(direct).length > 0) {
    const live = Object.entries(direct).map(([id, name]) => ({ id, label: name, sub: "", icon: "high_quality" as const }));
    return [DEFAULT, ...live];
  }

  // Fallback: Overseerr service proxy (pings *arr — slow, but works when *arr isn't
  // configured separately in AERIE).
  const h = { "X-Api-Key": apiKey };
  const get = <T>(url: string) => fetchJson<T>(url, { service: "overseerr", headers: h, timeoutMs: 20000 });
  type SvcEntry = { id: number };
  type ProfileEntry = { id: number; name?: string };
  const svcs = await get<SvcEntry[]>(`${baseUrl}/api/v1/service/${arr}`).catch(() => [] as SvcEntry[]);
  if (svcs.length > 0) {
    const raw = await get<ProfileEntry[]>(`${baseUrl}/api/v1/service/${arr}/${svcs[0].id}/profiles`).catch(() => [] as ProfileEntry[]);
    const live: QualityProfile[] = raw.filter((p) => p.id != null && p.name).map((p) => ({ id: String(p.id), label: p.name!, sub: "", icon: "high_quality" }));
    if (live.length > 0) return [DEFAULT, ...live];
  }

  // Last resort: Overseerr settings (active profile only).
  type SettingsEntry = { activeProfileId?: number; activeProfileName?: string };
  const settings = await fetchJson<SettingsEntry[]>(`${baseUrl}/api/v1/settings/${arr}`, { service: "overseerr", headers: h, timeoutMs: 5000 }).catch(() => [] as SettingsEntry[]);
  const fromSettings: QualityProfile[] = settings
    .filter((e) => e.activeProfileId != null && e.activeProfileName)
    .map((e) => ({ id: String(e.activeProfileId!), label: e.activeProfileName!, sub: "active profile", icon: "high_quality" }));
  return [DEFAULT, ...fromSettings];
}

const MOVIE_FILE_INDEX_TTL = 30 * 60 * 1000;
interface MovieIndexes { fileIndex: Map<number, FileInfo>; profileIndex: Map<number, number> }
let movieIndexCache: { at: number } & MovieIndexes | null = null;

async function arrMovieIndexes(): Promise<MovieIndexes> {
  if (movieIndexCache && Date.now() - movieIndexCache.at < MOVIE_FILE_INDEX_TTL) {
    return { fileIndex: movieIndexCache.fileIndex, profileIndex: movieIndexCache.profileIndex };
  }
  const { baseUrl, apiKey } = await creds("radarr");
  type RMovie = {
    tmdbId: number;
    qualityProfileId?: number;
    movieFile?: {
      size?: number;
      quality?: { quality?: { resolution?: number; source?: string } };
      mediaInfo?: { videoCodec?: string };
    };
  };
  const movies = await fetchJson<RMovie[]>(`${baseUrl}/api/v3/movie`, {
    service: "radarr",
    headers: { "X-Api-Key": apiKey },
    timeoutMs: 10000,
  });
  const SOURCE: Record<string, string> = { bluray: "Blu-ray", webrip: "WEBRip", webdl: "WEB-DL", hdtv: "HDTV", dvd: "DVD", cam: "CAM" };
  const fileIndex = new Map<number, FileInfo>();
  const profileIndex = new Map<number, number>();
  for (const m of movies) {
    if (!m.tmdbId) continue;
    if (m.qualityProfileId != null) profileIndex.set(m.tmdbId, m.qualityProfileId);
    if (!m.movieFile) continue;
    const q = m.movieFile.quality?.quality;
    const res = q?.resolution ? `${q.resolution}p` : undefined;
    const src = q?.source ? (SOURCE[q.source] ?? q.source) : undefined;
    const codec = m.movieFile.mediaInfo?.videoCodec?.toUpperCase() ?? undefined;
    const parts = [res, src, codec ? `· ${codec}` : undefined].filter(Boolean);
    fileIndex.set(m.tmdbId, { label: parts.join(" ") || "Unknown", sizeBytes: m.movieFile.size });
  }
  movieIndexCache = { at: Date.now(), fileIndex, profileIndex };
  return { fileIndex, profileIndex };
}

async function arrMovieFileIndex(): Promise<Map<number, FileInfo>> {
  return (await arrMovieIndexes()).fileIndex;
}

/** Live quality profiles for movie requests (from the first Radarr instance). Cached 1h. */
export async function overseerrMovieProfiles(): Promise<QualityProfile[]> {
  if (movieProfilesCache && Date.now() - movieProfilesCache.at < QUALITY_PROFILES_TTL) return movieProfilesCache.profiles;
  const { baseUrl, apiKey } = await creds("overseerr");
  const profiles = await fetchServiceProfiles(baseUrl, apiKey, "radarr");
  movieProfilesCache = { at: Date.now(), profiles };
  return profiles;
}

/** Live quality profiles for TV requests (from the first Sonarr instance). Cached 1h. */
export async function overseerrTvProfiles(): Promise<QualityProfile[]> {
  if (tvProfilesCache && Date.now() - tvProfilesCache.at < QUALITY_PROFILES_TTL) return tvProfilesCache.profiles;
  const { baseUrl, apiKey } = await creds("overseerr");
  const profiles = await fetchServiceProfiles(baseUrl, apiKey, "sonarr");
  tvProfilesCache = { at: Date.now(), profiles };
  return profiles;
}

// Overseerr's /api/v1/request endpoint is slow only when cold (~10s after idle, ~300ms warm).
// Stale-while-revalidate keeps the snapshot instant: serve the last-known list, refresh in the
// background. Mutations bustCache("overseerr:requests") so approvals/cancels reflect at once.
export async function overseerrRequests(): Promise<MediaRequest[]> {
  return cached("overseerr:requests", 10_000, fetchOverseerrRequests);
}

async function fetchOverseerrRequests(): Promise<MediaRequest[]> {
  const { baseUrl, apiKey } = await creds("overseerr");
  const [data, profileMaps, movieIndexes] = await Promise.all([
    fetchJson<{ results: OverseerrRequest[] }>(`${baseUrl}/api/v1/request?take=250&sort=added`, {
      service: "overseerr",
      headers: { "X-Api-Key": apiKey },
      timeoutMs: 10000,
    }),
    overseerrQualityProfiles(baseUrl, apiKey!).catch(() => ({ movie: {}, tv: {} } as { movie: Record<number, string>; tv: Record<number, string> })),
    arrMovieIndexes().catch(() => ({ fileIndex: new Map<number, FileInfo>(), profileIndex: new Map<number, number>() })),
  ]);
  const { fileIndex, profileIndex } = movieIndexes;
  const results = data.results ?? [];

  // Cosmetic media details (title/poster/year/overview) are immutable and cached 1h.
  // Serve whatever is already cached and background-fill misses (coalesced) so the
  // snapshot never blocks on a cold per-item TMDB fan-out — the list itself (status,
  // requester, date) is always fresh from the fetch above. Misses fill in next poll.
  const enriched: EnrichedDetails[] = results.map((r) => {
    if (!r.media?.tmdbId) return { title: "", cachedAt: 0 };
    const hit = enrichPeek(r.type, r.media.tmdbId);
    if (hit) return hit;
    queueEnrich(baseUrl, apiKey!, r.type, r.media.tmdbId); // bounded background fill
    return { title: "", cachedAt: 0 };
  });

  return results.map((r, i) => {
    const { title, posterPath, year, overview } = enriched[i];
    const fallbackYear = r.createdAt ? new Date(r.createdAt).getFullYear() : 0;
    const seasons = r.seasons?.map((s) => s.seasonNumber).filter((n) => n > 0);
    return {
      id: `os-${r.id}`,
      title: title || `Request ${r.id}`,
      kind: r.type === "tv" ? "series" : "movie",
      year: year ?? fallbackYear,
      user: String(r.requestedBy?.id ?? "unknown"),
      status: r.media?.status === 5 ? "available"
        : (r.media?.status === 3 || r.media?.status === 4) ? "processing"
        : (OVERSEERR_STATUS[r.status] ?? "pending"),
      requested: r.createdAt ? new Date(r.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "",
      art: posterPath ? `/api/artwork?svc=overseerr&ref=${encodeURIComponent(posterPath)}` : undefined,
      requesterName: r.requestedBy?.displayName || r.requestedBy?.plexUsername || r.requestedBy?.email?.split("@")[0],
      requesterEmail: r.requestedBy?.email,
      seasons: seasons && seasons.length > 0 ? seasons : undefined,
      overview: overview || undefined,
      qualityProfile: (() => {
        const map = profileMaps[r.type === "tv" ? "tv" : "movie"];
        // Prefer Overseerr's stored profileId; fall back to Radarr's assigned profile
        // (covers requests created via AERIE where no explicit profileId was submitted).
        const pid = r.profileId ?? (r.type === "movie" && r.media?.tmdbId ? profileIndex.get(r.media.tmdbId) : undefined);
        return pid != null ? (map[pid] ?? `Profile ${pid}`) : undefined;
      })(),
      mediaOverseerrId: r.media?.id,
      tmdbId: r.media?.tmdbId,
      modified: r.updatedAt ?? r.createdAt,
      fileInfo: r.type === "movie" && r.media?.tmdbId ? fileIndex.get(r.media.tmdbId) : undefined,
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
  posterPath?: string;
  mediaInfo?: { status?: number };
}

// Overseerr MediaStatus → our request state.
function mediaStatusToState(status?: number): RequestStatus | null {
  if (status === 5 || status === 4) return "available";
  if (status === 3) return "approved";
  if (status === 2) return "pending";
  return null;
}

function mapDiscoverResult(r: OverseerrSearchResult): DiscoverItem {
  const date = r.releaseDate || r.firstAirDate || "";
  return {
    id: String(r.id),
    title: r.title || r.name || `#${r.id}`,
    kind: r.mediaType === "tv" ? "series" : "movie",
    year: date ? Number(date.slice(0, 4)) : 0,
    rating: r.voteAverage ? Math.round(r.voteAverage * 10) / 10 : 0,
    state: mediaStatusToState(r.mediaInfo?.status),
    overview: r.overview || "",
    art: r.posterPath ? `/api/artwork?svc=overseerr&ref=${encodeURIComponent(r.posterPath)}` : undefined,
  };
}

export async function overseerrSearch(query: string): Promise<DiscoverItem[]> {
  const { baseUrl, apiKey } = await creds("overseerr");
  const data = await fetchJson<{ results: OverseerrSearchResult[] }>(
    `${baseUrl}/api/v1/search?query=${encodeURIComponent(query || "a")}&page=1&language=en`,
    { service: "overseerr", headers: { "X-Api-Key": apiKey }, timeoutMs: 12000 },
  );
  return (data.results ?? [])
    .filter((r) => r.mediaType === "movie" || r.mediaType === "tv")
    .slice(0, 20)
    .map(mapDiscoverResult);
}

// ── Overseerr — discover (trending / popular / upcoming) ──────
async function fetchDiscover(baseUrl: string, apiKey: string, path: string, limit = 20): Promise<DiscoverItem[]> {
  const data = await fetchJson<{ results: OverseerrSearchResult[] }>(
    `${baseUrl}/api/v1/discover/${path}?page=1&language=en`,
    { service: "overseerr", headers: { "X-Api-Key": apiKey }, timeoutMs: 8000 },
  );
  return (data.results ?? [])
    .filter((r) => r.mediaType === "movie" || r.mediaType === "tv")
    .slice(0, limit)
    .map(mapDiscoverResult);
}

export async function overseerrTrending(): Promise<DiscoverItem[]> {
  return cached("overseerr:discover:trending", QUALITY_PROFILES_TTL, async () => {
    const { baseUrl, apiKey } = await creds("overseerr");
    return fetchDiscover(baseUrl, apiKey, "trending", 20);
  });
}

export async function overseerrPopularMovies(): Promise<DiscoverItem[]> {
  return cached("overseerr:discover:popularMovies", QUALITY_PROFILES_TTL, async () => {
    const { baseUrl, apiKey } = await creds("overseerr");
    return fetchDiscover(baseUrl, apiKey, "movies", 20);
  });
}

export async function overseerrPopularTv(): Promise<DiscoverItem[]> {
  return cached("overseerr:discover:popularTv", QUALITY_PROFILES_TTL, async () => {
    const { baseUrl, apiKey } = await creds("overseerr");
    return fetchDiscover(baseUrl, apiKey, "tv", 20);
  });
}

export async function overseerrUpcomingMovies(): Promise<DiscoverItem[]> {
  return cached("overseerr:discover:upcomingMovies", QUALITY_PROFILES_TTL, async () => {
    const { baseUrl, apiKey } = await creds("overseerr");
    return fetchDiscover(baseUrl, apiKey, "movies/upcoming", 20);
  });
}

// ── Overseerr — request mutations (delete / edit) ─────────────
export async function overseerrDeleteRequest(requestId: number): Promise<void> {
  const { baseUrl, apiKey } = await creds("overseerr");
  await fetchJson(`${baseUrl}/api/v1/request/${requestId}`, { service: "overseerr", method: "DELETE", headers: { "X-Api-Key": apiKey } });
}

export async function overseerrRequestDetails(requestId: number): Promise<OverseerrRequestDetails> {
  const { baseUrl, apiKey } = await creds("overseerr");
  const r = await fetchJson<OverseerrRequest>(`${baseUrl}/api/v1/request/${requestId}`, {
    service: "overseerr",
    headers: { "X-Api-Key": apiKey },
  });
  const seasons = r.seasons?.map((s) => s.seasonNumber).filter((n) => n > 0);
  return {
    id: r.id,
    requesterId: r.requestedBy?.id,
    requesterEmail: r.requestedBy?.email,
    status: r.media?.status === 5 ? "available"
      : (r.media?.status === 3 || r.media?.status === 4) ? "processing"
      : (OVERSEERR_STATUS[r.status] ?? "pending"),
    seasons: seasons && seasons.length > 0 ? seasons : undefined,
  };
}

export async function overseerrEditRequest(requestId: number, changes: { seasons?: number[]; profileId?: number }): Promise<void> {
  const { baseUrl, apiKey } = await creds("overseerr");
  const body: Record<string, unknown> = {};
  if (changes.seasons !== undefined) body.seasons = changes.seasons.length ? changes.seasons : "all";
  if (changes.profileId !== undefined) body.profileId = changes.profileId;
  await fetchJson(`${baseUrl}/api/v1/request/${requestId}`, { service: "overseerr", method: "PUT", headers: { "X-Api-Key": apiKey }, body });
}

// ── Overseerr — request counts ────────────────────────────────
export interface RequestCounts {
  total: number;
  pending: number;
  approved: number;
  processing: number;
  failed: number;
  available: number;
}

export async function overseerrRequestCounts(): Promise<RequestCounts> {
  return cached("overseerr:requestCounts", 3 * 60 * 1000, async () => {
    const { baseUrl, apiKey } = await creds("overseerr");
    const data = await fetchJson<Record<string, number>>(`${baseUrl}/api/v1/request/count`, {
      service: "overseerr",
      headers: { "X-Api-Key": apiKey },
    });
    return {
      total: data.total ?? 0,
      pending: data.pending ?? 0,
      approved: data.approved ?? 0,
      processing: data.processing ?? 0,
      failed: (data.failed ?? 0) + (data.unavailable ?? 0),
      available: data.available ?? 0,
    };
  });
}

// ── Overseerr — Plex watchlist ────────────────────────────────
export async function overseerrWatchlist(): Promise<DiscoverItem[]> {
  return cached("overseerr:watchlist", 5 * 60 * 1000, async () => {
    const { baseUrl, apiKey } = await creds("overseerr");
    const data = await fetchJson<{ results: (OverseerrSearchResult & { tmdbId?: number })[] }>(
      `${baseUrl}/api/v1/discover/watchlist?page=1`,
      { service: "overseerr", headers: { "X-Api-Key": apiKey }, timeoutMs: 8000 },
    );
    const raw = (data.results ?? [])
      .filter((r) => r.mediaType === "movie" || r.mediaType === "tv")
      .slice(0, 50);
    // Watchlist items come from Plex and lack TMDB fields — enrich any that are missing art or date.
    return Promise.all(raw.map(async (r) => {
      const base = mapDiscoverResult({ ...r, id: r.tmdbId ?? r.id });
      if (base.art && base.year) return base;
      const tmdbId = r.tmdbId ?? r.id;
      if (!tmdbId) return base;
      const type = r.mediaType === "tv" ? "tv" : "movie";
      const enriched = await enrichMedia(baseUrl, apiKey, type, tmdbId);
      return {
        ...base,
        year: base.year || enriched.year || 0,
        art: base.art ?? (enriched.posterPath ? `/api/artwork?svc=overseerr&ref=${encodeURIComponent(enriched.posterPath)}` : undefined),
      };
    }));
  });
}

export async function overseerrCreateRequest(input: { tmdbId: number; mediaType: "movie" | "tv"; seasons?: number[]; userId?: number; profileId?: number }): Promise<{ status: number; mediaStatus?: number }> {
  const { baseUrl, apiKey } = await creds("overseerr");
  const body: Record<string, unknown> = { mediaType: input.mediaType, mediaId: input.tmdbId };
  if (input.mediaType === "tv") body.seasons = input.seasons && input.seasons.length ? input.seasons : "all";
  if (input.userId) body.userId = input.userId;
  if (input.profileId) body.profileId = input.profileId;
  // The POST response is the created MediaRequest: `status` is 1 pending / 2 approved
  // (auto-approve), so the caller can tell whether the request needs approval.
  const res = await fetchJson<{ status?: number; media?: { status?: number } }>(`${baseUrl}/api/v1/request`, { service: "overseerr", method: "POST", headers: { "X-Api-Key": apiKey }, body });
  return { status: typeof res?.status === "number" ? res.status : 1, mediaStatus: res?.media?.status };
}

export async function overseerrReview(requestId: number, action: "approve" | "decline"): Promise<void> {
  const { baseUrl, apiKey } = await creds("overseerr");
  await fetchJson(`${baseUrl}/api/v1/request/${requestId}/${action}`, { service: "overseerr", method: "POST", headers: { "X-Api-Key": apiKey } });
}

export async function overseerrComment(mediaId: number, message: string): Promise<void> {
  const { baseUrl, apiKey } = await creds("overseerr");
  await fetchJson(`${baseUrl}/api/v1/comment`, { service: "overseerr", method: "POST", headers: { "X-Api-Key": apiKey }, body: { message, mediaId } });
}

// ── Overseerr — users (for portal↔Overseerr identity matching) ──
export interface OverseerrUser {
  id: number;
  email?: string;
  displayName?: string;
  plexUsername?: string;
}
interface OverseerrUserApi {
  id: number;
  email?: string;
  displayName?: string;
  plexUsername?: string;
}

// Cache the user list briefly — getSnapshot polls every 12s and submitRequest may
// also call this; a short TTL avoids hammering /api/v1/user on every poll.
let usersCache: { at: number; users: OverseerrUser[] } | null = null;
const USERS_TTL = 5 * 60 * 1000;

export async function overseerrUsers(): Promise<OverseerrUser[]> {
  if (usersCache && Date.now() - usersCache.at < USERS_TTL) return usersCache.users;
  const { baseUrl, apiKey } = await creds("overseerr");
  const data = await fetchJson<{ results: OverseerrUserApi[] }>(`${baseUrl}/api/v1/user?take=100`, {
    service: "overseerr",
    headers: { "X-Api-Key": apiKey },
  });
  const users = (data.results ?? []).map((u) => ({ id: u.id, email: u.email, displayName: u.displayName, plexUsername: u.plexUsername }));
  usersCache = { at: Date.now(), users };
  return users;
}

// ── Overseerr — open issues (cached) ───────────────────────
interface OverseerrIssueApi {
  id: number;
  issueType?: number;
  status?: number;
}

export async function overseerrIssues(): Promise<{ open: number; items: IssueItem[] }> {
  return cached("overseerr:issues", 3 * 60 * 1000, async () => {
    const { baseUrl, apiKey } = await creds("overseerr");
    const data = await fetchJson<{ pageInfo?: { results?: number }; results?: OverseerrIssueApi[] }>(
      `${baseUrl}/api/v1/issue?take=20&filter=open&sort=added`,
      { service: "overseerr", headers: { "X-Api-Key": apiKey } },
    );
    const items: IssueItem[] = (data.results ?? []).map((i) => ({ id: i.id, issueType: i.issueType ?? 0, status: i.status ?? 0 }));
    return { open: data.pageInfo?.results ?? items.length, items };
  });
}

export async function overseerrVersion(): Promise<string | null> {
  return cached("overseerr:version", 30 * 60 * 1000, async () => {
    const { baseUrl, apiKey } = await creds("overseerr");
    const d = await fetchJson<{ version?: string }>(`${baseUrl}/api/v1/status`, {
      service: "overseerr",
      headers: { "X-Api-Key": apiKey },
    });
    return normalizeVersion(d.version);
  });
}

/** Pure helper: find the Overseerr user id whose email matches `email` (case-insensitive). */
export function matchOverseerrUserId(users: OverseerrUser[], email: string | undefined): number | undefined {
  if (!email) return undefined;
  const key = email.trim().toLowerCase();
  if (!key) return undefined;
  return users.find((u) => u.email?.trim().toLowerCase() === key)?.id;
}

// ── Overseerr — per-user quota (read + write) ──────────────
interface OverseerrQuotaApi {
  limit: number;
  days: number;
  used: number;
  remaining: number;
  restricted: boolean;
}

function mapQuota(q: OverseerrQuotaApi): OverseerrQuota {
  return { limit: q.limit === 0 ? null : q.limit, days: q.days, used: q.used, remaining: q.remaining, restricted: q.restricted };
}

/** Fetch the current movie + TV quota for an Overseerr user. Cached 3 min per user. */
export async function overseerrUserQuota(overseerrUserId: number): Promise<{ movie: OverseerrQuota; tv: OverseerrQuota }> {
  return cached(`overseerr:quota:${overseerrUserId}`, 3 * 60 * 1000, async () => {
    const { baseUrl, apiKey } = await creds("overseerr");
    const raw = await fetchJson<{ movie: OverseerrQuotaApi; tv: OverseerrQuotaApi }>(
      `${baseUrl}/api/v1/user/${overseerrUserId}/quota`,
      { service: "overseerr", headers: { "X-Api-Key": apiKey } },
    );
    return { movie: mapQuota(raw.movie), tv: mapQuota(raw.tv) };
  });
}

export interface OverseerrQuotaSettings {
  movieQuotaLimit: number | null;
  movieQuotaDays: number;
  tvQuotaLimit: number | null;
  tvQuotaDays: number;
}

/** Write movie + TV quota settings for an Overseerr user, then bust the local cache. */
export async function overseerrUpdateUserQuota(overseerrUserId: number, settings: OverseerrQuotaSettings): Promise<void> {
  const { baseUrl, apiKey } = await creds("overseerr");
  await fetchJson(`${baseUrl}/api/v1/user/${overseerrUserId}/settings/main`, {
    service: "overseerr",
    method: "POST",
    headers: { "X-Api-Key": apiKey },
    body: {
      movieQuotaLimit: settings.movieQuotaLimit ?? 0,
      movieQuotaDays: settings.movieQuotaDays,
      tvQuotaLimit: settings.tvQuotaLimit ?? 0,
      tvQuotaDays: settings.tvQuotaDays,
    },
  });
  bustCache(`overseerr:quota:${overseerrUserId}`);
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

// ── *arr — disk space (cached; mounts change slowly) ───────
interface ArrDiskSpace {
  path: string;
  label?: string;
  freeSpace: number;
  totalSpace: number;
}

export async function arrDiskSpace(serviceId: "sonarr" | "radarr"): Promise<StorageMount[]> {
  return cached(`diskspace:${serviceId}`, 10 * 60 * 1000, async () => {
    const { baseUrl, apiKey } = await creds(serviceId);
    const data = await fetchJson<ArrDiskSpace[]>(`${baseUrl}/api/v3/diskspace`, {
      service: serviceId,
      headers: { "X-Api-Key": apiKey },
    });
    return (data ?? [])
      .filter((d) => d.totalSpace > 0)
      .map((d) => ({ path: d.path, label: d.label || d.path, freeBytes: d.freeSpace, totalBytes: d.totalSpace }));
  });
}

// ── *arr — health warnings (cached) ────────────────────────
interface ArrHealthRecord {
  source?: string;
  type?: string;
  message?: string;
  wikiUrl?: string;
}

export async function arrHealth(serviceId: "sonarr" | "radarr"): Promise<HealthIssue[]> {
  return cached(`health:${serviceId}`, 3 * 60 * 1000, async () => {
    const { baseUrl, apiKey } = await creds(serviceId);
    const data = await fetchJson<ArrHealthRecord[]>(`${baseUrl}/api/v3/health`, {
      service: serviceId,
      headers: { "X-Api-Key": apiKey },
    });
    return (data ?? []).map((h) => ({
      svc: serviceId,
      type: h.type || "warning",
      message: h.message || "",
      source: h.source,
      wikiUrl: h.wikiUrl,
    }));
  });
}

// ── *arr — upcoming calendar (cached) ──────────────────────
interface ArrCalendarRecord {
  id: number;
  title?: string;        // Radarr movie title
  seriesTitle?: string;  // sometimes present on Sonarr records
  series?: { title?: string; images?: { coverType: string; remoteUrl?: string; url?: string }[] };
  seasonNumber?: number;
  episodeNumber?: number;
  airDateUtc?: string;   // Sonarr
  inCinemas?: string;    // Radarr
  digitalRelease?: string;
  physicalRelease?: string;
  images?: { coverType: string; remoteUrl?: string; url?: string }[];
}

function arrPoster(serviceId: string, rec: ArrCalendarRecord): string | undefined {
  // Sonarr episodes: poster lives on rec.series.images; Radarr movies: rec.images
  const imgs = (rec.series?.images?.length ? rec.series.images : rec.images) ?? [];
  const img = imgs.find((i) => i.coverType === "poster") ?? imgs[0];
  const ref = img?.remoteUrl || img?.url;
  return ref ? `/api/artwork?svc=${serviceId}&ref=${encodeURIComponent(ref)}` : undefined;
}

export async function arrCalendar(serviceId: "sonarr" | "radarr"): Promise<UpcomingItem[]> {
  return cached(`calendar:${serviceId}`, 15 * 60 * 1000, async () => {
    const { baseUrl, apiKey } = await creds(serviceId);
    const start = new Date().toISOString();
    const end = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
    const data = await fetchJson<ArrCalendarRecord[]>(
      `${baseUrl}/api/v3/calendar?start=${start}&end=${end}&includeSeries=true`,
      { service: serviceId, headers: { "X-Api-Key": apiKey } },
    );
    const isSeries = serviceId === "sonarr";
    const out: UpcomingItem[] = [];
    for (const rec of data ?? []) {
      const when = isSeries ? rec.airDateUtc : rec.digitalRelease || rec.inCinemas || rec.physicalRelease;
      if (!when) continue;
      const seriesTitle = rec.series?.title || rec.seriesTitle || "";
      const ep = isSeries && rec.seasonNumber != null && rec.episodeNumber != null
        ? `S${String(rec.seasonNumber).padStart(2, "0")}E${String(rec.episodeNumber).padStart(2, "0")}${rec.title ? ` · ${rec.title}` : ""}`
        : undefined;
      out.push({
        id: `${serviceId}-${rec.id}`,
        title: isSeries ? seriesTitle || rec.title || "Untitled" : rec.title || "Untitled",
        kind: isSeries ? "series" : "movie",
        when,
        ep,
        svc: serviceId,
        art: arrPoster(serviceId, rec),
      });
    }
    return out;
  });
}

// ── *arr — recently grabbed/imported history (cached) ──────
interface ArrHistoryRecord {
  id: number;
  eventType?: string;
  sourceTitle?: string;
  date?: string;
  movie?: { title?: string };
  series?: { title?: string };
}

export async function arrHistory(serviceId: "sonarr" | "radarr"): Promise<DownloadEvent[]> {
  return cached(`history:${serviceId}`, 3 * 60 * 1000, async () => {
    const { baseUrl, apiKey } = await creds(serviceId);
    const data = await fetchJson<{ records: ArrHistoryRecord[] }>(
      `${baseUrl}/api/v3/history?pageSize=30&sortKey=date&sortDirection=descending`,
      { service: serviceId, headers: { "X-Api-Key": apiKey } },
    );
    return (data.records ?? [])
      .filter((r) => r.eventType === "grabbed" || r.eventType === "downloadFolderImported")
      .map((r) => ({
        id: `${serviceId}-h${r.id}`,
        title: r.movie?.title || r.series?.title || r.sourceTitle || "Unknown",
        svc: serviceId,
        when: r.date || "",
        event: r.eventType === "downloadFolderImported" ? "imported" : "grabbed",
      }));
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

// ── Prometheus — instant query returning every result (with labels) ──
export async function prometheusQueryAll(query: string): Promise<{ metric: Record<string, string>; value: number }[]> {
  const c = await getServiceCredentials("prometheus");
  if (!c) return [];
  const base = c.baseUrl.replace(/\/$/, "");
  const data = await fetchJson<{ data: { result: { metric: Record<string, string>; value: [number, string] }[] } }>(
    `${base}/api/v1/query?query=${encodeURIComponent(query)}`,
    { service: "prometheus", headers: c.apiKey ? { Authorization: `Bearer ${c.apiKey}` } : {} },
  );
  return (data.data?.result ?? []).map((r) => ({ metric: r.metric, value: Number(r.value[1]) }));
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

// ── Wizarr — invite / user stats (cached) ──────────────────
export interface WizarrStats {
  users: number;
  invites: number;
  pending: number;
  expired: number;
}

export async function wizarrStats(): Promise<WizarrStats> {
  return cached("wizarr:stats", 60 * 1000, async () => {
    const { baseUrl, apiKey } = await creds("wizarr");
    const d = await fetchJson<{ users?: number; invites?: number; pending?: number; expired?: number }>(
      `${baseUrl}/api/status`,
      { service: "wizarr", headers: { "X-API-Key": apiKey } },
    );
    return { users: d.users ?? 0, invites: d.invites ?? 0, pending: d.pending ?? 0, expired: d.expired ?? 0 };
  });
}

// ── Prowlarr — indexer health + grab/query stats (cached) ──
export interface ProwlarrStats {
  total: number;
  enabled: number;
  queries: number;
  grabs: number;
  failedGrabs: number;
}

export async function prowlarrStats(): Promise<ProwlarrStats> {
  return cached("prowlarr:stats", 5 * 60 * 1000, async () => {
    const { baseUrl, apiKey } = await creds("prowlarr");
    const headers = { "X-Api-Key": apiKey };
    // The indexer list is the primary signal (a real outage throws here → panel empties).
    // Stats are best-effort enrichment: if /indexerstats errors (e.g. wants date params on
    // some versions), still show indexer counts rather than blanking the whole panel.
    const indexers = await fetchJson<{ enable?: boolean }[]>(`${baseUrl}/api/v1/indexer`, { service: "prowlarr", headers });
    const stats = await fetchJson<{ indexers?: { numberOfQueries?: number; numberOfGrabs?: number; numberOfFailedGrabs?: number }[] }>(
      `${baseUrl}/api/v1/indexerstats`,
      { service: "prowlarr", headers },
    ).catch(() => ({ indexers: [] as { numberOfQueries?: number; numberOfGrabs?: number; numberOfFailedGrabs?: number }[] }));
    const list = indexers ?? [];
    const si = stats.indexers ?? [];
    return {
      total: list.length,
      enabled: list.filter((i) => i.enable !== false).length,
      queries: si.reduce((a, s) => a + (s.numberOfQueries ?? 0), 0),
      grabs: si.reduce((a, s) => a + (s.numberOfGrabs ?? 0), 0),
      failedGrabs: si.reduce((a, s) => a + (s.numberOfFailedGrabs ?? 0), 0),
    };
  });
}

// ── Agregarr — collections + sync status (cached) ──────────
export interface AgregarrStatus {
  /** real configured-collection count (from /collections, not the sync run's counter) */
  collections: number;
  activeCollections: number;
  running: boolean;
  needingSync: number;
  progress: number;
  currentStage: string | null;
  lastSyncAt: string | null;
  nextSyncAt: string | null;
  error: string | null;
}

export async function agregarrStatus(serviceId = "agregarr"): Promise<AgregarrStatus> {
  return cached(`agregarr:status:${serviceId}`, 60 * 1000, async () => {
    const { baseUrl, apiKey } = await creds(serviceId);
    const headers = { "X-Api-Key": apiKey };
    // The configured collections are the real count; sync/status.totalCollections is only the
    // *current run's* counter (0 when idle), so read /collections for the headline figure.
    const list = await fetchJson<{ collectionConfigs?: { isActive?: boolean }[] }>(
      `${baseUrl}/api/v1/collections`,
      { service: "agregarr", headers },
    );
    // sync/status is best-effort enrichment — don't blank the panel if it errors.
    type AgSync = {
      running?: boolean;
      collectionsNeedingSync?: number;
      progress?: number;
      currentStage?: string;
      lastGlobalSyncAt?: string;
      nextSyncAt?: string;
      globalSyncError?: string | null;
    };
    const sync = await fetchJson<AgSync>(
      `${baseUrl}/api/v1/collections/sync/status`,
      { service: "agregarr", headers },
    ).catch((): AgSync => ({}));
    const cfgs = list.collectionConfigs ?? [];
    return {
      collections: cfgs.length,
      activeCollections: cfgs.filter((c) => c.isActive !== false).length,
      running: sync.running ?? false,
      needingSync: sync.collectionsNeedingSync ?? 0,
      progress: sync.progress ?? 0,
      currentStage: sync.currentStage ?? null,
      lastSyncAt: sync.lastGlobalSyncAt ?? null,
      nextSyncAt: sync.nextSyncAt ?? null,
      error: sync.globalSyncError ?? null,
    };
  });
}

// ── Bazarr — wanted (missing) subtitle counts (cached) ─────
export interface BazarrWanted {
  episodes: number;
  movies: number;
}

export async function bazarrWanted(): Promise<BazarrWanted> {
  return cached("bazarr:wanted", 3 * 60 * 1000, async () => {
    const { baseUrl, apiKey } = await creds("bazarr");
    // Bazarr authenticates via ?apikey=; length=1 keeps the page tiny — we only read `total`.
    const q = `apikey=${encodeURIComponent(apiKey)}&start=0&length=1`;
    // Settle independently: a Bazarr instance with only Sonarr (or only Radarr) wired up
    // errors on the other endpoint — that shouldn't blank the count we *can* read.
    const [ep, mv] = await Promise.allSettled([
      fetchJson<{ total?: number }>(`${baseUrl}/api/episodes/wanted?${q}`, { service: "bazarr" }),
      fetchJson<{ total?: number }>(`${baseUrl}/api/movies/wanted?${q}`, { service: "bazarr" }),
    ]);
    // If both endpoints fail, treat the service as down so the panel shows its empty state.
    if (ep.status === "rejected" && mv.status === "rejected") throw ep.reason;
    return {
      episodes: ep.status === "fulfilled" ? ep.value.total ?? 0 : 0,
      movies: mv.status === "fulfilled" ? mv.value.total ?? 0 : 0,
    };
  });
}

// ── NZBHydra2 — indexer health (cached) ────────────────────
export interface Nzbhydra2Stats {
  total: number;
  enabled: number;
  disabled: number;
  errored: number;
}

interface HydraIndexerStatus {
  indexer?: string;
  state?: string; // ENABLED | DISABLED_USER | DISABLED_SYSTEM | DISABLED_SYSTEM_TEMPORARY
  lastError?: string | null;
}

// NZBHydra2's /api/stats/indexers is a POST taking an ApiHistoryRequest body — a GET (or a body
// missing sortMode/column) returns HTTP 500. The apikey goes in both the query and the body, and
// Content-Type must be set explicitly (fetchJson only sends Accept by default).
async function nzbhydraIndexerStatuses(baseUrl: string, apiKey: string, service: string): Promise<HydraIndexerStatus[]> {
  return fetchJson<HydraIndexerStatus[]>(`${baseUrl}/api/stats/indexers?apikey=${encodeURIComponent(apiKey)}`, {
    service,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: { apikey: apiKey, page: 1, limit: 100, filterModel: {}, sortMode: 2, column: "time" },
  });
}

export async function nzbhydra2Stats(serviceId = "nzbhydra"): Promise<Nzbhydra2Stats> {
  return cached(`nzbhydra2:stats:${serviceId}`, 5 * 60 * 1000, async () => {
    const { baseUrl, apiKey } = await creds(serviceId);
    const items = (await nzbhydraIndexerStatuses(baseUrl, apiKey, "nzbhydra")) ?? [];
    const enabled = items.filter((i) => (i.state ?? "").toUpperCase() === "ENABLED").length;
    // System-disabled (auto, on repeated errors) or an active lastError counts as errored;
    // DISABLED_USER is a deliberate off-switch, so it's only "disabled", not "errored".
    const errored = items.filter((i) => !!i.lastError || (i.state ?? "").toUpperCase().startsWith("DISABLED_SYSTEM")).length;
    return { total: items.length, enabled, disabled: items.length - enabled, errored };
  });
}

// ── Version detection ──────────────────────────────────────

type ServiceKind =
  | "jellyfin"
  | "overseerr"
  | "arr" // Sonarr/Radarr/Whisparr — /api/v3
  | "arr-v1" // Prowlarr/Lidarr/Readarr — /api/v1
  | "bazarr" // own Flask API — /api/system/status?apikey=
  | "agregarr" // /api/v1/status (public)
  | "wizarr" // /api/swagger.json info.version (X-API-Key)
  | "audiobookshelf" // /api/libraries (Bearer; no version field)
  | "nzbhydra" // /internalapi/updates/infos?apikey= → currentVersion
  | "tautulli"
  | "prometheus"
  | "gatus" // /api/v1/endpoints/statuses (optional Bearer; no version field)
  | "beszel" // PocketBase auth → /api/health (no version field)
  | "unraid" // GraphQL /graphql (x-api-key) → info.versions.core.unraid
  | "plex"; // /identity (no auth needed) → MediaContainer.version

function serviceKind(id: string): ServiceKind | null {
  const l = id.toLowerCase();
  if (l.includes("jellyfin") || l.includes("emby")) return "jellyfin";
  if (l.includes("overseerr") || l.includes("jellyseerr") || l.includes("seerr")) return "overseerr";
  // Order matters: match the specific apps before the v3 *arr family below
  // (e.g. "bazarr"/"agregarr" must not fall through to the v3 branch).
  if (l.includes("bazarr")) return "bazarr";
  if (l.includes("agregarr")) return "agregarr";
  if (l.includes("wizarr")) return "wizarr";
  if (l.includes("audiobookshelf")) return "audiobookshelf";
  if (l.includes("nzbhydra") || l.includes("hydra")) return "nzbhydra";
  if (l.includes("prowlarr") || l.includes("lidarr") || l.includes("readarr")) return "arr-v1";
  if (l.includes("sonarr") || l.includes("radarr") || l.includes("whisparr")) return "arr";
  if (l.includes("tautulli")) return "tautulli";
  if (l.includes("prometheus")) return "prometheus";
  if (l.includes("gatus")) return "gatus";
  if (l.includes("beszel")) return "beszel";
  if (l.includes("unraid")) return "unraid";
  if (l.includes("plex")) return "plex";
  return null;
}

/** Strip a leading "v"/"V" so stored versions are bare (the UI prepends its own "v"). */
function normalizeVersion(v: string | undefined | null): string | null {
  if (!v) return null;
  const s = v.trim().replace(/^v/i, "");
  // dev builds: "develop-{fullSHA}" → "develop-{7chars}"
  const dev = s.match(/^(develop-[0-9a-f]{7})[0-9a-f]*/i);
  return (dev ? dev[1] : s) || null;
}

async function fetchServiceVersion(base: string, apiKey: string, kind: ServiceKind, insecureTls = false): Promise<string | null> {
  const b = base.replace(/\/$/, "");
  // Inject the service's TLS preference into every probe below without touching each call site:
  // this local binding shadows the imported fetchJson for the rest of this function only, so a
  // self-signed LAN host (e.g. Unraid) is reachable when its "allow self-signed TLS" toggle is on.
  const fetchJson = <T,>(url: string, opts: HttpOpts): Promise<T> => fetchJsonRaw<T>(url, { ...opts, insecureTls });
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
  if (kind === "arr" || kind === "arr-v1") {
    const apiVer = kind === "arr-v1" ? "v1" : "v3";
    const d = await fetchJson<{ version?: string }>(`${b}/api/${apiVer}/system/status`, {
      service: "version-detect",
      headers: apiKey ? { "X-Api-Key": apiKey } : {},
    });
    return normalizeVersion(d.version);
  }
  if (kind === "bazarr") {
    // Bazarr has its own (non-*arr) API; auth via ?apikey= like Tautulli.
    const d = await fetchJson<{ data?: { bazarr_version?: string } }>(
      `${b}/api/system/status?apikey=${encodeURIComponent(apiKey)}`,
      { service: "version-detect" },
    );
    return normalizeVersion(d.data?.bazarr_version);
  }
  if (kind === "agregarr") {
    // Public status endpoint (no auth) exposes the version.
    const d = await fetchJson<{ version?: string }>(`${b}/api/v1/status`, {
      service: "version-detect",
    });
    return normalizeVersion(d.version);
  }
  if (kind === "wizarr") {
    // The auto-generated swagger spec's info.version holds the app version.
    // /api/swagger.json is accessible without auth (or with the API key).
    const d = await fetchJson<{ info?: { version?: string } }>(`${b}/api/swagger.json`, {
      service: "version-detect",
      headers: apiKey ? { "X-API-Key": apiKey } : {},
    });
    return normalizeVersion(d.info?.version) ?? "";
  }
  if (kind === "audiobookshelf") {
    // Validate the token against an authenticated endpoint so a bad key fails the
    // connection test, then read the public /status endpoint for the server version.
    await fetchJson<unknown>(`${b}/api/libraries`, {
      service: "version-detect",
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    });
    const d = await fetchJson<{ serverVersion?: string }>(`${b}/status`, {
      service: "version-detect",
    });
    return normalizeVersion(d.serverVersion) ?? "";
  }
  if (kind === "nzbhydra") {
    // Spring Boot actuator /info is empty in the default LSIO package; use the internal
    // updates API which exposes currentVersion as plain JSON.
    const d = await fetchJson<{ currentVersion?: string }>(
      `${b}/internalapi/updates/infos?apikey=${encodeURIComponent(apiKey)}`,
      { service: "version-detect" },
    );
    return normalizeVersion(d.currentVersion) ?? "";
  }
  if (kind === "tautulli") {
    const d = await fetchJson<{ response?: { data?: { tautulli_version?: string } } }>(
      `${b}/api/v2?apikey=${encodeURIComponent(apiKey)}&cmd=get_tautulli_info`,
      { service: "version-detect" },
    );
    return normalizeVersion(d.response?.data?.tautulli_version);
  }
  if (kind === "gatus") {
    // Gatus exposes no version endpoint; hit the status endpoint to verify connectivity.
    await fetchJson<unknown>(`${b}/api/v1/endpoints/statuses`, {
      service: "version-detect",
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    });
    return "";
  }
  if (kind === "beszel") {
    // Authenticate via PocketBase superuser and verify the connection; no version endpoint.
    await beszelGet<unknown>(b, apiKey, "/api/health");
    return "";
  }
  if (kind === "unraid") {
    // Unraid 7.x GraphQL API: POST /graphql with an `x-api-key` header. The version lives at
    // info.versions.core.unraid (7.2+ integrated API); the older Connect plugin exposed it
    // flat at info.versions.unraid, so we fall back to that when the nested query yields nothing.
    // GraphQL surfaces field/auth errors as HTTP 400 (→ fetchJson throws → caught → null) or as
    // 200 with null data, so a bad key / wrong schema degrades to null rather than a wrong value.
    const ask = (query: string) =>
      fetchJson<{ data?: { info?: { versions?: { core?: { unraid?: string }; unraid?: string } } } }>(`${b}/graphql`, {
        service: "version-detect",
        method: "POST",
        headers: { "Content-Type": "application/json", ...(apiKey ? { "x-api-key": apiKey } : {}) },
        body: { query },
      }).catch(() => null);
    const nested = await ask("{ info { versions { core { unraid } } } }");
    const v = nested?.data?.info?.versions?.core?.unraid
      ?? (await ask("{ info { versions { unraid } } }"))?.data?.info?.versions?.unraid;
    return normalizeVersion(v);
  }
  if (kind === "plex") {
    // /identity is unauthenticated and returns the server version as JSON (Accept: application/json
    // is already set by fetchJson). Pass the token if available for future-proofing.
    const d = await fetchJson<{ MediaContainer?: { version?: string } }>(`${b}/identity`, {
      service: "version-detect",
      headers: apiKey ? { "X-Plex-Token": apiKey } : {},
    });
    return normalizeVersion(d.MediaContainer?.version) ?? "";
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
    return await fetchServiceVersion(c.baseUrl, c.apiKey ?? "", kind, c.insecureTls);
  } catch {
    return null;
  }
}

/** Probe a version endpoint with explicit (transient) credentials — no DB access. */
export async function probeVersion(baseUrl: string, apiKey: string, idHint: string, insecureTls = false): Promise<string | null> {
  try {
    const kind = serviceKind(idHint);
    if (!kind) return null;
    return await fetchServiceVersion(baseUrl, apiKey, kind, insecureTls);
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
  load5: number | null;
  load15: number | null;
  uptimeSec: number | null;
  swapUsedBytes: number | null;
  swapTotalBytes: number | null;
  /** per-mount filesystem usage (largest first, capped) */
  filesystems: { mount: string; usedBytes: number; totalBytes: number }[];
}

async function prometheusFilesystems(diskFilter: string): Promise<{ mount: string; usedBytes: number; totalBytes: number }[]> {
  const [sizes, avails] = await Promise.all([
    prometheusQueryAll(`node_filesystem_size_bytes${diskFilter}`),
    prometheusQueryAll(`node_filesystem_avail_bytes${diskFilter}`),
  ]);
  const availByMount = new Map<string, number>();
  for (const a of avails) {
    const m = a.metric.mountpoint;
    if (m) availByMount.set(m, a.value);
  }
  const seen = new Set<string>();
  const out: { mount: string; usedBytes: number; totalBytes: number }[] = [];
  for (const s of sizes) {
    const m = s.metric.mountpoint;
    if (!m || seen.has(m) || !(s.value > 0)) continue;
    seen.add(m);
    out.push({ mount: m, usedBytes: s.value - (availByMount.get(m) ?? 0), totalBytes: s.value });
  }
  return out.sort((a, b) => b.totalBytes - a.totalBytes).slice(0, 8);
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

  const [cpuHistory, memHistory, memTotal, netHistory, netInHistory, diskHistory, diskTotal, sysLoadHistory, load5, load15, uptimeSec, swapTotal, swapFree, filesystems] = await Promise.all([
    safe(() => prometheusRange(`100 - (avg(rate(node_cpu_seconds_total{mode="idle"${iq}}[5m])) * 100)`), Array<number>(40).fill(0)),
    safe(() => prometheusRange(`node_memory_MemTotal_bytes${isq} - node_memory_MemAvailable_bytes${isq}`), Array<number>(40).fill(0)),
    safe(() => prometheusQuery(`node_memory_MemTotal_bytes${isq}`), null),
    safe(() => prometheusRange(`sum(rate(node_network_transmit_bytes_total{device!~"lo|veth.*|docker.*|br.*"${iq}}[5m])) * 8`), Array<number>(40).fill(0)),
    safe(() => prometheusRange(`sum(rate(node_network_receive_bytes_total{device!~"lo|veth.*|docker.*|br.*"${iq}}[5m])) * 8`), Array<number>(40).fill(0)),
    safe(() => prometheusRange(`sum(max by(instance, device) (node_filesystem_size_bytes${diskFilter} - node_filesystem_avail_bytes${diskFilter}))`), Array<number>(40).fill(0)),
    safe(() => prometheusQuery(`sum(max by(instance, device) (node_filesystem_size_bytes${diskFilter}))`), null),
    safe(() => prometheusRange(`node_load1${isq}`), Array<number>(40).fill(0)),
    safe(() => prometheusQuery(`node_load5${isq}`), null),
    safe(() => prometheusQuery(`node_load15${isq}`), null),
    safe(() => prometheusQuery(`node_time_seconds${isq} - node_boot_time_seconds${isq}`), null),
    safe(() => prometheusQuery(`node_memory_SwapTotal_bytes${isq}`), null),
    safe(() => prometheusQuery(`node_memory_SwapFree_bytes${isq}`), null),
    safe(() => prometheusFilesystems(diskFilter), [] as { mount: string; usedBytes: number; totalBytes: number }[]),
  ]);

  const last = (h: number[]) => (h.length ? h[h.length - 1] : null);
  const finite = (v: number | null) => (v != null && isFinite(v) ? v : null);
  const swapUsedBytes = swapTotal != null && swapFree != null ? swapTotal - swapFree : null;

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
    load5: finite(load5),
    load15: finite(load15),
    uptimeSec: finite(uptimeSec),
    swapUsedBytes: finite(swapUsedBytes),
    swapTotalBytes: finite(swapTotal),
    filesystems,
  };
}

// ── Beszel — host metrics (PocketBase) ─────────────────────
// Beszel's hub is PocketBase. The `systems`/`system_stats` collections are locked
// to superusers in the base schema and relaxed at runtime to authenticated-and-member,
// so we authenticate as a SUPERUSER to read every system without per-system sharing
// (matches the Homepage Beszel-widget v2 convention). The stored apiKey secret holds
// "email:password" (split on the first ":"). The token is JWT and expires, so it's
// cached in-process (keyed by baseUrl) and re-fetched on a 401.
const BESZEL_GIB = 1073741824; // bytes per GiB — Beszel reports mem/disk/swap in GiB

interface BeszelToken { token: string; expMs: number; }
const beszelTokenCache = new Map<string, BeszelToken>();
const beszelAuthInflight = new Map<string, Promise<string>>();

function splitBeszelCreds(apiKey: string): { identity: string; password: string } {
  const i = apiKey.indexOf(":");
  if (i < 0) throw new IntegrationError("beszel", "apiKey must be 'email:password'");
  return { identity: apiKey.slice(0, i), password: apiKey.slice(i + 1) };
}

/** Decode a JWT's `exp` claim (no signature check) → epoch ms; fall back to +30min. */
function beszelTokenExpMs(token: string): number {
  try {
    const payload = token.split(".")[1];
    if (payload) {
      const json = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { exp?: number };
      if (typeof json.exp === "number") return json.exp * 1000;
    }
  } catch {
    /* unparsable — use the conservative fallback below */
  }
  return Date.now() + 30 * 60_000;
}

/** Authenticate as a Beszel superuser, caching the token until ~30s before expiry. */
async function beszelAuth(base: string, apiKey: string, force = false): Promise<string> {
  if (!force) {
    const hit = beszelTokenCache.get(base);
    if (hit && Date.now() < hit.expMs - 30_000) return hit.token;
    const inflight = beszelAuthInflight.get(base);
    if (inflight) return inflight;
  }
  const { identity, password } = splitBeszelCreds(apiKey);
  const p = (async () => {
    const data = await fetchJson<{ token?: string }>(
      `${base}/api/collections/_superusers/auth-with-password`,
      { service: "beszel", method: "POST", headers: { "Content-Type": "application/json" }, body: { identity, password } },
    );
    if (!data.token) throw new IntegrationError("beszel", "auth returned no token");
    beszelTokenCache.set(base, { token: data.token, expMs: beszelTokenExpMs(data.token) });
    return data.token;
  })();
  beszelAuthInflight.set(base, p);
  try {
    return await p;
  } finally {
    beszelAuthInflight.delete(base);
  }
}

/** Authenticated GET against the Beszel PocketBase API, with one re-auth retry on 401. */
async function beszelGet<T>(base: string, apiKey: string, path: string): Promise<T> {
  const token = await beszelAuth(base, apiKey);
  try {
    return await fetchJson<T>(`${base}${path}`, { service: "beszel", headers: { Authorization: token } });
  } catch (e) {
    if (e instanceof IntegrationError && e.status === 401) {
      const fresh = await beszelAuth(base, apiKey, true);
      return await fetchJson<T>(`${base}${path}`, { service: "beszel", headers: { Authorization: fresh } });
    }
    throw e;
  }
}

interface BeszelListResponse<T> { items: T[]; }
interface BeszelSystemRecord { id: string; name: string; status: string; info?: { u?: number }; }
interface BeszelStats {
  cpu?: number;
  m?: number; mu?: number;            // memory total / used (GiB)
  s?: number; su?: number;            // swap total / used (GiB)
  d?: number; du?: number;            // disk total / used (GiB)
  ns?: number; nr?: number;           // legacy network sent / recv (MiB/s)
  b?: [number, number];               // network [sent, recv] (bytes/s)
  la?: [number, number, number];      // load average [1m, 5m, 15m]
  efs?: Record<string, { d?: number; du?: number }>; // extra filesystems (GiB)
}
interface BeszelStatRecord { created: string; stats: BeszelStats; }

/** List Beszel-monitored systems (for the system picker). Cached ~30s. */
export async function beszelSystems(): Promise<{ id: string; name: string; status: string }[]> {
  const { baseUrl, apiKey } = await creds("beszel");
  return cached("beszel:systems", 30_000, async () => {
    const data = await beszelGet<BeszelListResponse<{ id: string; name: string; status: string }>>(
      baseUrl, apiKey, `/api/collections/systems/records?perPage=100&sort=name&fields=id,name,status`,
    );
    return (data.items ?? []).map((r) => ({ id: r.id, name: r.name, status: r.status }));
  });
}

/** Beszel host metrics for the selected system, normalized into NodeMetrics (live; not cached). */
export async function beszelMetrics(): Promise<NodeMetrics> {
  const { baseUrl, apiKey } = await creds("beszel");
  const stored = await getDeploymentSetting("beszelSystem");
  let systemId = stored && stored.trim() ? stored.trim() : null;
  if (!systemId) {
    const systems = await beszelSystems();
    if (systems.length === 0) throw new IntegrationError("beszel", "no systems");
    systemId = systems[0].id;
  }

  // Systems record → name (instance), uptime (info.u), status. Fall back to the
  // first system if the persisted id was deleted (404).
  const recordPath = (id: string) => `/api/collections/systems/records/${id}?fields=id,name,status,info`;
  let record: BeszelSystemRecord;
  try {
    record = await beszelGet<BeszelSystemRecord>(baseUrl, apiKey, recordPath(systemId));
  } catch (e) {
    if (e instanceof IntegrationError && e.status === 404) {
      const systems = await beszelSystems();
      if (systems.length === 0) throw new IntegrationError("beszel", "no systems");
      systemId = systems[0].id;
      record = await beszelGet<BeszelSystemRecord>(baseUrl, apiKey, recordPath(systemId));
    } else {
      throw e;
    }
  }

  // Recent 1m stats, newest first → reverse to oldest→newest for the history sparklines.
  const filter = encodeURIComponent(`system='${systemId}' && type='1m'`);
  const statsResp = await beszelGet<BeszelListResponse<BeszelStatRecord>>(
    baseUrl, apiKey, `/api/collections/system_stats/records?filter=${filter}&sort=-created&perPage=40&fields=created,stats`,
  );
  const points = (statsResp.items ?? []).map((r) => r.stats).reverse();
  const latest: BeszelStats | undefined = points[points.length - 1];

  // Network: prefer b[] (bytes/s) → bits/s ×8; fall back to legacy ns/nr (MiB/s) → bits/s.
  const netOut = (s: BeszelStats): number | undefined =>
    s.b && (s.b[0] || s.b[1]) ? s.b[0] * 8 : s.ns != null ? s.ns * 1048576 * 8 : undefined;
  const netIn = (s: BeszelStats): number | undefined =>
    s.b && (s.b[0] || s.b[1]) ? s.b[1] * 8 : s.nr != null ? s.nr * 1048576 * 8 : undefined;

  // Front-pad each series to 40 points (mirror prometheusRange).
  const series = (sel: (s: BeszelStats) => number | undefined): number[] => {
    const arr = points.map((s) => { const v = sel(s); return typeof v === "number" && isFinite(v) ? v : 0; });
    if (arr.length === 0) return new Array<number>(40).fill(0);
    return arr.length >= 40 ? arr.slice(-40) : [...new Array<number>(40 - arr.length).fill(arr[0]), ...arr];
  };
  const gib = (v: number | undefined): number | null => (v != null && isFinite(v) ? v * BESZEL_GIB : null);
  const finite = (v: number | null | undefined): number | null => (v != null && isFinite(v) ? v : null);

  // Filesystems: synthesized root + each efs mount (GiB → bytes), largest first, capped 8.
  const filesystems: { mount: string; usedBytes: number; totalBytes: number }[] = [];
  if (latest?.d != null) filesystems.push({ mount: "/", usedBytes: (latest.du ?? 0) * BESZEL_GIB, totalBytes: latest.d * BESZEL_GIB });
  for (const [mount, fs] of Object.entries(latest?.efs ?? {})) {
    if (fs?.d != null) filesystems.push({ mount, usedBytes: (fs.du ?? 0) * BESZEL_GIB, totalBytes: fs.d * BESZEL_GIB });
  }
  filesystems.sort((a, b) => b.totalBytes - a.totalBytes);

  return {
    instance: record.name,
    cpuPct: finite(latest?.cpu),
    cpuHistory: series((s) => s.cpu),
    memUsedBytes: gib(latest?.mu),
    memTotalBytes: gib(latest?.m),
    memHistory: series((s) => (s.mu != null ? s.mu * BESZEL_GIB : undefined)),
    netOutBps: finite(latest ? netOut(latest) : null),
    netHistory: series((s) => netOut(s)),
    netInBps: finite(latest ? netIn(latest) : null),
    netInHistory: series((s) => netIn(s)),
    diskUsedBytes: gib(latest?.du),
    diskTotalBytes: gib(latest?.d),
    diskHistory: series((s) => (s.du != null ? s.du * BESZEL_GIB : undefined)),
    sysLoad: finite(latest?.la?.[0]),
    sysLoadHistory: series((s) => s.la?.[0]),
    load5: finite(latest?.la?.[1]),
    load15: finite(latest?.la?.[2]),
    uptimeSec: finite(record.info?.u),
    swapUsedBytes: gib(latest?.su),
    swapTotalBytes: gib(latest?.s),
    filesystems: filesystems.slice(0, 8),
  };
}
