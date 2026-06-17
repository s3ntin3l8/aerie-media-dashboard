// ============================================================
// AERIE — Overseerr upstream client (server-only)
// Requests, discover/search, request mutations, users, issues, quotas.
// ============================================================
import "server-only";
import { IntegrationError, type HttpOpts } from "../http";
import { serviceClient, type ServiceClient } from "../serviceClient";
import { cached, bustCache } from "./cache";
import { tmdbFromGuids } from "./ui-helpers";
import { arrGet, arrMovieIndexes, arrQualityProfileMap } from "./arr";
import { fmtPercent } from "@/lib/format";
import type { MediaKind, MediaRequest, DiscoverItem, RequestStatus, QualityProfile, FileInfo, IssueItem, OverseerrQuota } from "@/lib/types";

// Cache enriched media details by "type:tmdbId".
// Titles and poster paths are effectively immutable — 1h TTL is fine.
// Module scope persists across snapshot polls within the same server process.
interface EnrichedDetails {
  title: string;
  posterPath?: string;
  year?: number;
  overview?: string;
  cachedAt: number;
  // — Overseerr media status + deep-link ids (for the Plex watchlist, which arrives
  //   without mediaInfo). Mutable-ish, but acceptably fresh for the 5-min watchlist. —
  state?: RequestStatus | null;
  plexUrl?: string;
  jellyfinItemId?: string;
  serviceUrl?: string;
  arrId?: number;
}
const enrichCache = new Map<string, EnrichedDetails>();
const ENRICH_TTL = 60 * 60 * 1000;
// On failed fetch, retry after 30s to avoid hammering a slow upstream.
const ENRICH_RETRY = 30 * 1000;
// Cap memory on a long-lived process: every unique title ever requested lands here, so evict the
// oldest (Map insertion order) once over the ceiling. ~2k entries is far above any real catalogue.
const ENRICH_CACHE_MAX = 2000;
function enrichCacheSet(key: string, val: EnrichedDetails): void {
  if (enrichCache.size >= ENRICH_CACHE_MAX && !enrichCache.has(key)) {
    const oldest = enrichCache.keys().next().value;
    if (oldest !== undefined) enrichCache.delete(oldest);
  }
  enrichCache.set(key, val);
}

// Coalesce concurrent enrichment fetches for the same title. The cold-cache window
// gets polled every 3s; without this, each poll re-issues the same TMDB roundtrips.
const enrichInflight = new Map<string, Promise<EnrichedDetails>>();

// Synchronous, read-only cache peek: returns a still-valid enrichment or undefined.
// Lets overseerrRequests serve the list immediately and background-fill misses.
function enrichPeek(type: "movie" | "tv", tmdbId: number): EnrichedDetails | undefined {
  const cached = enrichCache.get(`${type}:${tmdbId}`);
  if (cached) {
    const ttl = cached.title ? ENRICH_TTL : ENRICH_RETRY;
    if (Date.now() - cached.cachedAt < ttl) return cached;
  }
  return undefined;
}

async function enrichMedia(afetchJson: ServiceClient["json"], baseUrl: string, apiKey: string, type: "movie" | "tv", tmdbId: number): Promise<EnrichedDetails> {
  const cacheKey = `${type}:${tmdbId}`;
  const peek = enrichPeek(type, tmdbId);
  if (peek) return peek;
  const existing = enrichInflight.get(cacheKey);
  if (existing) return existing;
  const p = (async () => {
    try {
      const details = await afetchJson<OverseerrMediaDetails>(
        `${baseUrl}/api/v1/${type}/${tmdbId}`,
        { service: "overseerr", headers: { "X-Api-Key": apiKey }, timeoutMs: 15000 },
      );
      const dateStr = details.releaseDate || details.firstAirDate || "";
      const mi = details.mediaInfo;
      const result: EnrichedDetails = {
        title: details.title || details.name || "",
        posterPath: details.posterPath ?? undefined,
        year: dateStr ? Number(dateStr.slice(0, 4)) : undefined,
        overview: details.overview || undefined,
        cachedAt: Date.now(),
        state: mediaStatusToState(mi?.status),
        plexUrl: mi?.mediaUrl ?? mi?.plexUrl,
        jellyfinItemId: mi?.jellyfinMediaId,
        serviceUrl: mi?.serviceUrl,
        arrId: mi?.externalServiceId,
      };
      enrichCacheSet(cacheKey, result);
      return result;
    } catch {
      const fallback: EnrichedDetails = { title: "", cachedAt: Date.now() };
      enrichCacheSet(cacheKey, fallback);
      return fallback;
    } finally {
      enrichInflight.delete(cacheKey);
    }
  })();
  enrichInflight.set(cacheKey, p);
  return p;
}

