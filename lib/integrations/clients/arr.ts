// ============================================================
// AERIE — *arr (Sonarr/Radarr) upstream client (server-only)
// Download queue, disk space, health, calendar, history, movie/series metadata.
// ============================================================
import "server-only";
import { IntegrationError, type HttpOpts } from "../http";
import { serviceClient, type ServiceClient } from "../serviceClient";
import { cached, bustCache } from "./cache";
import { fmtPercent } from "@/lib/format";
import type { QueueItem, StorageMount, HealthIssue, UpcomingItem, DownloadEvent, FileInfo, SeasonQuality } from "@/lib/types";

/** GET a Sonarr/Radarr v3 endpoint with the service's X-Api-Key. The shape shared by every *arr
 *  reader — serviceClient + afetchJson, labelled by serviceId for error attribution. */
export async function arrGet<T>(serviceId: "sonarr" | "radarr", path: string, timeoutMs?: number): Promise<T> {
  const { baseUrl, apiKey, json: afetchJson } = await serviceClient(serviceId);
  return afetchJson<T>(`${baseUrl}${path}`, {
    service: serviceId,
    headers: { "X-Api-Key": apiKey },
    ...(timeoutMs ? { timeoutMs } : {}),
  });
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
  const data = await arrGet<{ records: ArrQueueRecord[] }>(serviceId, `/api/v3/queue?pageSize=20`);
  return (data.records ?? []).map((r, i) => {
    const pct = r.size && r.sizeleft != null ? fmtPercent(r.size - r.sizeleft, r.size) : 0;
    return { id: `${serviceId}-${i}`, title: r.title, svc: serviceId, pct, eta: r.timeleft || "—", speed: "" };
  });
}

// ── *arr — disk space (cached; mounts change slowly) ───────
interface ArrDiskSpace {
  path: string;
  label?: string;
  freeSpace: number;
  totalSpace: number;
}

export async function arrDiskSpace(serviceId: "sonarr" | "radarr"): Promise<StorageMount[]> {
  return cached(`diskspace:${serviceId}`, 10 * 60 * 1000, async () => {
    const data = await arrGet<ArrDiskSpace[]>(serviceId, `/api/v3/diskspace`);
    return (data ?? [])
      .filter((d) => d.totalSpace > 0)
      .map((d) => ({ path: d.path, label: d.label || d.path, freeBytes: d.freeSpace, totalBytes: d.totalSpace }));
  });
}

// ── *arr — health warnings (cached) ────────────────────────
interface ArrHealthRecord {
  source?: string;
  type?: string;
  message?: string;
  wikiUrl?: string;
}

export async function arrHealth(serviceId: "sonarr" | "radarr"): Promise<HealthIssue[]> {
  return cached(`health:${serviceId}`, 3 * 60 * 1000, async () => {
    const data = await arrGet<ArrHealthRecord[]>(serviceId, `/api/v3/health`);
    return (data ?? []).map((h) => ({
      svc: serviceId,
      type: h.type || "warning",
      message: h.message || "",
      source: h.source,
      wikiUrl: h.wikiUrl,
    }));
  });
}

// ── *arr — upcoming calendar (cached) ──────────────────────
// Ratings come in two shapes: Radarr keys them by source ({ imdb: { value }, tmdb: { value } }),
// Sonarr series uses a flat { value }. Normalize to one number (prefer imdb → tmdb → flat value).
type ArrRating = { value?: number };
type ArrRatings = { value?: number; imdb?: ArrRating; tmdb?: ArrRating };

interface ArrSeries {
  title?: string;
  titleSlug?: string;
  images?: { coverType: string; remoteUrl?: string; url?: string }[];
  overview?: string;
  runtime?: number;
  year?: number;
  genres?: string[];
  network?: string;
  ratings?: ArrRatings;
}

