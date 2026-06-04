"use client";
// ============================================================
// AERIE — widget catalog (registry for the modular homescreen)
// Maps each widget `type` to its size bounds + a render(ctx, settings) that
// returns the REAL, fill-aware panel/widget for a grid tile.
//
// The catalog is a SUPERSET of the classic hard-coded home: every
// panel that used to render there is here (so nothing is lost), plus
// the new modular widgets (Bandwidth, Clock, Shortcuts, Announcements).
// "Top Streamers" reuses the existing Tautulli-backed LeaderboardPanel.
// ============================================================
import React from "react";
import type { Role, Service, DiscoverItem } from "@/lib/types";
import { compactAll, findSlot, type Tile, type WidgetMeta } from "@/components/portal/gridLayout";
import {
  CentralServices,
  LibraryStats,
  NowPlayingPanel,
  ServiceTiles,
  StatusPanel,
  MyRequestsPanel,
  RecentlyAdded,
  UpcomingPanel,
  LeaderboardPanel,
  QueuePanel,
  DownloadsPanel,
  DiscoverFeedPanel,
} from "@/components/panels";
import { BandwidthWidget, ClockWidget, ShortcutsWidget, AnnouncementsWidget } from "@/components/widgets";

// Context handed to every widget's render() — navigation + actions wired by Home.
export interface WidgetCtx {
  role: Role;
  onNavigate: (path: string) => void;
  onOpenService: (s: Service) => void;
  onAct?: (id: string, action: "approve" | "decline") => void;
  onRequest?: (item: DiscoverItem) => void;
}

export type WidgetSettingSpec =
  | { key: string; label: string; type: "count"; hint?: string; default?: number; min?: number; max?: number }
  | { key: string; label: string; type: "select"; hint?: string; default?: string; options: { value: string; label: string }[] }
  | { key: string; label: string; type: "text"; hint?: string; default?: string }
  | { key: string; label: string; type: "toggle"; hint?: string; default?: boolean }
  | { key: string; label: string; type: "links"; hint?: string };

export interface ShortcutLink { label: string; url: string; icon?: string }

export interface CatalogEntry extends WidgetMeta {
  name: string;
  icon: string;
  accent: string;
  group: string;
  desc: string;
  defaultW: number;
  defaultH: number;
  adminOnly?: boolean;
  settings?: WidgetSettingSpec[];
  /** Snap h to the nearest "clean" height (complete content rows, no clipping). Called on resize release. */
  snapH?: (h: number) => number;
  render: (ctx: WidgetCtx, settings: Record<string, unknown>) => React.ReactNode;
}

// Snaps a grid height unit to the minimum h that fits exactly N complete poster rows without
// clipping. Formula: inner = 44h − 71, rowsFit = floor((inner + gap) / (itemH + gap)).
// Used by all FlowGrid poster widgets so resize always lands on a clean boundary.
function posterSnapH(h: number, minH: number, itemH = 155): number {
  const CELL = 44, OVERHEAD = 71, GAP = 12; // overhead = header(33) + padY*2(24) + formula-offset(14)
  const inner = CELL * h - OVERHEAD;
  const rows = Math.max(1, Math.floor((inner + GAP) / (itemH + GAP)));
  const targetInner = rows * itemH + (rows - 1) * GAP;
  const targetPx = targetInner + OVERHEAD;
  return Math.max(minH, Math.ceil(targetPx / CELL));
}

function parseLinks(raw: unknown): ShortcutLink[] {
  try { return JSON.parse(String(raw ?? "[]")) as ShortcutLink[]; } catch { return []; }
}

