// ============================================================
// AERIE — upstream integration clients (server-only)
// Each function fetches + normalizes one upstream. They throw on
// missing config / errors; the data facade catches and falls back
// to mock so a dead or unconfigured upstream only degrades its panel.
// ============================================================
import "server-only";
import { fetchJson, IntegrationError } from "./http";
import { getServiceCredentials } from "./registry";
import type { MediaKind, NowPlaying, MediaRequest, QueueItem, ServiceStatus } from "@/lib/types";

async function creds(serviceId: string): Promise<{ baseUrl: string; apiKey: string }> {
  const c = await getServiceCredentials(serviceId);
  if (!c || !c.apiKey) throw new IntegrationError(serviceId, "not configured (no API key)");
  return { baseUrl: c.baseUrl.replace(/\/$/, ""), apiKey: c.apiKey };
}

// ── Gatus — per-service health + heartbeat ─────────────────
export interface ServiceHealth {
  key: string; // matched to our service id where possible
  name: string;
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
    return { key: ep.name.toLowerCase(), name: ep.name, status, ms, uptime, beats };
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
      user: String(s.user_id ?? s.user),
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
  requestedBy?: { id: number; displayName?: string; email?: string };
  createdAt?: string;
  title?: string;
}

const OVERSEERR_STATUS: Record<number, MediaRequest["status"]> = { 1: "pending", 2: "approved", 3: "declined" };

export async function overseerrRequests(): Promise<MediaRequest[]> {
  const { baseUrl, apiKey } = await creds("overseerr");
  const data = await fetchJson<{ results: OverseerrRequest[] }>(`${baseUrl}/api/v1/request?take=50&sort=added`, {
    service: "overseerr",
    headers: { "X-Api-Key": apiKey },
  });
  return (data.results ?? []).map((r) => ({
    id: `os-${r.id}`,
    title: r.title || `Request ${r.id}`,
    kind: r.type === "tv" ? "series" : "movie",
    year: r.createdAt ? new Date(r.createdAt).getFullYear() : 0,
    user: String(r.requestedBy?.id ?? "unknown"),
    status: r.media?.status === 5 ? "available" : (OVERSEERR_STATUS[r.status] ?? "pending"),
    requested: r.createdAt ? new Date(r.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "",
    poster: String(r.media?.tmdbId ?? ""),
  }));
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