interface ArrCalendarRecord {
  id: number;
  title?: string;        // Radarr movie title
  titleSlug?: string;    // Radarr movie slug (web-UI deep link)
  seriesTitle?: string;  // sometimes present on Sonarr records
  series?: ArrSeries;
  seasonNumber?: number;
  episodeNumber?: number;
  airDateUtc?: string;   // Sonarr
  inCinemas?: string;    // Radarr
  digitalRelease?: string;
  physicalRelease?: string;
  images?: { coverType: string; remoteUrl?: string; url?: string }[];
  // detail fields (Radarr movie record / Sonarr episode record)
  overview?: string;
  runtime?: number;
  year?: number;
  genres?: string[];
  studio?: string;
  monitored?: boolean;
  hasFile?: boolean;
  ratings?: ArrRatings;
}

function arrPoster(serviceId: string, rec: ArrCalendarRecord): string | undefined {
  // Sonarr episodes: poster lives on rec.series.images; Radarr movies: rec.images
  const imgs = (rec.series?.images?.length ? rec.series.images : rec.images) ?? [];
  const img = imgs.find((i) => i.coverType === "poster") ?? imgs[0];
  if (!img) return undefined;
  // remoteUrl is a public CDN URL (no auth needed) — use directly so it never
  // flows through the artwork proxy as a user-controlled URL (SSRF mitigation).
  if (img.remoteUrl) return img.remoteUrl;
  return img.url ? `/api/artwork?svc=${serviceId}&ref=${encodeURIComponent(img.url)}` : undefined;
}

function arrRating(r?: ArrRatings): number | undefined {
  const v = r?.imdb?.value ?? r?.tmdb?.value ?? r?.value;
  return typeof v === "number" && v > 0 ? Math.round(v * 10) / 10 : undefined;
}

export async function arrCalendar(serviceId: "sonarr" | "radarr"): Promise<UpcomingItem[]> {
  return cached(`calendar:${serviceId}`, 15 * 60 * 1000, async () => {
    const start = new Date().toISOString();
    const end = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
    const data = await arrGet<ArrCalendarRecord[]>(serviceId, `/api/v3/calendar?start=${start}&end=${end}&includeSeries=true`);
    const isSeries = serviceId === "sonarr";
    const out: UpcomingItem[] = [];
    for (const rec of data ?? []) {
      const when = isSeries ? rec.airDateUtc : rec.digitalRelease || rec.inCinemas || rec.physicalRelease;
      if (!when) continue;
      const seriesTitle = rec.series?.title || rec.seriesTitle || "";
      const ep = isSeries && rec.seasonNumber != null && rec.episodeNumber != null
        ? `S${String(rec.seasonNumber).padStart(2, "0")}E${String(rec.episodeNumber).padStart(2, "0")}${rec.title ? ` · ${rec.title}` : ""}`
        : undefined;
      // For series, prefer episode-level detail then fall back to the series record.
      const genres = (isSeries ? rec.series?.genres : rec.genres) ?? undefined;
      // Deep link into the service's web UI: Radarr /movie/{slug}, Sonarr /series/{slug}.
      const slug = isSeries ? rec.series?.titleSlug : rec.titleSlug;
      const deepPath = slug ? (isSeries ? `/series/${slug}` : `/movie/${slug}`) : undefined;
      out.push({
        id: `${serviceId}-${rec.id}`,
        title: isSeries ? seriesTitle || rec.title || "Untitled" : rec.title || "Untitled",
        kind: isSeries ? "series" : "movie",
        when,
        ep,
        svc: serviceId,
        art: arrPoster(serviceId, rec),
        year: isSeries ? rec.series?.year : rec.year,
        runtime: isSeries ? rec.series?.runtime : rec.runtime,
        rating: arrRating(isSeries ? rec.series?.ratings : rec.ratings),
        genres: genres && genres.length ? genres : undefined,
        overview: rec.overview || rec.series?.overview || undefined,
        studio: isSeries ? rec.series?.network : rec.studio,
        monitored: rec.monitored,
        hasFile: rec.hasFile,
        inCinemas: isSeries ? undefined : rec.inCinemas,
        digitalRelease: isSeries ? undefined : rec.digitalRelease,
        physicalRelease: isSeries ? undefined : rec.physicalRelease,
        deepPath,
      });
    }
    return out;
  });
}

