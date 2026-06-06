"use client";
// ============================================================
// AERIE — modal shell + shared form primitives
// (ported from the design's Modals.jsx)
// ============================================================
import React, { useEffect } from "react";
import type { Category } from "@/lib/types";
import { Icon, Eyebrow } from "@/components/primitives";
import { CAT, catColor } from "@/lib/categories";
import { usePortal } from "@/components/portal/PortalProvider";

type CSS = React.CSSProperties;

// Overlay + centered card. Mirrors CommandPalette's scrim.
export function ModalShell({
  open,
  onClose,
  icon,
  logoUrl,
  accent = "var(--primary)",
  title,
  sub,
  children,
  footer,
  width = 600,
  headerActions,
}: {
  open: boolean;
  onClose: () => void;
  icon?: string;
  logoUrl?: string;
  accent?: string;
  title: string;
  sub?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
  headerActions?: React.ReactNode;
}) {
  const { setModalOpen } = usePortal();
  // Let the portal know a modal owns the keyboard while open.
  useEffect(() => {
    setModalOpen(open);
    return () => setModalOpen(false);
  }, [open, setModalOpen]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      onMouseDown={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 320,
        background: "color-mix(in srgb, var(--inverse-surface) 48%, transparent)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "7vh",
        paddingBottom: "7vh",
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: width,
          margin: "0 16px",
          maxHeight: "86vh",
          display: "flex",
          flexDirection: "column",
          background: "var(--surface-container-lowest)",
          border: "1px solid var(--outline-variant)",
          borderRadius: 18,
          boxShadow: "var(--shadow-2xl)",
          overflow: "hidden",
          animation: "modalIn .22s cubic-bezier(.2,.7,.2,1) both",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 13, padding: "18px 20px", borderBottom: "1px solid var(--outline-variant)", flexShrink: 0 }}>
          {(logoUrl || icon) && (
            <div style={{ width: 38, height: 38, borderRadius: 11, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: `color-mix(in srgb, ${accent} 14%, transparent)` }}>
              {logoUrl
                ? <img src={logoUrl} alt="" width={26} height={26} style={{ objectFit: "contain" }} />
                : <Icon name={icon!} size={21} color={accent} />
              }
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0, paddingTop: 1 }}>
            <h2 style={{ fontFamily: "var(--font-headline)", fontWeight: 800, fontSize: 17, letterSpacing: "-0.01em", color: "var(--on-surface)", lineHeight: 1.15 }}>{title}</h2>
            {sub && <div style={{ fontSize: 12.5, color: "var(--on-surface-variant)", marginTop: 3, lineHeight: 1.45 }}>{sub}</div>}
          </div>
          {headerActions}
          <button onClick={onClose} className="btn btn-ghost btn-sm" style={{ padding: 7, marginTop: -2, marginRight: -4 }} title="Close (esc)">
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="custom-scrollbar" style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>{children}</div>
        {footer && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 20px", borderTop: "1px solid var(--outline-variant)", background: "color-mix(in srgb, var(--surface-container) 45%, transparent)", flexShrink: 0 }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function SectionLabel({ children, hint, style }: { children?: React.ReactNode; hint?: React.ReactNode; style?: CSS }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 12, ...style }}>
      <Eyebrow style={{ color: "var(--primary)" }}>{children}</Eyebrow>
      {hint && <span style={{ fontSize: 11, color: "var(--on-surface-variant)" }}>{hint}</span>}
    </div>
  );
}

export function Field({ label, hint, children, full, style }: { label: string; hint?: React.ReactNode; children?: React.ReactNode; full?: boolean; style?: CSS }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6, gridColumn: full ? "1 / -1" : "auto", minWidth: 0, ...style }}>
      <span style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
        <span style={{ fontFamily: "var(--font-body)", fontSize: 11.5, fontWeight: 700, color: "var(--on-surface)" }}>{label}</span>
        {hint && <span style={{ fontSize: 10.5, color: "var(--on-surface-variant)" }}>{hint}</span>}
      </span>
      {children}
    </label>
  );
}

export function Toggle({ on, onChange, color = "var(--originator-own)", size = "md" }: { on: boolean; onChange: (v: boolean) => void; color?: string; size?: "sm" | "md" }) {
  const W = size === "sm" ? 30 : 38,
    H = size === "sm" ? 18 : 22,
    K = H - 4;
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      aria-pressed={on}
      style={{
        width: W,
        height: H,
        borderRadius: 9999,
        position: "relative",
        border: "none",
        cursor: "pointer",
        flexShrink: 0,
        padding: 0,
        background: on ? color : "color-mix(in srgb, var(--on-surface-variant) 24%, transparent)",
        transition: "background .16s",
      }}
    >
      <span style={{ position: "absolute", top: 2, left: on ? W - K - 2 : 2, width: K, height: K, borderRadius: 9999, background: on ? "var(--surface-container-lowest)" : "var(--on-surface-variant)", transition: "left .16s", boxShadow: "0 1px 2px rgba(0,0,0,0.3)" }} />
    </button>
  );
}

export function ToggleRow({ on, onChange, title, desc, color, icon }: { on: boolean; onChange: (v: boolean) => void; title: string; desc?: string; color?: string; icon?: string }) {
  const c = color || "var(--originator-own)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", borderRadius: 11, border: "1px solid var(--outline-variant)", background: on ? `color-mix(in srgb, ${c} 7%, transparent)` : "var(--surface-container-lowest)", transition: "background .16s" }}>
      {icon && <Icon name={icon} size={18} color={on ? c : "var(--on-surface-variant)"} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--on-surface)" }}>{title}</div>
        {desc && <div style={{ fontSize: 11, color: "var(--on-surface-variant)", marginTop: 1 }}>{desc}</div>}
      </div>
      <Toggle on={on} onChange={onChange} color={c} />
    </div>
  );
}

export function CatPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
      {(Object.keys(CAT) as Category[]).map((k) => {
        const c = catColor(k),
          sel = value === k,
          meta = CAT[k];
        return (
          <button
            key={k}
            type="button"
            onClick={() => onChange(k)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 12px",
              borderRadius: 9,
              cursor: "pointer",
              fontFamily: "var(--font-body)",
              fontSize: 12,
              fontWeight: 600,
              border: "1px solid " + (sel ? `color-mix(in srgb, ${c} 55%, transparent)` : "var(--outline-variant)"),
              background: sel ? `color-mix(in srgb, ${c} 14%, transparent)` : "transparent",
              color: sel ? c : "var(--on-surface-variant)",
              transition: "all .14s",
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: 9999, background: c }} />
            {meta.label}
          </button>
        );
      })}
    </div>
  );
}

// Slightly tighter than .input default; minWidth/border-box prevent grid overflow.
export const fieldInput: CSS = { fontSize: 13, padding: "9px 12px", minWidth: 0, boxSizing: "border-box" };