export const WIDGET_CATALOG: Record<string, CatalogEntry> = {
  centralServices: {
    type: "centralServices", name: "Central Services", icon: "verified", accent: "var(--originator-own)", group: "Overview",
    desc: "Big-figure uptime + heartbeat for your core streaming services.",
    defaultW: 12, defaultH: 6, minW: 5, minH: 4, maxW: 12, maxH: 10,
    render: (c, _s) => <CentralServices fill role={c.role} onOpen={c.onOpenService} onAll={() => c.onNavigate("/status")} />,
  },
  libraryStats: {
    type: "libraryStats", name: "Library Stats", icon: "video_library", accent: "var(--primary)", group: "Overview",
    desc: "Movie, show and music counts with weekly deltas.",
    defaultW: 12, defaultH: 3, minW: 3, minH: 2, maxW: 12, maxH: 4,
    render: (_c, _s) => <LibraryStats fill />,
  },
  nowPlaying: {
    type: "nowPlaying", name: "Now Playing", icon: "play_circle", accent: "var(--primary)", group: "Streaming",
    desc: "Live sessions — progress, device, codec and transcode state.",
    defaultW: 8, defaultH: 11, minW: 4, minH: 5, maxW: 12, maxH: 18,
    render: (c, _s) => <NowPlayingPanel fill role={c.role} onAll={() => c.onNavigate("/streams")} />,
  },
  serviceTiles: {
    type: "serviceTiles", name: "Services", icon: "apps", accent: "var(--on-surface-variant)", group: "Services",
    desc: "Launcher grid of every service with status and latency.",
    defaultW: 8, defaultH: 8, minW: 3, minH: 4, maxW: 12, maxH: 18,
    render: (c, _s) => <ServiceTiles fill role={c.role} onOpen={c.onOpenService} onAll={() => c.onNavigate("/services")} />,
  },
  status: {
    type: "status", name: "System Status", icon: "favorite", accent: "var(--originator-own)", group: "Monitoring",
    desc: "Per-service uptime — heartbeat strip per monitored service.",
    defaultW: 4, defaultH: 9, minW: 3, minH: 4, maxW: 12, maxH: 18,
    render: (c, _s) => <StatusPanel fill role={c.role} onAll={() => c.onNavigate("/status")} />,
  },
  myRequests: {
    type: "myRequests", name: "Requests", icon: "bookmark_added", accent: "var(--originator-court)", group: "Requests",
    desc: "Your requests — or the pending approval queue for admins.",
    defaultW: 4, defaultH: 8, minW: 3, minH: 4, maxW: 12, maxH: 16,
    settings: [
      { key: "title", label: "Card title", type: "text", hint: "Leave blank to use the default title" },
      { key: "limit", label: "Items to show", type: "count", min: 3, max: 15, hint: "Auto = 5 items" },
      { key: "view", label: "View mode", type: "select", options: [
        { value: "", label: "Auto (by role)" },
        { value: "mine", label: "My requests" },
        { value: "queue", label: "Approval queue" },
      ]},
      { key: "dense", label: "Compact rows", type: "toggle", hint: "Reduce row padding for a denser list" },
    ],
    render: (c, s) => <MyRequestsPanel fill role={c.role} onAll={() => c.onNavigate("/requests")} onAct={c.onAct} limit={s.limit != null ? Number(s.limit) : undefined} view={s.view as string | undefined} dense={s.dense as boolean | undefined} title={s.title as string | undefined} />,
  },
  recentlyAdded: {
    type: "recentlyAdded", name: "Recently Added", icon: "new_releases", accent: "var(--primary)", group: "Streaming",
    desc: "Newest titles across your libraries.",
    defaultW: 4, defaultH: 6, minW: 5, minH: 5, maxW: 12, maxH: 16,
    snapH: (h) => posterSnapH(h, 5, 150),
    settings: [
      { key: "title", label: "Card title", type: "text", hint: "Leave blank to use the default title" },
      { key: "limit", label: "Items to show", type: "count", min: 3, max: 24, hint: "Auto = show all matching items" },
      { key: "mediaKind", label: "Filter by type", type: "select", options: [
        { value: "", label: "All types" },
        { value: "movie", label: "Movies" },
        { value: "series", label: "TV Shows" },
        { value: "track", label: "Music" },
      ]},
    ],
    render: (_c, s) => <RecentlyAdded fill limit={s.limit != null ? Number(s.limit) : undefined} mediaKind={s.mediaKind as string | undefined} title={s.title as string | undefined} />,
  },
  upcoming: {
    type: "upcoming", name: "Coming Soon", icon: "event_upcoming", accent: "var(--originator-court)", group: "Streaming",
    desc: "Upcoming releases from your *arr calendars (next 7 days).",
    defaultW: 12, defaultH: 10, minW: 4, minH: 6, maxW: 12, maxH: 14,
    snapH: (h) => posterSnapH(h, 6, 150),
    settings: [
      { key: "title", label: "Card title", type: "text", hint: "Leave blank to use the default title" },
      { key: "limit", label: "Items to show", type: "count", min: 3, max: 30, hint: "Auto = up to 20 items" },
      { key: "window", label: "Time window", type: "select", default: "7", options: [
        { value: "7", label: "Next 7 days" },
        { value: "14", label: "Next 14 days" },
        { value: "30", label: "Next 30 days" },
      ]},
    ],
    render: (_c, s) => <UpcomingPanel fill limit={s.limit != null ? Number(s.limit) : undefined} window={s.window ? Number(s.window) : undefined} title={s.title as string | undefined} />,
  },
  leaderboard: {
    type: "leaderboard", name: "Top Streamers", icon: "leaderboard", accent: "var(--originator-own)", group: "Monitoring",
    desc: "Most active users and titles this week (Tautulli).",
    defaultW: 4, defaultH: 7, minW: 3, minH: 4, maxW: 8, maxH: 14,
    settings: [
      { key: "title", label: "Card title", type: "text", hint: "Leave blank to use the default title" },
      { key: "limit", label: "Users to show", type: "count", min: 3, max: 15, hint: "Auto = show all" },
    ],
    render: (_c, s) => <LeaderboardPanel fill limit={s.limit != null ? Number(s.limit) : undefined} title={s.title as string | undefined} />,
  },
  bandwidth: {
    type: "bandwidth", name: "Bandwidth", icon: "speed", accent: "var(--primary)", group: "Monitoring",
    desc: "Live streaming throughput plus host network rates.",
    defaultW: 8, defaultH: 6, minW: 4, minH: 4, maxW: 12, maxH: 10,
    render: (_c, _s) => <BandwidthWidget fill />,
  },
  queue: {
    type: "queue", name: "Download Queue", icon: "downloading", accent: "var(--originator-third-party)", group: "Automation", adminOnly: true,
    desc: "Active Sonarr / Radarr downloads with progress and ETA.",
    defaultW: 8, defaultH: 6, minW: 4, minH: 3, maxW: 12, maxH: 12,
    settings: [
      { key: "title", label: "Card title", type: "text", hint: "Leave blank to use the default title" },
      { key: "limit", label: "Items per page", type: "count", min: 3, max: 20, hint: "Auto = fit to card height" },
      { key: "dense", label: "Compact rows", type: "toggle", hint: "Reduce row padding for a denser list" },
    ],
    render: (_c, s) => <QueuePanel fill limit={s.limit != null ? Number(s.limit) : undefined} dense={s.dense as boolean | undefined} title={s.title as string | undefined} />,
  },
  downloads: {
    type: "downloads", name: "Recently Downloaded", icon: "download_done", accent: "var(--originator-third-party)", group: "Automation", adminOnly: true,
    desc: "Recently grabbed / imported downloads from *arr history.",
    defaultW: 8, defaultH: 6, minW: 4, minH: 3, maxW: 12, maxH: 12,
    settings: [
      { key: "title", label: "Card title", type: "text", hint: "Leave blank to use the default title" },
      { key: "limit", label: "Items per page", type: "count", min: 3, max: 20, hint: "Auto = fit to card height" },
      { key: "dense", label: "Compact rows", type: "toggle", hint: "Reduce row padding for a denser list" },
    ],
    render: (_c, s) => <DownloadsPanel fill limit={s.limit != null ? Number(s.limit) : undefined} dense={s.dense as boolean | undefined} title={s.title as string | undefined} />,
  },
  shortcuts: {
    type: "shortcuts", name: "Shortcuts", icon: "bolt", accent: "var(--primary)", group: "Overview",
    desc: "Custom quick-launch links — configure them via the widget settings gear.",
    defaultW: 4, defaultH: 5, minW: 3, minH: 3, maxW: 12, maxH: 10,
    settings: [
      { key: "links", label: "Quick-launch links", type: "links", hint: "Each link opens in a new tab" },
    ],
    render: (_c, s) => <ShortcutsWidget fill links={parseLinks(s.links)} />,
  },
  announcements: {
    type: "announcements", name: "Announcements", icon: "campaign", accent: "var(--amber)", group: "Overview",
    desc: "Broadcast notices and maintenance windows (configurable soon).",
    defaultW: 4, defaultH: 6, minW: 3, minH: 3, maxW: 12, maxH: 12,
    render: (_c, _s) => <AnnouncementsWidget fill />,
  },
  clock: {
    type: "clock", name: "Clock & Uptime", icon: "schedule", accent: "var(--primary)", group: "Overview",
    desc: "Local time, date and monitored-host uptime.",
    defaultW: 3, defaultH: 4, minW: 2, minH: 3, maxW: 6, maxH: 6,
    render: (_c, _s) => <ClockWidget fill />,
  },
  trendingMedia: {
    type: "trendingMedia", name: "Trending Now", icon: "trending_up", accent: "var(--originator-court)", group: "Requests",
    desc: "Trending movies and TV shows from TMDB — click to request.",
    defaultW: 8, defaultH: 6, minW: 4, minH: 6, maxW: 12, maxH: 10,
    snapH: (h) => posterSnapH(h, 6),
    settings: [
      { key: "title", label: "Card title", type: "text", hint: "Leave blank for default" },
      { key: "limit", label: "Items to show", type: "count", min: 3, max: 20, hint: "Auto = 20" },
    ],
    render: (c, s) => <DiscoverFeedPanel fill feed="trending" onRequest={c.onRequest} limit={s.limit != null ? Number(s.limit) : undefined} title={s.title as string | undefined} />,
  },
  popularMovies: {
    type: "popularMovies", name: "Popular Movies", icon: "movie", accent: "var(--originator-court)", group: "Requests",
    desc: "Popular movies on TMDB right now — click to request.",
    defaultW: 6, defaultH: 6, minW: 4, minH: 6, maxW: 12, maxH: 10,
    snapH: (h) => posterSnapH(h, 6),
    settings: [
      { key: "title", label: "Card title", type: "text", hint: "Leave blank for default" },
      { key: "limit", label: "Items to show", type: "count", min: 3, max: 20, hint: "Auto = 20" },
    ],
    render: (c, s) => <DiscoverFeedPanel fill feed="popularMovies" onRequest={c.onRequest} limit={s.limit != null ? Number(s.limit) : undefined} title={s.title as string | undefined} />,
  },
  popularTv: {
    type: "popularTv", name: "Popular TV Shows", icon: "live_tv", accent: "var(--originator-court)", group: "Requests",
    desc: "Popular TV shows on TMDB right now — click to request.",
    defaultW: 6, defaultH: 6, minW: 4, minH: 6, maxW: 12, maxH: 10,
    snapH: (h) => posterSnapH(h, 6),
    settings: [
      { key: "title", label: "Card title", type: "text", hint: "Leave blank for default" },
      { key: "limit", label: "Items to show", type: "count", min: 3, max: 20, hint: "Auto = 20" },
    ],
    render: (c, s) => <DiscoverFeedPanel fill feed="popularTv" onRequest={c.onRequest} limit={s.limit != null ? Number(s.limit) : undefined} title={s.title as string | undefined} />,
  },
  upcomingMovies: {
    type: "upcomingMovies", name: "Coming Soon", icon: "event_upcoming", accent: "var(--originator-court)", group: "Requests",
    desc: "Upcoming movie releases from TMDB — click to request.",
    defaultW: 6, defaultH: 6, minW: 4, minH: 6, maxW: 12, maxH: 10,
    snapH: (h) => posterSnapH(h, 6),
    settings: [
      { key: "title", label: "Card title", type: "text", hint: "Leave blank for default" },
      { key: "limit", label: "Items to show", type: "count", min: 3, max: 20, hint: "Auto = 20" },
    ],
    render: (c, s) => <DiscoverFeedPanel fill feed="upcomingMovies" onRequest={c.onRequest} limit={s.limit != null ? Number(s.limit) : undefined} title={s.title as string | undefined} />,
  },
  watchlist: {
    type: "watchlist", name: "Plex Watchlist", icon: "bookmarks", accent: "var(--primary)", group: "Requests",
    desc: "Titles from the Plex watchlist — click to request anything not already available.",
    defaultW: 6, defaultH: 6, minW: 4, minH: 6, maxW: 12, maxH: 10,
    snapH: (h) => posterSnapH(h, 6),
    settings: [
      { key: "title", label: "Card title", type: "text", hint: "Leave blank for default" },
      { key: "limit", label: "Items to show", type: "count", min: 3, max: 50, hint: "Auto = 50" },
    ],
    render: (c, s) => <DiscoverFeedPanel fill feed="watchlist" onRequest={c.onRequest} limit={s.limit != null ? Number(s.limit) : undefined} title={s.title as string | undefined} />,
  },
};

