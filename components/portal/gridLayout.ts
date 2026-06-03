// ============================================================
// AERIE — snap-to-grid layout math (pure, no React)
// 12-col grid · vertical packing · per-tile min/max bounds.
// Shared by GridDashboard (rendering) and the widget catalog
// (default layout / new-instance placement).
// ============================================================

import type { DashboardTile, DashboardStore } from "@/lib/types";

// `Tile` is the grid-local alias for the persisted DashboardTile domain type.
export type Tile = DashboardTile;
export type { DashboardStore };

export interface WidgetMeta {
  type: string;
  minW: number;
  minH: number;
  maxW: number;
  maxH: number;
}

export const GRID = { cols: 12, rowH: 30, gap: 14, stackBelow: 720 } as const;

const overlap = (a: Tile, b: Tile) => a.uid !== b.uid && a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

const collides = (arr: Tile[], it: Tile) => arr.some((o) => overlap(o, it));

export const gridSort = (a: Tile[]) => [...a].sort((p, q) => p.y - q.y || p.x - q.x);

// Pin `anchorUid` where it is; pack every other tile upward around it.
export function packAround(items: Tile[], anchorUid: string): Tile[] {
  const anchor = items.find((i) => i.uid === anchorUid);
  const placed: Tile[] = anchor ? [{ ...anchor }] : [];
  for (const it of gridSort(items.filter((i) => i.uid !== anchorUid))) {
    const t = { ...it, y: 0 };
    while (collides(placed, t)) t.y++;
    placed.push(t);
  }
  return placed;
}

// Full vertical compaction with no fixed anchor (used after removing a tile).
export function compactAll(items: Tile[]): Tile[] {
  const placed: Tile[] = [];
  for (const it of gridSort(items)) {
    const t = { ...it, y: 0 };
    while (collides(placed, t)) t.y++;
    placed.push(t);
  }
  return placed;
}

// First free top-left slot for a new w×h tile.
export function findSlot(items: Tile[], w: number, h: number, cols = GRID.cols): { x: number; y: number } {
  for (let y = 0; y < 2000; y++) {
    for (let x = 0; x <= cols - w; x++) {
      if (!collides(items, { uid: "__n", type: "__n", x, y, w, h })) return { x, y };
    }
  }
  return { x: 0, y: 0 };
}
