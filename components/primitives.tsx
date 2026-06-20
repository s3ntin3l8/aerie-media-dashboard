"use client";
// ============================================================
// AERIE — shared primitives (ported from the design prototype)
// Icon, Btn, Pill, Chip, Eyebrow, Divider, Kbd, HealthDots,
// StatusDot, Heartbeat, Sparkline, Equalizer, ProgressBar,
// PosterTile, CatBadge, Avatar, SearchField, RailTip
// ============================================================
import React, { useId, useMemo, useState } from "react";
import type { Category, MediaKind, ServiceStatus } from "@/lib/types";
import { CAT, catColor } from "@/lib/categories";

type CSS = React.CSSProperties;

export { catColor };

/** Single-line ellipsis truncation — the most-repeated inline style in the app. */
export const TRUNCATE: CSS = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };

/** `borderTop` for list rows: a hairline between items, none above the first (index 0).
 *  `opacity` is the outline-variant mix percentage (45 for most lists, 50 for stream rows). */
export const listDivider = (i: number, opacity = 45): string =>
  i ? `1px solid color-mix(in srgb, var(--outline-variant) ${opacity}%, transparent)` : "none";

/** Hover handlers that ring a bordered card with a tinted glow in color `c`, restored on leave.
 *  Spread onto the element: `<div {...hoverGlow(c)} />`. */
export function hoverGlow(c: string): {
  onMouseEnter: (e: React.MouseEvent<HTMLElement>) => void;
  onMouseLeave: (e: React.MouseEvent<HTMLElement>) => void;
} {
  return {
    onMouseEnter: (e) => {
      e.currentTarget.style.borderColor = `color-mix(in srgb, ${c} 55%, transparent)`;
      e.currentTarget.style.boxShadow = `0 0 0 3px color-mix(in srgb, ${c} 8%, transparent)`;
    },
    onMouseLeave: (e) => {
      e.currentTarget.style.borderColor = "var(--outline-variant)";
      e.currentTarget.style.boxShadow = "none";
    },
  };
}

/** Collapsible card with an icon/title/count header and a rotating chevron. Self-manages its
 *  open state. Used by the Admin "Discovered via Traefik" and "Traefik nodes" panels. */
export function ExpandableSection({
  icon,
  title,
  count,
  defaultOpen = false,
  children,
}: {
  icon: string;
  title: React.ReactNode;
  count?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderRadius: 16, border: "1px solid var(--outline-variant)", background: "var(--surface-container-lowest)", padding: 14, marginBottom: 12 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: 0, border: "none", background: "transparent", color: "inherit", cursor: "pointer", marginBottom: open ? 10 : 0 }}
      >
        <Icon name={icon} size={16} color="var(--primary)" />
        <Eyebrow>{title}</Eyebrow>
        {count != null && <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--on-surface-variant)" }}>{count}</span>}
        <Icon name="expand_more" size={18} color="var(--on-surface-variant)" style={{ marginLeft: "auto", transform: open ? "none" : "rotate(-90deg)", transition: "transform .15s" }} />
      </button>
      {open && children}
    </div>
  );
}

// ── Material Symbol icon ───────────────────────────────────
export function Icon({
  name,
  size = 20,
  fill = false,
  weight = 400,
  color,
  style,
  className = "",
}: {
  name: string;
  size?: number;
  fill?: boolean;
  weight?: number;
  color?: string;
  style?: CSS;
  className?: string;
}) {
  return (
    <span
      className={`material-symbols-outlined ${className}`}
      style={{
        fontSize: size,
        width: size,
        height: size,
        color,
        flexShrink: 0,
        fontVariationSettings: `'FILL' ${fill ? 1 : 0}, 'wght' ${weight}, 'GRAD' 0, 'opsz' ${size}`,
        ...style,
      }}
    >
      {name}
    </span>
  );
}

type BtnVariant = "primary" | "secondary" | "ghost" | "danger" | "tonal";
type BtnSize = "md" | "sm" | "xs";

