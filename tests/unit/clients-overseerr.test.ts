import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockHttp, mockClientsRegistry, mockEnv } from "./clientsMocks";

vi.mock("@/lib/integrations/http", () => mockHttp());
vi.mock("@/lib/integrations/registry", () => mockClientsRegistry());
vi.mock("@/lib/env", () => mockEnv());

import { fetchJson } from "@/lib/integrations/http";
import { getServiceCredentials } from "@/lib/integrations/registry";
import {
  overseerrDeleteRequest,
  overseerrRequestDetails,
  overseerrEditRequest,
  overseerrCreateRequest,
  overseerrReview,
  overseerrComment,
  overseerrUpdateUserQuota,
  overseerrRequestCounts,
  overseerrWatchlist,
  clearEnrichCache,
  bustCache,
} from "@/lib/integrations/clients";

const mockFetchJson = vi.mocked(fetchJson);
const mockGetCreds = vi.mocked(getServiceCredentials);

const BASE = "http://overseerr:5055";

beforeEach(() => {
  vi.clearAllMocks();
  clearEnrichCache();
  bustCache("overseerr:requestCounts");
  bustCache("overseerr:watchlist");
  mockGetCreds.mockResolvedValue({ baseUrl: BASE, apiKey: "key", insecureTls: false } as never);
});

// ── overseerrDeleteRequest ────────────────────────────────────
describe("overseerrDeleteRequest", () => {
  it("sends DELETE to /api/v1/request/{id}", async () => {
    mockFetchJson.mockResolvedValue({} as never);
    await overseerrDeleteRequest(42);
    expect(mockFetchJson).toHaveBeenCalledWith(
      `${BASE}/api/v1/request/42`,
      expect.objectContaining({ method: "DELETE", headers: { "X-Api-Key": "key" } }),
    );
  });
});

// ── overseerrRequestDetails ───────────────────────────────────
describe("overseerrRequestDetails", () => {
  it("maps a pending movie request (no seasons)", async () => {
    mockFetchJson.mockResolvedValue({
      id: 7, requestedBy: { id: 1, email: "user@example.com" },
      status: 1, media: { status: 2 }, seasons: [],
    } as never);
    const d = await overseerrRequestDetails(7);
    expect(d.id).toBe(7);
    expect(d.requesterId).toBe(1);
    expect(d.requesterEmail).toBe("user@example.com");
    expect(d.status).toBe("pending");
    expect(d.seasons).toBeUndefined();
  });

  it("status=available when media.status=5", async () => {
    mockFetchJson.mockResolvedValue({
      id: 8, requestedBy: { id: 2 }, status: 2, media: { status: 5 }, seasons: [],
    } as never);
    expect((await overseerrRequestDetails(8)).status).toBe("available");
  });

  it("status=processing when media.status=3", async () => {
    mockFetchJson.mockResolvedValue({
      id: 9, requestedBy: { id: 3 }, status: 2, media: { status: 3 }, seasons: [],
    } as never);
    expect((await overseerrRequestDetails(9)).status).toBe("processing");
  });

  it("includes non-zero season numbers from a TV request", async () => {
    mockFetchJson.mockResolvedValue({
      id: 10, requestedBy: { id: 4 }, status: 1, media: {},
      seasons: [{ seasonNumber: 1 }, { seasonNumber: 2 }, { seasonNumber: 0 }],
    } as never);
    const d = await overseerrRequestDetails(10);
    expect(d.seasons).toEqual([1, 2]);
  });
});

// ── overseerrEditRequest ──────────────────────────────────────
describe("overseerrEditRequest", () => {
  it("sends PUT with seasons list", async () => {
    mockFetchJson.mockResolvedValue({} as never);
    await overseerrEditRequest(3, { seasons: [1, 2] });
    expect(mockFetchJson).toHaveBeenCalledWith(
      `${BASE}/api/v1/request/3`,
      expect.objectContaining({ method: "PUT", body: expect.objectContaining({ seasons: [1, 2] }) }),
    );
  });

  it("sends PUT with profileId", async () => {
    mockFetchJson.mockResolvedValue({} as never);
    await overseerrEditRequest(4, { profileId: 99 });
    expect(mockFetchJson).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ body: expect.objectContaining({ profileId: 99 }) }),
    );
  });

  it("sends empty-array seasons as 'all'", async () => {
    mockFetchJson.mockResolvedValue({} as never);
    await overseerrEditRequest(5, { seasons: [] });
    expect(mockFetchJson).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ body: expect.objectContaining({ seasons: "all" }) }),
    );
  });
});

