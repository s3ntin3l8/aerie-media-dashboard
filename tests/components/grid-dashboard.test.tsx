import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

// GridDashboard renders tiles from a layout, wires per-tile remove/configure buttons, and
// exposes the resize/drag chrome only while editing. GridDashboard reads only widgetMeta() +
// hasSettings() from the widget catalog; the real catalog imports server-only panels, so we
// stub those two functions with simple per-type metadata (the layout math itself is the real
// gridLayout module). The render(widget) callback is supplied by the parent.
vi.mock("@/components/portal/widgetCatalog", () => ({
  widgetMeta: (type: string) => ({ type, minW: 2, minH: 2, maxW: 12, maxH: 24 }),
  // "myRequests" stands in for a widget with configurable settings; everything else has none.
  hasSettings: (type: string) => type === "myRequests",
  // The stacked "Hidden on this device" list reads a display name from the catalog; empty stub
  // → the component falls back to the tile type, which is all these tests need.
  WIDGET_CATALOG: {},
}));

import { GridDashboard } from "@/components/portal/GridDashboard";
import { useStacked } from "@/components/portal/StackedContext";
import type { Tile } from "@/components/portal/gridLayout";

const tile = (over: Partial<Tile> = {}): Tile => ({
  uid: "t1",
  type: "status", // a real catalog type with NO settings (hasSettings → false)
  x: 0,
  y: 0,
  w: 4,
  h: 4,
  ...over,
});

// "myRequests" has a settings spec → hasSettings true → the gear (configure) button renders.
const configurable = (over: Partial<Tile> = {}): Tile =>
  tile({ uid: "cfg", type: "myRequests", ...over });

const renderWidget = (item: Tile) => <div data-testid={`widget-${item.uid}`}>{item.type}</div>;

// Force the desktop grid path (W must be >= GRID.stackBelow = 720). jsdom reports clientWidth 0,
// so the component's measure() collapses to the stacked single-column layout unless we stub it.
function withGridWidth(px: number) {
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => px });
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  // Drop the clientWidth override so the next test starts from jsdom's default (0 → stacked).
  delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
});

describe("GridDashboard — rendering", () => {
  it("renders one widget body per layout tile (stacked / mobile path)", () => {
    const layout = [tile({ uid: "a" }), tile({ uid: "b", y: 4 }), tile({ uid: "c", y: 8 })];
    render(
      <GridDashboard layout={layout} onChange={vi.fn()} editing={false} renderWidget={renderWidget} onRemove={vi.fn()} onConfigure={vi.fn()} />,
    );
    expect(screen.getByTestId("widget-a")).toBeInTheDocument();
    expect(screen.getByTestId("widget-b")).toBeInTheDocument();
    expect(screen.getByTestId("widget-c")).toBeInTheDocument();
  });

  it("hides edit chrome when not editing (no remove/resize buttons)", () => {
    render(
      <GridDashboard layout={[tile()]} onChange={vi.fn()} editing={false} renderWidget={renderWidget} onRemove={vi.fn()} onConfigure={vi.fn()} />,
    );
    expect(screen.queryByTitle("Remove")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Remove widget")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Widget settings")).not.toBeInTheDocument();
  });
});

