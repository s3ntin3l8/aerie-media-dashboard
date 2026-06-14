import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/integrations/http", () => ({
  fetchJson: vi.fn(),
  fetchRaw: vi.fn(),
  IntegrationError: class IntegrationError extends Error {
    service: string;
    status?: number;
    constructor(service: string, message: string, status?: number) {
      super(`[${service}] ${message}`);
      this.name = "IntegrationError";
      this.service = service;
      this.status = status;
    }
  },
}));

vi.mock("@/lib/integrations/registry", () => ({
  getServiceSecret: vi.fn(), getServiceCredentials: vi.fn(),
  getDeploymentSetting: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  env: {
    encryptionKey: "0".repeat(64),
    authSecret: "test",
    prometheusInstance: undefined,
    configFile: "/dev/null",
    brand: "AERIE",
    portalUrl: "https://test",
    adminGroup: "admins",
    adminEmails: [],
    authIssuer: "",
    authClientId: "",
    authClientSecret: "",
    oidcProviderId: "oidc",
    oidcProviderName: "SSO",
    oidcProviderIcon: "shield_person",
    oidcScopes: "openid email profile groups",
    oidcGroupsClaim: "groups",
    databaseUrl: "file::memory:",
  },
  authConfigured: false,
}));

import { fetchJson, fetchRaw } from "@/lib/integrations/http";
import { getServiceCredentials } from "@/lib/integrations/registry";
import {
  gatusHealth,
  jellyfinNowPlaying,
  tautulliActivity,
  arrCalendar,
  overseerrSearch,
  overseerrRequests,
  matchOverseerrUserId,
  bustCache,
  clearCache,
  tmdbFromGuids,
  sonarrSeasonQuality,
  sonarrSeriesMeta,
  radarrMovieMeta,
  overseerrMediaByTmdb,
  overseerrWatchlist,
  type OverseerrUser,
} from "@/lib/integrations/clients";

const mockFetchJson = vi.mocked(fetchJson);
const mockFetchRaw = vi.mocked(fetchRaw);
const mockGetCreds = vi.mocked(getServiceCredentials);

function makeTautulliSession(overrides: Record<string, unknown> = {}) {
  return {
    session_key: "1",
    full_title: "Test Movie",
    title: "Test Movie",
    year: 2024,
    media_type: "movie",
    user: "testuser",
    player: "Plex Web",
    video_full_resolution: "1080",
    transcode_decision: "direct play",
    stream_bitrate: "2000",
    video_codec: "h264",
    progress_percent: "50",
    duration: "7200000",
    state: "playing",
    thumb: "/thumb.jpg",
    art: "/art.jpg",
    secure: "1",
    relayed: "0",
    local: "1",
    bandwidth: "2000",
    location: "lan",
    ip_address_public: "1.2.3.4",
    platform: "Chrome",
    platform_version: "120",
    product: "Plex Web",
    product_version: "4.0",
    device: "Windows",
    quality_profile: "Original",
    transcode_hw_decoding: "0",
    transcode_hw_encoding: "0",
    transcode_throttled: "0",
    transcode_speed: "",
    transcode_progress: "",
    audio_codec: "ac3",
    stream_audio_codec: "ac3",
    audio_channels: "6",
    stream_audio_channels: "6",
    audio_channel_layout: "5.1(side)",
    subtitles: "0",
    summary: "A test movie.",
    genres: ["Action"],
    content_rating: "PG-13",
    originally_available_at: "2024-01-01",
    parent_media_index: "",
    media_index: "",
    ...overrides,
  };
}

describe("tmdbFromGuids", () => {
  it("extracts the TMDB id from a Plex guids array", () => {
    expect(tmdbFromGuids(["imdb://tt41021125", "tmdb://7041216", "tvdb://11780710"])).toBe(7041216);
  });
  it("returns undefined when absent or malformed", () => {
    expect(tmdbFromGuids(["imdb://tt1", "tvdb://2"])).toBeUndefined();
    expect(tmdbFromGuids([])).toBeUndefined();
    expect(tmdbFromGuids(undefined)).toBeUndefined();
  });
});

