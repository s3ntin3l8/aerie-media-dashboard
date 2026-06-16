import { describe, it, expect } from "vitest";
import { MARK_SVG, MASKABLE_SVG } from "@/app/_brand-mark";

// The shared brand geometry feeds the favicon, Apple touch icon, and all PWA
// icon routes. Pin the brand colors and — critically — the maskable safe-zone
// treatment, which is easy to regress and invisible until an OS clips the icon.
const BG = "#0b1326";
const STROKE = "#57f1db";

describe("app/_brand-mark.ts", () => {
  it("MARK_SVG is the circular any-purpose mark in brand colors", () => {
    expect(MARK_SVG).toContain('viewBox="0 0 120 120"');
    expect(MARK_SVG).toContain(`fill="${BG}"`);
    expect(MARK_SVG).toContain(`stroke="${STROKE}"`);
    // Circular treatment: a filled background circle, no full-bleed rect.
    expect(MARK_SVG).toContain("<circle");
    expect(MARK_SVG).not.toContain("<rect");
  });

  it("MASKABLE_SVG is square full-bleed with the mark pulled into the safe zone", () => {
    expect(MASKABLE_SVG).toContain('viewBox="0 0 120 120"');
    // Full-bleed background covering the whole canvas so the OS can crop any shape.
    expect(MASKABLE_SVG).toContain(`<rect x="0" y="0" width="120" height="120" fill="${BG}"`);
    // Mark scaled <1 about the center → inside the maskable safe zone (no clipping).
    expect(MASKABLE_SVG).toMatch(/translate\(60 60\) scale\(0?\.\d+\) translate\(-60 -60\)/);
    const scale = Number(MASKABLE_SVG.match(/scale\((0?\.\d+)\)/)?.[1]);
    expect(scale).toBeGreaterThan(0);
    expect(scale).toBeLessThanOrEqual(0.8); // within the inner-80% safe zone
    expect(MASKABLE_SVG).toContain(`stroke="${STROKE}"`);
  });
});
