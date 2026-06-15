import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockHttp, mockClientsRegistry, mockEnv } from "./clientsMocks";

// Same harness as clients-media.test.ts: stub the HTTP layer + registry creds so the real
// normalizers run against controlled upstream payloads, with no DB or network.
vi.mock("@/lib/integrations/http", () => mockHttp());
vi.mock("@/lib/integrations/registry", () => mockClientsRegistry());
vi.mock("@/lib/env", () => mockEnv());

import { fetchJson } from "@/lib/integrations/http";
import { getServiceCredentials } from "@/lib/integrations/registry";
import {
  clearCache,
  jellyfinLibraries, jellyfinRecentlyAdded,
  tautulliLibraries, tautulliPlays24h, tautulliRecentlyAdded, tautulliUsers, tautulliStreamHistory,
  listenarrQueue, listenarrHistory, listenarrHealth,
  overseerrIssues, overseerrVersion, overseerrPopularMovies,
} from "@/lib/integrations/clients";

const mockJson = vi.mocked(fetchJson);
beforeEach(() => {
  vi.clearAllMocks();
  clearCache();
  vi.mocked(getServiceCredentials).mockResolvedValue({ baseUrl: "http://svc", apiKey: "key", insecureTls: false } as never);
});

describe("jellyfinLibraries", () => {
  it("emits only the non-zero categories with formatted counts and detail deltas", async () => {
    mockJson.mockResolvedValue({ MovieCount: 1234, SeriesCount: 12, EpisodeCount: 300, AlbumCount: 0 } as never);
    const out = await jellyfinLibraries();
    expect(out.map((l) => l.id)).toEqual(["movies", "shows"]); // music dropped (AlbumCount 0)
    expect(out[0]).toMatchObject({ count: "1,234", delta: "1,234 titles" });
    expect(out[1].delta).toBe("300 episodes");
  });

  it("is empty when every count is zero/absent", async () => {
    mockJson.mockResolvedValue({} as never);
    expect(await jellyfinLibraries()).toEqual([]);
  });
});

describe("jellyfinRecentlyAdded", () => {
  it("maps types to kinds and pins the artwork ref to SeriesId for episodes", async () => {
    mockJson.mockResolvedValue({ Items: [
      { Id: "m1", Name: "Film", Type: "Movie", ProductionYear: 2021 },
      { Id: "e1", Name: "Ep", Type: "Episode", SeriesName: "Show", SeriesId: "s9" },
      { Id: "a1", Name: "Song", Type: "Audio" },
    ] } as never);
    const out = await jellyfinRecentlyAdded();
    expect(out.map((r) => r.kind)).toEqual(["movie", "series", "track"]);
    expect(out[1].title).toBe("Show"); // SeriesName preferred
    expect(out[1].art).toContain("ref=s9"); // episode art keyed on SeriesId, not the episode id
    expect(out[2].year).toBe(0); // missing ProductionYear → 0
  });
});

describe("tautulliLibraries", () => {
  it("reads the per-section counts (episodes from child, albums from parent)", async () => {
    mockJson.mockResolvedValue({ response: { data: [
      { section_type: "movie", section_name: "Movies", count: "500" },
      { section_type: "show", section_name: "TV", count: 80, child_count: 4200 },
      { section_type: "artist", section_name: "Music", child_count: 1500, parent_count: 320 },
    ] } } as never);
    const out = await tautulliLibraries();
    expect(out.find((l) => l.id === "movies")?.count).toBe("500");
    expect(out.find((l) => l.id === "shows")?.delta).toBe("4,200 episodes");
    expect(out.find((l) => l.id === "music")).toMatchObject({ count: "1,500", delta: "320 albums" });
  });
});

describe("tautulliPlays24h", () => {
  it("buckets in-window records into the current hour and ignores stale ones", async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    mockJson.mockResolvedValue({ response: { data: { recordsFiltered: 7, data: [
      { started: nowSec - 60 },              // current hour → last bucket
      { started: nowSec - 25 * 3600 },       // older than 24h → dropped
      { date: nowSec - 120 },                // falls back to `date`
    ] } } } as never);
    const { total, hourly } = await tautulliPlays24h();
    expect(total).toBe(7); // recordsFiltered wins over array length
    expect(hourly).toHaveLength(24);
    expect(hourly[23]).toBe(2); // both in-window plays land in the current hour
    expect(hourly.reduce((a, b) => a + b, 0)).toBe(2);
  });
});

describe("tautulliRecentlyAdded", () => {
  it("derives kind/year/art and only resolves tmdb for non-series", async () => {
    mockJson.mockResolvedValue({ response: { data: { recently_added: [
      { title: "Dune", year: "2021", media_type: "movie", thumb: "/t1", guids: ["tmdb://438631"], rating_key: 55 },
      { title: "S1E1", media_type: "episode", grandparent_thumb: "/g", grandparent_rating_key: 9 },
    ] } } } as never);
    const out = await tautulliRecentlyAdded();
    expect(out[0]).toMatchObject({ kind: "movie", year: 2021, ratingKey: "55", tmdbId: 438631 });
    expect(out[0].art).toContain("ref=" + encodeURIComponent("/t1"));
    expect(out[1]).toMatchObject({ kind: "series", year: 0, tmdbId: undefined, grandparentRatingKey: "9" });
  });
});