const META_FALLBACK: WidgetMeta = { type: "__unknown", minW: 2, minH: 2, maxW: 12, maxH: 24 };

export function widgetMeta(type: string): WidgetMeta {
  return WIDGET_CATALOG[type] ?? { ...META_FALLBACK, type };
}

/** All setting specs for a widget type; empty array if none. */
export function widgetSettings(type: string): WidgetSettingSpec[] {
  return WIDGET_CATALOG[type]?.settings ?? [];
}

/** True if the widget type has any configurable settings. */
export function hasSettings(type: string): boolean {
  return widgetSettings(type).length > 0;
}

/**
 * Merge stored per-tile settings over each spec's default.
 * Returns a plain object — render() functions read from it.
 * Keys absent from raw fall back to the spec's default (or undefined).
 */
export function resolveSettings(
  type: string,
  raw?: Record<string, string | number | boolean>
): Record<string, unknown> {
  const specs = widgetSettings(type);
  const out: Record<string, unknown> = {};
  for (const spec of specs) {
    const stored = raw?.[spec.key];
    // Treat empty string (saved "auto") or missing value as "use default"
    const def = "default" in spec ? (spec as { default?: unknown }).default : undefined;
    out[spec.key] = stored !== undefined && stored !== "" ? stored : def;
  }
  return out;
}

