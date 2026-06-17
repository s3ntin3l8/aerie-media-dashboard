// ============================================================
// AERIE — Audiobookshelf upstream client (server-only)
// Now-playing sessions from ABS /api/users/online.
// ============================================================
import "server-only";
import { serviceClient } from "../serviceClient";
import type { NowPlaying } from "@/lib/types";

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
  const { baseUrl, apiKey, json: afetchJson } = await serviceClient("audiobookshelf");
  const data = await afetchJson<{ usersOnline?: AbsOnlineUser[] }>(`${baseUrl}/api/users/online`, {
    service: "audiobookshelf",
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  return (data.usersOnline ?? []).filter((u) => u.session).map((u) => mapAbsSession(u));
}