describe("clients — private helpers via exported functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearCache();
  });

  describe("gatusHealth — beat mapping & uptime", () => {
    // Helper for the dedicated /uptimes/30d endpoint: ratio body (0–1) with a 200.
    const rawUptime = (ratio: string) => ({ ok: true, text: async () => ratio }) as unknown as Response;

    it("uses the real 30-day uptime from /uptimes/30d, not the recent results window", async () => {
      mockGetCreds.mockResolvedValue({ baseUrl: "http://gatus", apiKey: "key", insecureTls: false });
      mockFetchJson.mockResolvedValue([
        {
          name: "plex",
          key: "plex",
          results: [
            { status: 200, success: true, duration: 50_000_000, timestamp: "2025-01-01T00:01:00Z" },
            { status: 200, success: true, duration: 60_000_000, timestamp: "2025-01-01T00:02:00Z" },
            { status: 500, success: false, duration: 120_000_000, timestamp: "2025-01-01T00:03:00Z" },
          ],
        },
      ]);
      // Recent window would be 66.67%; the 30d endpoint reports 99.75% — the displayed value
      // must follow the 30d endpoint (the label says "30d"), independent of the window ratio.
      mockFetchRaw.mockResolvedValue(rawUptime("0.9975"));
      const [result] = await gatusHealth();
      expect(mockFetchRaw).toHaveBeenCalledWith(
        "http://gatus/api/v1/endpoints/plex/uptimes/30d",
        expect.objectContaining({ service: "gatus" }),
      );
      expect(result.uptime).toBeCloseTo(99.75, 2);
      // Heartbeat / latency / status / incident still come from the recent results window.
      expect(result.status).toBe("down");
      expect(result.beats).toEqual([1, 1, 0]);
      expect(result.ms).toBe(120);
      expect(result.msHistory).toEqual([50, 60, 120]);
      expect(result.lastIncidentAt).toBe("2025-01-01T00:03:00Z");
    });

    it("falls back to the recent-window uptime when /uptimes/30d fails", async () => {
      mockGetCreds.mockResolvedValue({ baseUrl: "http://gatus", apiKey: "key", insecureTls: false });
      mockFetchJson.mockResolvedValue([
        {
          name: "plex",
          key: "plex",
          results: [
            { status: 200, success: true, duration: 50_000_000, timestamp: "2025-01-01T00:01:00Z" },
            { status: 200, success: true, duration: 60_000_000, timestamp: "2025-01-01T00:02:00Z" },
            { status: 500, success: false, duration: 120_000_000, timestamp: "2025-01-01T00:03:00Z" },
          ],
        },
      ]);
      mockFetchRaw.mockResolvedValue({ ok: false, status: 404, text: async () => "" } as unknown as Response);
      const [result] = await gatusHealth();
      expect(result.uptime).toBeCloseTo(66.67, 1);
    });

    it("returns no incident when all results are successful", async () => {
      mockGetCreds.mockResolvedValue({ baseUrl: "http://gatus", apiKey: "key", insecureTls: false });
      mockFetchRaw.mockResolvedValue(rawUptime("1"));
      mockFetchJson.mockResolvedValue([
        {
          name: "svc",
          key: "svc",
          results: [
            { status: 200, success: true, duration: 50_000_000, timestamp: "2025-01-01T00:01:00Z" },
          ],
        },
      ]);
      const [result] = await gatusHealth();
      expect(result.lastIncidentAt).toBeUndefined();
      expect(result.status).toBe("up");
    });

    it("returns 'down' status when last result failed", async () => {
      mockGetCreds.mockResolvedValue({ baseUrl: "http://gatus", apiKey: "key", insecureTls: false });
      mockFetchRaw.mockResolvedValue(rawUptime("0.5"));
      mockFetchJson.mockResolvedValue([
        {
          name: "svc",
          key: "svc",
          results: [
            { status: 503, success: false, duration: 5_000_000, timestamp: "2025-01-01T00:01:00Z" },
          ],
        },
      ]);
      const [result] = await gatusHealth();
      expect(result.status).toBe("down");
    });
  });

  describe("tautulliActivity — ttBool, ttNum, cleanLayout mapping", () => {
    it("converts Tautulli session fields correctly", async () => {
      mockGetCreds.mockResolvedValue({ baseUrl: "http://tautulli", apiKey: "key", insecureTls: false });
      mockFetchJson.mockResolvedValue({
        response: { data: { sessions: [makeTautulliSession()], stream_count: 1, stream_bandwidth: 2000, wan_bandwidth: 0 } },
      });
      const result = await tautulliActivity();
      const session = result.sessions[0];
      expect(session.secure).toBe(true);
      expect(session.relayed).toBe(false);
      expect(session.local).toBe(true);
      expect(session.audioLayout).toBe("5.1");
    });
  });

  describe("jellyfinNowPlaying — heightToRes, isLanIp, chLayout", () => {
it("maps height to resolution labels", async () => {
      mockGetCreds.mockResolvedValue({ baseUrl: "http://jf", apiKey: "key", insecureTls: false });
      mockFetchJson.mockResolvedValue([
        {
          Id: "s1",
          UserId: "u1",
          UserName: "testuser",
          DeviceName: "JF Web",
          Client: "Jellyfin Web",
          ApplicationVersion: "10.9",
          RemoteEndPoint: "10.0.0.5",
          PlayState: { IsPaused: false, PlayMethod: "DirectStream" },
          NowPlayingItem: {
            Id: "item1",
            Name: "Big Movie",
            Type: "Movie",
            RunTimeTicks: 72000000000,
            ProductionYear: 2024,
            MediaStreams: [
              { Type: "Video", Height: 2160, BitRate: 20000000, Codec: "hevc", VideoRangeType: "HDR", RealFrameRate: 24 },
              { Type: "Audio", Codec: "truehd", Channels: 8, ChannelLayout: "7.1" },
            ],
          },
          TranscodingInfo: undefined,
        },
      ]);
      const result = await jellyfinNowPlaying();
      expect(result[0].res).toBe("4K");
      expect(result[0].audioLayout).toBe("7.1");
      expect(result[0].location).toBe("lan");
    });

    it("identifies WAN IPs correctly", async () => {
      mockGetCreds.mockResolvedValue({ baseUrl: "http://jf", apiKey: "key", insecureTls: false });
      mockFetchJson.mockResolvedValue([
        {
          Id: "s2",
          UserId: "u2",
          UserName: "remoteuser",
          DeviceName: "JF Android",
          Client: "Jellyfin Android",
          ApplicationVersion: "1.0",
          RemoteEndPoint: "203.0.113.5",
          PlayState: { IsPaused: false, PlayMethod: "DirectPlay" },
          NowPlayingItem: {
            Id: "item2",
            Name: "Small Movie",
            Type: "Movie",
            RunTimeTicks: 36000000000,
            ProductionYear: 2023,
            MediaStreams: [
              { Type: "Video", Height: 720, BitRate: 4000000, Codec: "h264" },
              { Type: "Audio", Codec: "aac", Channels: 2, ChannelLayout: "stereo" },
            ],
          },
          TranscodingInfo: undefined,
        },
      ]);
      const result = await jellyfinNowPlaying();
      expect(result[0].location).toBe("wan");
      expect(result[0].local).toBe(false);
      expect(result[0].res).toBe("720p");
    });

    it("uses chLayout when no ChannelLayout is provided", async () => {
      mockGetCreds.mockResolvedValue({ baseUrl: "http://jf", apiKey: "key", insecureTls: false });
      mockFetchJson.mockResolvedValue([
        {
          Id: "s3",
          UserId: "u3",
          UserName: "user3",
          DeviceName: "Chrome",
          Client: "Jellyfin Web",
          ApplicationVersion: "10.9",
          RemoteEndPoint: "::ffff:192.168.1.50",
          PlayState: { IsPaused: true, PlayMethod: "Transcode" },
          NowPlayingItem: {
            Id: "item3",
            Name: "Show Episode",
            Type: "Episode",
            SeriesName: "Test Show",
            RunTimeTicks: 15000000000,
            ProductionYear: 2024,
            ParentIndexNumber: 2,
            IndexNumber: 5,
            SeriesId: "series1",
            MediaStreams: [
              { Type: "Video", Height: 1080, BitRate: 8000000, Codec: "h264" },
              { Type: "Audio", Codec: "ac3", Channels: 6 },
            ],
          },
          TranscodingInfo: { VideoCodec: "h264", AudioCodec: "ac3", AudioChannels: 6, Bitrate: 8000000, CompletionPercentage: 50, IsVideoDirect: true, IsAudioDirect: true },
        },
      ]);
      const result = await jellyfinNowPlaying();
      expect(result[0].audioLayout).toBe("5.1");
      expect(result[0].kind).toBe("series");
    });
  });

  describe("matchOverseerrUserId (exported)", () => {
    const users: OverseerrUser[] = [
      { id: 1, email: "Admin@example.com", displayName: "Admin" } as OverseerrUser,
      { id: 2, email: "user@test.com", displayName: "User" } as OverseerrUser,
    ];

    it("finds a user by exact email", () => {
      expect(matchOverseerrUserId(users, "user@test.com")).toBe(2);
    });

    it("is case-insensitive", () => {
      expect(matchOverseerrUserId(users, "admin@example.com")).toBe(1);
    });

    it("returns undefined when no match", () => {
      expect(matchOverseerrUserId(users, "nobody@test.com")).toBeUndefined();
    });

    it("returns undefined for undefined email", () => {
      expect(matchOverseerrUserId(users, undefined)).toBeUndefined();
    });

    it("returns undefined for empty string email", () => {
      expect(matchOverseerrUserId(users, "  ")).toBeUndefined();
    });
  });

  describe("bustCache + cached TTL", () => {
    it("bustCache removes a cached entry", async () => {
      let callCount = 0;
      mockGetCreds.mockResolvedValue({ baseUrl: "http://gatus", apiKey: "key", insecureTls: false });
      mockFetchJson.mockImplementation(async () => {
        callCount++;
        return [{ name: "svc", key: "svc", results: [] }];
      });

      await gatusHealth();
      expect(callCount).toBe(1);

      bustCache("gatus:health");
      await gatusHealth();
      expect(callCount).toBe(2);
    });
  });

  describe("overseerrSearch — mediaStatusToState via discover results", () => {
    it("maps mediaStatus 5 (available) to state 'available'", async () => {
      mockGetCreds.mockResolvedValue({ baseUrl: "http://os", apiKey: "key", insecureTls: false });
      mockFetchJson.mockResolvedValue({
        results: [
          { id: 1, mediaType: "movie", title: "Available Movie", releaseDate: "2024-01-01", voteAverage: 8.5, mediaInfo: { status: 5 } },
          { id: 2, mediaType: "tv", name: "Pending Show", firstAirDate: "2023-06-15", voteAverage: 7.2, mediaInfo: { status: 2 } },
          { id: 3, mediaType: "movie", title: "No Status", releaseDate: "2022-03-10", voteAverage: 6.1 },
        ],
      });
      const results = await overseerrSearch("test");
      expect(results).toHaveLength(3);
      expect(results[0].state).toBe("available");
      expect(results[0].kind).toBe("movie");
      expect(results[0].id).toBe("1");
      expect(results[1].state).toBe("pending");
      expect(results[1].kind).toBe("series");
      expect(results[2].state).toBeNull();
    });

    it("maps mediaStatus 4 (processing/available) to 'available'", async () => {
      mockGetCreds.mockResolvedValue({ baseUrl: "http://os", apiKey: "key", insecureTls: false });
      mockFetchJson.mockResolvedValue({
        results: [
          { id: 10, mediaType: "movie", title: "Processing", mediaInfo: { status: 4 } },
        ],
      });
      const results = await overseerrSearch("test");
      expect(results[0].state).toBe("available");
    });

    it("maps mediaStatus 3 (approved) to 'approved'", async () => {
      mockGetCreds.mockResolvedValue({ baseUrl: "http://os", apiKey: "key", insecureTls: false });
      mockFetchJson.mockResolvedValue({
        results: [
          { id: 20, mediaType: "tv", name: "Approved Show", mediaInfo: { status: 3 } },
        ],
      });
      const results = await overseerrSearch("test");
      expect(results[0].state).toBe("approved");
    });

    it("extracts year from releaseDate or firstAirDate", async () => {
      mockGetCreds.mockResolvedValue({ baseUrl: "http://os", apiKey: "key", insecureTls: false });
      mockFetchJson.mockResolvedValue({
        results: [
          { id: 1, mediaType: "movie", title: "Movie 2023", releaseDate: "2023-07-15" },
          { id: 2, mediaType: "tv", name: "Show 2022", firstAirDate: "2022-03-01" },
          { id: 3, mediaType: "movie", title: "No Date" },
        ],
      });
      const results = await overseerrSearch("test");
      expect(results[0].year).toBe(2023);
      expect(results[1].year).toBe(2022);
      expect(results[2].year).toBe(0);
    });

    it("filters out person results", async () => {
      mockGetCreds.mockResolvedValue({ baseUrl: "http://os", apiKey: "key", insecureTls: false });
      mockFetchJson.mockResolvedValue({
        results: [
          { id: 1, mediaType: "movie", title: "A Movie" },
          { id: 2, mediaType: "person", name: "An Actor" },
          { id: 3, mediaType: "tv", name: "A Show" },
        ],
      });
      const results = await overseerrSearch("test");
      expect(results).toHaveLength(2);
      expect(results[0].kind).toBe("movie");
      expect(results[1].kind).toBe("series");
    });

    it("uses title, falls back to name, then #id", async () => {
      mockGetCreds.mockResolvedValue({ baseUrl: "http://os", apiKey: "key", insecureTls: false });
      mockFetchJson.mockResolvedValue({
        results: [
          { id: 1, mediaType: "movie", title: "Has Title" },
          { id: 2, mediaType: "tv", name: "Has Name" },
          { id: 3, mediaType: "movie" },
        ],
      });
      const results = await overseerrSearch("test");
      expect(results[0].title).toBe("Has Title");
      expect(results[1].title).toBe("Has Name");
      expect(results[2].title).toBe("#3");
    });

    it("rounds rating to 1 decimal", async () => {
      mockGetCreds.mockResolvedValue({ baseUrl: "http://os", apiKey: "key", insecureTls: false });
      mockFetchJson.mockResolvedValue({
        results: [
          { id: 1, mediaType: "movie", title: "A", voteAverage: 7.56 },
          { id: 2, mediaType: "movie", title: "B", voteAverage: undefined },
        ],
      });
      const results = await overseerrSearch("test");
      expect(results[0].rating).toBe(7.6);
      expect(results[1].rating).toBe(0);
    });
  });

  describe("overseerrRequests — OVERSEERR_STATUS mapping", () => {
    beforeEach(() => {
      // Production cache keys: `overseerr:requests` and `overseerr:quota:${userId}`.
      // The quota key requires the user id; tests query user 1.
      bustCache("overseerr:requests");
      bustCache("overseerr:quota:1");
    });

    it("maps Overseerr request status 1 → pending, 2 → approved, 3 → declined, 4 → failed", async () => {
      mockGetCreds.mockResolvedValue({ baseUrl: "http://os", apiKey: "key", insecureTls: false });
      mockFetchJson.mockImplementation(async (url: string) => {
        if (typeof url === "string" && url.includes("/api/v1/request?")) {
          return {
            results: [
              { id: 1, type: "movie", status: 1, createdAt: "2024-01-01T00:00:00Z", requestedBy: { id: 10, displayName: "Alice", email: "a@b.com" }, media: { tmdbId: 100, status: undefined } },
              { id: 2, type: "tv", status: 2, createdAt: "2024-02-01T00:00:00Z", requestedBy: { id: 11, displayName: "Bob", email: "b@b.com" }, media: { tmdbId: 200, status: undefined } },
              { id: 3, type: "movie", status: 3, createdAt: "2024-03-01T00:00:00Z", requestedBy: { id: 12, displayName: "Carol", email: "c@b.com" }, media: { tmdbId: 300, status: undefined } },
              { id: 4, type: "movie", status: 4, createdAt: "2024-04-01T00:00:00Z", requestedBy: { id: 13, displayName: "Dave", email: "d@b.com" }, media: { tmdbId: 400, status: undefined } },
            ],
          };
        }
        return {};
      });
      const results = await overseerrRequests();
      expect(results[0].status).toBe("pending");
      expect(results[1].status).toBe("approved");
      expect(results[2].status).toBe("declined");
      expect(results[3].status).toBe("failed");
    });

    it("maps media status 5 → available, 3/4 → processing", async () => {
      mockGetCreds.mockResolvedValue({ baseUrl: "http://os", apiKey: "key", insecureTls: false });
      mockFetchJson.mockImplementation(async (url: string) => {
        if (typeof url === "string" && url.includes("/api/v1/request?")) {
          return {
            results: [
              { id: 10, type: "movie", status: 1, createdAt: "2024-01-01T00:00:00Z", requestedBy: { id: 1, email: "x@x.com" }, media: { tmdbId: 1, status: 5 } },
              { id: 11, type: "tv", status: 1, createdAt: "2024-01-01T00:00:00Z", requestedBy: { id: 2, email: "y@y.com" }, media: { tmdbId: 2, status: 3 } },
              { id: 12, type: "tv", status: 1, createdAt: "2024-01-01T00:00:00Z", requestedBy: { id: 3, email: "z@z.com" }, media: { tmdbId: 3, status: 4 } },
            ],
          };
        }
        return {};
      });
      const results = await overseerrRequests();
      expect(results[0].status).toBe("available");
      expect(results[1].status).toBe("processing");
      expect(results[2].status).toBe("processing");
    });
  });
});

