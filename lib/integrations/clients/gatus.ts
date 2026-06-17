// ============================================================
// AERIE — Gatus upstream client (server-only)
// Per-service health + heartbeat from the Gatus /statuses API.
// ============================================================
import "server-only";
import { IntegrationError } from "../http";
import { serviceClient, type ServiceClient } from "../serviceClient";
import { cached } from "./cache";
import type { ServiceStatus } from "@/lib/types";

export interface ServiceHealth {
  key: string; // matched to our service id where possible
  name: string;
  group?: string;
  status: ServiceStatus;
  ms: number;
  uptime: number; // % over the last 30 days
  uptime24h?: number; // % over the last 24 hours
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

/** True 30-day uptime (%) for one Gatus endpoint, via the dedicated /uptimes/30d API.
 *  The /statuses `results` array only spans the last ~50 checks (Gatus's default page size),
 *  so it can't back a "30d" figure — this hits the endpoint that aggregates the full window.
 *  Returns null on any failure so the caller can fall back to the recent-window figure.
 *  Cached ~5 min: getSnapshot() polls every few seconds, but a 30-day uptime barely moves. */
async function gatusUptime30d(svc: ServiceClient, key: string): Promise<number | null> {
  return gatusUptimeWindow(svc, key, "30d", 5 * 60_000);
}

/** True 24-hour uptime (%) for one Gatus endpoint, via the dedicated /uptimes/24h API.
 *  Mirrors gatusUptime30d but on a shorter cache TTL (~2 min) since a 24h window moves faster. */
async function gatusUptime24h(svc: ServiceClient, key: string): Promise<number | null> {
  return gatusUptimeWindow(svc, key, "24h", 2 * 60_000);
}

/** Shared fetch for a Gatus /uptimes/{window} figure. The /statuses `results` array only spans the
 *  last ~50 checks (Gatus's default page size), so it can't back a windowed figure — this hits the
 *  endpoint that aggregates the full window. Returns null on any failure so callers can fall back. */
async function gatusUptimeWindow(svc: ServiceClient, key: string, window: "24h" | "30d", ttlMs: number): Promise<number | null> {
  return cached(`gatus:uptime${window}:${key}`, ttlMs, async () => {
    const res = await svc.raw(`${svc.baseUrl}/api/v1/endpoints/${encodeURIComponent(key)}/uptimes/${window}`, {
      headers: svc.apiKey ? { Authorization: `Bearer ${svc.apiKey}` } : {},
    });
    if (!res.ok) throw new IntegrationError("gatus", `HTTP ${res.status} for uptimes/${window}`, res.status);
    const raw = parseFloat((await res.text()).trim());
    if (!Number.isFinite(raw)) throw new IntegrationError("gatus", `non-numeric uptimes/${window} body`);
    // Gatus returns a ratio 0–1; ×100 → percent. Defensive: tolerate a future already-percent value.
    const pct = raw > 1 ? raw : raw * 100;
    return Math.max(0, Math.min(100, pct));
  }).catch(() => null);
}

export async function gatusHealth(): Promise<ServiceHealth[]> {
  const svc = await serviceClient("gatus", { requireKey: false });
  const data = await svc.json<GatusEndpoint[]>(`${svc.baseUrl}/api/v1/endpoints/statuses`, {
    headers: svc.apiKey ? { Authorization: `Bearer ${svc.apiKey}` } : {},
  });
  return Promise.all(data.map(async (ep) => {
    const results = ep.results ?? [];
    const last = results[results.length - 1];
    const beats = results.slice(-30).map((r) => (r.success ? 1 : 0));
    const msHistory = results.slice(-30).map((r) => Math.round(r.duration / 1e6));
    const okCount = results.filter((r) => r.success).length;
    // Recent-window uptime from the (short) results array — only a fallback now.
    const windowUptime = results.length ? (okCount / results.length) * 100 : 100;
    // Real 30-day + 24-hour uptime from the dedicated APIs (fetched in parallel); fall back to
    // the recent window for the 30d figure if unavailable. 24h is left undefined on failure.
    const [real, real24h] = ep.key
      ? await Promise.all([gatusUptime30d(svc, ep.key), gatusUptime24h(svc, ep.key)])
      : [null, null];
    const uptime = real ?? windowUptime;
    const uptime24h = real24h ?? undefined;
    const ms = last ? Math.round(last.duration / 1e6) : 0;
    const status: ServiceStatus = !last ? "up" : last.success ? "up" : "down";
    // Most recent failure in the window → "last incident" age. Undefined when all-clear.
    let lastIncidentAt: string | undefined;
    for (let i = results.length - 1; i >= 0; i--) {
      if (!results[i].success) { lastIncidentAt = results[i].timestamp; break; }
    }
    return { key: ep.name.toLowerCase(), name: ep.name, group: ep.group, status, ms, uptime, uptime24h, beats, msHistory, lastIncidentAt };
  }));
}