// Bounded background enrichment: a cold request list can have hundreds of uncached
// items. Rather than fire them all at once (a burst that can overwhelm Overseerr,
// especially right after a DNS/upstream hiccup), drain the misses through a small
// worker pool. Deduped against in-flight + already-queued keys so repeated polls
// during the cold window don't stack duplicate work.
const ENRICH_CONCURRENCY = 6;
const enrichQueue: Array<() => Promise<unknown>> = [];
const enrichQueued = new Set<string>();
let enrichActive = 0;
function pumpEnrichQueue(): void {
  while (enrichActive < ENRICH_CONCURRENCY && enrichQueue.length > 0) {
    const job = enrichQueue.shift()!;
    enrichActive++;
    void job().finally(() => {
      enrichActive--;
      pumpEnrichQueue();
    });
  }
}
function queueEnrich(afetchJson: ServiceClient["json"], baseUrl: string, apiKey: string, type: "movie" | "tv", tmdbId: number): void {
  const key = `${type}:${tmdbId}`;
  if (enrichQueued.has(key) || enrichInflight.has(key)) return; // already pending
  enrichQueued.add(key);
  enrichQueue.push(() => enrichMedia(afetchJson, baseUrl, apiKey, type, tmdbId).finally(() => enrichQueued.delete(key)));
  pumpEnrichQueue();
}

const OVERSEERR_STATUS: Record<number, MediaRequest["status"]> = { 1: "pending", 2: "approved", 3: "declined", 4: "failed" };

// Cache resolved quality profile names (profileId → name) for 1 hour.
// Radarr (movies) and Sonarr (TV) have independent profile ID spaces so we keep
// separate maps and select by request type when resolving a name.
interface QualityProfileMaps { movie: Record<number, string>; tv: Record<number, string> }
const QUALITY_PROFILES_TTL = 60 * 60 * 1000;

function overseerrQualityProfiles(afetchJson: ServiceClient["json"], baseUrl: string, apiKey: string): Promise<QualityProfileMaps> {
  return cached("overseerr:qualityprofiles:maps", QUALITY_PROFILES_TTL, async () => {
    // Primary: call Radarr/Sonarr directly — gets ALL profiles, not just the active one.
    // Falls back to Overseerr settings (active profile only) if *arr isn't configured in AERIE.
    const settingsFallback = (arr: "radarr" | "sonarr") => async () => {
      type S = { activeProfileId?: number; activeProfileName?: string };
      const rows = await afetchJson<S[]>(`${baseUrl}/api/v1/settings/${arr}`, { service: "overseerr", headers: { "X-Api-Key": apiKey }, timeoutMs: 5000 }).catch(() => [] as S[]);
      const m: Record<number, string> = {};
      for (const e of rows) if (e.activeProfileId != null && e.activeProfileName) m[e.activeProfileId] = e.activeProfileName;
      return m;
    };
    const [movieMap, tvMap] = await Promise.all([
      arrQualityProfileMap("radarr").catch(settingsFallback("radarr")),
      arrQualityProfileMap("sonarr").catch(settingsFallback("sonarr")),
    ]);
    return { movie: movieMap, tv: tvMap };
  });
}

