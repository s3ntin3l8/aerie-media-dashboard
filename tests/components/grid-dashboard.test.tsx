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
}));

import { GridDashboard } from "@/components/portal/GridDashboard";
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
  it("shows a Remove button per tile and fires onRemove with the tile uid", () => {
    const onRemove = vi.fn();
    render(
      <GridDashboard layout={[tile({ uid: "x" })]} onChange={vi.fn()} editing renderWidget={renderWidget} onRemove={onRemove} onConfigure={vi.fn()} />,
    );
    fireEvent.click(screen.getByTitle("Remove"));
    expect(onRemove).toHaveBeenCalledWith("x");
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