describe("arrCalendar poster URL", () => {
  beforeEach(() => {
    clearCache();
    mockGetCreds.mockResolvedValue({ baseUrl: "http://radarr:7878", apiKey: "key", insecureTls: false });
  });

  it("uses remoteUrl directly when present", async () => {
    mockFetchJson.mockResolvedValue([{
      id: 1,
      title: "Movie",
      inCinemas: "2025-01-01T00:00:00Z",
      images: [{ coverType: "poster", remoteUrl: "https://cdn.tvdb.com/poster.jpg", url: "/MediaCover/1/poster.jpg" }],
    }]);
    const items = await arrCalendar("radarr");
    expect(items[0].art).toBe("https://cdn.tvdb.com/poster.jpg");
  });

  it("proxies local url path when no remoteUrl", async () => {
    mockFetchJson.mockResolvedValue([{
      id: 2,
      title: "Movie",
      inCinemas: "2025-01-01T00:00:00Z",
      images: [{ coverType: "poster", url: "/MediaCover/2/poster.jpg" }],
    }]);
    const items = await arrCalendar("radarr");
    expect(items[0].art).toBe("/api/artwork?svc=radarr&ref=%2FMediaCover%2F2%2Fposter.jpg");
  });

  it("returns undefined art when images is empty", async () => {
    mockFetchJson.mockResolvedValue([{
      id: 3,
      title: "Movie",
      inCinemas: "2025-01-01T00:00:00Z",
      images: [],
    }]);
    const items = await arrCalendar("radarr");
    expect(items[0].art).toBeUndefined();
  });
});

