// ============================================================
// AERIE — Download client integrations (server-only)
// NZBGet (JSON-RPC) and qBittorrent (WebUI v2 cookie-session).
// ============================================================
import "server-only";
import { IntegrationError } from "../http";
import { serviceClient, type ServiceClient } from "../serviceClient";
import { createAuthCache } from "../tokenCache";
import { fmtPercent } from "@/lib/format";
import { fmtEtaSeconds } from "./ui-helpers";
import type { QueueItem, NzbgetStatus, QbittorrentStats } from "@/lib/types";

// ── NZBGet — JSON-RPC download client ──────────────────────
// NZBGet has no API key: it authenticates with HTTP Basic auth
// (ControlUsername/ControlPassword), so the stored secret holds
// "username:password" (same convention as Beszel's email:password).
async function nzbgetRpc<T>(method: string): Promise<T> {
  const { baseUrl, apiKey, json: afetchJson } = await serviceClient("nzbget", { requireKey: false });
  // apiKey is null when NZBGet auth is disabled — omit the Authorization header.
  const hdrs: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) hdrs.Authorization = `Basic ${Buffer.from(apiKey).toString("base64")}`;
  const res = await afetchJson<{ result: T }>(`${baseUrl}/jsonrpc`, {
    method: "POST",
    headers: hdrs,
    body: { method, params: [] },
  });
  return res.result;
}

interface NzbgetGroup {
  NZBName?: string;
  FileSizeMB?: number;
  RemainingSizeMB?: number;
  Status?: string;
}

export async function nzbgetQueue(): Promise<QueueItem[]> {
  const groups = await nzbgetRpc<NzbgetGroup[]>("listgroups");
  return (groups ?? []).map((g, i) => {
    // Per-item rate/ETA aren't exposed (DownloadRate is global — see nzbgetStatus),
    // so rows carry progress only; the panel header shows the server-wide rate.
    const pct = g.FileSizeMB && g.RemainingSizeMB != null ? fmtPercent(g.FileSizeMB - g.RemainingSizeMB, g.FileSizeMB) : 0;
    return { id: `nzbget-${i}`, title: g.NZBName || "(unnamed)", svc: "nzbget", pct, eta: "—", speed: "" };
  });
}

interface NzbgetStatusResponse {
  DownloadRate?: number; // bytes/sec
  RemainingSizeMB?: number;
  DownloadPaused?: boolean;
  ServerStandBy?: boolean;
  DownloadedSizeMB?: number;
  PostJobCount?: number;
  FreeDiskSpaceMB?: number;
  UpTimeSec?: number;
}

export async function nzbgetStatus(): Promise<NzbgetStatus> {
  const s = await nzbgetRpc<NzbgetStatusResponse>("status");
  return {
    downloadRate: s.DownloadRate ?? 0,
    remainingMB: s.RemainingSizeMB ?? 0,
    paused: s.DownloadPaused ?? false,
    standby: s.ServerStandBy ?? true,
    downloadedMB: s.DownloadedSizeMB ?? 0,
    postJobs: s.PostJobCount ?? 0,
    freeDiskMB: s.FreeDiskSpaceMB ?? 0,
    uptimeSec: s.UpTimeSec ?? 0,
  };
}

// ── qBittorrent — WebUI v2 cookie-session download client ──
// qBittorrent has no API key: it authenticates via a form-POST login that returns
// a session cookie (SID in <5.x, QBT_SID_<port> in ≥5.x). The stored secret holds
// "username:password" (same colon-pair convention as NZBGet/Beszel). All subsequent
// API calls send that cookie plus Referer/Origin to satisfy qBittorrent's CSRF guard.

export function splitQbitCreds(apiKey: string): { username: string; password: string } {
  const i = apiKey.indexOf(":");
  if (i < 0) throw new IntegrationError("qbittorrent", "apiKey must be 'username:password'");
  return { username: apiKey.slice(0, i), password: apiKey.slice(i + 1) };
}

// qBittorrent ≥5.x renamed the session cookie from "SID" to "QBT_SID_<port>" to support
// multiple instances. We cache the full "name=value" string so callers send it verbatim.
/** TTL = 30 min; re-auth on 403/401 covers server-side expiry before that. */
const QBIT_SID_TTL = 30 * 60_000;
const qbitSidCache = createAuthCache<{ cookie: string; at: number }>({
  fresh: (v) => Date.now() - v.at < QBIT_SID_TTL - 30_000,
});

/**
 * Obtain a valid qBittorrent session cookie string (e.g. "QBT_SID_8080=abc…"),
 * caching it until 30 s before expiry. Returns the full "name=value" pair.
 */
