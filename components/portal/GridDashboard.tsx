"use client";
// ============================================================
// AERIE — snap-to-grid dashboard engine
// 12-col grid · drag-anywhere · corner-resize · vertical packing
// mobile single-column stack · per-tile min/max from the catalog.
// Grid feel is locked to "lift" (the design-time switcher was dropped,
// matching the committed-defaults policy in CLAUDE.md).
// ============================================================
import React, { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/primitives";
import { GRID, gridSort, packAround, type Tile } from "@/components/portal/gridLayout";
import { widgetMeta, hasSettings } from "@/components/portal/widgetCatalog";

type CSS = React.CSSProperties;

interface ActiveDrag {
  kind: "drag" | "resize";
  uid: string;
  w: number;
  h: number;
  curLeft?: number;
  curTop?: number;
  cell?: { x: number; y: number };
  preview: Tile[];
}

interface GridDashboardProps {
  layout: Tile[];
  onChange: (next: Tile[]) => void;
  editing: boolean;
  renderWidget: (item: Tile, stacked: boolean) => React.ReactNode;
  onRemove: (uid: string) => void;
  onConfigure: (uid: string) => void;
}

// floating configure (gear) button shared by grid + stack
const configBtnStyle: CSS = {
  position: "absolute",
  top: 8,
  right: 40,
  width: 24,
  height: 24,
  borderRadius: 7,
  zIndex: 6,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  border: "none",
  background: "color-mix(in srgb, var(--on-surface) 12%, var(--surface-container-highest))",
  color: "var(--on-surface-variant)",
  boxShadow: "var(--shadow-sm)",
};

// floating remove button shared by grid + stack
const removeBtnStyle: CSS = {
  position: "absolute",
  top: 8,
  right: 8,
  width: 24,
  height: 24,
  borderRadius: 7,
  zIndex: 6,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  border: "none",
  background: "color-mix(in srgb, var(--error) 16%, var(--surface-container-highest))",
  color: "var(--error)",
  boxShadow: "var(--shadow-sm)",
};

// "lift" tile chrome while editing
function tileChrome(editing: boolean, isActive: boolean): CSS {
  if (!editing) return {};
  return {
    boxShadow: isActive
      ? "0 0 0 2px color-mix(in srgb, var(--primary) 70%, transparent), 0 20px 44px rgba(0,0,0,.34)"
      : "0 0 0 1px color-mix(in srgb, var(--primary) 22%, transparent), var(--shadow-card, var(--shadow-sm))",
    transform: isActive ? "scale(1.012)" : "none",
  };
}

export function GridDashboard({ layout, onChange, editing, renderWidget, onRemove, onConfigure }: GridDashboardProps) {
  const { cols, rowH, gap, stackBelow } = GRID;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(1180);
  const [act, setAct] = useState<ActiveDrag | null>(null);
  const actRef = useRef<ActiveDrag | null>(null);
  const setActBoth = (v: ActiveDrag | null) => {
    actRef.current = v;
    setAct(v);
  };

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setW(el.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const stacked = W < stackBelow;
  const colW = Math.max(1, (W - gap * (cols - 1)) / cols);
  const cellW = colW + gap;
  const cellH = rowH + gap;
  const pxOf = (it: { x: number; y: number; w: number; h: number }) => ({
    left: it.x * cellW,
    top: it.y * cellH,
    width: it.w * colW + (it.w - 1) * gap,
    height: it.h * rowH + (it.h - 1) * gap,
  });

  // ── drag (move) ──
  const startDrag = (e: React.PointerEvent, item: Tile) => {
    if (!editing || stacked || e.button !== 0) return;
    e.preventDefault();
    const p = pxOf(item);
    const sx = e.clientX;
    const sy = e.clientY;
    const onMove = (ev: PointerEvent) => {
      const curLeft = p.left + (ev.clientX - sx);
      const curTop = p.top + (ev.clientY - sy);
      const cx = Math.max(0, Math.min(cols - item.w, Math.round(curLeft / cellW)));
      const cy = Math.max(0, Math.round(curTop / cellH));
      const moved = layout.map((l) => (l.uid === item.uid ? { ...l, x: cx, y: cy } : l));
      setActBoth({ kind: "drag", uid: item.uid, w: item.w, h: item.h, curLeft, curTop, cell: { x: cx, y: cy }, preview: packAround(moved, item.uid) });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const a = actRef.current;
      if (a && a.preview) onChange(a.preview);
      setActBoth(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  // ── resize (corner) ──
  const startResize = (e: React.PointerEvent, item: Tile) => {
    if (!editing || stacked || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const p = pxOf(item);
    const sx = e.clientX;
    const sy = e.clientY;
    const m = widgetMeta(item.type);
    const onMove = (ev: PointerEvent) => {
      const wpx = p.width + (ev.clientX - sx);
      const hpx = p.height + (ev.clientY - sy);
      let nw = Math.round((wpx + gap) / cellW);
      let nh = Math.round((hpx + gap) / cellH);
      nw = Math.max(m.minW, Math.min(m.maxW, cols - item.x, nw));
      nh = Math.max(m.minH, Math.min(m.maxH, nh));
      const resized = layout.map((l) => (l.uid === item.uid ? { ...l, w: nw, h: nh } : l));
      setActBoth({ kind: "resize", uid: item.uid, w: nw, h: nh, preview: packAround(resized, item.uid) });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const a = actRef.current;
      if (a && a.preview) onChange(a.preview);
      setActBoth(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  // ===========================================================
  // STACKED (mobile) — single column, arrangement is read-only
  // ===========================================================
  if (stacked) {
    return (
      <div ref={wrapRef} style={{ display: "flex", flexDirection: "column", gap }}>
        {gridSort(layout).map((item) => {
          const m = widgetMeta(item.type);
          const hUnits = Math.max(item.h, m.minH);
          return (
            <div key={item.uid} style={{ position: "relative", height: hUnits * rowH + (hUnits - 1) * gap, borderRadius: "var(--radius-xl)" }}>
              <div style={{ height: "100%", pointerEvents: editing ? "none" : "auto" }}>{renderWidget(item, true)}</div>
              {editing && hasSettings(item.type) && (
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => onConfigure(item.uid)}
                  title="Widget settings"
                  style={configBtnStyle}
                >
                  <Icon name="settings" size={14} />
                </button>
              )}
              {editing && (
                <button onClick={() => onRemove(item.uid)} title="Remove" style={removeBtnStyle}>
                  <Icon name="close" size={15} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // ===========================================================
  // GRID (desktop)
  // ===========================================================
  const view = act ? act.preview : layout;
  const maxB = view.reduce((m, it) => Math.max(m, it.y + it.h), 0);
  const rows = maxB + (editing ? 3 : 0);
  const hPx = Math.max(rows * cellH - gap, 120);

  return (
    <div ref={wrapRef} style={{ position: "relative", width: "100%", height: hPx, transition: "height .18s" }}>
      {/* drop placeholder */}
      {act &&
        (() => {
          const cell = act.kind === "drag" ? act.cell! : view.find((v) => v.uid === act.uid)!;
          const ph = pxOf({ x: cell.x, y: cell.y, w: act.w, h: act.h });
          return (
            <div
              aria-hidden
              style={{
                position: "absolute",
                left: ph.left,
                top: ph.top,
                width: ph.width,
                height: ph.height,
                borderRadius: "var(--radius-xl)",
                border: "1.5px dashed color-mix(in srgb, var(--primary) 60%, transparent)",
                background: "color-mix(in srgb, var(--primary) 7%, transparent)",
                transition: "left .12s, top .12s, width .12s, height .12s",
                zIndex: 1,
              }}
            />
          );
        })()}

      {view.map((item) => {
        const isActive = !!act && act.uid === item.uid;
        const p = pxOf(item);
        const left = isActive && act!.kind === "drag" ? act!.curLeft : p.left;
        const top = isActive && act!.kind === "drag" ? act!.curTop : p.top;

        return (
          <div
            key={item.uid}
            onPointerDown={editing ? (e) => startDrag(e, item) : undefined}
            style={{
              position: "absolute",
              left,
              top,
              width: p.width,
              height: p.height,
              zIndex: isActive ? 30 : 2,
              transition: isActive ? "none" : "left .18s cubic-bezier(.2,.7,.2,1), top .18s cubic-bezier(.2,.7,.2,1), width .18s, height .18s, opacity .18s",
              cursor: editing ? (isActive ? "grabbing" : "grab") : "default",
              userSelect: editing ? "none" : "auto",
              borderRadius: "var(--radius-xl)",
              ...tileChrome(editing, isActive),
            }}
          >
            {/* widget body */}
            <div style={{ position: "absolute", inset: 0, borderRadius: "var(--radius-xl)", overflow: "hidden", pointerEvents: editing ? "none" : "auto" }}>
              {renderWidget(item, false)}
            </div>

            {editing && (
              <>
                {hasSettings(item.type) && (
                  <button
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => onConfigure(item.uid)}
                    title="Widget settings"
                    style={configBtnStyle}
                  >
                    <Icon name="settings" size={14} />
                  </button>
                )}
                <button onPointerDown={(e) => e.stopPropagation()} onClick={() => onRemove(item.uid)} title="Remove widget" style={removeBtnStyle}>
                  <Icon name="close" size={15} />
                </button>
                {/* resize grip */}
                <div
                  onPointerDown={(e) => startResize(e, item)}
                  title="Resize"
                  style={{
                    position: "absolute",
                    right: 0,
                    bottom: 0,
                    width: 22,
                    height: 22,
                    cursor: "nwse-resize",
                    zIndex: 6,
                    display: "flex",
                    alignItems: "flex-end",
                    justifyContent: "flex-end",
                    padding: 3,
                    color: "var(--primary)",
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 13 13" style={{ display: "block", filter: "drop-shadow(0 1px 1px rgba(0,0,0,.35))" }}>
                    <g fill="currentColor">
                      <circle cx="11" cy="11" r="1.4" />
                      <circle cx="11" cy="6.5" r="1.4" />
                      <circle cx="6.5" cy="11" r="1.4" />
                      <circle cx="11" cy="2" r="1.4" opacity="0.55" />
                      <circle cx="2" cy="11" r="1.4" opacity="0.55" />
                      <circle cx="6.5" cy="6.5" r="1.4" opacity="0.55" />
                    </g>
                  </svg>
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