async function fetchServiceProfiles(afetchJson: ServiceClient["json"], baseUrl: string, apiKey: string, arr: "radarr" | "sonarr"): Promise<QualityProfile[]> {
  const DEFAULT: QualityProfile = { id: "default", label: "Default", sub: "Overseerr default", icon: "auto_awesome", def: true };

  // Primary: call *arr directly — fast, full list, no Overseerr service-proxy ping.
  const direct = await arrQualityProfileMap(arr).catch(() => null);
  if (direct && Object.keys(direct).length > 0) {
    const live = Object.entries(direct).map(([id, name]) => ({ id, label: name, sub: "", icon: "high_quality" as const }));
    return [DEFAULT, ...live];
  }

  // Fallback: Overseerr service proxy (pings *arr — slow, but works when *arr isn't
  // configured separately in AERIE).
  const h = { "X-Api-Key": apiKey };
  const get = <T>(url: string) => afetchJson<T>(url, { service: "overseerr", headers: h, timeoutMs: 20000 });
  type SvcEntry = { id: number };
  type ProfileEntry = { id: number; name?: string };
  const svcs = await get<SvcEntry[]>(`${baseUrl}/api/v1/service/${arr}`).catch(() => [] as SvcEntry[]);
  if (svcs.length > 0) {
    const raw = await get<ProfileEntry[]>(`${baseUrl}/api/v1/service/${arr}/${svcs[0].id}/profiles`).catch(() => [] as ProfileEntry[]);
    const live: QualityProfile[] = raw.filter((p) => p.id != null && p.name).map((p) => ({ id: String(p.id), label: p.name!, sub: "", icon: "high_quality" }));
    if (live.length > 0) return [DEFAULT, ...live];
  }

  // Last resort: Overseerr settings (active profile only).
  type SettingsEntry = { activeProfileId?: number; activeProfileName?: string };
  const settings = await afetchJson<SettingsEntry[]>(`${baseUrl}/api/v1/settings/${arr}`, { service: "overseerr", headers: h, timeoutMs: 5000 }).catch(() => [] as SettingsEntry[]);
  const fromSettings: QualityProfile[] = settings
    .filter((e) => e.activeProfileId != null && e.activeProfileName)
    .map((e) => ({ id: String(e.activeProfileId!), label: e.activeProfileName!, sub: "active profile", icon: "high_quality" }));
  return [DEFAULT, ...fromSettings];
}

// ── Overseerr — requests ───────────────────────────────────
interface OverseerrRequest {
  id: number;
  type: "movie" | "tv";
  status: number; // 1 pending, 2 approved, 3 declined, 4 failed
  // Overseerr enriches `media` with watch/service deep-links for synced items —
  // free to read from the payload we already fetch (no extra upstream calls).
  // NB: the Plex web link is `mediaUrl` (app.plex.tv/...); `plexUrl` is not present.
  media?: {
    id?: number;
    status?: number;
    tmdbId?: number;
    mediaType?: string;
    mediaUrl?: string;
    plexUrl?: string;
    jellyfinMediaId?: string;
    ratingKey?: string;
    serviceUrl?: string;
    /** the *arr's internal id (Radarr movie id / Sonarr series id). */
    externalServiceId?: number;
  };
  requestedBy?: { id: number; displayName?: string; plexUsername?: string; email?: string };
  createdAt?: string;
  updatedAt?: string;
  seasons?: Array<{ seasonNumber: number }>;
  profileId?: number;
}

export interface OverseerrRequestDetails {
  id: number;
  requesterId?: number;
  requesterEmail?: string;
  status: MediaRequest["status"];
  seasons?: number[];
}

interface OverseerrMediaDetails {
  title?: string;       // movies
  name?: string;        // tv shows
  posterPath?: string;
  releaseDate?: string;  // movies
  firstAirDate?: string; // tv shows
  overview?: string;
  mediaInfo?: { status?: number; mediaUrl?: string; plexUrl?: string; jellyfinMediaId?: string; ratingKey?: string; serviceUrl?: string; externalServiceId?: number };
}

interface OverseerrSearchResult {
  id: number;
  mediaType: "movie" | "tv" | "person";
  title?: string;
  name?: string;
  releaseDate?: string;
  firstAirDate?: string;
  voteAverage?: number;
  overview?: string;
  posterPath?: string;
  mediaInfo?: { status?: number; mediaUrl?: string; plexUrl?: string; jellyfinMediaId?: string; ratingKey?: string; serviceUrl?: string; externalServiceId?: number };
}

// Overseerr MediaStatus → our request state.
function mediaStatusToState(status?: number): RequestStatus | null {
  if (status === 5 || status === 4) return "available";
  if (status === 3) return "approved";
  if (status === 2) return "pending";
  return null;
}

