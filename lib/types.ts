// ============================================================
// AERIE — shared domain types
// ============================================================

export type Category = "stream" | "request" | "automation" | "monitor" | "infra";
export type ServiceStatus = "up" | "degraded" | "down" | "unknown";
export type Role = "admin" | "user";
export type MediaKind = "movie" | "series" | "track";
export type RequestStatus = "available" | "approved" | "pending" | "declined" | "processing" | "failed";
export type PlayMode = "direct" | "transcode";

export interface CatMeta {
  token: string;
  label: string;
}

export interface Service {
  id: string;
  name: string;
  cat: Category;
  icon: string;
  logoSlug?: string;
  embeddable: boolean;
  /** false → fully disabled: hidden from every end-user surface and never polled (config kept) */
  active: boolean;
  /** true → keep this embeddable service's iframe mounted (hidden) after first open, so switching
   *  away and back preserves its in-app state instead of reloading. No-op for non-embeddable services. */
  keepAlive: boolean;
  central?: boolean;
  centralLabel?: string;
  host: string;
  scheme: "http" | "https";
  /** optional internal/LAN URL the server uses for API calls (admin-only; never used for the iframe) */
  internalUrl?: string;
  /** skip TLS cert verification for this service's server-side API calls (self-signed LAN hosts) */
  insecureTls?: boolean;
  version: string;
  status: ServiceStatus;
  uptime: number;
  ms: number;
  /** 30-point heartbeat: 1 = up, 0.5 = degraded, 0 = down, -1 = no data (unknown) */
  beats: number[];
  /** ISO timestamp of the most recent failed health check, if any (from Gatus) */
  lastIncidentAt?: string;
  /** last ≤30 response times in ms, for a latency trend sparkline (from Gatus) */
  msHistory?: number[];
  note: string;
  monitoringKey?: string;
}

export interface NowPlaying {
  id: string;
  title: string;
  kind: MediaKind;
  year?: number;
  ep?: string;
  user: string;
  src: string;
  device: string;
  res: string;
  play: PlayMode;
  bitrate: string;
  codec: string;
  /** fractional progress 0..1 at snapshot time */
  pos: number;
  /** duration in minutes */
  dur: number;
  paused: boolean;
  /** proxied cover-art URL (/api/artwork?…), if available */
  art?: string;
  /** proxied wide backdrop/fanart URL (/api/artwork?…&kind=backdrop), if available */
  backdrop?: string;

  // ── enrichment (all optional; Jellyfin/missing data degrades gracefully) ──
  // — title detail —
  /** plot/episode synopsis */
  summary?: string;
  /** season number (series only) */
  season?: number;
  /** episode number (series only) */
  episode?: number;
  /** original air / release date, ISO "YYYY-MM-DD" */
  airDate?: string;
  /** maturity rating, e.g. "TV-MA", "PG-13" */
  contentRating?: string;
  /** genre labels */
  genres?: string[];
  /** proxied user profile photo URL (/api/artwork?…&kind=avatar), if available */
  userAvatar?: string;
  // — audiobook detail (Audiobookshelf) —
  /** narrator(s), e.g. "Roy Dotrice" */
  narrator?: string;
  /** current chapter at snapshot time (index is 1-based) */
  chapter?: { title?: string; index: number; count: number };
  // — client / app —
  /** client app platform, e.g. "Chrome", "Android", "Roku" */
  platform?: string;
  platformVersion?: string;
  /** Plex/Jellyfin product, e.g. "Plex Web", "Plex for Android" */
  product?: string;
  productVersion?: string;
  /** device OS/hardware (Tautulli `device`, e.g. "OSX"), distinct from the player name */
  devicePlatform?: string;
  /** Plex quality profile, e.g. "Original", "20 Mbps 1080p" */
  qualityProfile?: string;
  // — network —
  /** "lan" | "wan" | "cellular" */
  location?: string;
  ipPublic?: string;
  secure?: boolean;
  relayed?: boolean;
  local?: boolean;
  /** per-session bandwidth in kbps */
  sessionKbps?: number;
  /** resolved geo for the public IP (tier-2; only when Tautulli GeoLite2 is available) */
  geo?: StreamGeo;
  // — transcode detail (per stream) —
  /** "direct play" | "copy" | "transcode" */
  videoDecision?: string;
  audioDecision?: string;
  subtitleDecision?: string;
  /** hardware-assisted transcode (decode or encode) */
  hwTranscode?: boolean;
  transcodeThrottled?: boolean;
  /** transcode speed in ×realtime (e.g. 8.5) */
  transcodeSpeed?: number;
  /** transcode buffer fill 0..100 */
  transcodeProgress?: number;
  // — stream specs (source → delivered) —
  /** e.g. "Dolby Vision/HDR10", "HDR", "SDR" */
  dynamicRange?: string;
  /** e.g. "24p" */
  framerate?: string;
  sourceContainer?: string;
  streamContainer?: string;
  /** source bitrate in kbps (delivered bitrate is `bitrate`, in Mbps) */
  sourceKbps?: number;
  /** delivered video codec (source codec is `codec`) */
  streamCodec?: string;
  audioCodec?: string;
  streamAudioCodec?: string;
  audioChannels?: number;
  streamAudioChannels?: number;
  /** simplified channel layout, e.g. "5.1" */
  audioLayout?: string;
  subtitle?: { codec?: string; language?: string; transcode?: boolean };
}

