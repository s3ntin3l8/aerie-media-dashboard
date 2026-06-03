// ============================================================
// AERIE — shared domain types
// ============================================================

export type Category = "stream" | "request" | "automation" | "monitor" | "infra";
export type ServiceStatus = "up" | "degraded" | "down" | "unknown";
export type Role = "admin" | "user";
export type MediaKind = "movie" | "series" | "track";
export type RequestStatus = "available" | "approved" | "pending" | "declined";
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
  central?: boolean;
  centralLabel?: string;
  host: string;
  scheme: "http" | "https";
  /** optional internal/LAN URL the server uses for API calls (admin-only; never used for the iframe) */
  internalUrl?: string;
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
  /** Portal account id resolved from `requesterEmail`, set in the snapshot. */
  portalUser?: string;
}

export interface User {
  id: string;
  name: string;
  handle: string;
  role: Role;
  email: string;
  linked: boolean;
  groups: string[];
  reqUsed: number;
  reqQuota: number;
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
  svc: string;
  art?: string;
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
  users: { name: string; plays: number }[];
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
}

/** Per-role saved homescreen arrangements, persisted to preferences.dashboards. */
export type DashboardStore = Partial<Record<Role, DashboardTile[]>>;
