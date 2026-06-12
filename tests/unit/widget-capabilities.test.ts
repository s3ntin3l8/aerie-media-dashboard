import { describe, it, expect } from "vitest";
import { sourceOptions, capabilitySources, resolveBySource, CAPABILITY_SOURCES } from "@/lib/widgets/capabilities";

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

describe("widget capabilities — resolveBySource", () => {
  const lib = [
    { id: "movies", source: "tautulli" },
    { id: "plays", source: "tautulli" },
    { id: "movies", source: "jellyfin" },
    { id: "audiobooks", source: "listenarr" },
  ];
  const media = ["tautulli", "jellyfin"];

  it("filters to an explicit source", () => {
    expect(resolveBySource(lib, "jellyfin", media).map((i) => i.id)).toEqual(["movies"]);
  });

  it("Auto picks the first media-priority source present, plus all non-media items", () => {
    // Tautulli wins for media; the listenarr (non-media) card is always kept; jellyfin dropped.
    expect(resolveBySource(lib, "", media).map((i) => `${i.source}:${i.id}`)).toEqual([
      "tautulli:movies",
      "tautulli:plays",
      "listenarr:audiobooks",
    ]);
  });

  it("Auto falls through to the next media source when the first is absent", () => {
    const jfOnly = [{ id: "movies", source: "jellyfin" }, { id: "books", source: "listenarr" }];
    expect(resolveBySource(jfOnly, "", media).map((i) => i.source)).toEqual(["jellyfin", "listenarr"]);
  });

  it("Auto with no media priority is a pass-through merge (now-playing)", () => {
    const np = [{ id: "a", source: "plex" }, { id: "b", source: "jellyfin" }];
    expect(resolveBySource(np, "", [])).toHaveLength(2);
  });

  it("is empty-safe", () => {
    expect(resolveBySource([], "", media)).toEqual([]);
  });
});