describe("arrCalendar detail fields", () => {
  beforeEach(() => {
    clearCache();
  });

  it("captures Radarr movie detail fields and normalizes keyed ratings", async () => {
    mockGetCreds.mockResolvedValue({ baseUrl: "http://radarr:7878", apiKey: "key", insecureTls: false });
    mockFetchJson.mockResolvedValue([{
      id: 10,
      title: "The Movie",
      year: 2025,
      runtime: 122,
      genres: ["Action", "Sci-Fi"],
      overview: "A synopsis.",
      studio: "Acme",
      monitored: true,
      hasFile: false,
      inCinemas: "2025-01-01T00:00:00Z",
      digitalRelease: "2025-02-01T00:00:00Z",
      physicalRelease: "2025-03-01T00:00:00Z",
      ratings: { imdb: { value: 7.456 }, tmdb: { value: 8.1 } },
      titleSlug: "the-movie-2025",
    }]);
    const items = await arrCalendar("radarr");
    expect(items[0]).toMatchObject({
      kind: "movie",
      year: 2025,
      runtime: 122,
      rating: 7.5, // imdb preferred, rounded to 1dp
      genres: ["Action", "Sci-Fi"],
      overview: "A synopsis.",
      studio: "Acme",
      monitored: true,
      hasFile: false,
      digitalRelease: "2025-02-01T00:00:00Z",
      deepPath: "/movie/the-movie-2025",
    });
  });

  it("omits deepPath when titleSlug is absent", async () => {
    mockGetCreds.mockResolvedValue({ baseUrl: "http://radarr:7878", apiKey: "key", insecureTls: false });
    mockFetchJson.mockResolvedValue([{ id: 11, title: "No Slug", inCinemas: "2025-01-01T00:00:00Z" }]);
    const items = await arrCalendar("radarr");
    expect(items[0].deepPath).toBeUndefined();
  });

  it("uses series-level detail and flat ratings for Sonarr episodes", async () => {
    mockGetCreds.mockResolvedValue({ baseUrl: "http://sonarr:8989", apiKey: "key", insecureTls: false });
    mockFetchJson.mockResolvedValue([{
      id: 20,
      title: "Pilot",
      seasonNumber: 1,
      episodeNumber: 2,
      airDateUtc: "2025-01-05T00:00:00Z",
      overview: "Episode synopsis.",
      monitored: true,
      hasFile: true,
      series: {
        title: "The Show",
        titleSlug: "the-show",
        year: 2024,
        runtime: 45,
        genres: ["Drama"],
        network: "HBO",
        ratings: { value: 8.9 },
      },
    }]);
    const items = await arrCalendar("sonarr");
    expect(items[0]).toMatchObject({
      kind: "series",
      title: "The Show",
      ep: "S01E02 · Pilot",
      year: 2024,
      runtime: 45,
      rating: 8.9,
      genres: ["Drama"],
      overview: "Episode synopsis.",
      studio: "HBO",
      hasFile: true,
      deepPath: "/series/the-show",
    });
    // movie-only release dates stay undefined for series
    expect(items[0].inCinemas).toBeUndefined();
  });
});
describe("sonarrSeasonQuality — per-season grouping", () => {
  beforeEach(() => {
    clearCache();
    mockGetCreds.mockResolvedValue({ baseUrl: "http://sonarr:8989", apiKey: "key", insecureTls: false });
  });

  it("groups downloaded episodes by season with the dominant quality label and summed size", async () => {
    mockFetchJson.mockResolvedValue([
      { seasonNumber: 1, hasFile: true, episodeFile: { size: 1_000_000_000, quality: { quality: { resolution: 1080, source: "web" } } } },
      { seasonNumber: 1, hasFile: true, episodeFile: { size: 1_000_000_000, quality: { quality: { resolution: 1080, source: "web" } } } },
      { seasonNumber: 1, hasFile: true, episodeFile: { size: 500_000_000, quality: { quality: { resolution: 720, source: "hdtv" } } } },
      { seasonNumber: 2, hasFile: false },
      { seasonNumber: 0, hasFile: true, episodeFile: { size: 100, quality: { quality: { resolution: 480 } } } },
    ]);
    const out = await sonarrSeasonQuality(42);
    // season 2 has no files and season 0 (specials) are dropped → only season 1
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ season: 1, episodeCount: 3 });
    // "web" maps to WEB-DL and 1080p is the dominant (2 of 3) label
    expect(out[0].label).toBe("1080p WEB-DL");
    expect(out[0].sizeBytes).toBe(2_500_000_000);
  });

  it("returns an empty array when nothing is downloaded", async () => {
    mockFetchJson.mockResolvedValue([{ seasonNumber: 1, hasFile: false }]);
    expect(await sonarrSeasonQuality(7)).toEqual([]);
  });
});