export function Btn({
  variant = "primary",
  size = "md",
  children,
  icon,
  iconRight,
  onClick,
  disabled,
  style,
  title,
  type = "button",
}: {
  variant?: BtnVariant;
  size?: BtnSize;
  children?: React.ReactNode;
  icon?: string;
  iconRight?: string;
  onClick?: () => void;
  disabled?: boolean;
  style?: CSS;
  title?: string;
  type?: "button" | "submit";
}) {
  const cls = `btn ${variant === "tonal" ? "btn-tonal" : `btn-${variant}`} ${
    size === "sm" ? "btn-sm" : size === "xs" ? "btn-xs" : ""
  }`;
  return (
    <button className={cls} onClick={onClick} disabled={disabled} style={style} title={title} type={type}>
      {icon && <Icon name={icon} size={size === "md" ? 16 : 14} />}
      {children}
      {iconRight && <Icon name={iconRight} size={size === "md" ? 16 : 14} />}
    </button>
  );
}

// Pill — tone is a token name OR a raw color via rawColor
export function Pill({
  children,
  tone = "primary",
  rawColor,
  style,
}: {
  children?: React.ReactNode;
  tone?: string;
  rawColor?: string;
  style?: CSS;
}) {
  const c = rawColor || `var(--${tone})`;
  return (
    <span
      className="pill"
      style={{
        color: c,
        background: `color-mix(in srgb, ${c} 13%, transparent)`,
        borderColor: `color-mix(in srgb, ${c} 28%, transparent)`,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

export function Chip({ children, icon, style }: { children?: React.ReactNode; icon?: string; style?: CSS }) {
  return (
    <span className="chip" style={style}>
      {icon && <Icon name={icon} size={12} />}
      {children}
    </span>
  );
}

export function Eyebrow({ children, color, style }: { children?: React.ReactNode; color?: string; style?: CSS }) {
  return (
    <div
      style={{
        fontFamily: "var(--font-body)",
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: color || "var(--on-surface-variant)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Divider({ style }: { style?: CSS }) {
  return <div style={{ height: 1, background: "var(--outline-variant)", ...style }} />;
}

export function Kbd({ children, style }: { children?: React.ReactNode; style?: CSS }) {
  return (
    <span className="kbd" style={style}>
      {children}
    </span>
  );
}

// Health dots — tier: ok | warn | crit | off
export function HealthDots({ tier = "ok", size = 6 }: { tier?: "ok" | "warn" | "crit" | "off"; size?: number }) {
  const fill = { ok: 3, warn: 2, crit: 1, off: 0 }[tier];
  const col =
    tier === "crit"
      ? "var(--error)"
      : tier === "warn"
        ? "var(--amber)"
        : tier === "off"
          ? "var(--outline-variant)"
          : "var(--originator-own)";
  return (
    <span style={{ display: "inline-flex", gap: 2, alignItems: "center" }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: size,
            height: size,
            borderRadius: 9999,
            background: i < fill ? col : "color-mix(in srgb, var(--outline-variant) 45%, transparent)",
          }}
        />
      ))}
    </span>
  );
}

// Pulsing status dot
export function StatusDot({ status = "up", size = 8 }: { status?: ServiceStatus; size?: number }) {
  const col = status === "down" ? "var(--error)" : status === "degraded" ? "var(--amber)" : status === "unknown" ? "var(--on-surface-variant)" : "var(--originator-own)";
  return (
    <span style={{ position: "relative", width: size, height: size, display: "inline-flex", flexShrink: 0 }}>
      {status !== "down" && status !== "unknown" && (
        <span
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 9999,
            background: col,
            animation: "aeriePulse 2.4s ease-out infinite",
          }}
        />
      )}
      <span style={{ position: "relative", width: size, height: size, borderRadius: 9999, background: col }} />
    </span>
  );
}

// Heartbeat bars (Gatus-style) — array of 1=up / 0.5=degraded / 0=down / -1=no data
// fluid=true: bars stretch to fill the parent container (use inside a flex: 1 div)
export function Heartbeat({ beats, h = 22, barW = 4, gap = 2, fluid = false }: { beats: number[]; h?: number; barW?: number; gap?: number; fluid?: boolean }) {
  return (
    <span style={{ display: fluid ? "flex" : "inline-flex", alignItems: "flex-end", gap, ...(fluid ? { width: "100%" } : {}) }}>
      {beats.map((b, i) => {
        const col = b === 0 ? "var(--error)" : b === 0.5 ? "var(--amber)" : b < 0 ? "var(--on-surface-variant)" : "var(--originator-own)";
        return (
          <span
            key={i}
            title={b < 0 ? "no data" : b === 0 ? "down" : b === 0.5 ? "degraded" : "up"}
            style={{
              ...(fluid ? { flex: 1, minWidth: 0 } : { width: barW }),
              height: b === 0 ? h : b === 0.5 ? h * 0.62 : b < 0 ? Math.max(3, h * 0.28) : h,
              background: col,
              opacity: b < 0 ? 0.4 : b === 0 ? 0.9 : 0.85,
              borderRadius: 1.5,
            }}
          />
        );
      })}
    </span>
  );
}

// SVG sparkline from numeric series
export function Sparkline({
  data,
  w = 120,
  h = 28,
  color = "var(--primary)",
  fill = true,
  strokeW = 1.5,
  fluid = false,
}: {
  data: number[];
  w?: number;
  h?: number;
  color?: string;
  fill?: boolean;
  strokeW?: number;
  fluid?: boolean;
}) {
  const { line, area } = useMemo(() => {
    const max = Math.max(...data, 1),
      min = Math.min(...data, 0);
    const span = max - min || 1;
    const pts = data.map((v, i) => [(i / (data.length - 1)) * w, h - 2 - ((v - min) / span) * (h - 4)]);
    const line = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
    const area = line + ` L${w} ${h} L0 ${h} Z`;
    return { line, area };
  }, [data, w, h]);
  const gid = useId();
  // fluid: fill the container width while keeping the w×h geometry as the viewBox. The
  // non-scaling-stroke keeps the line crisp/uniform despite the horizontal stretch.
  const sizing = fluid
    ? ({ width: "100%", height: h, viewBox: `0 0 ${w} ${h}`, preserveAspectRatio: "none" } as const)
    : ({ width: w, height: h } as const);
  return (
    <svg {...sizing} style={{ display: "block", overflow: "visible" }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && <path d={area} fill={`url(#${gid})`} />}
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={strokeW}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect={fluid ? "non-scaling-stroke" : undefined}
      />
    </svg>
  );
}

// Animated mini equalizer (for now-playing audio/active streams)
export function Equalizer({ color = "var(--primary)", active = true, bars = 4, h = 13 }: { color?: string; active?: boolean; bars?: number; h?: number }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "flex-end", gap: 2, height: h }}>
      {Array.from({ length: bars }).map((_, i) => (
        <span
          key={i}
          style={{
            width: 2.5,
            height: active ? h : 3,
            background: color,
            borderRadius: 2,
            transformOrigin: "bottom",
            animation: active ? `aerieEq 0.9s ease-in-out ${i * 0.13}s infinite` : "none",
          }}
        />
      ))}
    </span>
  );
}

