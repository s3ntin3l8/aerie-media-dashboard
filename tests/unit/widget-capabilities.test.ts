import { describe, it, expect } from "vitest";
import { sourceOptions, capabilitySources, CAPABILITY_SOURCES } from "@/lib/widgets/capabilities";

describe("widget capabilities — sourceOptions", () => {
  it("always leads with an Auto entry", () => {
    const opts = sourceOptions("nowPlaying", []);
    expect(opts[0]).toEqual({ value: "", label: "Auto (all sources)" });
  });

  it("returns only Auto when nothing is configured", () => {
    expect(sourceOptions("library", [])).toHaveLength(1);
  });

  it("includes a source when any of its backing services is configured", () => {
    // Plex now-playing is available when EITHER plex or tautulli is configured.
    const opts = sourceOptions("nowPlaying", [{ id: "tautulli" }]);
    expect(opts.map((o) => o.value)).toContain("plex");
    expect(opts.map((o) => o.value)).not.toContain("jellyfin");
  });

  it("lists multiple configured sources in priority order after Auto", () => {
    const opts = sourceOptions("indexers", [{ id: "nzbhydra" }, { id: "prowlarr" }]);
    expect(opts.map((o) => o.value)).toEqual(["", "prowlarr", "nzbhydra"]);
  });

  it("capabilitySources lists the ordered tag values", () => {
    expect(capabilitySources("metrics")).toEqual(["prometheus", "beszel"]);
  });

  it("every capability has at least one source def", () => {
    for (const defs of Object.values(CAPABILITY_SOURCES)) {
      expect(defs.length).toBeGreaterThan(0);
    }
  });
});
