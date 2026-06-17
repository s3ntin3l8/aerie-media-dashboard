// ============================================================
// AERIE — Loki upstream client (server-only)
// Read-only per-service log tail (admin-only debug viewer).
// On-demand only: fetched when an admin opens a service's logs (never on the snapshot
// poll). Resolves the active Loki source by logo (multi-instance capable, like Traefik),
// runs a LogQL selector against query_range, and normalizes the streams into LokiLine[].
// ============================================================
import "server-only";
import { IntegrationError } from "../http";
import { serviceClient } from "../serviceClient";
import { getServiceConfigsByLogo } from "../registry";
import type { LokiLine } from "@/lib/types";

interface LokiStream { stream?: Record<string, string>; values?: [string, string][] }
interface LokiQueryRangeResponse { data?: { result?: LokiStream[] } }

/** Best-effort severity from a raw log line (common across container log formats). */
function lokiLevel(line: string): LokiLine["level"] | undefined {
  if (/\b(error|err|fatal|panic|exception|critical)\b/i.test(line)) return "error";
  if (/\bwarn(ing)?\b/i.test(line)) return "warn";
  if (/\bdebug\b/i.test(line)) return "debug";
  if (/\binfo(rmation)?\b/i.test(line)) return "info";
  return undefined;
}

/** The LogQL selector for a service: its explicit `lokiQuery`, else the inferred default. */
export function lokiSelectorFor(service: { id: string; lokiQuery?: string | null }): string {
  return service.lokiQuery?.trim() || `{container="${service.id}"}`;
}

/** The first active Loki source's config (by logo slug "loki"), or null when none. */
async function activeLokiConfig() {
  const cfgs = (await getServiceConfigsByLogo("loki")).filter((c) => c.active);
  return cfgs[0] ?? null;
}

/**
 * Fetch the most-recent log lines matching a LogQL selector from the active Loki source.
 * Read-only (`query_range`, direction=backward). Throws when no Loki is configured; the
 * route handler catches and returns an empty list.
 */
export async function lokiTail(selector: string, opts: { limit?: number; sinceMs?: number } = {}): Promise<LokiLine[]> {
  const cfg = await activeLokiConfig();
  if (!cfg) throw new IntegrationError("loki", "not configured");
  const svc = await serviceClient(cfg.id, { requireKey: false });
  const base = svc.baseUrl;
  const limit = Math.min(Math.max(1, Math.floor(opts.limit ?? 100)), 500);
  const sinceMs = Math.max(60_000, Math.floor(opts.sinceMs ?? 60 * 60_000));
  const nowMs = Date.now();
  // Loki wants nanosecond timestamps; ms × 1e6 == append six zeros.
  const startNs = `${nowMs - sinceMs}000000`;
  const endNs = `${nowMs}000000`;
  const url = `${base}/loki/api/v1/query_range?query=${encodeURIComponent(selector)}&limit=${limit}&start=${startNs}&end=${endNs}&direction=backward`;

  // Auth (optional): a stored secret containing ":" → HTTP Basic (user:password); else Bearer token.
  const headers: Record<string, string> = {};
  if (svc.apiKey) {
    headers.Authorization = svc.apiKey.includes(":")
      ? `Basic ${Buffer.from(svc.apiKey).toString("base64")}`
      : `Bearer ${svc.apiKey}`;
  }

  const res = await svc.json<LokiQueryRangeResponse>(url, { service: "loki", headers });
  const lines: LokiLine[] = [];
  for (const stream of res.data?.result ?? []) {
    const labels = stream.stream ?? {};
    for (const [tsNs, line] of stream.values ?? []) {
      lines.push({ tsNs, ts: new Date(Number(tsNs.slice(0, -6))).toISOString(), line, level: lokiLevel(line), labels });
    }
  }
  // Newest-first across all streams (query_range returns per-stream ascending).
  lines.sort((a, b) => (a.tsNs < b.tsNs ? 1 : a.tsNs > b.tsNs ? -1 : 0));
  return lines.slice(0, limit);
}