// ── overseerrCreateRequest ────────────────────────────────────
describe("overseerrCreateRequest", () => {
  it("creates a movie request and returns status + mediaStatus", async () => {
    mockFetchJson.mockResolvedValue({ status: 2, media: { status: 5 } } as never);
    const r = await overseerrCreateRequest({ tmdbId: 1234, mediaType: "movie" });
    expect(r.status).toBe(2);
    expect(r.mediaStatus).toBe(5);
  });

  it("defaults status to 1 when the response omits it", async () => {
    mockFetchJson.mockResolvedValue({} as never);
    const r = await overseerrCreateRequest({ tmdbId: 5678, mediaType: "movie" });
    expect(r.status).toBe(1);
    expect(r.mediaStatus).toBeUndefined();
  });

  it("sends seasons='all' for TV when no seasons specified", async () => {
    mockFetchJson.mockResolvedValue({ status: 1 } as never);
    await overseerrCreateRequest({ tmdbId: 9999, mediaType: "tv" });
    expect(mockFetchJson).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/request"),
      expect.objectContaining({ body: expect.objectContaining({ seasons: "all" }) }),
    );
  });

  it("sends specific seasons for TV when provided", async () => {
    mockFetchJson.mockResolvedValue({ status: 1 } as never);
    await overseerrCreateRequest({ tmdbId: 9999, mediaType: "tv", seasons: [1, 2] });
    expect(mockFetchJson).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ body: expect.objectContaining({ seasons: [1, 2] }) }),
    );
  });

  it("includes userId and profileId when provided", async () => {
    mockFetchJson.mockResolvedValue({ status: 1 } as never);
    await overseerrCreateRequest({ tmdbId: 100, mediaType: "movie", userId: 7, profileId: 3 });
    expect(mockFetchJson).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ body: expect.objectContaining({ userId: 7, profileId: 3 }) }),
    );
  });
});

// ── overseerrReview ───────────────────────────────────────────
describe("overseerrReview", () => {
  it("sends approve action to /request/{id}/approve", async () => {
    mockFetchJson.mockResolvedValue({} as never);
    await overseerrReview(10, "approve");
    expect(mockFetchJson).toHaveBeenCalledWith(
      `${BASE}/api/v1/request/10/approve`,
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("sends decline action to /request/{id}/decline", async () => {
    mockFetchJson.mockResolvedValue({} as never);
    await overseerrReview(11, "decline");
    expect(mockFetchJson).toHaveBeenCalledWith(
      `${BASE}/api/v1/request/11/decline`,
      expect.objectContaining({ method: "POST" }),
    );
  });
});

// ── overseerrComment ──────────────────────────────────────────
describe("overseerrComment", () => {
  it("posts to /api/v1/comment with message and mediaId", async () => {
    mockFetchJson.mockResolvedValue({} as never);
    await overseerrComment(99, "Looks good!");
    expect(mockFetchJson).toHaveBeenCalledWith(
      `${BASE}/api/v1/comment`,
      expect.objectContaining({ method: "POST", body: { message: "Looks good!", mediaId: 99 } }),
    );
  });
});

// ── overseerrUpdateUserQuota ──────────────────────────────────
describe("overseerrUpdateUserQuota", () => {
  it("posts quota settings with null limits converted to 0", async () => {
    mockFetchJson.mockResolvedValue({} as never);
    await overseerrUpdateUserQuota(5, { movieQuotaLimit: 10, movieQuotaDays: 7, tvQuotaLimit: null, tvQuotaDays: 7 });
    expect(mockFetchJson).toHaveBeenCalledWith(
      `${BASE}/api/v1/user/5/settings/main`,
      expect.objectContaining({
        method: "POST",
        body: { movieQuotaLimit: 10, movieQuotaDays: 7, tvQuotaLimit: 0, tvQuotaDays: 7 },
      }),
    );
  });
});

// ── overseerrRequestCounts ────────────────────────────────────
describe("overseerrRequestCounts", () => {
  it("maps raw count fields and combines failed + unavailable", async () => {
    mockFetchJson.mockResolvedValue({
      total: 20, pending: 5, approved: 3, processing: 2, failed: 1, unavailable: 2, available: 7,
    } as never);
    const c = await overseerrRequestCounts();
    expect(c.total).toBe(20);
    expect(c.pending).toBe(5);
    expect(c.failed).toBe(3); // 1 + 2
    expect(c.available).toBe(7);
  });

  it("defaults all counts to 0 when fields are absent", async () => {
    mockFetchJson.mockResolvedValue({} as never);
    const c = await overseerrRequestCounts();
    expect(c.total).toBe(0);
    expect(c.pending).toBe(0);
  });
});

// ── enrichMedia error path ────────────────────────────────────
describe("enrichMedia — error catch branch", () => {
  it("returns a fallback entry when the media-detail fetch throws", async () => {
    // First call: watchlist items; second call: enrichMedia fetch throws
    mockFetchJson
      .mockResolvedValueOnce({
        results: [{ id: 1, tmdbId: 100, mediaType: "movie" }],
      } as never)
      .mockRejectedValueOnce(new Error("upstream 503") as never);
    const items = await overseerrWatchlist();
    // watchlist returns the item even on enrichment failure (fallback EnrichedDetails)
    expect(items).toHaveLength(1);
    // The catch branch sets title="" and returns a partial object; state/art may be absent
    expect(items[0]).toBeDefined();
  });
});
