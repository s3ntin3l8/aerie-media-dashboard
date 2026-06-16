import { describe, it, expect, vi } from "vitest";

// Stub next/og so we assert OUR wiring (size, which art, static rendering) rather
// than exercising satori/resvg. `new ImageResponse(el, opts)` returns the captured
// element + options for inspection.
vi.mock("next/og", () => ({
  ImageResponse: vi.fn(function (element: unknown, options: unknown) {
    return { element, options };
  }),
}));

import * as icon192 from "@/app/icon-192.png/route";
import * as icon512 from "@/app/icon-512.png/route";
import * as iconMask from "@/app/icon-maskable.png/route";
import AppleIcon, { size as appleSize, contentType as appleType } from "@/app/apple-icon";

type Img = { props: { src: string; width: number; height: number } };
type Captured = { element: { props: { children: Img | (Img | undefined)[] } }; options: { width: number; height: number } };

const imgOf = (res: Captured): Img => {
  const kids = res.element.props.children;
  const img = Array.isArray(kids) ? kids.find((k) => k?.props?.src) : kids;
  if (!img) throw new Error("no <img> child");
  return img;
};
const svgOf = (res: Captured) =>
  decodeURIComponent(imgOf(res).props.src.replace(/^data:image\/svg\+xml;utf8,/, ""));

describe("PWA icon routes", () => {
  it.each([
    { name: "icon-192", mod: icon192, size: 192 },
    { name: "icon-512", mod: icon512, size: 512 },
    { name: "icon-maskable", mod: iconMask, size: 512 },
  ])("$name renders at $size and is force-static", ({ mod, size }) => {
    // Cached at build time, not regenerated per request.
    expect(mod.dynamic).toBe("force-static");
    const res = mod.GET() as unknown as Captured;
    expect(res.options).toEqual({ width: size, height: size });
    expect(imgOf(res).props.width).toBe(size);
    expect(imgOf(res).props.height).toBe(size);
  });

  it("the any-purpose routes embed the circular mark", () => {
    for (const mod of [icon192, icon512]) {
      const svg = svgOf(mod.GET() as unknown as Captured);
      expect(svg).toContain("<circle");
      expect(svg).not.toContain("<rect");
    }
  });

  it("the maskable route embeds the square full-bleed variant", () => {
    const svg = svgOf(iconMask.GET() as unknown as Captured);
    expect(svg).toContain('<rect x="0" y="0" width="120" height="120"');
    expect(svg).toMatch(/scale\(0?\.\d+\)/); // mark held inside the safe zone
  });

  it("the Apple touch icon renders at 180 with the circular mark", () => {
    expect(appleSize).toEqual({ width: 180, height: 180 });
    expect(appleType).toBe("image/png");
    const res = AppleIcon() as unknown as Captured;
    expect(res.options).toEqual({ width: 180, height: 180 });
    expect(imgOf(res).props.width).toBe(180);
    expect(svgOf(res)).toContain("<circle");
  });
});
