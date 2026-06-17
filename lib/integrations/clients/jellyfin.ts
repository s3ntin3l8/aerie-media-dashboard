// ============================================================
// AERIE — Jellyfin upstream client (server-only)
// Now-playing sessions, library counts, recently added.
// ============================================================
import "server-only";
import { serviceClient } from "../serviceClient";
import { cached } from "./cache";
import { n, fmt, cleanLayout } from "./ui-helpers";
import type { MediaKind, NowPlaying, LibraryStat, RecentItem } from "@/lib/types";

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
  const { baseUrl, apiKey, json: afetchJson } = await serviceClient("jellyfin");
  const data = await afetchJson<JellyfinSession[]>(`${baseUrl}/Sessions`, {
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

// ── Jellyfin — library counts (cached) ─────────────────────
export async function jellyfinLibraries(): Promise<LibraryStat[]> {
  return cached("jellyfin:libraries", 10 * 60 * 1000, async () => {
    const { baseUrl, apiKey, json: afetchJson } = await serviceClient("jellyfin");
    const d = await afetchJson<{ MovieCount?: number; SeriesCount?: number; EpisodeCount?: number; AlbumCount?: number; SongCount?: number }>(
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
    const { baseUrl, apiKey, json: afetchJson } = await serviceClient("jellyfin");
    const data = await afetchJson<{ Items?: JellyfinItem[] }>(
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