// Progress bar
export function ProgressBar({
  pct,
  color = "var(--primary)",
  h = 4,
  track = "color-mix(in srgb, var(--on-surface-variant) 18%, transparent)",
}: {
  pct: number;
  color?: string;
  h?: number;
  track?: string;
}) {
  return (
    <div style={{ height: h, borderRadius: 9999, background: track, overflow: "hidden" }}>
      <div
        style={{
          width: `${Math.min(100, Math.max(0, pct))}%`,
          height: "100%",
          borderRadius: 9999,
          background: color,
          transition: "width .4s linear",
        }}
      />
    </div>
  );
}

// Poster placeholder — flat category-tinted block + glyph (restrained imagery)
export function PosterTile({
  title,
  kind = "movie",
  cat = "stream",
  w = 56,
  ratio = 1.5,
  rounded = 8,
  art,
}: {
  title?: string;
  kind?: MediaKind;
  cat?: Category;
  w?: number;
  ratio?: number;
  rounded?: number;
  /** real cover-art URL; falls back to the tinted block on error */
  art?: string;
}) {
  const c = catColor(cat);
  const glyph = kind === "series" ? "live_tv" : kind === "track" ? "album" : "movie";
  const [imgOk, setImgOk] = useState(true);
  return (
    <div
      style={{
        width: w,
        height: w * ratio,
        borderRadius: rounded,
        flexShrink: 0,
        position: "relative",
        overflow: "hidden",
        background: `linear-gradient(160deg, color-mix(in srgb, ${c} 26%, var(--surface-container)) 0%, var(--surface-container-high) 100%)`,
        border: "1px solid color-mix(in srgb, var(--outline-variant) 70%, transparent)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* placeholder glyph (also the fallback when art fails to load) */}
      <Icon name={glyph} size={Math.round(w * 0.42)} color={`color-mix(in srgb, ${c} 75%, var(--on-surface-variant))`} />
      {art && imgOk && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={art}
          alt={title || ""}
          loading="lazy"
          onError={() => setImgOk(false)}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
      )}
      <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: c, zIndex: 1 }} />
    </div>
  );
}