// Default arrangement — mirrors the classic hard-coded home, authored on the
// 12-col grid (non-overlapping so admin sees it verbatim; members get the
// admin-only tiles stripped and the rest compacted upward).
const DEFAULT_TILES: Omit<Tile, "uid">[] = [
  { type: "centralServices", x: 0, y: 0, w: 12, h: 6 },
  { type: "libraryStats", x: 0, y: 6, w: 12, h: 3 },
  { type: "upcoming", x: 0, y: 9, w: 12, h: 10 },
  { type: "nowPlaying", x: 0, y: 19, w: 8, h: 11 },
  { type: "myRequests", x: 8, y: 19, w: 4, h: 8 },
  { type: "status", x: 8, y: 27, w: 4, h: 9 },
  { type: "serviceTiles", x: 0, y: 30, w: 8, h: 8 },
  { type: "leaderboard", x: 8, y: 36, w: 4, h: 7 },
  { type: "queue", x: 0, y: 38, w: 8, h: 6 },
  { type: "recentlyAdded", x: 8, y: 43, w: 4, h: 6 },
  { type: "downloads", x: 0, y: 44, w: 8, h: 6 },
];

export function defaultLayout(role: Role): Tile[] {
  const tiles = DEFAULT_TILES.filter((t) => !(WIDGET_CATALOG[t.type]?.adminOnly && role !== "admin")).map((t, i) => ({ uid: `${t.type}-${i}`, ...t }));
  return role === "admin" ? tiles : compactAll(tiles);
}

