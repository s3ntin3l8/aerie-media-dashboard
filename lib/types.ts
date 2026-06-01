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
  version: string;
  status: ServiceStatus;
  uptime: number;
  ms: number;
  /** 30-point heartbeat: 1 = up, 0.5 = degraded, 0 = down, -1 = no data (unknown) */
  beats: number[];
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
  user: string;
  status: RequestStatus;
  requested: string;
  eta?: string;
  art?: string;
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
}

/** A request quality profile option. */
export interface QualityProfile {
  id: string;
  label: string;
  sub: string;
  icon: string;
  def?: boolean;
}

/** The signed-in portal user (from the auth session, or a dev-mode mock). */
export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  groups: string[];
}
