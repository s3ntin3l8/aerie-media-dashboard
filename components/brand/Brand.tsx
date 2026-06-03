// ============================================================
// AERIE — brand mark (single source of truth)
// ------------------------------------------------------------
// A "layered ridge" mark: two offset mountain ridgelines that
// read as depth and elevation — the high vantage point the name
// (aerie = an eagle's nest) and the product ("every service,
// one vantage point") are built around.
//
// Pure presentational, theme-aware via the --primary token. The
// static assets that can't read CSS vars (app/icon.svg,
// app/apple-icon.tsx, app/opengraph-image.tsx, docs/assets/*.svg)
// MIRROR the geometry constants below — keep them in sync.
// ============================================================
import React from "react";

// ── Canonical geometry (viewBox 0 0 120 120) ─────────────────
export const BRAND_VIEWBOX = "0 0 120 120";
export const BRAND_RIDGE_FRONT = "16,86 50,40 70,66"; // front ridge (full opacity)
export const BRAND_RIDGE_BACK = "58,74 80,50 100,80"; // back ridge (0.55 opacity)
export const BRAND_RIDGE_STROKE = 7.5;

/** The bare ridge mark (no container). Stroke uses `color`. */
export function BrandMark({
  size = 24,
  color = "var(--primary)",
  strokeWidth = BRAND_RIDGE_STROKE,
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
      <polyline
        points={BRAND_RIDGE_BACK}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeOpacity={0.55}
      />
      <polyline
        points={BRAND_RIDGE_FRONT}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** The mark inside the tinted, circular brand disc. */
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
        borderRadius: "50%",
        background:
          "color-mix(in srgb, var(--primary) 9%, var(--surface-container-lowest))",
        border:
          "1px solid color-mix(in srgb, var(--primary) 32%, transparent)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <BrandMark size={Math.round(size * 0.62)} color="var(--primary)" />
    </div>
  );
}

/** Horizontal lockup: brand disc + AERIE wordmark. */
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
