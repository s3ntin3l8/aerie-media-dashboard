// ============================================================
// AERIE — Traefik upstream client (server-only)
// Per-service route, forward-auth & TLS-cert expiry from Traefik API.
// Read-only: the routing rule → host (the join key to AERIE services), the router status,
// the middleware chain (→ "behind forward-auth"), backend health, and — best-effort from the
// /metrics endpoint — TLS cert expiry. Throws on the routers/services call; the facade catches.
// Also reads the traefik-dashboard-aggregator merged snapshot for multi-node setups.
// ============================================================
import "server-only";
import { IntegrationError } from "../http";
import { serviceClient, type ServiceClient } from "../serviceClient";
import { cached } from "./cache";
import { getServiceConfigs, getServiceConfigsByLogo } from "../registry";
import { isTraefikSource } from "@/lib/servicePresets";
import type { TraefikRoute, TraefikInstance } from "@/lib/types";

interface TraefikApiRouter {
  name: string;
  rule?: string;
  service?: string;
  provider?: string;
  status?: string;
  middlewares?: string[];
  tls?: unknown; // presence indicates TLS termination; shape unused
}
interface TraefikApiService {
  name: string;
  serverStatus?: Record<string, string>; // server URL → "UP" | "DOWN"
}

/** Extract hostnames from a Traefik routing rule. Handles Host(`a`,`b`), HostSNI/HostRegexp,
 *  and `||`/`,`-joined unions. Best-effort: HostRegexp patterns are returned verbatim (matched
 *  exactly later). */
