// Shared AERIE brand-mark geometry, used by the generated icon routes
// (apple-icon, icon-192/512, maskable) so the mark lives in one place.
// Geometry mirrors app/icon.svg and components/brand/Brand.tsx.

const BG = "#0b1326";
const STROKE = "#57f1db";

// The ridgeline mark on a full-bleed circular background — the standard
// any-purpose app icon (matches the favicon and Apple touch icon).
export const MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
  <circle cx="60" cy="60" r="60" fill="${BG}"/>
  <g fill="none" stroke="${STROKE}" stroke-width="7.5" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="16,86 50,40 70,66"/>
    <polyline points="58,74 80,50 100,80" stroke-opacity="0.55"/>
  </g>
  <circle cx="60" cy="60" r="59" fill="none" stroke="${STROKE}" stroke-opacity="0.32" stroke-width="2"/>
</svg>`;

// Maskable variant: square full-bleed background with the mark scaled to
// ~66% and centered, so it stays inside the maskable safe zone (inner 80%)
// and the OS can crop it to any shape (circle/squircle) without clipping.
export const MASKABLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
  <rect x="0" y="0" width="120" height="120" fill="${BG}"/>
  <g transform="translate(60 60) scale(0.66) translate(-60 -60)" fill="none" stroke="${STROKE}" stroke-width="7.5" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="16,86 50,40 70,66"/>
    <polyline points="58,74 80,50 100,80" stroke-opacity="0.55"/>
  </g>
</svg>`;