export interface StreamHistoryItem {
  id: number;
  /** Main display title: movie title, episode title, or track title. */
  title: string;
  /** Season name (TV) or album (music). */
  parentTitle?: string;
  /** Show name (TV) or artist (music). */
  grandparentTitle?: string;
  kind: "movie" | "episode" | "track";
  year?: number;
  /** Best available Plex thumb path for /api/artwork. */
  thumb?: string;
  ratingKey?: number;
  /** Tautulli friendly_name. */
  user: string;
  userId?: number;
  /** Unix timestamp (seconds). */
  started: number;
  /** Unix timestamp (seconds). */
  stopped?: number;
  /** Seconds actually watched. */
  duration: number;
  pausedCounter?: number;
  platform?: string;
  player?: string;
  ipAddress?: string;
  /** Kbps. */
  bitrate?: number;
  /** Episode number (TV only). */
  mediaIndex?: number;
  /** Season number (TV only). */
  parentMediaIndex?: number;
  transcodeDecision?: "direct play" | "copy" | "transcode";
  /** 0 = in-progress, 1 = watched. */
  watchedStatus: number;
}

export interface StreamGeo {
  city?: string;
  region?: string;
  country?: string;
  /** ISO 3166-1 alpha-2 country code, e.g. "GB" */
  code?: string;
  lat?: number;
  lon?: number;
}

export interface MediaRequest {
  id: string;
  title: string;
  kind: MediaKind;
  year: number;
  /** Overseerr's numeric user id (string), the raw requester. */
  user: string;
  status: RequestStatus;
  requested: string;
  eta?: string;
  art?: string;
  requesterName?: string;
  /** The requester's Overseerr email (used to resolve `portalUser`). */
  requesterEmail?: string;
  /** Proxied Plex profile photo for the requester (from Tautulli `get_users`). */
  requesterAvatar?: string;
  /** Portal account id resolved from `requesterEmail`, set in the snapshot. */
  portalUser?: string;
  /** Season numbers explicitly requested (TV only). */
  seasons?: number[];
  /** Overview/synopsis from Overseerr media enrichment. */
  overview?: string;
  /** Resolved quality profile name from the connected *arr service. */
  qualityProfile?: string;
  /** Overseerr's internal media record id (used for posting comments). */
  mediaOverseerrId?: number;
  /** TMDB ID for the media item — used to construct Overseerr deep-links. */
  tmdbId?: number;
  /** absolute Plex web URL (app.plex.tv) for an available item (from Overseerr). */
  plexUrl?: string;
  /** Jellyfin library item id for an available item → /web/#/details?id={id}. */
  jellyfinItemId?: string;
  /** absolute Sonarr/Radarr URL Overseerr resolved for a requested/processing item. */
  serviceUrl?: string;
  /** ISO timestamp of last modification (status change etc.) — used for sort-by-modified. */
  modified?: string;
  /** Actual downloaded file quality from Radarr (movies only). */
  fileInfo?: FileInfo;
}

export interface FileInfo {
  /** Human-readable label, e.g. "2160p Blu-ray · x265". */
  label: string;
  sizeBytes?: number;
}

export interface OverseerrQuota {
  /** null = unlimited (Overseerr stores 0) */
  limit: number | null;
  days: number;
  used: number;
  remaining: number;
  restricted: boolean;
}

export interface User {
  id: string;
  name: string;
  handle: string;
  role: Role;
  email: string;
  linked: boolean;
  groups: string[];
  /** Proxied Plex profile photo (from Tautulli `get_users`), if matched. */
  avatar?: string;
  /** null when user has no Overseerr account */
  movieQuota: OverseerrQuota | null;
  tvQuota: OverseerrQuota | null;
  watching: string | null;
}

export interface LibraryStat {
  id: string;
  label: string;
  count: string;
  icon: string;
  delta: string;
}

export interface RecentItem {
  id: string;
  title: string;
  kind: MediaKind;
  year: number;
  cat: Category;
  /** proxied cover-art URL (/api/artwork?…), if available */
  art?: string;
}