export function CatBadge({ cat, size = "sm" }: { cat: Category; size?: "sm" | "xs" }) {
  const c = catColor(cat);
  const meta = CAT[cat] || CAT.infra;
  return (
    <Pill rawColor={c} style={size === "xs" ? { fontSize: 9, padding: "1px 6px" } : undefined}>
      {meta.label}
    </Pill>
  );
}

export function Avatar({ name, size = 28, color = "var(--primary)", you = false, src }: { name?: string; size?: number; color?: string; you?: boolean; src?: string }) {
  // Show a real profile photo when available; fall back to the tinted initials
  // (also the fallback if the image fails to load).
  const [imgOk, setImgOk] = useState(true);
  const initials = name
    ? name
        .trim()
        .split(/\s+/)
        .map((s) => s[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "?";
  const showImg = Boolean(src) && imgOk;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 9999,
        flexShrink: 0,
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-body)",
        fontWeight: 700,
        fontSize: size * 0.4,
        letterSpacing: "0.02em",
        background: `color-mix(in srgb, ${color} ${you ? 22 : 16}%, transparent)`,
        color,
        border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
      }}
    >
      {showImg ? (
        <img
          src={src}
          alt={name || ""}
          loading="lazy"
          onError={() => setImgOk(false)}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        initials
      )}
    </div>
  );
}

// Standardized search field — input (filters) or button (palette triggers).
export function SearchField({
  value,
  onChange,
  placeholder = "Search…",
  width = 240,
  kbd,
  asButton = false,
  onClick,
  icon = "search",
}: {
  value?: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  width?: number | string;
  kbd?: string;
  asButton?: boolean;
  onClick?: () => void;
  icon?: string;
}) {
  const H = 38;
  const wrap: CSS = { position: "relative", display: "inline-flex", alignItems: "center", width };
  const lead = (
    <Icon
      name={icon}
      size={16}
      color="var(--on-surface-variant)"
      style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
    />
  );
  const padRight = kbd ? 44 : 12;

  if (asButton) {
    return (
      <button
        onClick={onClick}
        className="input"
        style={{
          ...wrap,
          height: H,
          boxSizing: "border-box",
          paddingTop: 0,
          paddingBottom: 0,
          paddingLeft: 34,
          paddingRight: padRight,
          textAlign: "left",
          color: "var(--on-surface-variant)",
          cursor: "pointer",
          background: "var(--surface-container-low)",
        }}
      >
        {lead}
        <span style={{ flex: 1, fontSize: 13 }}>{placeholder}</span>
        {kbd && <Kbd style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)" }}>{kbd}</Kbd>}
      </button>
    );
  }
  return (
    <div style={wrap}>
      {lead}
      <input
        className="input"
        value={value}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        placeholder={placeholder}
        style={{ height: H, boxSizing: "border-box", paddingTop: 0, paddingBottom: 0, paddingLeft: 34, paddingRight: padRight, fontSize: 13 }}
      />
      {kbd && <Kbd style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>{kbd}</Kbd>}
    </div>
  );
}

// Rail tooltip
export function RailTip({
  label,
  children,
  kbd,
  side = "right",
}: {
  label: string;
  children: React.ReactNode;
  kbd?: string;
  side?: "right" | "left";
}) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: "relative", display: "flex" }} onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {children}
      {show && (
        <span
          style={{
            position: "absolute",
            left: side === "right" ? 50 : "auto",
            right: side === "left" ? 50 : "auto",
            top: "50%",
            transform: "translateY(-50%)",
            padding: "6px 10px",
            background: "var(--surface-container-highest)",
            color: "var(--on-surface)",
            fontSize: 11,
            fontWeight: 500,
            borderRadius: 6,
            border: "1px solid var(--outline-variant)",
            boxShadow: "var(--shadow-lg)",
            whiteSpace: "nowrap",
            zIndex: 200,
            pointerEvents: "none",
          }}
        >
          {label}
          {kbd && <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, opacity: 0.6, marginLeft: 6 }}>{kbd}</span>}
        </span>
      )}
    </div>
  );
}
