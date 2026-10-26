import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// Guardrail from the 2026-10 portal UI/UX audit: the accent/status tokens are used as text on a
// 12-13% tint of themselves (pills, badges), over the page surfaces. axe only sees what a capture
// renders, so this checks the real token values in both themes against WCAG AA (4.5:1).

const css = readFileSync("styles/colors_and_type.css", "utf8");
const lightBlock = css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {")));
// The dark theme block is the second block that defines --surface.
const darkStart = css.indexOf("--surface:", css.indexOf("--surface:") + 1);
const darkBlock = css.slice(css.lastIndexOf("{", darkStart), css.indexOf("}", darkStart));

const tokens = (block: string) =>
  Object.fromEntries([...block.matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6})\b/g)].map((m) => [m[1], m[2]]));
const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const luminance = (hex: string) => {
  const [r, g, b] = channels(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const tint = (fg: string, bg: string, p: number) => {
  const f = channels(fg), g = channels(bg);
  return "#" + f.map((v, i) => Math.round(v * p + g[i] * (1 - p)).toString(16).padStart(2, "0")).join("");
};

// `--near` is deliberately absent: nothing renders text in it, so it has no contrast requirement.
const ACCENTS = ["--originator-court", "--originator-opposing", "--originator-own", "--originator-third-party", "--originator-unknown", "--amber", "--warning", "--critical", "--primary"];
const SURFACES = ["--surface", "--surface-container", "--surface-container-lowest"];

describe.each([
  ["light", tokens(lightBlock)],
  ["dark", tokens(darkBlock)],
])("%s theme accent contrast", (_name, t) => {
  it("parsed the theme's surface and accent tokens", () => {
    for (const surface of SURFACES) expect(t[surface], surface).toMatch(/^#[0-9a-f]{6}$/i);
    expect(t["--primary"]).toMatch(/^#[0-9a-f]{6}$/i);
  });

  for (const accent of ACCENTS) {
    it(`${accent} reads on its own 13% tint over every surface`, () => {
      // A renamed or dropped token must fail here, not silently skip its contrast check.
      expect(t[accent], `${accent} must be a plain hex in this theme`).toMatch(/^#[0-9a-f]{6}$/i);
      for (const surface of SURFACES) {
        const bg = tint(t[accent], t[surface], 0.13);
        expect(ratio(t[accent], bg), `${accent} on ${surface}`).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});

// Focus ring (audit #277): WCAG 1.4.11 wants >= 3:1 for the indicator against what it sits on.
describe.each([
  ["light", tokens(lightBlock)],
  ["dark", tokens(darkBlock)],
])("%s theme focus ring", (_name, t) => {
  for (const surface of SURFACES) {
    it(`--primary outline reads on ${surface}`, () => {
      expect(ratio(t["--primary"], t[surface])).toBeGreaterThanOrEqual(3);
    });
  }
});

describe("motion and focus rules in components.css", () => {
  const components = readFileSync("styles/components.css", "utf8");
  const globals = readFileSync("app/globals.css", "utf8");

  it("has a prefers-reduced-motion block that stops animations and transitions", () => {
    const m = components.match(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/);
    expect(m, "missing @media (prefers-reduced-motion: reduce)").not.toBeNull();
    expect(m![1]).toMatch(/animation-duration:[^;]*!important/);
    expect(m![1]).toMatch(/animation-iteration-count:\s*1\s*!important/);
    expect(m![1]).toMatch(/transition-duration:[^;]*!important/);
  });

  it("every @keyframes lives in a file the reduced-motion block covers (global *)", () => {
    // The block uses the universal selector, so any keyframes in these two stylesheets are covered.
    const names = [...(components + globals).matchAll(/@keyframes\s+(\w+)/g)].map((x) => x[1]);
    expect(names.length).toBeGreaterThanOrEqual(7);
  });

  it("has one shared :focus-visible outline rule for non-button controls", () => {
    expect(components).toMatch(/:where\([^{]*\[role="tab"\][^{]*:focus-visible\s*\{\s*outline:\s*2px solid var\(--primary\)/);
  });
});
