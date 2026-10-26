import { describe, it, expect, vi } from "vitest";

// Stub next/og so we assert OUR wiring (size, art, static rendering), not satori/resvg.
vi.mock("next/og", () => ({
  ImageResponse: vi.fn(function (element: unknown, options: unknown) {
    return { element, options };
  }),
}));

import { SPLASH_IMAGES, APPLE_STARTUP_IMAGES } from "@/app/_splash";
import * as route from "@/app/pwa/splash/[size]/route";

type Captured = {
  element: { props: { children: ({ props: { src?: string; width?: number } } | undefined)[] } };
  options: { width: number; height: number };
};
const call = (size: string) => route.GET(new Request("http://x"), { params: Promise.resolve({ size }) });

describe("iOS splash table (app/_splash.ts)", () => {
  it("has unique sizes whose route segment is <W>x<H> in device pixels", () => {
    expect(new Set(SPLASH_IMAGES.map((i) => i.size)).size).toBe(SPLASH_IMAGES.length);
    for (const i of SPLASH_IMAGES) {
      expect(i.size).toBe(`${i.width}x${i.height}`);
      expect(i.url).toBe(`/pwa/splash/${i.size}`);
    }
  });

  it("gates each image by an exact device media query (pixels = CSS size × DPR)", () => {
    const iphone15pm = SPLASH_IMAGES.find((i) => i.size === "1290x2796");
    expect(iphone15pm?.media).toBe(
      "(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)",
    );
    for (const i of SPLASH_IMAGES) {
      const [, w, h, dpr] = /device-width: (\d+)px\) and \(device-height: (\d+)px\) and \(-webkit-device-pixel-ratio: (\d)\)/.exec(i.media)!;
      const landscape = i.media.endsWith("landscape)");
      expect([i.width, i.height]).toEqual([Number(w) * Number(dpr), Number(h) * Number(dpr)]);
      expect(landscape).toBe(Number(w) > Number(h));
    }
  });

  it("gives iPads a landscape twin of every portrait size", () => {
    const ipadAir = SPLASH_IMAGES.filter((i) => i.width === 1640 || i.height === 1640);
    expect(ipadAir.map((i) => i.size).sort()).toEqual(["1640x2360", "2360x1640"]);
  });

  it("exposes {url, media} pairs for the layout metadata", () => {
    expect(APPLE_STARTUP_IMAGES).toEqual(SPLASH_IMAGES.map(({ url, media }) => ({ url, media })));
  });
});

describe("/pwa/splash/[size] route", () => {
  it("is fully static: one pre-rendered image per table entry, nothing on demand", () => {
    expect(route.dynamic).toBe("force-static");
    expect(route.dynamicParams).toBe(false);
    expect(route.generateStaticParams()).toEqual(SPLASH_IMAGES.map(({ size }) => ({ size })));
  });

  it("renders at the exact device size with the brand mark", async () => {
    const res = (await call("1290x2796")) as unknown as Captured;
    expect(res.options).toEqual({ width: 1290, height: 2796 });
    const img = res.element.props.children.find((k) => k?.props?.src);
    expect(decodeURIComponent(img!.props.src!)).toContain("<circle");
    // Mark scales with the short edge so it fits both portrait phones and landscape iPads.
    expect(img!.props.width).toBe(Math.round(1290 * 0.28));
  });

  it("404s a size that is not in the table", async () => {
    const res = (await call("100x100")) as Response;
    expect(res.status).toBe(404);
  });
});
