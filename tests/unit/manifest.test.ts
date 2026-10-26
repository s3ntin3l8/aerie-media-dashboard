import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import manifest from "@/app/manifest";

// The PWA install contract. These assertions are what a browser reads to decide
// install name, standalone display, splash colors, and which icons to use —
// guard them so a refactor can't silently break installability.
describe("app/manifest.ts", () => {
  const m = manifest();

  it("declares the install identity and standalone display", () => {
    expect(m.name).toBe("AERIE — Media Command Center");
    expect(m.short_name).toBe("AERIE");
    expect(m.description).toBeTruthy();
    expect(m.start_url).toBe("/");
    expect(m.display).toBe("standalone");
  });

  it("uses the locked dark-theme token for theme and background", () => {
    // --background from styles/colors_and_type.css; address bar + splash must match.
    expect(m.background_color).toBe("#0b1326");
    expect(m.theme_color).toBe("#0b1326");
  });

  it("ships the full icon set: svg + 192/512 any-purpose + a maskable 512", () => {
    const icons = m.icons ?? [];
    const byPurpose = (p: string) => icons.filter((i) => i.purpose === p);

    // Every PNG referenced here has a matching public route (exempted in proxy.ts).
    expect(icons.map((i) => i.src)).toEqual([
      "/icon.svg",
      "/icon-192.png",
      "/icon-512.png",
      "/icon-maskable.png",
    ]);

    // A scalable favicon, two raster any-purpose sizes, and exactly one maskable.
    expect(icons.find((i) => i.src === "/icon.svg")).toMatchObject({ type: "image/svg+xml", sizes: "any" });
    expect(byPurpose("any").map((i) => i.sizes)).toEqual(["192x192", "512x512"]);
    expect(byPurpose("maskable")).toEqual([
      { src: "/icon-maskable.png", type: "image/png", sizes: "512x512", purpose: "maskable" },
    ]);
    // Android needs a >=512 maskable to avoid an OS-generated fallback badge.
    expect(byPurpose("maskable")[0]?.sizes).toBe("512x512");
  });

  it("declares scope/identity and install metadata fields", () => {
    expect(m.id).toBe("/");
    expect(m.scope).toBe("/");
    expect(m.lang).toBe("en");
    expect(m.dir).toBe("ltr");
    expect(m.orientation).toBe("any");
    expect(m.categories?.length).toBeGreaterThan(0);
  });

  it("ships three in-scope shortcuts and never deep-links to admin", () => {
    const shortcuts = m.shortcuts ?? [];
    expect(shortcuts.map((s) => s.url)).toEqual(["/streams", "/requests", "/status"]);
    // Admin is admin-only; a generic shortcut would just redirect non-admins.
    expect(shortcuts.some((s) => s.url.startsWith("/admin"))).toBe(false);
    // Every shortcut url is in-scope (under scope "/").
    expect(shortcuts.every((s) => s.url.startsWith("/"))).toBe(true);
  });

  describe("screenshots (richer install dialog)", () => {
    const shots = m.screenshots ?? [];
    const dims = (sizes?: string) => (sizes ?? "").split("x").map(Number) as [number, number];

    it("ships both form factors", () => {
      expect(shots.some((s) => s.form_factor === "wide")).toBe(true);
      expect(shots.some((s) => s.form_factor === "narrow")).toBe(true);
    });

    it("points at committed public files whose real PNG size matches the declared size", () => {
      for (const s of shots) {
        expect(s.src.startsWith("/pwa/screenshots/")).toBe(true);
        expect(s.type).toBe("image/png");
        const file = readFileSync(path.join(process.cwd(), "public", s.src));
        // PNG IHDR: width/height are big-endian u32 at bytes 16 and 20.
        expect([file.readUInt32BE(16), file.readUInt32BE(20)]).toEqual(dims(s.sizes));
      }
    });

    it("keeps Chrome's rules: wide is landscape, narrow is portrait, ratio <= 2.3, one size per form factor", () => {
      for (const s of shots) {
        const [w, h] = dims(s.sizes);
        expect(Math.max(w, h) / Math.min(w, h)).toBeLessThanOrEqual(2.3);
        expect(s.form_factor === "wide" ? w > h : h > w).toBe(true);
      }
      for (const ff of ["wide", "narrow"] as const)
        expect(new Set(shots.filter((s) => s.form_factor === ff).map((s) => s.sizes)).size).toBe(1);
    });
  });
});