// ── *arr — recently grabbed/imported history (cached) ──────
interface ArrHistoryRecord {
  id: number;
  eventType?: string;
  sourceTitle?: string;
  date?: string;
  movie?: { title?: string };
  series?: { title?: string };
}

export async function arrHistory(serviceId: "sonarr" | "radarr"): Promise<DownloadEvent[]> {
  return cached(`history:${serviceId}`, 3 * 60 * 1000, async () => {
    const data = await arrGet<{ records: ArrHistoryRecord[] }>(serviceId, `/api/v3/history?pageSize=30&sortKey=date&sortDirection=descending`);
    return (data.records ?? [])
      .filter((r) => r.eventType === "grabbed" || r.eventType === "downloadFolderImported")
      .map((r) => ({
        id: `${serviceId}-h${r.id}`,
        title: r.movie?.title || r.series?.title || r.sourceTitle || "Unknown",
        svc: serviceId,
        when: r.date || "",
        event: r.eventType === "downloadFolderImported" ? "imported" : "grabbed",
      }));
  });
}

// ── Radarr movie metadata (cached index) ────────────────────
const MOVIE_FILE_INDEX_TTL = 30 * 60 * 1000;
/** Radarr download/monitor state for a movie (by tmdbId). */
interface MovieMeta { monitored?: boolean; hasFile?: boolean; genres?: string[]; studio?: string }
interface MovieIndexes { fileIndex: Map<number, FileInfo>; profileIndex: Map<number, number>; metaIndex: Map<number, MovieMeta> }

export async function arrMovieIndexes(): Promise<MovieIndexes> {
  return cached("radarr:movieindexes", MOVIE_FILE_INDEX_TTL, async () => {
    type RMovie = {
      tmdbId: number;
      qualityProfileId?: number;
      monitored?: boolean;
      hasFile?: boolean;
      genres?: string[];
      studio?: string;
      movieFile?: {
        size?: number;
        quality?: { quality?: { resolution?: number; source?: string } };
        mediaInfo?: { videoCodec?: string };
      };
    };
    const movies = await arrGet<RMovie[]>("radarr", `/api/v3/movie`, 10000);
    const SOURCE: Record<string, string> = { bluray: "Blu-ray", webrip: "WEBRip", webdl: "WEB-DL", hdtv: "HDTV", dvd: "DVD", cam: "CAM" };
    const fileIndex = new Map<number, FileInfo>();
    const profileIndex = new Map<number, number>();
    const metaIndex = new Map<number, MovieMeta>();
    for (const m of movies) {
      if (!m.tmdbId) continue;
      if (m.qualityProfileId != null) profileIndex.set(m.tmdbId, m.qualityProfileId);
      metaIndex.set(m.tmdbId, { monitored: m.monitored, hasFile: m.hasFile, genres: m.genres?.length ? m.genres : undefined, studio: m.studio || undefined });
      if (!m.movieFile) continue;
      const q = m.movieFile.quality?.quality;
      const res = q?.resolution ? `${q.resolution}p` : undefined;
      const src = q?.source ? (SOURCE[q.source] ?? q.source) : undefined;
      const codec = m.movieFile.mediaInfo?.videoCodec?.toUpperCase() ?? undefined;
      const parts = [res, src, codec ? `· ${codec}` : undefined].filter(Boolean);
      fileIndex.set(m.tmdbId, { label: parts.join(" ") || "Unknown", sizeBytes: m.movieFile.size });
    }
    return { fileIndex, profileIndex, metaIndex };
  });
}

/** Radarr monitor/download state + metadata for a single movie by tmdbId (uses the cached index). */
export async function radarrMovieMeta(tmdbId: number): Promise<{ monitored?: boolean; hasFile?: boolean; fileInfo?: FileInfo; genres?: string[]; studio?: string }> {
  const { fileIndex, metaIndex } = await arrMovieIndexes();
  return { ...(metaIndex.get(tmdbId) ?? {}), fileInfo: fileIndex.get(tmdbId) };
}

