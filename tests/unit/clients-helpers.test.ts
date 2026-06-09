import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/integrations/http", () => ({
  fetchJson: vi.fn(),
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
  getServiceCredentials: vi.fn(),
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

import { fetchJson } from "@/lib/integrations/http";
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
  type OverseerrUser,
} from "@/lib/integrations/clients";

const mockFetchJson = vi.mocked(fetchJson);
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

describe("clients — private helpers via exported functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearCache();
  });

  describe("gatusHealth — beat mapping & uptime", () => {
    it("maps Gatus results to ServiceHealth with correct uptime and beats", async () => {
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
      const [result] = await gatusHealth();
      expect(result.status).toBe("down");
      expect(result.beats).toEqual([1, 1, 0]);
      expect(result.uptime).toBeCloseTo(66.67, 1);
      expect(result.ms).toBe(120);
      expect(result.msHistory).toEqual([50, 60, 120]);
      expect(result.lastIncidentAt).toBe("2025-01-01T00:03:00Z");
    });

    it("returns no incident when all results are successful", async () => {
      mockGetCreds.mockResolvedValue({ baseUrl: "http://gatus", apiKey: "key", insecureTls: false });
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