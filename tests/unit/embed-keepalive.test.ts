import { describe, it, expect } from "vitest";
import { serviceIdFromPath, nextMountedIds } from "@/lib/embed/keepAlive";

describe("embed/keepAlive — serviceIdFromPath", () => {
  it("extracts the id from a /s/<id> path", () => {
    expect(serviceIdFromPath("/s/sonarr")).toBe("sonarr");
  });

  it("extracts the id when a trailing segment follows", () => {
    expect(serviceIdFromPath("/s/sonarr/anything")).toBe("sonarr");
  });

  it("decodes percent-encoded ids", () => {
    expect(serviceIdFromPath("/s/my%20app")).toBe("my app");
  });

  it("returns null for non-service routes", () => {
    expect(serviceIdFromPath("/services")).toBeNull();
    expect(serviceIdFromPath("/admin")).toBeNull();
    expect(serviceIdFromPath("/")).toBeNull();
  });

  it("returns null for empty/nullish input", () => {
    expect(serviceIdFromPath(null)).toBeNull();
    expect(serviceIdFromPath(undefined)).toBeNull();
    expect(serviceIdFromPath("")).toBeNull();
  });
});

describe("embed/keepAlive — nextMountedIds", () => {
  const keep = ["sonarr", "radarr"];

  it("lazily adds the active id on first open", () => {
    expect(nextMountedIds([], keep, "sonarr")).toEqual(["sonarr"]);
  });

  it("keeps previously-opened ids mounted when navigating to another (preserves state)", () => {
    expect(nextMountedIds(["sonarr"], keep, "radarr")).toEqual(["sonarr", "radarr"]);
  });

  it("does not duplicate an already-mounted active id", () => {
    const prev = ["sonarr", "radarr"];
    expect(nextMountedIds(prev, keep, "sonarr")).toBe(prev); // same ref → no re-render
  });

  it("keeps ids mounted when navigating away to a non-embed route (activeId null)", () => {
    const prev = ["sonarr"];
    expect(nextMountedIds(prev, keep, null)).toBe(prev);
  });

  it("prunes ids that are no longer keep-alive (flag off / deactivated / deleted)", () => {
    expect(nextMountedIds(["sonarr", "radarr"], ["radarr"], null)).toEqual(["radarr"]);
  });

  it("ignores an active id that is not in the keep-alive set", () => {
    expect(nextMountedIds([], keep, "plex")).toEqual([]);
  });

  it("returns the same reference when nothing changed (no spurious re-render)", () => {
    const prev = ["sonarr"];
    expect(nextMountedIds(prev, keep, "sonarr")).toBe(prev);
  });
});
