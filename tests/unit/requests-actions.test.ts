import { describe, it, expect, vi, beforeEach } from "vitest";

// Server actions orchestrate the clients + registry; mock the heavy/server-only deps
// so we can test the orchestration logic (id/secret gating, movie vs series, resolve).
vi.mock("@/lib/db/client", () => ({ db: {}, schema: {} }));
vi.mock("@/lib/db/bootstrap", () => ({ ensureDb: vi.fn() }));
vi.mock("@/lib/session", () => ({ getSessionUser: vi.fn() }));
vi.mock("@/lib/integrations/registry", () => ({ getServiceSecret: vi.fn() }));
vi.mock("@/lib/integrations/clients", () => ({
  radarrMovieMeta: vi.fn(),
  sonarrSeriesMeta: vi.fn(),
  sonarrSeasonQuality: vi.fn(),
  tautulliShowTmdb: vi.fn(),
  overseerrMediaByTmdb: vi.fn(),
}));

import { getServiceSecret } from "@/lib/integrations/registry";
import { radarrMovieMeta, sonarrSeriesMeta, sonarrSeasonQuality, tautulliShowTmdb, overseerrMediaByTmdb } from "@/lib/integrations/clients";
import { getMediaDetail, getSeasonQuality, resolveDiscoverItem } from "@/app/(portal)/requests/actions";

const secret = vi.mocked(getServiceSecret);

beforeEach(() => {
  vi.clearAllMocks();
  // Default: every service configured (override per-test for the gating cases).
  secret.mockResolvedValue("secret");
});

describe("getMediaDetail", () => {
  it("movie → Radarr meta by tmdbId", async () => {
    vi.mocked(radarrMovieMeta).mockResolvedValue({ monitored: true, hasFile: true, fileInfo: { label: "2160p" } });
    expect(await getMediaDetail({ kind: "movie", tmdbId: 603 })).toEqual({ monitored: true, hasFile: true, fileInfo: { label: "2160p" } });
    expect(radarrMovieMeta).toHaveBeenCalledWith(603);
  });

  it("movie → {} when no tmdbId or Radarr not configured", async () => {
    expect(await getMediaDetail({ kind: "movie" })).toEqual({});
    secret.mockResolvedValue(null);
    expect(await getMediaDetail({ kind: "movie", tmdbId: 1 })).toEqual({});
    expect(radarrMovieMeta).not.toHaveBeenCalled();
  });

  it("series → merges Sonarr meta + per-season quality", async () => {
    vi.mocked(sonarrSeriesMeta).mockResolvedValue({ monitored: false, hasFile: true, studio: "HBO" });
    vi.mocked(sonarrSeasonQuality).mockResolvedValue([{ season: 1, label: "1080p WEB-DL", episodeCount: 8 }]);
    const out = await getMediaDetail({ kind: "series", arrId: 42 });
    expect(out).toMatchObject({ monitored: false, hasFile: true, studio: "HBO" });
    expect(out.seasons).toHaveLength(1);
  });

  it("series → {} when no arrId", async () => {
    expect(await getMediaDetail({ kind: "series" })).toEqual({});
    expect(sonarrSeriesMeta).not.toHaveBeenCalled();
  });
});

describe("getSeasonQuality", () => {
  it("returns Sonarr seasons when configured", async () => {
    vi.mocked(sonarrSeasonQuality).mockResolvedValue([{ season: 1, label: "1080p", episodeCount: 3 }]);
    expect(await getSeasonQuality(42)).toHaveLength(1);
  });
  it("returns [] when id missing or Sonarr not configured", async () => {
    expect(await getSeasonQuality(0)).toEqual([]);
    secret.mockResolvedValue(null);
    expect(await getSeasonQuality(42)).toEqual([]);
  });
});

describe("resolveDiscoverItem", () => {
  it("returns null when Overseerr isn't configured", async () => {
    secret.mockResolvedValue(null);
    expect(await resolveDiscoverItem({ kind: "movie", tmdbId: 1 })).toBeNull();
    expect(overseerrMediaByTmdb).not.toHaveBeenCalled();
  });

  it("movie → resolves directly by tmdbId", async () => {
    vi.mocked(overseerrMediaByTmdb).mockResolvedValue({ id: "603", title: "Dune", kind: "movie", year: 2021, rating: 8, state: "available", overview: "" });
    const item = await resolveDiscoverItem({ kind: "movie", tmdbId: 603 });
    expect(item?.id).toBe("603");
    expect(overseerrMediaByTmdb).toHaveBeenCalledWith(603, "movie");
  });

  it("series → resolves the show TMDB from the grandparent rating key", async () => {
    vi.mocked(tautulliShowTmdb).mockResolvedValue(1396);
    vi.mocked(overseerrMediaByTmdb).mockResolvedValue({ id: "1396", title: "Show", kind: "series", year: 2008, rating: 9, state: null, overview: "" });
    const item = await resolveDiscoverItem({ kind: "series", grandparentRatingKey: "102166" });
    expect(tautulliShowTmdb).toHaveBeenCalledWith("102166");
    expect(overseerrMediaByTmdb).toHaveBeenCalledWith(1396, "series");
    expect(item?.kind).toBe("series");
  });

  it("returns null when no TMDB id can be resolved", async () => {
    vi.mocked(tautulliShowTmdb).mockResolvedValue(undefined);
    expect(await resolveDiscoverItem({ kind: "series", grandparentRatingKey: "x" })).toBeNull();
    expect(overseerrMediaByTmdb).not.toHaveBeenCalled();
  });
});
