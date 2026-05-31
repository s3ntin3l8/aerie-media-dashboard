// ============================================================
// AERIE — mock data (ported from the design prototype's data.jsx)
// Drives the pixel-faithful frontend until real integrations land.
// ============================================================
import type {
  CatMeta,
  Category,
  DiscoverItem,
  LibraryStat,
  MediaRequest,
  NowPlaying,
  QualityProfile,
  QueueItem,
  RecentItem,
  Service,
  User,
} from "@/lib/types";

// Service-category accent system (reframed originator palette).
export const CAT: Record<Category, CatMeta> = {
  stream: { token: "var(--primary)", label: "Streaming" },
  request: { token: "var(--originator-court)", label: "Requests" },
  automation: { token: "var(--originator-third-party)", label: "Automation" },
  monitor: { token: "var(--originator-own)", label: "Monitoring" },
  infra: { token: "var(--originator-unknown)", label: "Infra" },
};

export function catColor(cat: Category): string {
  return (CAT[cat] || CAT.infra).token;
}

// Synthetic 30-point heartbeat (1 = up, 0.5 = degraded, 0 = down). Mostly up.
function beat(downAt: number[] = [], degAt: number[] = []): number[] {
  return Array.from({ length: 30 }, (_, i) =>
    downAt.includes(i) ? 0 : degAt.includes(i) ? 0.5 : 1,
  );
}

export const SERVICES: Service[] = [
  { id: "plex", name: "Plex", cat: "stream", icon: "play_circle", embeddable: false, central: true, centralLabel: "Stream", host: "app.plex.tv", version: "1.41.3", status: "up", uptime: 99.98, ms: 88, beats: beat(), note: "External · launch only" },
  { id: "jellyfin", name: "Jellyfin", cat: "stream", icon: "smart_display", embeddable: true, central: true, centralLabel: "Stream", host: "jellyfin.aerie.tv", version: "10.9.6", status: "up", uptime: 99.91, ms: 41, beats: beat(), note: "Embeds in portal" },
  { id: "overseerr", name: "Overseerr", cat: "request", icon: "playlist_add", embeddable: true, central: true, centralLabel: "Requests", host: "requests.aerie.tv", version: "1.33.2", status: "up", uptime: 99.99, ms: 36, beats: beat(), note: "Per-user requests" },
  { id: "sonarr", name: "Sonarr", cat: "automation", icon: "live_tv", embeddable: true, host: "sonarr.aerie.tv", version: "4.0.10", status: "up", uptime: 99.87, ms: 52, beats: beat([], [21]), note: "TV automation" },
  { id: "radarr", name: "Radarr", cat: "automation", icon: "movie", embeddable: true, host: "radarr.aerie.tv", version: "5.14.0", status: "degraded", uptime: 98.4, ms: 240, beats: beat([], [24, 25, 26]), note: "Slow indexer response" },
  { id: "tautulli", name: "Tautulli", cat: "monitor", icon: "monitoring", embeddable: true, host: "tautulli.aerie.tv", version: "2.14.6", status: "up", uptime: 99.95, ms: 47, beats: beat(), note: "Plex stats" },
  { id: "jellystat", name: "Jellystat", cat: "monitor", icon: "insights", embeddable: true, host: "jellystat.aerie.tv", version: "1.1.4", status: "up", uptime: 99.8, ms: 63, beats: beat(), note: "Jellyfin stats" },
  { id: "prowlarr", name: "Prowlarr", cat: "automation", icon: "travel_explore", embeddable: true, host: "prowlarr.aerie.tv", version: "1.24.3", status: "up", uptime: 99.72, ms: 71, beats: beat(), note: "Indexer manager" },
  { id: "qbittorrent", name: "qBittorrent", cat: "automation", icon: "downloading", embeddable: true, host: "qbit.aerie.tv", version: "4.6.5", status: "up", uptime: 99.6, ms: 58, beats: beat([5]), note: "Download client" },
  { id: "gatus", name: "Gatus", cat: "monitor", icon: "favorite", embeddable: true, host: "status.aerie.tv", version: "5.11.0", status: "up", uptime: 100.0, ms: 22, beats: beat(), note: "Status engine" },
  { id: "prometheus", name: "Prometheus", cat: "monitor", icon: "query_stats", embeddable: true, host: "metrics.aerie.tv", version: "2.53.0", status: "up", uptime: 99.99, ms: 31, beats: beat(), note: "Metrics · admin" },
  { id: "authentik", name: "Authentik", cat: "infra", icon: "shield_person", embeddable: false, host: "auth.aerie.tv", version: "2024.6", status: "up", uptime: 100.0, ms: 19, beats: beat(), note: "Identity · OIDC" },
];