describe("sonarrSeriesMeta — monitored / hasFile / metadata", () => {
  beforeEach(() => {
    clearCache();
    mockGetCreds.mockResolvedValue({ baseUrl: "http://sonarr:8989", apiKey: "key", insecureTls: false });
  });

  it("derives hasFile from episodeFileCount and maps network → studio", async () => {
    mockFetchJson.mockResolvedValue({ monitored: true, statistics: { episodeFileCount: 8 }, genres: ["Drama"], network: "HBO" });
    expect(await sonarrSeriesMeta(1)).toEqual({ monitored: true, hasFile: true, genres: ["Drama"], studio: "HBO" });
  });

  it("hasFile is false when no episode files", async () => {
    mockFetchJson.mockResolvedValue({ monitored: false, statistics: { episodeFileCount: 0 } });
    expect(await sonarrSeriesMeta(2)).toMatchObject({ monitored: false, hasFile: false });
  });
});

describe("radarrMovieMeta — by tmdbId via the movie index", () => {
  beforeEach(() => {
    clearCache();
    mockGetCreds.mockResolvedValue({ baseUrl: "http://radarr:7878", apiKey: "key", insecureTls: false });
  });

  it("returns monitored/hasFile/genres/studio + fileInfo for an indexed movie", async () => {
    mockFetchJson.mockResolvedValue([
      {
        tmdbId: 603,
        monitored: true,
        hasFile: true,
        genres: ["Action"],
        studio: "Warner Bros.",
        qualityProfileId: 4,
        movieFile: { size: 8_000_000_000, quality: { quality: { resolution: 2160, source: "bluray" } }, mediaInfo: { videoCodec: "x265" } },
      },
    ]);
    const meta = await radarrMovieMeta(603);
    expect(meta).toMatchObject({ monitored: true, hasFile: true, genres: ["Action"], studio: "Warner Bros." });
    expect(meta.fileInfo?.label).toBe("2160p Blu-ray · X265");
    expect(meta.fileInfo?.sizeBytes).toBe(8_000_000_000);
  });

  it("returns an empty object for a movie not in the library", async () => {
    mockFetchJson.mockResolvedValue([{ tmdbId: 1, monitored: true, hasFile: false }]);
    expect(await radarrMovieMeta(999)).toEqual({ fileInfo: undefined });
  });
});

