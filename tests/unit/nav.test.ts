import { describe, it, expect } from "vitest";
import { NAV_ITEMS, RAIL_NAV_ITEMS, MOBILE_NAV_ITEMS, PALETTE_NAV_ITEMS } from "@/lib/nav";

describe("NAV_ITEMS", () => {
  it("has 5 items (services merged into status)", () => {
    expect(NAV_ITEMS).toHaveLength(5);
  });

  it("every item has required fields", () => {
    for (const item of NAV_ITEMS) {
      expect(item.id).toBeTruthy();
      expect(item.href).toBeTruthy();
      expect(item.icon).toBeTruthy();
      expect(item.label).toBeTruthy();
      expect(typeof item.isActive).toBe("function");
    }
  });

  it("home is active on exact /", () => {
    const home = NAV_ITEMS.find((i) => i.id === "home")!;
    expect(home.isActive("/")).toBe(true);
    expect(home.isActive("/streams")).toBe(false);
    expect(home.isActive("/admin")).toBe(false);
  });

  it("streams is active on /streams and /streams/xyz", () => {
    const streams = NAV_ITEMS.find((i) => i.id === "streams")!;
    expect(streams.isActive("/streams")).toBe(true);
    expect(streams.isActive("/streams/123")).toBe(true);
    expect(streams.isActive("/")).toBe(false);
  });

  it("status (merged Services) is active on /status, /s/plex, and legacy /services", () => {
    // The old `services` item is gone; the `status` item now covers the merged browse+health page.
    const status = NAV_ITEMS.find((i) => i.id === "status")!;
    expect(status.isActive("/status")).toBe(true);
    expect(status.isActive("/status/details")).toBe(true);
    expect(status.isActive("/s/plex")).toBe(true);
    expect(status.isActive("/services")).toBe(true); // legacy redirect path
    expect(status.isActive("/streams")).toBe(false);
    expect(status.isActive("/")).toBe(false);
  });

  it("requests is active on /requests and /requests/something", () => {
    const requests = NAV_ITEMS.find((i) => i.id === "requests")!;
    expect(requests.isActive("/requests")).toBe(true);
    expect(requests.isActive("/requests/something")).toBe(true);
    expect(requests.isActive("/")).toBe(false);
  });

  it("admin is active on /admin and /admin/settings", () => {
    const admin = NAV_ITEMS.find((i) => i.id === "admin")!;
    expect(admin.isActive("/admin")).toBe(true);
    expect(admin.isActive("/admin/settings")).toBe(true);
    expect(admin.isActive("/")).toBe(false);
  });

  it("admin is the only adminOnly item", () => {
    const adminItems = NAV_ITEMS.filter((i) => i.adminOnly);
    expect(adminItems).toHaveLength(1);
    expect(adminItems[0].id).toBe("admin");
  });

  it("has gKey shortcuts for home, services (g s on /status), requests, admin — g u is retired", () => {
    const withGKey = NAV_ITEMS.filter((i) => i.gKey);
    expect(withGKey.map((i) => i.gKey)).toEqual(
      expect.arrayContaining(["h", "s", "r", "a"]),
    );
    // g u (old Status shortcut) is retired.
    expect(withGKey.map((i) => i.gKey)).not.toContain("u");
  });

  it("streams has no gKey", () => {
    const streams = NAV_ITEMS.find((i) => i.id === "streams")!;
    expect(streams.gKey).toBeUndefined();
  });
});

describe("RAIL_NAV_ITEMS", () => {
  it("excludes mobileOnly items (currently none), equals NAV_ITEMS", () => {
    expect(RAIL_NAV_ITEMS).toHaveLength(NAV_ITEMS.length);
  });
});

describe("MOBILE_NAV_ITEMS", () => {
  it("excludes adminOnly items", () => {
    expect(MOBILE_NAV_ITEMS.every((i) => !i.adminOnly)).toBe(true);
    expect(MOBILE_NAV_ITEMS).toHaveLength(NAV_ITEMS.length - 1);
  });

  it("does not include admin", () => {
    expect(MOBILE_NAV_ITEMS.find((i) => i.id === "admin")).toBeUndefined();
  });
});

describe("PALETTE_NAV_ITEMS", () => {
  it("excludes mobileOnly items, equals NAV_ITEMS", () => {
    expect(PALETTE_NAV_ITEMS).toHaveLength(NAV_ITEMS.length);
  });
});