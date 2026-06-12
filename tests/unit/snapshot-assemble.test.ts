import { describe, it, expect } from "vitest";
import { buildLibrary, buildRecent, buildMetricsBySource } from "@/lib/data/assemble";
import type { LibraryStat, RecentItem } from "@/lib/types";

const lib = (id: string, count: string): LibraryStat => ({ id, label: id, count, icon: "x", delta: "" });
const rec = (id: string): RecentItem => ({ id, title: id, kind: "movie", year: 2020, cat: "stream" });

describe("buildLibrary", () => {
  it("tags every source and Auto-prefers Tautulli for media, appending books", () => {
    const { libraryAll, library } = buildLibrary({
      tautulli: [lib("movies", "100")],
      jellyfin: [lib("movies", "42")],
      lazylibrarian: [lib("books", "7")],
      listenarr: [lib("audiobooks", "3")],
      playsCard: lib("plays", "9"),
    });
    // all sources present + tagged
    expect(libraryAll.map((c) => c.source)).toEqual(["tautulli", "tautulli", "jellyfin", "lazylibrarian", "listenarr"]);
    // Auto: tautulli media + plays + books/audiobooks; jellyfin dropped
    expect(library.map((c) => `${c.source}:${c.id}`)).toEqual([
      "tautulli:movies", "tautulli:plays", "lazylibrarian:books", "listenarr:audiobooks",
    ]);
  });

  it("falls back to Jellyfin media when Tautulli has none", () => {
    const { library } = buildLibrary({ jellyfin: [lib("movies", "42")], listenarr: [lib("audiobooks", "3")] });
    expect(library.map((c) => c.source)).toEqual(["jellyfin", "listenarr"]);
  });

  it("omits the plays card when not provided and is empty-safe", () => {
    expect(buildLibrary({}).libraryAll).toEqual([]);
    expect(buildLibrary({ tautulli: [lib("movies", "1")] }).libraryAll.some((c) => c.id === "plays")).toBe(false);
  });
});

describe("buildRecent", () => {
  it("tags both sources; Auto prefers Tautulli", () => {
    const { recentAll, recent } = buildRecent([rec("a")], [rec("b")]);
    expect(recentAll.map((r) => r.source)).toEqual(["tautulli", "jellyfin"]);
    expect(recent.map((r) => r.source)).toEqual(["tautulli"]);
  });

  it("uses Jellyfin when Tautulli is empty", () => {
    expect(buildRecent([], [rec("b")]).recent.map((r) => r.source)).toEqual(["jellyfin"]);
  });
});

describe("buildMetricsBySource", () => {
  const a = { instance: "active" } as never;
  const b = { instance: "alt" } as never;
  it("maps active+alt onto prometheus/beszel by the active source", () => {
    expect(buildMetricsBySource("prometheus", a, b)).toEqual({ prometheus: a, beszel: b });
    expect(buildMetricsBySource("beszel", a, b)).toEqual({ beszel: a, prometheus: b });
  });
  it("keeps nulls", () => {
    expect(buildMetricsBySource("prometheus", null, null)).toEqual({ prometheus: null, beszel: null });
  });
});
