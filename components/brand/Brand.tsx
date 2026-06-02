// ============================================================
// AERIE — brand mark (single source of truth)
// ------------------------------------------------------------
// A "peak monogram": an angular /\ chevron + crossbar that reads
// as both the letter A and a mountain summit — the high vantage
// point the name (aerie = an eagle's nest) and the product
// ("every service, one vantage point") are built around.
//
// Pure presentational, theme-aware via the --primary token. The
// static assets that can't read CSS vars (app/icon.svg,
// app/apple-icon.tsx, app/opengraph-image.tsx, docs/assets/*.svg)
// MIRROR the geometry constants below — keep them in sync.
// ============================================================
import React from "react";

// ── Canonical geometry (viewBox 0 0 32 32) ──────────────────
export const BRAND_VIEWBOX = "0 0 32 32";
export const BRAND_PEAK_PATH = "M 6 25 L 16 7 L 26 25"; // /\ summit
export const BRAND_BAR_PATH = "M 11 18.5 L 21 18.5"; // crossbar
export const BRAND_STROKE = 3.4;

/** The bare peak-A mark (no container). Stroke uses `color`. */
export function BrandMark({
  size = 24,
  color = "var(--primary)",
  strokeWidth = BRAND_STROKE,
}: {
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={BRAND_VIEWBOX}
      fill="none"
      aria-hidden
      focusable="false"
    >
      <path
        d={BRAND_PEAK_PATH}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={BRAND_BAR_PATH}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** The mark inside the tinted, rounded brand tile. */
export function BrandBadge({ size = 28 }: { size?: number }) {
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.28),
        background: "color-mix(in srgb, var(--primary) 16%, var(--surface-container))",
        border: "1px solid color-mix(in srgb, var(--primary) 30%, transparent)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <BrandMark size={Math.round(size * 0.62)} color="var(--primary)" />
    </div>
  );
}

/** Horizontal lockup: brand tile + AERIE wordmark. */
export function BrandLockup({
  size = 28,
  wordmark = true,
}: {
  size?: number;
  wordmark?: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: Math.round(size * 0.42) }}>
      <BrandBadge size={size} />
      {wordmark && (
        <span
          style={{
            fontFamily: "var(--font-headline)",
            fontWeight: 800,
            fontSize: Math.round(size * 0.56),
            letterSpacing: "0.04em",
            color: "var(--on-surface)",
          }}
        >
          AERIE
        </span>
      )}
    </div>
  );
}