describe("GridDashboard — edit mode (stacked)", () => {
  it("renders the visible stack in overlay order", () => {
    const layout = [tile({ uid: "a" }), tile({ uid: "b", y: 4 }), tile({ uid: "c", y: 8 })];
    render(
      <GridDashboard
        layout={layout}
        onChange={vi.fn()}
        editing
        renderWidget={renderWidget}
        onRemove={vi.fn()}
        onConfigure={vi.fn()}
        mobileOverlay={{ order: ["c", "a", "b"], hidden: [] }}
      />,
    );
    const order = screen.getAllByTestId(/^widget-/).map((el) => el.getAttribute("data-testid"));
    expect(order).toEqual(["widget-c", "widget-a", "widget-b"]);
  });

  it("fires onMobileReorder from the up/down buttons and disables them at the ends", () => {
    const onMobileReorder = vi.fn();
    render(
      <GridDashboard
        layout={[tile({ uid: "a" }), tile({ uid: "b", y: 4 }), tile({ uid: "c", y: 8 })]}
        onChange={vi.fn()}
        editing
        renderWidget={renderWidget}
        onRemove={vi.fn()}
        onConfigure={vi.fn()}
        onMobileReorder={onMobileReorder}
      />,
    );
    const ups = screen.getAllByTitle("Move up");
    const downs = screen.getAllByTitle("Move down");
    // First tile can't move up; last tile can't move down.
    expect(ups[0]).toBeDisabled();
    expect(downs[2]).toBeDisabled();
    fireEvent.click(downs[0]);
    expect(onMobileReorder).toHaveBeenCalledWith("a", 1);
    fireEvent.click(ups[2]);
    expect(onMobileReorder).toHaveBeenCalledWith("c", -1);
  });

  it("fires onMobileHide from the hide button (mobile remove = hide on this device)", () => {
    const onMobileHide = vi.fn();
    render(
      <GridDashboard
        layout={[tile({ uid: "x" })]}
        onChange={vi.fn()}
        editing
        renderWidget={renderWidget}
        onRemove={vi.fn()}
        onConfigure={vi.fn()}
        onMobileHide={onMobileHide}
      />,
    );
    // No destructive "Remove" on the mobile stack — only hide.
    expect(screen.queryByTitle("Remove")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTitle("Hide on this device"));
    expect(onMobileHide).toHaveBeenCalledWith("x");
  });

  it("lists hidden tiles in a 'Hidden on this device' section with a working Show button", () => {
    const onMobileShow = vi.fn();
    render(
      <GridDashboard
        layout={[tile({ uid: "a" }), tile({ uid: "b", y: 4 })]}
        onChange={vi.fn()}
        editing
        renderWidget={renderWidget}
        onRemove={vi.fn()}
        onConfigure={vi.fn()}
        onMobileShow={onMobileShow}
        mobileOverlay={{ order: [], hidden: ["b"] }}
      />,
    );
    // "b" is hidden → not rendered in the stack…
    expect(screen.queryByTestId("widget-b")).not.toBeInTheDocument();
    expect(screen.getByTestId("widget-a")).toBeInTheDocument();
    // …but surfaced in the hidden section with a Show button that fires onMobileShow.
    expect(screen.getByText("Hidden on this device")).toBeInTheDocument();
    fireEvent.click(screen.getByTitle("Show on this device"));
    expect(onMobileShow).toHaveBeenCalledWith("b");
  });

  it("shows the settings gear only for tiles whose type has settings, and fires onConfigure", () => {
    const onConfigure = vi.fn();
    render(
      <GridDashboard
        layout={[tile({ uid: "nogear" }), configurable({ uid: "gear" })]}
        onChange={vi.fn()}
        editing
        renderWidget={renderWidget}
        onRemove={vi.fn()}
        onConfigure={onConfigure}
      />,
    );
    // Only the configurable ("myRequests") tile gets a gear → exactly one settings button.
    const gears = screen.getAllByTitle("Widget settings");
    expect(gears).toHaveLength(1);
    fireEvent.click(gears[0]);
    expect(onConfigure).toHaveBeenCalledWith("gear");
  });
});