export function hostsFromRule(rule: string): string[] {
  const hosts: string[] = [];
  const callRe = /Host(?:SNI|Regexp)?\s*\(([^)]*)\)/gi;
  let m: RegExpExecArray | null;
  while ((m = callRe.exec(rule)) !== null) {
    const argRe = /`([^`]+)`/g;
    let a: RegExpExecArray | null;
    while ((a = argRe.exec(m[1])) !== null) hosts.push(a[1].toLowerCase());
  }
  return [...new Set(hosts)];
}

/** Parse `traefik_tls_certs_not_after` gauge lines out of Traefik's Prometheus /metrics text.
 *  Each carries cn/sans (the cert domains) and a value = expiry unix seconds. */
export function parseCertMetric(text: string): { domains: string[]; notAfter: number }[] {
  const out: { domains: string[]; notAfter: number }[] = [];
  const lineRe = /^traefik_tls_certs_not_after\{([^}]*)\}\s+([0-9.eE+-]+)\s*$/gm;
  let m: RegExpExecArray | null;
  while ((m = lineRe.exec(text)) !== null) {
    const notAfter = Math.round(parseFloat(m[2]));
    if (!Number.isFinite(notAfter) || notAfter <= 0) continue;
    const labels = m[1];
    const domains: string[] = [];
    const cn = /cn="([^"]*)"/.exec(labels)?.[1];
    const sans = /sans="([^"]*)"/.exec(labels)?.[1];
    if (cn) domains.push(cn.toLowerCase());
    if (sans) for (const s of sans.split(",")) { const t = s.trim().toLowerCase(); if (t) domains.push(t); }
    if (domains.length) out.push({ domains: [...new Set(domains)], notAfter });
  }
  return out;
}

// The cert list carries optional richer fields (issuer/resolver/keyType/notBefore) the aggregator
// path supplies; the raw /metrics path leaves them undefined and they're simply omitted.
type CertEntry = { domains: string[]; notAfter: number; issuer?: string; resolver?: string; keyType?: string; notBefore?: number };
function certForHost(host: string, certs: CertEntry[]): TraefikRoute["cert"] {
  const h = host.toLowerCase();
  const matches = certs.filter((c) =>
    c.domains.some((d) =>
      d === h ||
      // wildcard covers exactly one label: *.example.com matches a.example.com, not a.b.example.com
      (d.startsWith("*.") && h.endsWith(d.slice(1)) && h.split(".").length === d.split(".").length),
    ),
  );
  if (!matches.length) return undefined;
  const best = matches.reduce((a, b) => (b.notAfter < a.notAfter ? b : a));
  return {
    notAfter: best.notAfter,
    daysRemaining: Math.floor((best.notAfter * 1000 - Date.now()) / 86_400_000),
    domains: best.domains,
    ...(best.issuer ? { issuer: best.issuer } : {}),
    ...(best.resolver ? { resolver: best.resolver } : {}),
    ...(best.keyType ? { keyType: best.keyType } : {}),
    ...(best.notBefore ? { notBefore: best.notBefore } : {}),
  };
}

function aggServerStatus(serverStatus?: Record<string, string>): TraefikRoute["serverStatus"] {
  const vals = Object.values(serverStatus ?? {});
  if (!vals.length) return "unknown";
  const up = vals.filter((v) => v.toUpperCase() === "UP").length;
  return up === vals.length ? "up" : up === 0 ? "down" : "mixed";
}

function normRouterStatus(s?: string): TraefikRoute["status"] {
  return s === "enabled" || s === "disabled" || s === "warning" ? s : "unknown";
}

async function traefikRoutesUncached(svc: ServiceClient): Promise<TraefikRoute[]> {
  const base = svc.baseUrl;
  const headers: Record<string, string> = {};
  // Traefik's API auth, when present, is HTTP basicAuth → secret holds "user:password".
  // If this instance sits behind authentik forward-auth, the service client layers the outpost
  // credential on top (and its Authorization wins over this Basic).
  if (svc.apiKey && svc.apiKey.includes(":")) headers.Authorization = `Basic ${Buffer.from(svc.apiKey).toString("base64")}`;
  const [routers, services] = await Promise.all([
    svc.json<TraefikApiRouter[]>(`${base}/api/http/routers`, { service: "traefik", headers }),
    svc.json<TraefikApiService[]>(`${base}/api/http/services`, { service: "traefik", headers }),
  ]);

  // Cert expiry is best-effort: a missing/legacy /metrics endpoint must not fail the route read.
  let certs: { domains: string[]; notAfter: number }[] = [];
  try {
    const res = await svc.raw(`${base}/metrics`, { service: "traefik", headers });
    if (res.ok) certs = parseCertMetric(await res.text());
  } catch { /* metrics optional */ }

  const svcStatus = new Map<string, TraefikRoute["serverStatus"]>();
  for (const s of services ?? []) svcStatus.set(s.name, aggServerStatus(s.serverStatus));

  const routes: TraefikRoute[] = [];
  for (const r of routers ?? []) {
    const hosts = hostsFromRule(r.rule ?? "");
    if (!hosts.length) continue; // only host-routed routers correlate to a service
    const middlewares = r.middlewares ?? [];
    // router.service is sometimes bare ("sonarr") and sometimes name@provider ("sonarr@docker").
    const serverStatus = svcStatus.get(r.service ?? "") ?? svcStatus.get(`${r.service}@${r.provider}`) ?? "unknown";
    let cert: TraefikRoute["cert"];
    for (const h of hosts) { cert = certForHost(h, certs); if (cert) break; }
    routes.push({
      serviceId: "", // correlated to an AERIE service id in getSnapshot()
      router: r.name,
      rule: r.rule ?? "",
      hosts,
      status: normRouterStatus(r.status),
      tls: r.tls != null,
      forwardAuth: middlewares.some((mw) => /auth|forward|authentik/i.test(mw)),
      middlewares,
      serverStatus,
      cert,
    });
  }
  return routes;
}

// ── Traefik Dashboard Aggregator — same insight, one merged source ──
// github.com/s3ntin3l8/traefik-dashboard-aggregator polls every Traefik node and serves a single
// pre-merged snapshot at GET /api/snapshot. We map its httpRouters[] + certificates[] onto the
// same TraefikRoute[] the per-instance scraper produces, so snapshot.ts correlation is unchanged.
interface AggRouter {
  name: string;
  rule?: string;
  host?: string;
  serviceStatus?: string; // ok | degraded | down
  middlewares?: string[];
  tls?: boolean;
  status?: string; // enabled | warning | error | disabled
  instance?: string; // the Traefik node this router lives on
  authentik?: unknown; // present when an authentik forward-auth guards this router
}
interface AggCertificate {
  domain?: string;
  sans?: string[];
  resolver?: string;
  issuer?: string;
  issuerCN?: string;
  keyType?: string;
  notBefore?: number; // Unix MILLISECONDS
  notAfter?: number; // Unix MILLISECONDS (0 when absent); AERIE cert.notAfter is Unix seconds
}
interface AggMiddleware {
  name?: string; // short name, e.g. "authentik"
  fullName?: string; // provider-qualified, e.g. "authentik@docker"
  type?: string; // e.g. "forwardauth", "headers", "ratelimit"
  usedByRouters?: string[];
}
interface AggInstance {
  name: string;
  role?: string; // "gateway" | ""
  url?: string;
  status?: string; // ok | degraded | unreachable
  version?: string;
  lastScrape?: number; // Unix MILLISECONDS
  counts?: { routers?: number; services?: number; middlewares?: number; warnings?: number };
}
interface AggSnapshot {
  httpRouters?: AggRouter[];
  certificates?: AggCertificate[];
  middlewares?: AggMiddleware[];
  instances?: AggInstance[];
}

/** Map the aggregator's router status (enabled|warning|error|disabled) into AERIE's vocabulary,
 *  folding the aggregator-only "error" into "warning". */
function normAggStatus(s?: string): TraefikRoute["status"] {
  if (s === "error") return "warning";
  return normRouterStatus(s);
}

/** Map the aggregator's per-router serviceStatus (ok|degraded|down) into AERIE's serverStatus. */
function aggServiceStatus(s?: string): TraefikRoute["serverStatus"] {
  return s === "ok" ? "up" : s === "degraded" ? "mixed" : s === "down" ? "down" : "unknown";
}

/** Fetch + cache the aggregator's merged snapshot. Routes and node health both derive from this,
 *  so the concurrent snapshot-wave reads share one 30s-cached fetch (cached() coalesces inflight). */
async function aggregatorSnapshot(serviceId: string): Promise<AggSnapshot> {
  const svc = await serviceClient(serviceId, { requireKey: false });
  return cached(`traefik:agg:${serviceId}`, 30_000, () => {
    const headers: Record<string, string> = {};
    // The aggregator has no built-in auth; an optional basicAuth front uses "user:password".
    // When it sits behind authentik forward-auth, the service client layers the outpost
    // credential on top (its Authorization wins over this Basic).
    if (svc.apiKey && svc.apiKey.includes(":")) headers.Authorization = `Basic ${Buffer.from(svc.apiKey).toString("base64")}`;
    return svc.json<AggSnapshot>(`${svc.baseUrl}/api/snapshot`, { service: "traefik", headers });
  });
}

/** Map an aggregator snapshot's httpRouters[]+certificates[]+middlewares[] → TraefikRoute[], enriched
 *  with the serving node, per-middleware type, and richer cert detail (aggregator-only fields). */
function aggRoutes(snap: AggSnapshot): TraefikRoute[] {
  // Reshape certificates into the cert list certForHost expects, carrying richer detail (ms→s).
  const certs = (snap.certificates ?? []).flatMap((c) => {
    const ms = c.notAfter ?? 0;
    if (!ms) return []; // 0 = absent/unparseable upstream
    const domains = [c.domain, ...(c.sans ?? [])].filter((d): d is string => !!d).map((d) => d.toLowerCase());
    if (!domains.length) return [];
    return [{
      domains: [...new Set(domains)],
      notAfter: Math.round(ms / 1000),
      issuer: c.issuer || c.issuerCN || undefined,
      resolver: c.resolver || undefined,
      keyType: c.keyType || undefined,
      notBefore: c.notBefore ? Math.round(c.notBefore / 1000) : undefined,
    }];
  });

  // Resolve middleware name → type. The router chain references short names ("authentik") or
  // provider-qualified ones ("authentik@docker"); index both forms.
  const mwType = new Map<string, string>();
  for (const m of snap.middlewares ?? []) {
    if (!m.type) continue;
    if (m.name) mwType.set(m.name, m.type);
    if (m.fullName) mwType.set(m.fullName, m.type);
  }

  const routes: TraefikRoute[] = [];
  for (const r of snap.httpRouters ?? []) {
    // Prefer parsing the rule (handles multi-host unions); fall back to the aggregator's single host.
    const hosts = hostsFromRule(r.rule ?? "");
    if (!hosts.length && r.host) hosts.push(r.host.toLowerCase());
    if (!hosts.length) continue; // only host-routed routers correlate to a service
    const middlewares = r.middlewares ?? [];
    const middlewareDetail = middlewares.map((name) => ({ name, type: mwType.get(name) ?? "" })).filter((m) => m.type);
    let cert: TraefikRoute["cert"];
    for (const h of hosts) { cert = certForHost(h, certs); if (cert) break; }
    routes.push({
      serviceId: "", // correlated in getSnapshot()
      router: r.name,
      rule: r.rule ?? "",
      hosts,
      status: normAggStatus(r.status),
      tls: r.tls === true,
      // The aggregator already resolves authentik; fall back to the middleware-name heuristic.
      forwardAuth: r.authentik != null || middlewares.some((mw) => /auth|forward|authentik/i.test(mw)),
      middlewares,
      ...(middlewareDetail.length ? { middlewareDetail } : {}),
      ...(r.instance ? { instance: r.instance } : {}),
      serverStatus: aggServiceStatus(r.serviceStatus),
      cert,
    });
  }
  return routes;
}

/** Map an aggregator snapshot's instances[] → TraefikInstance[] (node health; lastScrape ms→s). */
function aggInstances(snap: AggSnapshot): TraefikInstance[] {
  return (snap.instances ?? []).map((i) => ({
    name: i.name,
    ...(i.role ? { role: i.role } : {}),
    status: i.status === "ok" || i.status === "degraded" || i.status === "unreachable" ? i.status : "unknown",
    ...(i.version ? { version: i.version } : {}),
    ...(i.lastScrape ? { lastScrape: Math.round(i.lastScrape / 1000) } : {}),
    ...(i.url ? { url: i.url } : {}),
    ...(i.counts ? { counts: {
      routers: i.counts.routers ?? 0,
      services: i.counts.services ?? 0,
      middlewares: i.counts.middlewares ?? 0,
      warnings: i.counts.warnings ?? 0,
    } } : {}),
  }));
}

/** Routes from one aggregator instance (its /api/snapshot), tagged with its source service id. */
export async function traefikRoutesFromAggregator(serviceId: string): Promise<TraefikRoute[]> {
  const routes = aggRoutes(await aggregatorSnapshot(serviceId));
  return routes.map((r) => ({ ...r, via: serviceId }));
}

/** A merged aggregator snapshot, distinguished from a raw Traefik (which has no /api/snapshot). */
function isAggregatorSnapshot(s: AggSnapshot): boolean {
  return Array.isArray(s.httpRouters) || Array.isArray(s.instances);
}

/** Active Traefik sources: any active service that reads as a Traefik (logo/id/name contains
 *  "traefik" — see isTraefikSource). The logo is cosmetic (dashboard-icons) and can't express
 *  "this is an aggregator" — "traefik-aggregator" isn't even a real icon — so the raw-vs-aggregator
 *  split is decided per-source by probing /api/snapshot (see traefikIsAggregator). */
async function activeTraefikConfigs() {
  const configs = await getServiceConfigs();
  return configs.filter((c) => c.active && isTraefikSource(c));
}

/** Auto-detect: a source is an aggregator iff GET /api/snapshot returns a valid merged snapshot.
 *  Cached per service id (60s) so a raw instance isn't re-probed on every 12s poll; a successful
 *  probe also warms aggregatorSnapshot()'s 30s cache, so the route fetch reuses it (one request). */
async function traefikIsAggregator(serviceId: string): Promise<boolean> {
  return cached(`traefik:kind:${serviceId}`, 60_000, async () => {
    try {
      return isAggregatorSnapshot(await aggregatorSnapshot(serviceId));
    } catch {
      return false; // 404/HTML/parse-fail → raw Traefik (or unreachable on that path)
    }
  });
}

/** Traefik node health, derived from whichever active sources turn out to be aggregators (the raw
 *  per-instance path has no node-health data, so it contributes nothing and this is [] when no
 *  aggregator is present). Degrades per-source like traefikRoutes(): a failing source drops only its
 *  own nodes. */
export async function traefikInstances(): Promise<TraefikInstance[]> {
  const sources = await activeTraefikConfigs();
  if (!sources.length) return [];
  const settled = await Promise.allSettled(
    sources.map(async (c) => ((await traefikIsAggregator(c.id)) ? aggInstances(await aggregatorSnapshot(c.id)) : [])),
  );
  return settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
}

/** Routes from a single Traefik instance, tagged with its source service id. */
export async function traefikRoutesFor(serviceId: string): Promise<TraefikRoute[]> {
  const svc = await serviceClient(serviceId, { requireKey: false });
  // Routers/certs change slowly; this feeds the 12s snapshot poll → cache to spare Traefik.
  const routes = await cached(`traefik:routes:${serviceId}`, 30_000, () => traefikRoutesUncached(svc));
  return routes.map((r) => ({ ...r, via: serviceId }));
}

/** Aggregate routes across every active Traefik source (logo/id/name contains "traefik").
 *  Each source is classified by probing /api/snapshot: an aggregator (one call already merges all
 *  nodes) reads via traefikRoutesFromAggregator, a raw Traefik via traefikRoutesFor. A single source
 *  failing only drops its own routes; only when EVERY source fails does this throw (so the facade
 *  degrades the panel). */
export async function traefikRoutes(): Promise<TraefikRoute[]> {
  const sources = await activeTraefikConfigs();
  if (!sources.length) throw new IntegrationError("traefik", "not configured");
  const settled = await Promise.allSettled(
    sources.map(async (c) =>
      (await traefikIsAggregator(c.id)) ? traefikRoutesFromAggregator(c.id) : traefikRoutesFor(c.id),
    ),
  );
  const ok = settled.filter((r): r is PromiseFulfilledResult<TraefikRoute[]> => r.status === "fulfilled");
  if (!ok.length) {
    const firstErr = settled.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
    throw firstErr?.reason ?? new IntegrationError("traefik", "no routes");
  }
  return ok.flatMap((r) => r.value);
}