function mapDiscoverResult(r: OverseerrSearchResult): DiscoverItem {
  const date = r.releaseDate || r.firstAirDate || "";
  return {
    id: String(r.id),
    title: r.title || r.name || `#${r.id}`,
    kind: r.mediaType === "tv" ? "series" : "movie",
    year: date ? Number(date.slice(0, 4)) : 0,
    rating: r.voteAverage ? Math.round(r.voteAverage * 10) / 10 : 0,
    state: mediaStatusToState(r.mediaInfo?.status),
    overview: r.overview || "",
    art: r.posterPath ? `/api/artwork?svc=overseerr&ref=${encodeURIComponent(r.posterPath)}` : undefined,
    plexUrl: r.mediaInfo?.mediaUrl ?? r.mediaInfo?.plexUrl,
    jellyfinItemId: r.mediaInfo?.jellyfinMediaId,
    serviceUrl: r.mediaInfo?.serviceUrl,
    arrId: r.mediaInfo?.externalServiceId,
  };
}

/** Live quality profiles for a request kind (movie = Radarr, TV = Sonarr). Cached 1h. */
function overseerrProfiles(arr: "radarr" | "sonarr"): Promise<QualityProfile[]> {
  return cached(`overseerr:profiles:${arr}`, QUALITY_PROFILES_TTL, async () => {
    const { baseUrl, apiKey, json: afetchJson } = await serviceClient("overseerr");
    return fetchServiceProfiles(afetchJson, baseUrl, apiKey, arr);
  });
}
export const overseerrMovieProfiles = (): Promise<QualityProfile[]> => overseerrProfiles("radarr");
export const overseerrTvProfiles = (): Promise<QualityProfile[]> => overseerrProfiles("sonarr");

// Overseerr's /api/v1/request endpoint is slow only when cold (~10s after idle, ~300ms warm).
// Stale-while-revalidate keeps the snapshot instant: serve the last-known list, refresh in the
// background. Mutations bustCache("overseerr:requests") so approvals/cancels reflect at once.
export async function overseerrRequests(): Promise<MediaRequest[]> {
  return cached("overseerr:requests", 10_000, fetchOverseerrRequests);
}