describe("GridDashboard — desktop grid path", () => {
  it("renders the resize grip and remove-widget button per tile while editing", () => {
    withGridWidth(1180);
    const onRemove = vi.fn();
    render(
      <GridDashboard layout={[tile({ uid: "g1" })]} onChange={vi.fn()} editing renderWidget={renderWidget} onRemove={onRemove} onConfigure={vi.fn()} />,
    );
    // Desktop edit chrome uses the "Remove widget" + "Resize" titles (distinct from the stacked path).
    expect(screen.getByTitle("Remove widget")).toBeInTheDocument();
    expect(screen.getByTitle("Resize")).toBeInTheDocument();
    fireEvent.click(screen.getByTitle("Remove widget"));
    expect(onRemove).toHaveBeenCalledWith("g1");
  });

  it("renders all tiles in the grid and keeps the body present", () => {
    withGridWidth(1180);
    render(
      <GridDashboard
        layout={[tile({ uid: "g1" }), tile({ uid: "g2", x: 4 })]}
        onChange={vi.fn()}
        editing={false}
        renderWidget={renderWidget}
        onRemove={vi.fn()}
        onConfigure={vi.fn()}
      />,
    );
    expect(screen.getByTestId("widget-g1")).toBeInTheDocument();
    expect(screen.getByTestId("widget-g2")).toBeInTheDocument();
  });

  it("view mode uses CSS Grid so tile geometry is correct from first paint (no measured-width flash)", () => {
    // The key regression guard: view mode must NOT use absolute-pixel positioning driven by a
    // measured container width. A native CSS grid is fluid and SSR-correct — no layout shift.
    // We render without withGridWidth() so jsdom clientWidth=0 would have triggered the stacked
    // path under the old code (W=0 < stackBelow=720). We force desktop via forceStacked=false
    // and a wide clientWidth so the non-stacked view branch is taken.
    withGridWidth(1180);
    render(
      <GridDashboard
        layout={[tile({ uid: "g1", x: 0, w: 4, h: 3 }), tile({ uid: "g2", x: 4, w: 6, h: 2 })]}
        onChange={vi.fn()}
        editing={false}
        renderWidget={renderWidget}
        onRemove={vi.fn()}
        onConfigure={vi.fn()}
      />,
    );
    // DOM structure (view mode):
    //   gridContainer   ← display:grid (StackedContext.Provider > div)
    //     tileWrapper   ← gridColumn / gridRow spans (key={uid})
    //       innerDiv    ← position:absolute, inset:0, overflow:hidden
    //         widget    ← data-testid="widget-g1"
    const body1 = screen.getByTestId("widget-g1");
    const innerDiv = body1.parentElement!;
    const tileWrapper = innerDiv.parentElement!;
    const gridContainer = tileWrapper.parentElement!;
    expect(gridContainer.style.display).toBe("grid");
    expect(gridContainer.style.gridTemplateColumns).toContain("repeat(12");

    // Tile g1: x=0,w=4 → gridColumn "1 / span 4"; y=0,h=3 → gridRow "1 / span 3"
    expect(tileWrapper.style.gridColumn).toBe("1 / span 4");
    expect(tileWrapper.style.gridRow).toBe("1 / span 3");

    // Tile g2: x=4,w=6 → gridColumn "5 / span 6"; y=0,h=2 → gridRow "1 / span 2"
    const wrapper2 = screen.getByTestId("widget-g2").parentElement!.parentElement!;
    expect(wrapper2.style.gridColumn).toBe("5 / span 6");
    expect(wrapper2.style.gridRow).toBe("1 / span 2");
  });

  it("measures width through ResizeObserver on mount (grid path)", () => {
    class RO {
      cb: () => void;
      constructor(cb: () => void) { this.cb = cb; }
      observe() { this.cb(); }
      disconnect() {}
      unobserve() {}
    }
    const prev = (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = RO as never;
    withGridWidth(1180);
    try {
      render(
        <GridDashboard layout={[tile({ uid: "ro" })]} onChange={vi.fn()} editing renderWidget={renderWidget} onRemove={vi.fn()} onConfigure={vi.fn()} />,
      );
      // ResizeObserver fired measure() → width 1180 ≥ stackBelow → desktop grid chrome present.
      expect(screen.getByTitle("Resize")).toBeInTheDocument();
    } finally {
      (globalThis as { ResizeObserver?: unknown }).ResizeObserver = prev;
    }
  });
});

describe("GridDashboard — drag & resize handlers", () => {
  // Drag/resize are pointer-driven and snap-to-grid; we don't assert pixel math, only that the
  // gestures run end-to-end (startDrag/startResize → window pointermove → pointerup) and commit a
  // packed layout through onChange. This exercises the handler closures without brittle geometry.
  const fireMoveUp = () => {
    fireEvent(window, new MouseEvent("pointermove", { clientX: 120, clientY: 90 } as MouseEventInit) as never);
    fireEvent(window, new MouseEvent("pointerup", {} as MouseEventInit) as never);
  };

  it("commits a moved layout via onChange after a drag gesture", () => {
    withGridWidth(1180);
    const onChange = vi.fn();
    const layout = [tile({ uid: "d1" }), tile({ uid: "d2", x: 6 })];
    render(
      <GridDashboard layout={layout} onChange={onChange} editing renderWidget={renderWidget} onRemove={vi.fn()} onConfigure={vi.fn()} />,
    );
    // The tile wrapper carries the pointerdown drag handler; grab it by the widget body's ancestor.
    const body = screen.getByTestId("widget-d1");
    const wrapper = body.parentElement!.parentElement!;
    fireEvent.pointerDown(wrapper, { button: 0, clientX: 10, clientY: 10 });
    fireMoveUp();
    expect(onChange).toHaveBeenCalledTimes(1);
    // onChange receives a packed Tile[] still containing both tiles.
    const next = onChange.mock.calls[0][0] as Tile[];
    expect(next.map((t) => t.uid).sort()).toEqual(["d1", "d2"]);
  });

  it("commits a resized layout via onChange after a resize gesture", () => {
    withGridWidth(1180);
    const onChange = vi.fn();
    render(
      <GridDashboard layout={[tile({ uid: "r1" })]} onChange={onChange} editing renderWidget={renderWidget} onRemove={vi.fn()} onConfigure={vi.fn()} />,
    );
    fireEvent.pointerDown(screen.getByTitle("Resize"), { button: 0, clientX: 200, clientY: 200 });
    fireMoveUp();
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as Tile[];
    expect(next.find((t) => t.uid === "r1")).toBeDefined();
  });
});

describe("GridDashboard — stacked flag (StackedContext)", () => {
  // GridDashboard owns the 720px breakpoint and provides it to the widget subtree via context,
  // so leaf panels can tighten their layout on mobile. A probe widget reads useStacked().
  const Probe = () => <span data-testid="stacked">{String(useStacked())}</span>;
  const probeRender = () => <Probe />;

  it("provides stacked=true to widgets in the single-column (mobile) path", () => {
    // jsdom clientWidth 0 → W < stackBelow → stacked branch.
    render(
      <GridDashboard layout={[tile({ uid: "s1" })]} onChange={vi.fn()} editing={false} renderWidget={probeRender} onRemove={vi.fn()} onConfigure={vi.fn()} />,
    );
    expect(screen.getByTestId("stacked")).toHaveTextContent("true");
  });

  it("sizes stacked tiles to content, reserving no desktop-derived height", () => {
    // jsdom clientWidth 0 → stacked branch. The desktop grid `h` must NOT leak in as a
    // reserved height: short/idle widgets should size to their natural content, not pad out
    // to a desktop-tall blank (issue #110). Overlap is still prevented by the column flow + gap.
    render(
      <GridDashboard layout={[tile({ uid: "s1", h: 4 })]} onChange={vi.fn()} editing={false} renderWidget={renderWidget} onRemove={vi.fn()} onConfigure={vi.fn()} />,
    );
    // renderWidget body → inner pointer-events div → the stacked wrapper.
    const wrapper = screen.getByTestId("widget-s1").parentElement!.parentElement!;
    // Neither a fixed height (overflow/overlap regression of #88/#107) nor a reserved
    // minHeight (the #110 gap) should be set — the tile is purely content-sized.
    expect(wrapper.style.minHeight).toBe("");
    expect(wrapper.style.height).toBe("");
  });

  it("provides stacked=false to widgets in the desktop grid path", () => {
    withGridWidth(1180);
    render(
      <GridDashboard layout={[tile({ uid: "g1" })]} onChange={vi.fn()} editing={false} renderWidget={probeRender} onRemove={vi.fn()} onConfigure={vi.fn()} />,
    );
    expect(screen.getByTestId("stacked")).toHaveTextContent("false");
  });

  it("forceStacked pins the single-column path even at desktop width (mobile shell)", () => {
    // Wide container (1180 ≥ stackBelow) would normally take the grid path; forceStacked overrides
    // it so a 721-768px phone still stacks. Probe sees stacked=true and no resize chrome renders.
    withGridWidth(1180);
    render(
      <GridDashboard layout={[tile({ uid: "f1" })]} onChange={vi.fn()} editing renderWidget={probeRender} onRemove={vi.fn()} onConfigure={vi.fn()} forceStacked />,
    );
    expect(screen.getByTestId("stacked")).toHaveTextContent("true");
    // Stacked edit chrome uses "Hide on this device", never the grid's "Resize" grip.
    expect(screen.queryByTitle("Resize")).not.toBeInTheDocument();
    expect(screen.getByTitle("Hide on this device")).toBeInTheDocument();
  });
});