export interface QueueItem {
  id: string;
  title: string;
  svc: string;
  pct: number;
  eta: string;
  speed: string;
}

/** NZBGet global download status (the rate is server-wide, not per-item). */
export interface NzbgetStatus {
  /** bytes/sec */
  downloadRate: number;
  /** total MB left across the queue */
  remainingMB: number;
  /** download paused by the user */
  paused: boolean;
  /** idle — nothing downloading */
  standby: boolean;
}

/** Which download client feeds the shared Download Queue panel. */
export type QueueSource = "arr" | "nzbget" | "qbittorrent";

/** qBittorrent global transfer stats + torrent counts. */
export interface QbittorrentStats {
  /** bytes/sec download speed */
  dlSpeed: number;
  /** bytes/sec upload speed */
  upSpeed: number;
  /** bytes downloaded this session */
  downloaded: number;
  /** bytes uploaded this session */
  uploaded: number;
  /** active downloading torrents (downloading/queued/stalled) */
  downloading: number;
  /** active seeding/uploading torrents */
  seeding: number;
  /** total torrent count */
  torrents: number;
  /** connection status from qBittorrent ("connected" | "firewalled" | "disconnected") */
  connectionStatus: string;
}

/** A discoverable title in the request modal's catalog. */
export interface DiscoverItem {
  id: string;
  title: string;
  kind: MediaKind;
  year: number;
  rating: number;
  seasons?: number;
  state: RequestStatus | null;
  overview: string;
  /** proxied cover-art URL (/api/artwork?…), if available */
  art?: string;
  // — watch/service deep-link ids, surfaced by Overseerr for synced items (all best-effort) —
  /** absolute Plex web URL (app.plex.tv) for an available item */
  plexUrl?: string;
  /** Jellyfin library item id for an available item → /web/#/details?id={id} */
  jellyfinItemId?: string;
  /** absolute Sonarr/Radarr URL Overseerr resolved for a requested/processing item */
  serviceUrl?: string;
}

/** A request quality profile option. */
export interface QualityProfile {
  id: string;
  label: string;
  sub: string;
  icon: string;
  def?: boolean;
}

/** A storage mount reported by an *arr (de-duplicated by path in the snapshot). */
export interface StorageMount {
  path: string;
  label: string;
  freeBytes: number;
  totalBytes: number;
}

/** A minimal Overseerr issue (we mainly surface the open count). */
export interface IssueItem {
  id: number;
  issueType: number;
  status: number;
}

/** A health warning/error reported by an *arr's /health endpoint. */
export interface HealthIssue {
  svc: string;
  type: string;
  message: string;
  source?: string;
  wikiUrl?: string;
}

/** An upcoming release from an *arr calendar (Sonarr episode / Radarr movie). */
export interface UpcomingItem {
  id: string;
  title: string;
  kind: MediaKind;
  /** ISO date the item airs / releases */
  when: string;
  /** episode label, e.g. "S02E05 · Title" (series only) */
  ep?: string;
  /** service id ("sonarr" | "radarr") — also the id used for the /s/{svc} embed */
  svc: string;
  art?: string;
  // — optional detail fields surfaced in the detail modal (all best-effort) —
  year?: number;
  /** runtime in minutes */
  runtime?: number;
  /** normalized critic rating, 0–10 */
  rating?: number;
  genres?: string[];
  overview?: string;
  /** Radarr studio / Sonarr network */
  studio?: string;
  monitored?: boolean;
  /** already downloaded */
  hasFile?: boolean;
  /** movie release-date breakdown (ISO) */
  inCinemas?: string;
  digitalRelease?: string;
  physicalRelease?: string;
  /** root-relative path into the service's web UI, e.g. "/movie/{slug}" */
  deepPath?: string;
}

/** A recently grabbed/imported download event from an *arr history feed. */
export interface DownloadEvent {
  id: string;
  title: string;
  svc: string;
  /** ISO timestamp of the event */
  when: string;
  /** "grabbed" | "imported" */
  event: string;
}

/** Weekly leaderboard from Tautulli home stats. */
export interface TopStats {
  users: { name: string; plays: number; avatar?: string }[];
  media: { title: string; plays: number; art?: string }[];
}

/** The signed-in portal user (from the auth session, or a dev-mode mock). */
export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  groups: string[];
}

/** A widget placed on the modular homescreen grid (12-col, fixed row height). */
export interface DashboardTile {
  uid: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Per-card user settings (item count, title override, filters). Absent = catalog defaults. */
  settings?: Record<string, string | number | boolean>;
}

/** Per-role saved homescreen arrangements, persisted to preferences.dashboards. */
export type DashboardStore = Partial<Record<Role, DashboardTile[]>>;
