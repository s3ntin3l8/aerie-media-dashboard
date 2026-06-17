// ============================================================
// AERIE — Tautulli upstream client (server-only)
// Plex now-playing + library counts, users, stream history, recently added, leaderboard.
// ============================================================
import "server-only";
import { serviceClient } from "../serviceClient";
import { cached } from "./cache";
import { tmdbFromGuids, n, fmt, cleanLayout } from "./ui-helpers";
import type { MediaKind, NowPlaying, StreamGeo, StreamHistoryItem, LibraryStat, RecentItem, TopStats } from "@/lib/types";

// ── Tautulli — per-service health + heartbeat ─────────────────

interface TautulliSession {
  session_key: string;
  full_title: string;
  title: string;
  media_type: string;
  year?: string;
  rating_key?: string | number;
  grandparent_rating_key?: string | number;
  guids?: string[];
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
    // Movie guids carry the movie's TMDB id; an episode's are the episode's, so for
    // series we resolve the show TMDB lazily from the grandparent rating key.
    tmdbId: kind === "series" ? undefined : tmdbFromGuids(s.guids),
    ratingKey: s.rating_key != null ? String(s.rating_key) : undefined,
    grandparentRatingKey: s.grandparent_rating_key != null ? String(s.grandparent_rating_key) : undefined,
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
      const { baseUrl, apiKey, json: afetchJson } = await serviceClient("tautulli");
      const r = await afetchJson<{ response: { result?: string; data?: { city?: string; region?: string; country?: string; code?: string; latitude?: number; longitude?: number } } }>(
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
  const { baseUrl, apiKey, json: afetchJson } = await serviceClient("tautulli");
  const data = await afetchJson<{ response: { data: { sessions: TautulliSession[]; total_bandwidth?: number | string; wan_bandwidth?: number | string } } }>(
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
    const { baseUrl, apiKey, json: afetchJson } = await serviceClient("tautulli");
    const data = await afetchJson<{ response: { data?: TautulliUser[] } }>(
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

export async function tautulliLibraries(): Promise<LibraryStat[]> {
  // Library counts change rarely → cache to avoid a fetch on every 3–12s poll.
  return cached("tautulli:libraries", 10 * 60 * 1000, async () => {
    const { baseUrl, apiKey, json: afetchJson } = await serviceClient("tautulli");
    const data = await afetchJson<{ response: { data: TautulliLibrary[] } }>(`${baseUrl}/api/v2?apikey=${apiKey}&cmd=get_libraries`, { service: "tautulli" });
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
    const { baseUrl, apiKey, json: afetchJson } = await serviceClient("tautulli");
    const sinceMs = Date.now() - 24 * 3600 * 1000;
    const afterDate = new Date(sinceMs).toISOString().slice(0, 10);
    const data = await afetchJson<{ response: { data: { recordsFiltered?: number; data?: { date?: number; started?: number }[] } } }>(
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
    const { baseUrl, apiKey, json: afetchJson } = await serviceClient("tautulli");
    const afterDate = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const data = await afetchJson<{ response: { data: { data?: TautulliHistoryRecord[] } } }>(
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
  rating_key?: string | number;
  grandparent_rating_key?: string | number;
  guids?: string[];
}

export async function tautulliRecentlyAdded(count = 6): Promise<RecentItem[]> {
  // Recently-added changes only when new media lands → short cache, not every poll.
  return cached(`tautulli:recent:${count}`, 3 * 60 * 1000, async () => {
    const { baseUrl, apiKey, json: afetchJson } = await serviceClient("tautulli");
    const data = await afetchJson<{ response: { data: { recently_added: TautulliRecent[] } } }>(
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
        // Movie guids carry the movie's TMDB id; for a recently-added episode the
        // grandparent rating key resolves the show TMDB lazily on click.
        tmdbId: kind === "series" ? undefined : tmdbFromGuids(it.guids),
        ratingKey: it.rating_key != null ? String(it.rating_key) : undefined,
        grandparentRatingKey: it.grandparent_rating_key != null ? String(it.grandparent_rating_key) : undefined,
      };
    });
  });
}

/** Resolve a show/movie TMDB id from a Plex rating key (via Tautulli get_metadata guids). */
export async function tautulliShowTmdb(ratingKey: number | string): Promise<number | undefined> {
  const { baseUrl, apiKey, json: afetchJson } = await serviceClient("tautulli");
  const data = await afetchJson<{ response?: { data?: { guids?: string[] } } }>(
    `${baseUrl}/api/v2?apikey=${apiKey}&cmd=get_metadata&rating_key=${ratingKey}`,
    { service: "tautulli", timeoutMs: 8000 },
  );
  return tmdbFromGuids(data.response?.data?.guids);
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
    const { baseUrl, apiKey, json: afetchJson } = await serviceClient("tautulli");
    const data = await afetchJson<{ response: { data: TautulliHomeStat[] } }>(
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