async function qbitAuth(svc: ServiceClient, force = false): Promise<string> {
  const base = svc.baseUrl;
  const { username, password } = splitQbitCreds(svc.apiKey ?? "");
  const { cookie } = await qbitSidCache.get(
    base,
    async () => {
      const res = await svc.raw(`${base}/api/v2/auth/login`, {
        service: "qbittorrent",
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Referer: base,
          Origin: base,
        },
        body: `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
      });
      if (res.status === 403) throw new IntegrationError("qbittorrent", "IP temporarily banned by qBittorrent (too many failed logins)", 403);
      const setCookie = res.headers.get("set-cookie") ?? "";
      // <5.x: "SID=…"; ≥5.x: "QBT_SID_<port>=…" — capture the full name=value pair.
      const cookieMatch = setCookie.match(/((?:QBT_SID_\w+|SID)=([^;]+))/);
      if (!cookieMatch) throw new IntegrationError("qbittorrent", "Login failed — invalid credentials");
      return { cookie: cookieMatch[1], at: Date.now() };
    },
    force,
  );
  return cookie;
}

/**
 * Authenticated JSON GET against qBittorrent, with one re-auth retry on 403/401
 * (expired SID). Sends Cookie + Referer + Origin on every request.
 */
async function qbitGet<T>(svc: ServiceClient, path: string): Promise<T> {
  const base = svc.baseUrl;
  const cookie = await qbitAuth(svc);
  try {
    return await svc.json<T>(`${base}${path}`, { service: "qbittorrent", headers: { Cookie: cookie, Referer: base, Origin: base } });
  } catch (e) {
    if (e instanceof IntegrationError && (e.status === 403 || e.status === 401)) {
      const fresh = await qbitAuth(svc, true);
      return await svc.json<T>(`${base}${path}`, {
        service: "qbittorrent",
        headers: { Cookie: fresh, Referer: base, Origin: base },
      });
    }
    throw e;
  }
}


interface QbitTorrentRecord {
  hash?: string;
  name?: string;
  progress?: number;   // 0–1
  eta?: number;        // seconds; 8640000 = no ETA / stalled
  dlspeed?: number;    // bytes/sec
  state?: string;      // "downloading" | "stalledDL" | "metaDL" | "uploading" | "stalledUP" | …
}

interface QbitTransferInfo {
  dl_info_speed?: number;   // bytes/sec
  up_info_speed?: number;   // bytes/sec
  dl_info_data?: number;    // bytes this session
  up_info_data?: number;    // bytes this session
  connection_status?: string; // "connected" | "firewalled" | "disconnected"
}

const QBIT_DOWNLOADING_STATES = new Set(["downloading", "stalledDL", "metaDL", "forcedDL", "queuedDL"]);
const QBIT_SEEDING_STATES = new Set(["uploading", "stalledUP", "forcedUP", "queuedUP"]);
/** ETA sentinel (qBittorrent uses 8640000 = 100 days for "no ETA / stalled"). */
const QBIT_ETA_SENTINEL = 8_640_000;

export async function qbittorrentQueue(): Promise<QueueItem[]> {
  const svc = await serviceClient("qbittorrent");
  const torrents = await qbitGet<QbitTorrentRecord[]>(svc, "/api/v2/torrents/info");
  return (torrents ?? []).map((t) => {
    const pct = fmtPercent(t.progress ?? 0, 1);
    const etaSec = t.eta ?? 0;
    return {
      id: `qbittorrent-${t.hash ?? Math.random()}`,
      title: t.name || "(unnamed)",
      svc: "qbittorrent",
      pct,
      eta: etaSec > 0 && etaSec < QBIT_ETA_SENTINEL ? fmtEtaSeconds(etaSec) : "—",
      speed: (t.dlspeed ?? 0) > 0 ? `${((t.dlspeed ?? 0) / 1_048_576).toFixed(1)} MB/s` : "",
    };
  });
}

export async function qbittorrentStats(): Promise<QbittorrentStats> {
  const svc = await serviceClient("qbittorrent");
  const [info, torrents] = await Promise.all([
    qbitGet<QbitTransferInfo>(svc, "/api/v2/transfer/info"),
    qbitGet<QbitTorrentRecord[]>(svc, "/api/v2/torrents/info"),
  ]);
  const list = torrents ?? [];
  return {
    dlSpeed: info.dl_info_speed ?? 0,
    upSpeed: info.up_info_speed ?? 0,
    downloaded: info.dl_info_data ?? 0,
    uploaded: info.up_info_data ?? 0,
    downloading: list.filter((t) => QBIT_DOWNLOADING_STATES.has(t.state ?? "")).length,
    seeding: list.filter((t) => QBIT_SEEDING_STATES.has(t.state ?? "")).length,
    torrents: list.length,
    connectionStatus: info.connection_status ?? "unknown",
  };
}