export const NOW_PLAYING: NowPlaying[] = [
  { id: "np1", title: "Dune: Part Two", kind: "movie", year: 2024, user: "marco", src: "plex", device: "Living Room · Apple TV", res: "4K HDR", play: "direct", bitrate: "38.4", codec: "HEVC", pos: 0.42, dur: 166, paused: false },
  { id: "np2", title: "The Bear", kind: "series", ep: "S03E04 · Violet", user: "lena", src: "jellyfin", device: "Bedroom · Firefox", res: "1080p", play: "transcode", bitrate: "6.1", codec: "H.264", pos: 0.18, dur: 31, paused: false },
  { id: "np3", title: "Oppenheimer", kind: "movie", year: 2023, user: "you", src: "plex", device: "Study · Plex HTPC", res: "1080p", play: "direct", bitrate: "18.0", codec: "H.264", pos: 0.71, dur: 180, paused: true },
  { id: "np4", title: "Blue Note — Jazz Mix", kind: "track", ep: "Plexamp · Hand-Built", user: "theo", src: "plex", device: "Kitchen · Sonos", res: "FLAC", play: "direct", bitrate: "1.0", codec: "FLAC", pos: 0.55, dur: 4, paused: false },
];

export const REQUESTS: MediaRequest[] = [
  { id: "rq-2041", title: "Shogun", kind: "series", year: 2024, user: "you", status: "available", requested: "12 May", poster: "sg" },
  { id: "rq-2055", title: "Furiosa", kind: "movie", year: 2024, user: "you", status: "approved", requested: "21 May", eta: "Downloading · 64%", poster: "fu" },
  { id: "rq-2061", title: "Fallout", kind: "series", year: 2024, user: "you", status: "pending", requested: "28 May", poster: "fo" },
  { id: "rq-2062", title: "The Wild Robot", kind: "movie", year: 2024, user: "marco", status: "pending", requested: "29 May", poster: "wr" },
  { id: "rq-2063", title: "Ripley", kind: "series", year: 2024, user: "lena", status: "pending", requested: "29 May", poster: "rp" },
  { id: "rq-2058", title: "Civil War", kind: "movie", year: 2024, user: "theo", status: "approved", requested: "24 May", eta: "Queued", poster: "cw" },
  { id: "rq-2049", title: "Hit Man", kind: "movie", year: 2024, user: "marco", status: "available", requested: "18 May", poster: "hm" },
];

export const USERS: User[] = [
  { id: "you", name: "Björn", handle: "bjoern", role: "admin", email: "bjoern@aerie.tv", linked: true, groups: ["admins"], reqUsed: 2, reqQuota: 10, watching: "np3" },
  { id: "marco", name: "Marco", handle: "marco", role: "user", email: "marco@gmail.com", linked: true, groups: ["friends"], reqUsed: 4, reqQuota: 5, watching: "np1" },
  { id: "lena", name: "Lena", handle: "lena", role: "user", email: "lena@gmail.com", linked: true, groups: ["friends"], reqUsed: 1, reqQuota: 5, watching: "np2" },
  { id: "theo", name: "Theo", handle: "theo", role: "user", email: "theo@proton.me", linked: false, groups: ["friends"], reqUsed: 3, reqQuota: 5, watching: "np4" },
  { id: "priya", name: "Priya", handle: "priya", role: "user", email: "priya@gmail.com", linked: true, groups: ["friends"], reqUsed: 0, reqQuota: 5, watching: null },
  { id: "sam", name: "Sam", handle: "sam", role: "user", email: "sam@gmail.com", linked: true, groups: ["friends"], reqUsed: 5, reqQuota: 5, watching: null },
];