describe("tautulliUsers", () => {
  it("blanks falsy fields and proxies the avatar thumb", async () => {
    mockJson.mockResolvedValue({ response: { data: [
      { username: "ada", friendly_name: "Ada", email: "", user_thumb: "/u" },
      { username: "bo", thumb: "/fallback" },
    ] } } as never);
    const out = await tautulliUsers();
    expect(out[0]).toMatchObject({ username: "ada", friendlyName: "Ada", email: undefined });
    expect(out[0].avatar).toContain("kind=avatar");
    expect(out[1].avatar).toContain(encodeURIComponent("/fallback")); // falls back to thumb
  });
});

describe("tautulliStreamHistory", () => {
  it("maps fields, defaults, and whitelists transcode_decision", async () => {
    mockJson.mockResolvedValue({ response: { data: { data: [
      { row_id: 1, title: "Dune", media_type: "movie", friendly_name: "Ada", started: 100, duration: 200, rating_key: "7", transcode_decision: "transcode" },
      { media_type: "episode", transcode_decision: "bogus" },
    ] } } } as never);
    const out = await tautulliStreamHistory();
    expect(out[0]).toMatchObject({ id: 1, kind: "movie", user: "Ada", ratingKey: 7, transcodeDecision: "transcode" });
    expect(out[1]).toMatchObject({ id: 0, title: "", kind: "episode", started: 0, watchedStatus: 0 });
    expect(out[1].transcodeDecision).toBeUndefined(); // unknown value rejected
  });
});

describe("listenarrQueue", () => {
  it("prefers byte progress, clamps pct, and formats speed/eta", async () => {
    mockJson.mockResolvedValue({ items: [
      { id: "a", title: "Book", author: "Auth", size: 200, downloaded: 50, downloadSpeed: 2_097_152, eta: 90 },
      { title: "Solo", progress: 150 }, // no bytes → progress, clamped to 100; no author/eta/speed
    ] } as never);
    const out = await listenarrQueue();
    expect(out[0]).toMatchObject({ id: "listenarr-a", title: "Book · Auth", pct: 25, speed: "2.0 MB/s", eta: "1m" });
    expect(out[1]).toMatchObject({ title: "Solo", pct: 100, speed: "", eta: "—" });
  });
});

describe("listenarrHistory", () => {
  it("merges the three history endpoints, tags events, and sorts newest first", async () => {
    mockJson
      .mockResolvedValueOnce([{ id: 1, audiobookTitle: "Old", timestamp: "2024-01-01T00:00:00" }] as never)   // Grabbed
      .mockResolvedValueOnce([{ id: 2, audiobookTitle: "New", timestamp: "2024-06-01T00:00:00Z" }] as never)  // Downloaded
      .mockResolvedValueOnce([] as never);                                                                     // Imported
    const out = await listenarrHistory();
    expect(out.map((e) => e.event)).toEqual(["imported", "grabbed"]); // newest (Downloaded) first
    expect(out[1].when).toBe("2024-01-01T00:00:00Z"); // suffix-less UTC pinned with Z
  });
});

describe("listenarrHealth", () => {
  it("flags disconnected clients (error) and degraded APIs (warning), skipping disabled ones", async () => {
    mockJson.mockResolvedValue({
      status: "degraded",
      downloadClients: { clients: [{ name: "SAB", status: "disconnected" }, { name: "OK", status: "connected" }] },
      externalApis: { apis: [{ name: "MB", status: "down" }, { name: "off", status: "down", enabled: false }] },
    } as never);
    const out = await listenarrHealth();
    expect(out).toEqual([
      { svc: "listenarr", type: "error", message: "Download client SAB is disconnected" },
      { svc: "listenarr", type: "warning", message: "MB is down" },
    ]);
  });

  it("falls back to the overall status when no component explains the degradation", async () => {
    mockJson.mockResolvedValue({ status: "degraded" } as never);
    expect((await listenarrHealth())[0].message).toBe('Listenarr reports status "degraded"');
  });
});

describe("overseerrIssues", () => {
  it("uses pageInfo.results for the open count and defaults issue fields", async () => {
    mockJson.mockResolvedValue({ pageInfo: { results: 9 }, results: [{ id: 3 }] } as never);
    expect(await overseerrIssues()).toEqual({ open: 9, items: [{ id: 3, issueType: 0, status: 0 }] });
  });
});

describe("overseerrVersion", () => {
  it("strips the v prefix and shortens develop SHAs", async () => {
    mockJson.mockResolvedValueOnce({ version: "v1.2.3" } as never);
    expect(await overseerrVersion()).toBe("1.2.3");
    clearCache();
    mockJson.mockResolvedValueOnce({ version: "develop-abc1234def567" } as never);
    expect(await overseerrVersion()).toBe("develop-abc1234");
    clearCache();
    mockJson.mockResolvedValueOnce({} as never);
    expect(await overseerrVersion()).toBeNull();
  });
});

describe("overseerrPopularMovies (discover)", () => {
  it("keeps movie/tv, drops people, and maps state from mediaInfo", async () => {
    mockJson.mockResolvedValue({ results: [
      { id: 1, mediaType: "movie", title: "M", releaseDate: "2020-05-01", voteAverage: 7.84, mediaInfo: { status: 5 } },
      { id: 2, mediaType: "person", name: "Nobody" },
      { id: 3, mediaType: "tv", name: "Show", firstAirDate: "2019-01-01" },
    ] } as never);
    const out = await overseerrPopularMovies();
    expect(out.map((d) => d.id)).toEqual(["1", "3"]); // person filtered
    expect(out[0]).toMatchObject({ kind: "movie", year: 2020, rating: 7.8, state: "available" });
    expect(out[1]).toMatchObject({ kind: "series", year: 2019, rating: 0, state: null });
  });
});