/** Sonarr series monitor/download state + metadata by series id. */
export async function sonarrSeriesMeta(seriesId: number): Promise<{ monitored?: boolean; hasFile?: boolean; genres?: string[]; studio?: string }> {
  return cached(`sonarr:seriesmeta:${seriesId}`, 60_000, async () => {
    const { baseUrl, apiKey, json: afetchJson } = await serviceClient("sonarr");
    type S = { monitored?: boolean; statistics?: { episodeFileCount?: number }; genres?: string[]; network?: string };
    const s = await afetchJson<S>(`${baseUrl}/api/v3/series/${seriesId}`, {
      service: "sonarr",
      headers: { "X-Api-Key": apiKey },
      timeoutMs: 8000,
    });
    return { monitored: s.monitored, hasFile: (s.statistics?.episodeFileCount ?? 0) > 0, genres: s.genres?.length ? s.genres : undefined, studio: s.network || undefined };
  });
}

// Per-season downloaded quality for a Sonarr series (by Sonarr series id), for the
// "available qualities" section of the detail modal. Cached briefly per series.
export async function sonarrSeasonQuality(seriesId: number): Promise<SeasonQuality[]> {
  return cached(`sonarr:seasonq:${seriesId}`, 60_000, async () => {
    const { baseUrl, apiKey, json: afetchJson } = await serviceClient("sonarr");
    type Ep = {
      seasonNumber?: number;
      hasFile?: boolean;
      episodeFile?: { size?: number; quality?: { quality?: { resolution?: number; source?: string } } };
    };
    const eps = await afetchJson<Ep[]>(`${baseUrl}/api/v3/episode?seriesId=${seriesId}&includeEpisodeFile=true`, {
      service: "sonarr",
      headers: { "X-Api-Key": apiKey },
      timeoutMs: 10000,
    });
    // Sonarr reports the web source as "web" (Radarr uses "webdl"/"webrip").
    const SOURCE: Record<string, string> = { bluray: "Blu-ray", web: "WEB-DL", webdl: "WEB-DL", webrip: "WEBRip", hdtv: "HDTV", dvd: "DVD", cam: "CAM" };
    const bySeason = new Map<number, { count: number; size: number; labels: Map<string, number> }>();
    for (const e of eps) {
      if (e.seasonNumber == null) continue;
      let s = bySeason.get(e.seasonNumber);
      if (!s) { s = { count: 0, size: 0, labels: new Map() }; bySeason.set(e.seasonNumber, s); }
      if (e.hasFile && e.episodeFile) {
        s.count++;
        s.size += e.episodeFile.size ?? 0;
        const q = e.episodeFile.quality?.quality;
        const res = q?.resolution ? `${q.resolution}p` : undefined;
        const src = q?.source ? (SOURCE[q.source] ?? q.source) : undefined;
        const label = [res, src].filter(Boolean).join(" ");
        if (label) s.labels.set(label, (s.labels.get(label) ?? 0) + 1);
      }
    }
    return [...bySeason.entries()]
      .filter(([season, s]) => season > 0 && s.count > 0) // skip specials + seasons with no downloads
      .sort((a, b) => a[0] - b[0])
      .map(([season, s]) => ({
        season,
        label: [...s.labels.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "",
        episodeCount: s.count,
        sizeBytes: s.size || undefined,
      }));
  });
}

/** Build a quality profile map from the *arr directly (Radarr/Sonarr). */
export async function arrQualityProfileMap(serviceId: "radarr" | "sonarr"): Promise<Record<number, string>> {
  type ArrProfile = { id: number; name: string };
  const profiles = await arrGet<ArrProfile[]>(serviceId, `/api/v3/qualityprofile`, 5000);
  const m: Record<number, string> = {};
  for (const p of profiles) if (p.id != null && p.name) m[p.id] = p.name;
  return m;
}