export const LIBRARY: LibraryStat[] = [
  { id: "movies", label: "Movies", count: "2,481", icon: "movie", delta: "+12 this week" },
  { id: "shows", label: "TV Shows", count: "418", icon: "live_tv", delta: "+3 series" },
  { id: "music", label: "Music", count: "38,902", icon: "library_music", delta: "1,204 albums" },
  { id: "plays", label: "Plays 24h", count: "146", icon: "play_arrow", delta: "9 active now" },
];

// 24h plays sparkline (per-hour stream count) for the header ticker.
export const PLAYS_24H: number[] = [2, 1, 0, 0, 1, 3, 4, 2, 1, 2, 5, 6, 4, 3, 2, 4, 7, 9, 8, 6, 9, 7, 5, 3];

export const RECENT: RecentItem[] = [
  { id: "ra1", title: "Shōgun", kind: "series", year: 2024, cat: "stream" },
  { id: "ra2", title: "Dune: Part Two", kind: "movie", year: 2024, cat: "stream" },
  { id: "ra3", title: "Ripley", kind: "series", year: 2024, cat: "stream" },
  { id: "ra4", title: "Challengers", kind: "movie", year: 2024, cat: "stream" },
  { id: "ra5", title: "The Bear", kind: "series", year: 2024, cat: "stream" },
  { id: "ra6", title: "Civil War", kind: "movie", year: 2024, cat: "stream" },
];

export const QUEUE: QueueItem[] = [
  { id: "q1", title: "Furiosa (2024) · 2160p", svc: "radarr", pct: 64, eta: "14m", speed: "22.4 MB/s" },
  { id: "q2", title: "Fallout S01E06 · 1080p", svc: "sonarr", pct: 91, eta: "3m", speed: "8.1 MB/s" },
  { id: "q3", title: "Shōgun S01E09 · 1080p", svc: "sonarr", pct: 12, eta: "38m", speed: "4.6 MB/s" },
];

// Request quality profiles (request modal).
export const QUALITY_PROFILES: QualityProfile[] = [
  { id: "hd1080", label: "1080p", sub: "HD · Bluray/WEB", icon: "hd", def: true },
  { id: "uhd4k", label: "4K HDR", sub: "2160p · Dolby Vision", icon: "4k" },
  { id: "any", label: "Any", sub: "First available", icon: "auto_awesome" },
];

// Discover catalog — TMDB-style results for "request media". `state` ties to the request queue.
export const DISCOVER: DiscoverItem[] = [
  { id: "d1", title: "Severance", kind: "series", year: 2022, rating: 8.7, seasons: 2, state: "available", overview: "Office workers undergo a procedure that splits their work and personal memories." },
  { id: "d2", title: "The Substance", kind: "movie", year: 2024, rating: 7.3, state: null, overview: "A fading star takes a black-market drug that generates a younger version of herself." },
  { id: "d3", title: "Fallout", kind: "series", year: 2024, rating: 8.4, seasons: 1, state: "pending", overview: "A vault dweller ventures into a post-nuclear wasteland in search of her father." },
  { id: "d4", title: "Furiosa", kind: "movie", year: 2024, rating: 7.6, state: "approved", overview: "The origin of the warrior Furiosa before she joined forces with Mad Max." },
  { id: "d5", title: "Shōgun", kind: "series", year: 2024, rating: 8.6, seasons: 1, state: "available", overview: "A English pilot is shipwrecked in feudal Japan amid a brewing power struggle." },
  { id: "d6", title: "Challengers", kind: "movie", year: 2024, rating: 7.1, state: null, overview: "A former tennis prodigy turned coach reshapes the rivalry between two players." },
  { id: "d7", title: "Ripley", kind: "series", year: 2024, rating: 8.0, seasons: 1, state: "pending", overview: "A grifter in 1960s Italy is hired to retrieve a wealthy heir — and assumes his life." },
  { id: "d8", title: "Hit Man", kind: "movie", year: 2024, rating: 6.9, state: "available", overview: "A professor moonlighting as a fake hitman gets entangled with a would-be client." },
  { id: "d9", title: "The Penguin", kind: "series", year: 2024, rating: 8.1, seasons: 1, state: null, overview: "A Gotham crime lieutenant claws his way toward control of the city underworld." },
  { id: "d10", title: "Civil War", kind: "movie", year: 2024, rating: 7.0, state: "approved", overview: "A team of journalists treks across a fractured America during a near-future conflict." },
];