async function fetchOverseerrRequests(): Promise<MediaRequest[]> {
  const { baseUrl, apiKey, json: afetchJson } = await serviceClient("overseerr");
  const [data, profileMaps, movieIndexes] = await Promise.all([
    afetchJson<{ results: OverseerrRequest[] }>(`${baseUrl}/api/v1/request?take=250&sort=added`, {
      service: "overseerr",
      headers: { "X-Api-Key": apiKey },
      timeoutMs: 10000,
    }),
    overseerrQualityProfiles(afetchJson, baseUrl, apiKey!).catch(() => ({ movie: {}, tv: {} } as { movie: Record<number, string>; tv: Record<number, string> })),
    arrMovieIndexes().catch(() => ({ fileIndex: new Map<number, FileInfo>(), profileIndex: new Map<number, number>() })),
  ]);
  const { fileIndex, profileIndex } = movieIndexes;
  const results = data.results ?? [];

  // Cosmetic media details (title/poster/year/overview) are immutable and cached 1h.
  // Serve whatever is already cached and background-fill misses (coalesced) so the
  // snapshot never blocks on a cold per-item TMDB fan-out — the list itself (status,
  // requester, date) is always fresh from the fetch above. Misses fill in next poll.
  const enriched: EnrichedDetails[] = results.map((r) => {
    if (!r.media?.tmdbId) return { title: "", cachedAt: 0 };
    const hit = enrichPeek(r.type, r.media.tmdbId);
    if (hit) return hit;
    queueEnrich(afetchJson, baseUrl, apiKey!, r.type, r.media.tmdbId); // bounded background fill
    return { title: "", cachedAt: 0 };
  });

  return results.map((r, i) => {
    const { title, posterPath, year, overview } = enriched[i];
    const fallbackYear = r.createdAt ? new Date(r.createdAt).getFullYear() : 0;
    const seasons = r.seasons?.map((s) => s.seasonNumber).filter((n) => n > 0);
    return {
      id: `os-${r.id}`,
      title: title || `Request ${r.id}`,
      kind: r.type === "tv" ? "series" : "movie",
      year: year ?? fallbackYear,
      user: String(r.requestedBy?.id ?? "unknown"),
      status: r.media?.status === 5 ? "available"
        : (r.media?.status === 3 || r.media?.status === 4) ? "processing"
        : (OVERSEERR_STATUS[r.status] ?? "pending"),
      requested: r.createdAt ? new Date(r.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "",
      art: posterPath ? `/api/artwork?svc=overseerr&ref=${encodeURIComponent(posterPath)}` : undefined,
      requesterName: r.requestedBy?.displayName || r.requestedBy?.plexUsername || r.requestedBy?.email?.split("@")[0],
      requesterEmail: r.requestedBy?.email,
      seasons: seasons && seasons.length > 0 ? seasons : undefined,
      overview: overview || undefined,
      qualityProfile: (() => {
        const map = profileMaps[r.type === "tv" ? "tv" : "movie"];
        // Prefer Overseerr's stored profileId; fall back to Radarr's assigned profile
        // (covers requests created via AERIE where no explicit profileId was submitted).
        const pid = r.profileId ?? (r.type === "movie" && r.media?.tmdbId ? profileIndex.get(r.media.tmdbId) : undefined);
        return pid != null ? (map[pid] ?? `Profile ${pid}`) : undefined;
      })(),
      mediaOverseerrId: r.media?.id,
      tmdbId: r.media?.tmdbId,
      plexUrl: r.media?.mediaUrl ?? r.media?.plexUrl,
      jellyfinItemId: r.media?.jellyfinMediaId,
      serviceUrl: r.media?.serviceUrl,
      arrId: r.media?.externalServiceId,
      modified: r.updatedAt ?? r.createdAt,
      fileInfo: r.type === "movie" && r.media?.tmdbId ? fileIndex.get(r.media.tmdbId) : undefined,
    };
  });
}

// ── Overseerr — discover/search + request create/approve/decline ──

/**
 * Resolve a single DiscoverItem from Overseerr by TMDB id (used when opening the
 * detail modal from a library widget that only knows the TMDB id). Carries the same
 * mediaInfo enrichment (state, watch links, arrId) as search results.
 */
export async function overseerrMediaByTmdb(tmdbId: number, kind: MediaKind): Promise<DiscoverItem | null> {
  const { baseUrl, apiKey, json: afetchJson } = await serviceClient("overseerr");
  const path = kind === "series" ? "tv" : "movie";
  const r = await afetchJson<OverseerrSearchResult & { numberOfSeasons?: number }>(
    `${baseUrl}/api/v1/${path}/${tmdbId}`,
    { service: "overseerr", headers: { "X-Api-Key": apiKey }, timeoutMs: 8000 },
  );
  const item = mapDiscoverResult({ ...r, id: tmdbId, mediaType: kind === "series" ? "tv" : "movie" });
  if (kind === "series" && r.numberOfSeasons) item.seasons = r.numberOfSeasons;
  return item;
}

export async function overseerrSearch(query: string): Promise<DiscoverItem[]> {
  const { baseUrl, apiKey, json: afetchJson } = await serviceClient("overseerr");
  const data = await afetchJson<{ results: OverseerrSearchResult[] }>(
    `${baseUrl}/api/v1/search?query=${encodeURIComponent(query || "a")}&page=1&language=en`,
    { service: "overseerr", headers: { "X-Api-Key": apiKey }, timeoutMs: 12000 },
  );
  return (data.results ?? [])
    .filter((r) => r.mediaType === "movie" || r.mediaType === "tv")
    .slice(0, 20)
    .map(mapDiscoverResult);
}

// ── Overseerr — discover (trending / popular / upcoming) ──────
async function fetchDiscover(svc: ServiceClient, path: string, limit = 20): Promise<DiscoverItem[]> {
  const data = await svc.json<{ results: OverseerrSearchResult[] }>(
    `${svc.baseUrl}/api/v1/discover/${path}?page=1&language=en`,
    { service: "overseerr", headers: { "X-Api-Key": svc.apiKey ?? "" }, timeoutMs: 8000 },
  );
  return (data.results ?? [])
    .filter((r) => r.mediaType === "movie" || r.mediaType === "tv")
    .slice(0, limit)
    .map(mapDiscoverResult);
}

/** Cached Overseerr discover feed: `key` names the cache slot, `path` is the /discover/<path> route. */
function cachedDiscover(key: string, path: string): Promise<DiscoverItem[]> {
  return cached(`overseerr:discover:${key}`, QUALITY_PROFILES_TTL, async () => fetchDiscover(await serviceClient("overseerr"), path, 20));
}

export const overseerrTrending = (): Promise<DiscoverItem[]> => cachedDiscover("trending", "trending");
export const overseerrPopularMovies = (): Promise<DiscoverItem[]> => cachedDiscover("popularMovies", "movies");
export const overseerrPopularTv = (): Promise<DiscoverItem[]> => cachedDiscover("popularTv", "tv");
export const overseerrUpcomingMovies = (): Promise<DiscoverItem[]> => cachedDiscover("upcomingMovies", "movies/upcoming");

// ── Overseerr — request mutations (delete / edit) ─────────────
export async function overseerrDeleteRequest(requestId: number): Promise<void> {
  const { baseUrl, apiKey, json: afetchJson } = await serviceClient("overseerr");
  await afetchJson(`${baseUrl}/api/v1/request/${requestId}`, { service: "overseerr", method: "DELETE", headers: { "X-Api-Key": apiKey } });
}

export async function overseerrRequestDetails(requestId: number): Promise<OverseerrRequestDetails> {
  const { baseUrl, apiKey, json: afetchJson } = await serviceClient("overseerr");
  const r = await afetchJson<OverseerrRequest>(`${baseUrl}/api/v1/request/${requestId}`, {
    service: "overseerr",
    headers: { "X-Api-Key": apiKey },
  });
  const seasons = r.seasons?.map((s) => s.seasonNumber).filter((n) => n > 0);
  return {
    id: r.id,
    requesterId: r.requestedBy?.id,
    requesterEmail: r.requestedBy?.email,
    status: r.media?.status === 5 ? "available"
      : (r.media?.status === 3 || r.media?.status === 4) ? "processing"
      : (OVERSEERR_STATUS[r.status] ?? "pending"),
    seasons: seasons && seasons.length > 0 ? seasons : undefined,
  };
}

export async function overseerrEditRequest(requestId: number, changes: { seasons?: number[]; profileId?: number }): Promise<void> {
  const { baseUrl, apiKey, json: afetchJson } = await serviceClient("overseerr");
  const body: Record<string, unknown> = {};
  if (changes.seasons !== undefined) body.seasons = changes.seasons.length ? changes.seasons : "all";
  if (changes.profileId !== undefined) body.profileId = changes.profileId;
  await afetchJson(`${baseUrl}/api/v1/request/${requestId}`, { service: "overseerr", method: "PUT", headers: { "X-Api-Key": apiKey }, body });
}

// ── Overseerr — request counts ────────────────────────────────
export interface RequestCounts {
  total: number;
  pending: number;
  approved: number;
  processing: number;
  failed: number;
  available: number;
}

export async function overseerrRequestCounts(): Promise<RequestCounts> {
  return cached("overseerr:requestCounts", 3 * 60 * 1000, async () => {
    const { baseUrl, apiKey, json: afetchJson } = await serviceClient("overseerr");
    const data = await afetchJson<Record<string, number>>(`${baseUrl}/api/v1/request/count`, {
      service: "overseerr",
      headers: { "X-Api-Key": apiKey },
    });
    return {
      total: data.total ?? 0,
      pending: data.pending ?? 0,
      approved: data.approved ?? 0,
      processing: data.processing ?? 0,
      failed: (data.failed ?? 0) + (data.unavailable ?? 0),
      available: data.available ?? 0,
    };
  });
}

// ── Overseerr — Plex watchlist ────────────────────────────────
export async function overseerrWatchlist(): Promise<DiscoverItem[]> {
  return cached("overseerr:watchlist", 5 * 60 * 1000, async () => {
    const { baseUrl, apiKey, json: afetchJson } = await serviceClient("overseerr");
    const data = await afetchJson<{ results: (OverseerrSearchResult & { tmdbId?: number })[] }>(
      `${baseUrl}/api/v1/discover/watchlist?page=1`,
      { service: "overseerr", headers: { "X-Api-Key": apiKey }, timeoutMs: 8000 },
    );
    const raw = (data.results ?? [])
      .filter((r) => r.mediaType === "movie" || r.mediaType === "tv")
      .slice(0, 50);
    // Watchlist items come from Plex and arrive WITHOUT mediaInfo, so mapDiscoverResult
    // can't see the request/library status — always enrich by TMDB id to resolve the
    // real Overseerr state + deep-link ids (and any missing art/year).
    return Promise.all(raw.map(async (r) => {
      const base = mapDiscoverResult({ ...r, id: r.tmdbId ?? r.id });
      const tmdbId = r.tmdbId ?? r.id;
      if (!tmdbId) return base;
      const type = r.mediaType === "tv" ? "tv" : "movie";
      const enriched = await enrichMedia(afetchJson, baseUrl, apiKey, type, tmdbId);
      return {
        ...base,
        year: base.year || enriched.year || 0,
        art: base.art ?? (enriched.posterPath ? `/api/artwork?svc=overseerr&ref=${encodeURIComponent(enriched.posterPath)}` : undefined),
        // status + deep-link ids resolved from the per-title detail (watchlist lacks them)
        state: base.state ?? enriched.state ?? null,
        plexUrl: base.plexUrl ?? enriched.plexUrl,
        jellyfinItemId: base.jellyfinItemId ?? enriched.jellyfinItemId,
        serviceUrl: base.serviceUrl ?? enriched.serviceUrl,
        arrId: base.arrId ?? enriched.arrId,
      };
    }));
  });
}

export async function overseerrCreateRequest(input: { tmdbId: number; mediaType: "movie" | "tv"; seasons?: number[]; userId?: number; profileId?: number }): Promise<{ status: number; mediaStatus?: number }> {
  const { baseUrl, apiKey, json: afetchJson } = await serviceClient("overseerr");
  const body: Record<string, unknown> = { mediaType: input.mediaType, mediaId: input.tmdbId };
  if (input.mediaType === "tv") body.seasons = input.seasons && input.seasons.length ? input.seasons : "all";
  if (input.userId) body.userId = input.userId;
  if (input.profileId) body.profileId = input.profileId;
  // The POST response is the created MediaRequest: `status` is 1 pending / 2 approved
  // (auto-approve), so the caller can tell whether the request needs approval.
  const res = await afetchJson<{ status?: number; media?: { status?: number } }>(`${baseUrl}/api/v1/request`, { service: "overseerr", method: "POST", headers: { "X-Api-Key": apiKey }, body });
  return { status: typeof res?.status === "number" ? res.status : 1, mediaStatus: res?.media?.status };
}

export async function overseerrReview(requestId: number, action: "approve" | "decline"): Promise<void> {
  const { baseUrl, apiKey, json: afetchJson } = await serviceClient("overseerr");
  await afetchJson(`${baseUrl}/api/v1/request/${requestId}/${action}`, { service: "overseerr", method: "POST", headers: { "X-Api-Key": apiKey } });
}

export async function overseerrComment(mediaId: number, message: string): Promise<void> {
  const { baseUrl, apiKey, json: afetchJson } = await serviceClient("overseerr");
  await afetchJson(`${baseUrl}/api/v1/comment`, { service: "overseerr", method: "POST", headers: { "X-Api-Key": apiKey }, body: { message, mediaId } });
}

// ── Overseerr — users (for portal↔Overseerr identity matching) ──
export interface OverseerrUser {
  id: number;
  email?: string;
  displayName?: string;
  plexUsername?: string;
}
interface OverseerrUserApi {
  id: number;
  email?: string;
  displayName?: string;
  plexUsername?: string;
}

// Cache the user list briefly — getSnapshot polls every 12s and submitRequest may
// also call this; a short TTL avoids hammering /api/v1/user on every poll.
const USERS_TTL = 5 * 60 * 1000;

export function overseerrUsers(): Promise<OverseerrUser[]> {
  return cached("overseerr:users", USERS_TTL, async () => {
    const { baseUrl, apiKey, json: afetchJson } = await serviceClient("overseerr");
    const data = await afetchJson<{ results: OverseerrUserApi[] }>(`${baseUrl}/api/v1/user?take=100`, {
      service: "overseerr",
      headers: { "X-Api-Key": apiKey },
    });
    return (data.results ?? []).map((u) => ({ id: u.id, email: u.email, displayName: u.displayName, plexUsername: u.plexUsername }));
  });
}

// ── Overseerr — open issues (cached) ───────────────────────
interface OverseerrIssueApi {
  id: number;
  issueType?: number;
  status?: number;
}

export async function overseerrIssues(): Promise<{ open: number; items: IssueItem[] }> {
  return cached("overseerr:issues", 3 * 60 * 1000, async () => {
    const { baseUrl, apiKey, json: afetchJson } = await serviceClient("overseerr");
    const data = await afetchJson<{ pageInfo?: { results?: number }; results?: OverseerrIssueApi[] }>(
      `${baseUrl}/api/v1/issue?take=20&filter=open&sort=added`,
      { service: "overseerr", headers: { "X-Api-Key": apiKey } },
    );
    const items: IssueItem[] = (data.results ?? []).map((i) => ({ id: i.id, issueType: i.issueType ?? 0, status: i.status ?? 0 }));
    return { open: data.pageInfo?.results ?? items.length, items };
  });
}

export async function overseerrVersion(): Promise<string | null> {
  return cached("overseerr:version", 30 * 60 * 1000, async () => {
    const { baseUrl, apiKey, json: afetchJson } = await serviceClient("overseerr");
    const d = await afetchJson<{ version?: string }>(`${baseUrl}/api/v1/status`, {
      service: "overseerr",
      headers: { "X-Api-Key": apiKey },
    });
    return normalizeVersion(d.version);
  });
}

/** Pure helper: find the Overseerr user id whose email matches `email` (case-insensitive). */
export function matchOverseerrUserId(users: OverseerrUser[], email: string | undefined): number | undefined {
  if (!email) return undefined;
  const key = email.trim().toLowerCase();
  if (!key) return undefined;
  return users.find((u) => u.email?.trim().toLowerCase() === key)?.id;
}

// ── Overseerr — per-user quota (read + write) ──────────────
interface OverseerrQuotaApi {
  limit: number;
  days: number;
  used: number;
  remaining: number;
  restricted: boolean;
}

function mapQuota(q: OverseerrQuotaApi): OverseerrQuota {
  return { limit: q.limit === 0 ? null : q.limit, days: q.days, used: q.used, remaining: q.remaining, restricted: q.restricted };
}

/** Fetch the current movie + TV quota for an Overseerr user. Cached 3 min per user. */
export async function overseerrUserQuota(overseerrUserId: number): Promise<{ movie: OverseerrQuota; tv: OverseerrQuota }> {
  return cached(`overseerr:quota:${overseerrUserId}`, 3 * 60 * 1000, async () => {
    const { baseUrl, apiKey, json: afetchJson } = await serviceClient("overseerr");
    const raw = await afetchJson<{ movie: OverseerrQuotaApi; tv: OverseerrQuotaApi }>(
      `${baseUrl}/api/v1/user/${overseerrUserId}/quota`,
      { service: "overseerr", headers: { "X-Api-Key": apiKey } },
    );
    return { movie: mapQuota(raw.movie), tv: mapQuota(raw.tv) };
  });
}

export interface OverseerrQuotaSettings {
  movieQuotaLimit: number | null;
  movieQuotaDays: number;
  tvQuotaLimit: number | null;
  tvQuotaDays: number;
}

/** Write movie + TV quota settings for an Overseerr user, then bust the local cache. */
export async function overseerrUpdateUserQuota(overseerrUserId: number, settings: OverseerrQuotaSettings): Promise<void> {
  const { baseUrl, apiKey, json: afetchJson } = await serviceClient("overseerr");
  await afetchJson(`${baseUrl}/api/v1/user/${overseerrUserId}/settings/main`, {
    service: "overseerr",
    method: "POST",
    headers: { "X-Api-Key": apiKey },
    body: {
      movieQuotaLimit: settings.movieQuotaLimit ?? 0,
      movieQuotaDays: settings.movieQuotaDays,
      tvQuotaLimit: settings.tvQuotaLimit ?? 0,
      tvQuotaDays: settings.tvQuotaDays,
    },
  });
  bustCache(`overseerr:quota:${overseerrUserId}`);
}

/** Strip a leading "v"/"V" so stored versions are bare (the UI prepends its own "v"). */
function normalizeVersion(v: string | undefined | null): string | null {
  if (!v) return null;
  const s = v.trim().replace(/^v/i, "");
  // dev builds: "develop-{fullSHA}" → "develop-{7chars}"
  const dev = s.match(/^(develop-[0-9a-f]{7})[0-9a-f]*/i);
  return (dev ? dev[1] : s) || null;
}

/** Clear the Overseerr enrichCache (used by the barrel clearCache). */
export function clearEnrichCache(): void {
  enrichCache.clear();
  enrichInflight.clear();
  enrichQueued.clear();
  enrichQueue.length = 0;
  enrichActive = 0;
}