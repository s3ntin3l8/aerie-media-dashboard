import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/integrations/http", () => ({
  fetchJson: vi.fn(),
  fetchJsonRaw: vi.fn(),
  fetchRaw: vi.fn(),
  IntegrationError: class IntegrationError extends Error {
    service: string;
    constructor(service: string, message: string) { super(`[${service}] ${message}`); this.service = service; }
  },
}));
vi.mock("@/lib/integrations/registry", () => ({ getServiceCredentials: vi.fn(), getDeploymentSetting: vi.fn() }));
vi.mock("@/lib/env", () => ({ env: { encryptionKey: "0".repeat(64), authSecret: "test", configFile: "/dev/null", databaseUrl: "file::memory:" }, authConfigured: false }));

import { fetchJson } from "@/lib/integrations/http";
import { getServiceCredentials } from "@/lib/integrations/registry";
import { clearCache, tautulliHomeStats, overseerrRequestCounts, overseerrTrending, jellyfinNowPlaying, audiobookshelfNowPlaying } from "@/lib/integrations/clients";

const mockJson = vi.mocked(fetchJson);
beforeEach(() => {
  vi.clearAllMocks();
  clearCache();
  vi.mocked(getServiceCredentials).mockResolvedValue({ baseUrl: "http://svc", apiKey: "key", insecureTls: false } as never);
});

describe("tautulliHomeStats", () => {
  it("extracts top users and merged top media", async () => {
    mockJson.mockResolvedValue({ response: { data: [
      { stat_id: "top_users", rows: [{ friendly_name: "Ada", total_plays: 5 }] },
      { stat_id: "top_movies", rows: [{ title: "Dune", total_plays: 3, thumb: "t1" }] },
      { stat_id: "top_tv", rows: [{ title: "Show", total_plays: 9 }] },
    ] } } as never);
    const s = await tautulliHomeStats();
    expect(s.users[0]).toEqual({ name: "Ada", plays: 5 });
    expect(s.media[0].title).toBe("Show"); // highest plays first
    expect(s.media.find((m) => m.title === "Dune")?.art).toContain("/api/artwork");
  });
});

describe("overseerrRequestCounts", () => {
  it("folds unavailable into failed", async () => {
    mockJson.mockResolvedValue({ total: 10, pending: 2, approved: 3, processing: 1, failed: 1, unavailable: 1, available: 3 } as never);
    expect(await overseerrRequestCounts()).toEqual({ total: 10, pending: 2, approved: 3, processing: 1, failed: 2, available: 3 });
  });
});

describe("overseerrTrending", () => {
  it("keeps only movie/tv discover results", async () => {
    mockJson.mockResolvedValue({ results: [
      { id: 1, mediaType: "movie", title: "M", posterPath: "/p" },
      { id: 2, mediaType: "person", name: "P" },
      { id: 3, mediaType: "tv", name: "T" },
    ] } as never);
    const items = await overseerrTrending();
    expect(items).toHaveLength(2);
  });
});

describe("jellyfinNowPlaying", () => {
  it("maps active sessions, ignoring idle ones", async () => {
    mockJson.mockResolvedValue([
      { NowPlayingItem: { Type: "Movie", Id: "i1", Name: "Film", RunTimeTicks: 36_000_000_000, MediaStreams: [{ Type: "Video", Codec: "h264" }, { Type: "Audio", Codec: "aac" }] }, PlayState: { PositionTicks: 18_000_000_000, PlayMethod: "DirectPlay" }, RemoteEndPoint: "1.2.3.4:5", UserName: "Ada" },
      { /* idle session, no NowPlayingItem */ },
    ] as never);
    const np = await jellyfinNowPlaying();
    expect(np).toHaveLength(1);
    expect(np[0]).toMatchObject({ kind: "movie", src: "jellyfin" });
  });
});

describe("audiobookshelfNowPlaying", () => {
  it("maps online users with a session", async () => {
    mockJson.mockResolvedValue({ usersOnline: [
      { username: "Ada", session: { id: "s1", displayTitle: "Book", displayAuthor: "Author", duration: 3600, currentTime: 100 } },
      { username: "idle" /* no session */ },
    ] } as never);
    const np = await audiobookshelfNowPlaying();
    expect(np).toHaveLength(1);
    expect(np[0]).toMatchObject({ kind: "track", src: "audiobookshelf", title: "Book" });
  });
});