let __wuidN = 0;
export function newWidgetInstance(type: string): Tile {
  const m = WIDGET_CATALOG[type];
  return { uid: `${type}-${Date.now().toString(36)}-${(__wuidN++).toString(36)}`, type, w: m.defaultW, h: m.defaultH, x: 0, y: 0 };
}

// Place a new widget at the first free slot of the given layout.
export function addWidgetToLayout(layout: Tile[], type: string): Tile[] {
  const inst = newWidgetInstance(type);
  const slot = findSlot(layout, inst.w, inst.h);
  inst.x = slot.x;
  inst.y = slot.y;
  return [...layout, inst];
}

// Grouped, RBAC-filtered list for the Add-widget modal.
export function catalogGroups(role: Role): { group: string; items: CatalogEntry[] }[] {
  const groups: Record<string, CatalogEntry[]> = {};
  Object.values(WIDGET_CATALOG).forEach((m) => {
    if (m.adminOnly && role !== "admin") return;
    (groups[m.group] = groups[m.group] || []).push(m);
  });
  const order = ["Overview", "Streaming", "Monitoring", "Services", "Requests", "Automation"];
  return Object.keys(groups)
    .sort((a, b) => order.indexOf(a) - order.indexOf(b))
    .map((g) => ({ group: g, items: groups[g] }));
}
