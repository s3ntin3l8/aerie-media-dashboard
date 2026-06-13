import { describe, it, expect } from "vitest";
import { gridSort, packAround, compactAll, findSlot, GRID, type Tile } from "@/components/portal/gridLayout";

// Pure 12-col snap-to-grid packing math (no React). Complements layout-migration.test.ts
// (which only covers migrateLayout) with the placement/compaction/slot-finding logic.
const t = (uid: string, x: number, y: number, w = 3, h = 2): Tile => ({ uid, type: "x", x, y, w, h });
const pos = (tiles: Tile[]) => Object.fromEntries(tiles.map((it) => [it.uid, [it.x, it.y]]));

describe("gridSort", () => {
  it("orders by y, then x (top-to-bottom, left-to-right)", () => {
    const out = gridSort([t("a", 0, 2), t("b", 3, 0), t("c", 0, 0)]);
    expect(out.map((it) => it.uid)).toEqual(["c", "b", "a"]);
  });
  it("does not mutate the input array", () => {
    const input = [t("a", 0, 2), t("b", 0, 0)];
    gridSort(input);
    expect(input.map((it) => it.uid)).toEqual(["a", "b"]);
  });
});

describe("findSlot", () => {
  it("returns the top-left on an empty grid", () => {
    expect(findSlot([], 3, 4)).toEqual({ x: 0, y: 0 });
  });

  it("drops below a full-width occupant", () => {
    expect(findSlot([t("a", 0, 0, GRID.cols, 2)], 3, 4)).toEqual({ x: 0, y: 2 });
  });

  it("respects the column width bound (can't place past cols - w)", () => {
    // a 10-wide tile leaves no 3-wide slot on row 0 (x must be ≤ 9 yet clear of x0..10),
    // so the slot falls to the next free row.
    expect(findSlot([t("a", 0, 0, 10, 2)], 3, 2)).toEqual({ x: 0, y: 2 });
  });

  it("fills a gap to the right of a narrow occupant", () => {
    expect(findSlot([t("a", 0, 0, 4, 2)], 3, 2)).toEqual({ x: 4, y: 0 });
  });
});

describe("compactAll", () => {
  it("pulls tiles up to remove vertical gaps", () => {
    const out = compactAll([t("a", 0, 0), t("b", 0, 5)]);
    expect(pos(out)).toEqual({ a: [0, 0], b: [0, 2] }); // b drops from y5 to just under a
  });

  it("keeps non-overlapping side-by-side tiles on the same row", () => {
    const out = compactAll([t("a", 0, 3, 3, 2), t("b", 6, 4, 3, 2)]);
    expect(pos(out)).toEqual({ a: [0, 0], b: [6, 0] });
  });

  it("produces a collision-free layout", () => {
    const out = compactAll([t("a", 0, 9), t("b", 0, 0), t("c", 1, 0)]);
    const overlaps = out.some((p) =>
      out.some((q) => p.uid !== q.uid && p.x < q.x + q.w && p.x + p.w > q.x && p.y < q.y + q.h && p.y + p.h > q.y),
    );
    expect(overlaps).toBe(false);
  });
});

describe("packAround", () => {
  it("pins the anchor in place and packs others around it", () => {
    // anchor sits at y4; a tile at the top stays at the top (no overlap), anchor unmoved.
    const out = packAround([t("anchor", 0, 4), t("b", 0, 0)], "anchor");
    expect(pos(out)).toMatchObject({ anchor: [0, 4], b: [0, 0] });
  });

  it("pushes an overlapping tile off the pinned anchor", () => {
    const out = packAround([t("anchor", 0, 0), t("b", 0, 0)], "anchor");
    expect(pos(out)).toEqual({ anchor: [0, 0], b: [0, 2] });
  });

  it("compacts everything when the anchor uid is absent", () => {
    const out = packAround([t("a", 0, 0), t("b", 0, 5)], "missing");
    expect(pos(out)).toEqual({ a: [0, 0], b: [0, 2] });
  });
});
