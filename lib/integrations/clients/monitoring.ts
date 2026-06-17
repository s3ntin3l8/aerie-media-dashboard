// ============================================================
// AERIE — Monitoring upstream clients (server-only)
// Prometheus generic queries + node_exporter metrics bundle,
// Beszel host metrics (PocketBase).
// ============================================================
import "server-only";
import { IntegrationError } from "../http";
import { serviceClient, type ServiceClient } from "../serviceClient";
import { createAuthCache } from "../tokenCache";
import { cached } from "./cache";
import { getDeploymentSetting } from "../registry";
import { jwtExpMs } from "../forwardAuth";
import { env } from "@/lib/env";

// ── Prometheus — generic instant query ─────────────────────
export async function prometheusQuery(query: string): Promise<number | null> {
  const { baseUrl: base, apiKey, json: afetchJson } = await serviceClient("prometheus", { requireKey: false });
  const data = await afetchJson<{ data: { result: { value: [number, string] }[] } }>(
    `${base}/api/v1/query?query=${encodeURIComponent(query)}`,
    { headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {} },
  );
  const v = data.data?.result?.[0]?.value?.[1];
  return v != null ? Number(v) : null;
}

// ── Prometheus — instant query returning every result (with labels) ──
export async function prometheusQueryAll(query: string): Promise<{ metric: Record<string, string>; value: number }[]> {
  const svc = await serviceClient("prometheus", { requireKey: false }).catch(() => null);
  if (!svc) return [];
  const { baseUrl: base, apiKey, json: afetchJson } = svc;
  const data = await afetchJson<{ data: { result: { metric: Record<string, string>; value: [number, string] }[] } }>(
    `${base}/api/v1/query?query=${encodeURIComponent(query)}`,
    { headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {} },
  );
  return (data.data?.result ?? []).map((r) => ({ metric: r.metric, value: Number(r.value[1]) }));
}

// ── Prometheus — range query (returns `points` floats) ─────
export async function prometheusRange(query: string, points = 40, stepSec = 60): Promise<number[]> {
  try {
    const { baseUrl: base, apiKey, json: afetchJson } = await serviceClient("prometheus", { requireKey: false });
    const now = Math.floor(Date.now() / 1000);
    const start = now - points * stepSec;
    const data = await afetchJson<{ data: { result: { values: [number, string][] }[] } }>(
      `${base}/api/v1/query_range?query=${encodeURIComponent(query)}&start=${start}&end=${now}&step=${stepSec}`,
      { headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {} },
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
  const { baseUrl: base, apiKey, json: afetchJson } = await serviceClient("prometheus", { requireKey: false });
  const data = await afetchJson<{ data: string[] }>(
    `${base}/api/v1/label/instance/values?match[]=node_uname_info`,
    { headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {} },
  );
  return data.data ?? [];
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

const beszelTokenCache = createAuthCache<{ token: string; expMs: number }>({
  fresh: (v) => Date.now() < v.expMs - 30_000,
});

export function splitBeszelCreds(apiKey: string): { identity: string; password: string } {
  const i = apiKey.indexOf(":");
  if (i < 0) throw new IntegrationError("beszel", "apiKey must be 'email:password'");
  return { identity: apiKey.slice(0, i), password: apiKey.slice(i + 1) };
}

/** Authenticate as a Beszel superuser, caching the token until ~30s before expiry. */
async function beszelAuth(svc: ServiceClient, force = false): Promise<string> {
  const { identity, password } = splitBeszelCreds(svc.apiKey ?? "");
  const { token } = await beszelTokenCache.get(
    svc.baseUrl,
    async () => {
      const data = await svc.json<{ token?: string }>(
        `${svc.baseUrl}/api/collections/_superusers/auth-with-password`,
        { service: "beszel", method: "POST", headers: { "Content-Type": "application/json" }, body: { identity, password } },
      );
      if (!data.token) throw new IntegrationError("beszel", "auth returned no token");
      return { token: data.token, expMs: jwtExpMs(data.token) };
    },
    force,
  );
  return token;
}

/** Authenticated GET against the Beszel PocketBase API, with one re-auth retry on 401. */
async function beszelGet<T>(svc: ServiceClient, path: string): Promise<T> {
  const token = await beszelAuth(svc);
  try {
    return await svc.json<T>(`${svc.baseUrl}${path}`, { service: "beszel", headers: { Authorization: token } });
  } catch (e) {
    if (e instanceof IntegrationError && e.status === 401) {
      const fresh = await beszelAuth(svc, true);
      return await svc.json<T>(`${svc.baseUrl}${path}`, { service: "beszel", headers: { Authorization: fresh } });
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
  const svc = await serviceClient("beszel");
  return cached("beszel:systems", 30_000, async () => {
    const data = await beszelGet<BeszelListResponse<{ id: string; name: string; status: string }>>(
      svc, `/api/collections/systems/records?perPage=100&sort=name&fields=id,name,status`,
    );
    return (data.items ?? []).map((r) => ({ id: r.id, name: r.name, status: r.status }));
  });
}

/** Beszel host metrics for the selected system, normalized into NodeMetrics (live; not cached). */
export async function beszelMetrics(): Promise<NodeMetrics> {
  const svc = await serviceClient("beszel");
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
    record = await beszelGet<BeszelSystemRecord>(svc, recordPath(systemId));
  } catch (e) {
    if (e instanceof IntegrationError && e.status === 404) {
      const systems = await beszelSystems();
      if (systems.length === 0) throw new IntegrationError("beszel", "no systems");
      systemId = systems[0].id;
      record = await beszelGet<BeszelSystemRecord>(svc, recordPath(systemId));
    } else {
      throw e;
    }
  }

  // Recent 1m stats, newest first → reverse to oldest→newest for the history sparklines.
  const filter = encodeURIComponent(`system='${systemId}' && type='1m'`);
  const statsResp = await beszelGet<BeszelListResponse<BeszelStatRecord>>(
    svc, `/api/collections/system_stats/records?filter=${filter}&sort=-created&perPage=40&fields=created,stats`,
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