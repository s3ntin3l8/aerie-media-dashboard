// ============================================================
// AERIE — Service metadata clients (server-only)
// Wizarr, Prowlarr, Agregarr, Bazarr, NZBHydra2, LazyLibrarian, Listenarr.
// ============================================================
import "server-only";
import { IntegrationError } from "../http";
import { serviceClient, type ServiceClient } from "../serviceClient";
import { cached } from "./cache";
import { fmt } from "./ui-helpers";
import { fmtPercent } from "@/lib/format";
import { fmtEtaSeconds } from "./ui-helpers";
import type { QueueItem, LibraryStat, HealthIssue, DownloadEvent } from "@/lib/types";

// ── Wizarr — invite / user stats (cached) ──────────────────
export interface WizarrStats {
  users: number;
  invites: number;
  pending: number;
  expired: number;
}

export async function wizarrStats(): Promise<WizarrStats> {
  return cached("wizarr:stats", 60 * 1000, async () => {
    const { baseUrl, apiKey, json: afetchJson } = await serviceClient("wizarr");
    const d = await afetchJson<{ users?: number; invites?: number; pending?: number; expired?: number }>(
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
    const { baseUrl, apiKey, json: afetchJson } = await serviceClient("prowlarr");
    const headers = { "X-Api-Key": apiKey };
    // The indexer list is the primary signal (a real outage throws here → panel empties).
    // Stats are best-effort enrichment: if /indexerstats errors (e.g. wants date params on
    // some versions), still show indexer counts rather than blanking the whole panel.
    const indexers = await afetchJson<{ enable?: boolean }[]>(`${baseUrl}/api/v1/indexer`, { service: "prowlarr", headers });
    const stats = await afetchJson<{ indexers?: { numberOfQueries?: number; numberOfGrabs?: number; numberOfFailedGrabs?: number }[] }>(
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
    const { baseUrl, apiKey, json: afetchJson } = await serviceClient(serviceId);
    const headers = { "X-Api-Key": apiKey };
    // The configured collections are the real count; sync/status.totalCollections is only the
    // *current run's* counter (0 when idle), so read /collections for the headline figure.
    const list = await afetchJson<{ collectionConfigs?: { isActive?: boolean }[] }>(
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
    const sync = await afetchJson<AgSync>(
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
    const { baseUrl, apiKey, json: afetchJson } = await serviceClient("bazarr");
    // Bazarr authenticates via ?apikey=; length=1 keeps the page tiny — we only read `total`.
    const q = `apikey=${encodeURIComponent(apiKey)}&start=0&length=1`;
    // Settle independently: a Bazarr instance with only Sonarr (or only Radarr) wired up
    // errors on the other endpoint — that shouldn't blank the count we *can* read.
    const [ep, mv] = await Promise.allSettled([
      afetchJson<{ total?: number }>(`${baseUrl}/api/episodes/wanted?${q}`, { service: "bazarr" }),
      afetchJson<{ total?: number }>(`${baseUrl}/api/movies/wanted?${q}`, { service: "bazarr" }),
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
// Content-Type must be set explicitly (afetchJson only sends Accept by default).
async function nzbhydraIndexerStatuses(svc: ServiceClient): Promise<HydraIndexerStatus[]> {
  const apiKey = svc.apiKey ?? "";
  return svc.json<HydraIndexerStatus[]>(`${svc.baseUrl}/api/stats/indexers?apikey=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: { apikey: apiKey, page: 1, limit: 100, filterModel: {}, sortMode: 2, column: "time" },
  });
}

export async function nzbhydra2Stats(serviceId = "nzbhydra"): Promise<Nzbhydra2Stats> {
  return cached(`nzbhydra2:stats:${serviceId}`, 5 * 60 * 1000, async () => {
    const items = (await nzbhydraIndexerStatuses(await serviceClient(serviceId))) ?? [];
    const enabled = items.filter((i) => (i.state ?? "").toUpperCase() === "ENABLED").length;
    // System-disabled (auto, on repeated errors) or an active lastError counts as errored;
    // DISABLED_USER is a deliberate off-switch, so it's only "disabled", not "errored".
    const errored = items.filter((i) => !!i.lastError || (i.state ?? "").toUpperCase().startsWith("DISABLED_SYSTEM")).length;
    return { total: items.length, enabled, disabled: items.length - enabled, errored };
  });
}

// ── LazyLibrarian ──────────────────────────────────────────
// LazyLibrarian's API is query-param auth (?apikey=) and ALWAYS answers HTTP 200 —
// auth/other failures are signalled only in the JSON body, and the body shape varies by
// command (getAllBooks returns a bare array; a failure returns an object). So we validate
// the shape ourselves and throw on anything unexpected, letting the facade's safe() degrade
// the panel rather than surfacing a bad key as an empty-but-healthy library.

interface LazyLibrarianBook {
  BookID?: string;
  AuthorID?: string;
  Status?: string; // ebook status: "Open" = on disk, "Wanted", "Snatched", "Skipped", "Ignored"
  AudioStatus?: string; // audiobook status, same vocabulary
}

const LL_ON_DISK = new Set(["open", "have"]);

/** Aggregate LazyLibrarian stats, all derived from a single getAllBooks scan. */
export interface LazyLibrarianStats {
  totalBooks: number;
  authors: number;
  ebooks: number; // ebook files on disk (Status "Open"/"Have")
  audiobooks: number; // audiobook files on disk (AudioStatus "Open"/"Have")
  wanted: number; // books or audio queued to grab
  snatched: number; // books or audio currently downloading
}

/**
 * LazyLibrarian stats from getAllBooks (one fast call, cached 10 min). getWanted only counts
 * ebooks, so deriving everything from getAllBooks (which carries both Status and AudioStatus)
 * is the single, accurate source for both the Library Stats cards and the LazyLibrarian widget.
 */
export async function lazylibrarianStats(): Promise<LazyLibrarianStats> {
  return cached("lazylibrarian:stats", 10 * 60 * 1000, async () => {
    const { baseUrl, apiKey, json: afetchJson } = await serviceClient("lazylibrarian");
    const data = await afetchJson<unknown>(`${baseUrl}/api?cmd=getAllBooks&apikey=${encodeURIComponent(apiKey)}`, {
      service: "lazylibrarian",
    });
    // Success is a bare array; failure is an object ({Success:false,...}). Guard explicitly.
    if (!Array.isArray(data)) throw new IntegrationError("lazylibrarian", "getAllBooks did not return a list (bad key?)");
    const books = data as LazyLibrarianBook[];

    const isOnDisk = (s?: string) => LL_ON_DISK.has((s ?? "").toLowerCase());
    const isStatus = (b: LazyLibrarianBook, v: string) =>
      (b.Status ?? "").toLowerCase() === v || (b.AudioStatus ?? "").toLowerCase() === v;

    return {
      totalBooks: books.length,
      authors: new Set(books.map((b) => b.AuthorID).filter(Boolean)).size,
      ebooks: books.filter((b) => isOnDisk(b.Status)).length,
      audiobooks: books.filter((b) => isOnDisk(b.AudioStatus)).length,
      wanted: books.filter((b) => isStatus(b, "wanted")).length,
      snatched: books.filter((b) => isStatus(b, "snatched")).length,
    } satisfies LazyLibrarianStats;
  });
}

/**
 * Library Stats cards (audiobooks + ebooks on disk) derived from {@link lazylibrarianStats}.
 * The "what's on disk" counts only — the headline total / wanted / authors live in the
 * dedicated LazyLibrarian widget instead (no overlap).
 */
export function lazylibrarianLibraryStats(s: LazyLibrarianStats): LibraryStat[] {
  const out: LibraryStat[] = [];
  if (s.audiobooks > 0) out.push({ id: "ll-audiobooks", label: "Audiobooks", count: fmt(s.audiobooks), icon: "headphones", delta: "on disk" });
  if (s.ebooks > 0) out.push({ id: "ll-ebooks", label: "eBooks", count: fmt(s.ebooks), icon: "book_2", delta: "on disk" });
  return out;
}

// ── Listenarr — audiobook *arr (own /api/v1, X-Api-Key) ────
// Listenarr does NOT speak the shared *arr API: queue/history/health live under its own
// /api/v1 with their own shapes. Its history is flooded by per-file "File Added" scan
// events, so the downloads feed reads the server-side typed endpoints
// (/history/type/{eventType}) instead of /history/recent.

interface ListenarrQueueRecord {
  id?: string;
  title?: string;
  author?: string;
  progress?: number; // 0–100
  size?: number; // bytes
  downloaded?: number; // bytes
  downloadSpeed?: number; // bytes/sec
  eta?: number; // seconds
}

export async function listenarrQueue(): Promise<QueueItem[]> {
  const { baseUrl, apiKey, json: afetchJson } = await serviceClient("listenarr");
  const data = await afetchJson<{ items?: ListenarrQueueRecord[] }>(`${baseUrl}/api/v1/download/queue`, {
    service: "listenarr",
    headers: { "X-Api-Key": apiKey },
  });
  return (data.items ?? []).map((r, i) => {
    // Prefer the byte counts (unambiguous units) over the reported progress when both exist.
    const pct = r.size && r.downloaded != null
      ? fmtPercent(r.downloaded, r.size)
      : Math.min(100, Math.max(0, Math.round(r.progress ?? 0)));
    return {
      id: `listenarr-${r.id ?? i}`,
      title: r.author ? `${r.title || "(unnamed)"} · ${r.author}` : r.title || "(unnamed)",
      svc: "listenarr",
      pct,
      eta: r.eta != null && r.eta > 0 ? fmtEtaSeconds(r.eta) : "—",
      speed: r.downloadSpeed && r.downloadSpeed > 0 ? `${(r.downloadSpeed / 1_048_576).toFixed(1)} MB/s` : "",
    };
  });
}

interface ListenarrHistoryRecord {
  id?: number;
  audiobookTitle?: string;
  message?: string;
  timestamp?: string;
}

/** Listenarr serializes UTC timestamps without a zone suffix — pin them to UTC for Date.parse. */
function listenarrTs(ts?: string): string {
  if (!ts) return "";
  return /(z|[+-]\d\d:?\d\d)$/i.test(ts) ? ts : `${ts}Z`;
}

export async function listenarrHistory(): Promise<DownloadEvent[]> {
  return cached("history:listenarr", 3 * 60 * 1000, async () => {
    const { baseUrl, apiKey, json: afetchJson } = await serviceClient("listenarr");
    // "Grabbed" = download started; "Downloaded"/"Imported" = landed in the library.
    const types = [
      { type: "Grabbed", event: "grabbed" },
      { type: "Downloaded", event: "imported" },
      { type: "Imported", event: "imported" },
    ] as const;
    const lists = await Promise.all(
      types.map(({ type }) =>
        afetchJson<ListenarrHistoryRecord[]>(`${baseUrl}/api/v1/history/type/${type}`, {
          service: "listenarr",
          headers: { "X-Api-Key": apiKey },
        }),
      ),
    );
    return lists
      .flatMap((list, t) =>
        (list ?? []).map((r, i) => ({
          id: `listenarr-h${r.id ?? `${t}-${i}`}`,
          title: r.audiobookTitle || r.message || "Unknown",
          svc: "listenarr",
          when: listenarrTs(r.timestamp),
          event: types[t].event,
        })),
      )
      .sort((a, b) => Date.parse(b.when) - Date.parse(a.when))
      .slice(0, 30);
  });
}

interface ListenarrHealthResponse {
  status?: string;
  downloadClients?: { clients?: { name?: string; status?: string; type?: string }[] };
  externalApis?: { apis?: { name?: string; status?: string; enabled?: boolean }[] };
}

export async function listenarrHealth(): Promise<HealthIssue[]> {
  return cached("health:listenarr", 3 * 60 * 1000, async () => {
    const { baseUrl, apiKey, json: afetchJson } = await serviceClient("listenarr");
    const d = await afetchJson<ListenarrHealthResponse>(`${baseUrl}/api/v1/system/health`, {
      service: "listenarr",
      headers: { "X-Api-Key": apiKey },
    });
    const out: HealthIssue[] = [];
    for (const c of d.downloadClients?.clients ?? []) {
      if ((c.status ?? "").toLowerCase() !== "connected")
        out.push({ svc: "listenarr", type: "error", message: `Download client ${c.name || c.type || "unknown"} is ${c.status || "unavailable"}` });
    }
    for (const a of d.externalApis?.apis ?? []) {
      if (a.enabled !== false && (a.status ?? "").toLowerCase() !== "connected")
        out.push({ svc: "listenarr", type: "warning", message: `${a.name || "External API"} is ${a.status || "unavailable"}` });
    }
    // Catch-all: surface a degraded overall status even when no component above explains it.
    if (out.length === 0 && d.status && d.status.toLowerCase() !== "healthy")
      out.push({ svc: "listenarr", type: "warning", message: `Listenarr reports status "${d.status}"` });
    return out;
  });
}

interface ListenarrLibraryRecord {
  authors?: string[]; // display names — include "X - translator" entries
  authorAsins?: string[]; // stable author ids (authors only, no translators)
  monitored?: boolean;
  wanted?: boolean;
}

/** Aggregate Listenarr library stats, all derived from a single /library scan. */
export interface ListenarrStats {
  audiobooks: number;
  authors: number; // distinct author names
  monitored: number;
  wanted: number;
}

export async function listenarrStats(): Promise<ListenarrStats> {
  return cached("listenarr:stats", 10 * 60 * 1000, async () => {
    const { baseUrl, apiKey, json: afetchJson } = await serviceClient("listenarr");
    const data = await afetchJson<unknown>(`${baseUrl}/api/v1/library`, {
      service: "listenarr",
      headers: { "X-Api-Key": apiKey },
    });
    if (!Array.isArray(data)) throw new IntegrationError("listenarr", "library did not return a list");
    const books = data as ListenarrLibraryRecord[];
    return {
      audiobooks: books.length,
      // Count distinct authors by ASIN where available (names would inflate the count
      // with per-book "X - translator" entries); fall back to names per record.
      authors: new Set(books.flatMap((b) => (b.authorAsins?.length ? b.authorAsins : (b.authors ?? [])))).size,
      monitored: books.filter((b) => b.monitored).length,
      wanted: books.filter((b) => b.wanted).length,
    } satisfies ListenarrStats;
  });
}

/**
 * Library Stats card derived from {@link listenarrStats}. The "in Listenarr" delta
 * distinguishes it from LazyLibrarian's "on disk" Audiobooks card when both run.
 */
export function listenarrLibraryStats(s: ListenarrStats): LibraryStat[] {
  return s.audiobooks > 0
    ? [{ id: "listenarr-audiobooks", label: "Audiobooks", count: fmt(s.audiobooks), icon: "headphones", delta: "in Listenarr" }]
    : [];
}