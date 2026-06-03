"use client";
// ============================================================
// AERIE — widget catalog (registry for the modular homescreen)
// Maps each widget `type` to its size bounds + a render(ctx) that
// returns the REAL, fill-aware panel/widget for a grid tile.
//
// The catalog is a SUPERSET of the classic hard-coded home: every
// panel that used to render there is here (so nothing is lost), plus
// the new modular widgets (Bandwidth, Clock, Shortcuts, Announcements).
// "Top Streamers" reuses the existing Tautulli-backed LeaderboardPanel.
// ============================================================
import React from "react";
import type { Role, Service } from "@/lib/types";
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
} from "@/components/panels";
import { BandwidthWidget, ClockWidget, ShortcutsWidget, AnnouncementsWidget } from "@/components/widgets";

// Context handed to every widget's render() — navigation + actions wired by Home.
export interface WidgetCtx {
  role: Role;
  onNavigate: (path: string) => void;
  onOpenService: (s: Service) => void;
  onAct?: (id: string, action: "approve" | "decline") => void;
}

export interface CatalogEntry extends WidgetMeta {
  name: string;
  icon: string;
  accent: string;
  group: string;
  desc: string;
  defaultW: number;
  defaultH: number;
  adminOnly?: boolean;
  render: (ctx: WidgetCtx) => React.ReactNode;
}

export const WIDGET_CATALOG: Record<string, CatalogEntry> = {
  centralServices: {
    type: "centralServices", name: "Central Services", icon: "verified", accent: "var(--originator-own)", group: "Overview",
    desc: "Big-figure uptime + heartbeat for your core streaming services.",
    defaultW: 12, defaultH: 6, minW: 5, minH: 4, maxW: 12, maxH: 10,
    render: (c) => <CentralServices fill role={c.role} onOpen={c.onOpenService} onAll={() => c.onNavigate("/status")} />,
  },
  libraryStats: {
    type: "libraryStats", name: "Library Stats", icon: "video_library", accent: "var(--primary)", group: "Overview",
    desc: "Movie, show and music counts with weekly deltas.",
    defaultW: 12, defaultH: 3, minW: 3, minH: 2, maxW: 12, maxH: 4,
    render: () => <LibraryStats fill />,
  },
  nowPlaying: {
    type: "nowPlaying", name: "Now Playing", icon: "play_circle", accent: "var(--primary)", group: "Streaming",
    desc: "Live sessions — progress, device, codec and transcode state.",
    defaultW: 8, defaultH: 11, minW: 4, minH: 5, maxW: 12, maxH: 18,
    render: (c) => <NowPlayingPanel fill role={c.role} onAll={() => c.onNavigate("/streams")} />,
  },
  serviceTiles: {
    type: "serviceTiles", name: "Services", icon: "apps", accent: "var(--on-surface-variant)", group: "Services",
    desc: "Launcher grid of every service with status and latency.",
    defaultW: 8, defaultH: 8, minW: 3, minH: 4, maxW: 12, maxH: 18,
    render: (c) => <ServiceTiles fill role={c.role} onOpen={c.onOpenService} onAll={() => c.onNavigate("/services")} />,
  },
  status: {
    type: "status", name: "System Status", icon: "favorite", accent: "var(--originator-own)", group: "Monitoring",
    desc: "Per-service uptime — heartbeat strip per monitored service.",
    defaultW: 4, defaultH: 9, minW: 3, minH: 4, maxW: 12, maxH: 18,
    render: (c) => <StatusPanel fill role={c.role} onAll={() => c.onNavigate("/status")} />,
  },
  myRequests: {
    type: "myRequests", name: "Requests", icon: "bookmark_added", accent: "var(--originator-court)", group: "Requests",
    desc: "Your requests — or the pending approval queue for admins.",
    defaultW: 4, defaultH: 8, minW: 3, minH: 4, maxW: 12, maxH: 16,
    render: (c) => <MyRequestsPanel fill role={c.role} onAll={() => c.onNavigate("/requests")} onAct={c.onAct} />,
  },
  recentlyAdded: {
    type: "recentlyAdded", name: "Recently Added", icon: "new_releases", accent: "var(--primary)", group: "Streaming",
    desc: "Newest titles across your libraries.",
    defaultW: 4, defaultH: 6, minW: 3, minH: 5, maxW: 12, maxH: 16,
    render: () => <RecentlyAdded fill />,
  },
  upcoming: {
    type: "upcoming", name: "Coming Soon", icon: "event_upcoming", accent: "var(--originator-court)", group: "Streaming",
    desc: "Upcoming releases from your *arr calendars (next 7 days).",
    defaultW: 12, defaultH: 10, minW: 4, minH: 4, maxW: 12, maxH: 14,
    render: () => <UpcomingPanel fill />,
  },
  leaderboard: {
    type: "leaderboard", name: "Top Streamers", icon: "leaderboard", accent: "var(--originator-own)", group: "Monitoring",
    desc: "Most active users and titles this week (Tautulli).",
    defaultW: 4, defaultH: 7, minW: 3, minH: 4, maxW: 8, maxH: 14,
    render: () => <LeaderboardPanel fill />,
  },
  bandwidth: {
    type: "bandwidth", name: "Bandwidth", icon: "speed", accent: "var(--primary)", group: "Monitoring",
    desc: "Live streaming throughput plus host network rates.",
    defaultW: 8, defaultH: 6, minW: 4, minH: 4, maxW: 12, maxH: 10,
    render: () => <BandwidthWidget fill />,
  },
  queue: {
    type: "queue", name: "Download Queue", icon: "downloading", accent: "var(--originator-third-party)", group: "Automation", adminOnly: true,
    desc: "Active Sonarr / Radarr downloads with progress and ETA.",
    defaultW: 8, defaultH: 6, minW: 4, minH: 3, maxW: 12, maxH: 12,
    render: () => <QueuePanel fill />,
  },
  downloads: {
    type: "downloads", name: "Recently Downloaded", icon: "download_done", accent: "var(--originator-third-party)", group: "Automation", adminOnly: true,
    desc: "Recently grabbed / imported downloads from *arr history.",
    defaultW: 8, defaultH: 6, minW: 4, minH: 3, maxW: 12, maxH: 12,
    render: () => <DownloadsPanel fill />,
  },
  shortcuts: {
    type: "shortcuts", name: "Shortcuts", icon: "bolt", accent: "var(--primary)", group: "Overview",
    desc: "Custom quick-launch links (configurable soon).",
    defaultW: 4, defaultH: 5, minW: 3, minH: 3, maxW: 12, maxH: 10,
    render: () => <ShortcutsWidget fill />,
  },
  announcements: {
    type: "announcements", name: "Announcements", icon: "campaign", accent: "var(--amber)", group: "Overview",
    desc: "Broadcast notices and maintenance windows (configurable soon).",
    defaultW: 4, defaultH: 6, minW: 3, minH: 3, maxW: 12, maxH: 12,
    render: () => <AnnouncementsWidget fill />,
  },
  clock: {
    type: "clock", name: "Clock & Uptime", icon: "schedule", accent: "var(--primary)", group: "Overview",
    desc: "Local time, date and monitored-host uptime.",
    defaultW: 3, defaultH: 4, minW: 2, minH: 3, maxW: 6, maxH: 6,
    render: () => <ClockWidget fill />,
  },
};

const META_FALLBACK: WidgetMeta = { type: "__unknown", minW: 2, minH: 2, maxW: 12, maxH: 24 };

export function widgetMeta(type: string): WidgetMeta {
  return WIDGET_CATALOG[type] ?? { ...META_FALLBACK, type };
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
