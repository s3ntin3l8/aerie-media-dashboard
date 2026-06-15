import { describe, it, expect } from "vitest";
import { mobileStack, reorderUids, type Tile, type MobileOverlay } from "@/components/portal/gridLayout";

// Pure layout helpers backing the modular mobile stack. mobileStack resolves the single-column
// order from the shared tile set + an optional overlay; reorderUids does a neighbour swap.

const t = (uid: string, y: number): Tile => ({ uid, type: "status", x: 0, y, w: 12, h: 3 });
// a,b,c in grid-position order (gridSort = by y, then x)
const layout = [t("a", 0), t("b", 3), t("c", 6)];

describe("mobileStack", () => {
  it("falls back to grid-position order when no overlay", () => {
    const { visible, hidden } = mobileStack(layout);
    expect(visible.map((x) => x.uid)).toEqual(["a", "b", "c"]);
    expect(hidden).toEqual([]);
  });

  it("honours overlay.order", () => {
    const overlay: MobileOverlay = { order: ["c", "a", "b"], hidden: [] };
    expect(mobileStack(layout, overlay).visible.map((x) => x.uid)).toEqual(["c", "a", "b"]);
  });

  it("appends tiles missing from order, in grid-position order (new widgets land at the bottom)", () => {
    const overlay: MobileOverlay = { order: ["c"], hidden: [] };
    expect(mobileStack(layout, overlay).visible.map((x) => x.uid)).toEqual(["c", "a", "b"]);
  });

  it("excludes hidden uids from visible and surfaces them (grid order) in hidden", () => {
    const overlay: MobileOverlay = { order: ["c", "a", "b"], hidden: ["b"] };
    const { visible, hidden } = mobileStack(layout, overlay);
    expect(visible.map((x) => x.uid)).toEqual(["c", "a"]);
    expect(hidden.map((x) => x.uid)).toEqual(["b"]);
  });

  it("prunes stale uids (no matching tile) from order and hidden", () => {
    const overlay: MobileOverlay = { order: ["gone", "a"], hidden: ["alsoGone"] };
    const { visible, hidden } = mobileStack(layout, overlay);
    expect(visible.map((x) => x.uid)).toEqual(["a", "b", "c"]);
    expect(hidden).toEqual([]);
  });
});

describe("reorderUids", () => {
  it("swaps a uid down", () => {
    expect(reorderUids(["a", "b", "c"], "b", 1)).toEqual(["a", "c", "b"]);
  });
  it("swaps a uid up", () => {
    expect(reorderUids(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
  });
  it("is a no-op at the top edge (returns the same array reference)", () => {
    const arr = ["a", "b", "c"];
    expect(reorderUids(arr, "a", -1)).toBe(arr);
  });
  it("is a no-op at the bottom edge", () => {
    const arr = ["a", "b", "c"];
    expect(reorderUids(arr, "c", 1)).toBe(arr);
  });
  it("is a no-op for an unknown uid", () => {
    const arr = ["a", "b", "c"];
    expect(reorderUids(arr, "z", -1)).toBe(arr);
  });
});