describe("overseerrMediaByTmdb — single-title DiscoverItem", () => {
  beforeEach(() => {
    clearCache();
    mockGetCreds.mockResolvedValue({ baseUrl: "http://os", apiKey: "key", insecureTls: false });
  });

  it("maps a movie detail (mediaUrl → plexUrl, externalServiceId → arrId, status → state)", async () => {
    mockFetchJson.mockResolvedValue({
      title: "Dune",
      releaseDate: "2021-10-22",
      voteAverage: 8,
      overview: "Spice.",
      mediaInfo: { status: 5, mediaUrl: "https://app.plex.tv/x", serviceUrl: "http://radarr/movie/438631", externalServiceId: 12 },
    });
    const item = await overseerrMediaByTmdb(438631, "movie");
    expect(item).toMatchObject({ id: "438631", kind: "movie", state: "available", plexUrl: "https://app.plex.tv/x", serviceUrl: "http://radarr/movie/438631", arrId: 12 });
  });

  it("maps a tv detail and carries numberOfSeasons", async () => {
    mockFetchJson.mockResolvedValue({ name: "The Bear", firstAirDate: "2022-06-23", numberOfSeasons: 3, mediaInfo: { status: 2 } });
    const item = await overseerrMediaByTmdb(136315, "series");
    expect(item).toMatchObject({ id: "136315", kind: "series", title: "The Bear", state: "pending", seasons: 3 });
  });
});

describe("overseerrWatchlist — resolves status for items that arrive without mediaInfo", () => {
  beforeEach(() => {
    clearCache();
    mockGetCreds.mockResolvedValue({ baseUrl: "http://os", apiKey: "key", insecureTls: false });
  });

  it("enriches state + deep-link ids by TMDB id (Plex watchlist lacks mediaInfo)", async () => {
    mockFetchJson.mockImplementation(async (url: string) => {
      if (url.includes("/discover/watchlist")) {
        // Plex-sourced item: no mediaInfo, so status is unknown at this point.
        return { results: [{ id: 0, tmdbId: 550, mediaType: "movie", title: "Fight Club", posterPath: "/p.jpg" }] };
      }
      if (url.includes("/api/v1/movie/550")) {
        return { title: "Fight Club", releaseDate: "1999-10-15", mediaInfo: { status: 5, mediaUrl: "https://app.plex.tv/fc", externalServiceId: 7 } };
      }
      return {};
    });
    const items = await overseerrWatchlist();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: "550", state: "available", plexUrl: "https://app.plex.tv/fc", arrId: 7 });
  });
});
