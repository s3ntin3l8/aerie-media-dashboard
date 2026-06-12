import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/client", () => ({ db: {}, schema: {} }));
vi.mock("@/lib/db/bootstrap", () => ({ ensureDb: vi.fn() }));
vi.mock("@/lib/session", () => ({ getSessionUser: vi.fn() }));
vi.mock("@/lib/integrations/registry", () => ({ getServiceSecret: vi.fn() }));
vi.mock("@/lib/integrations/clients", () => ({
  overseerrCreateRequest: vi.fn(),
  overseerrDeleteRequest: vi.fn(),
  overseerrEditRequest: vi.fn(),
  overseerrRequestDetails: vi.fn(),
  overseerrReview: vi.fn(),
  overseerrComment: vi.fn(),
  overseerrUsers: vi.fn(async () => []),
  overseerrUserQuota: vi.fn(),
  overseerrMovieProfiles: vi.fn(),
  overseerrTvProfiles: vi.fn(),
  overseerrWatchlist: vi.fn(),
  overseerrMediaByTmdb: vi.fn(),
  sonarrSeasonQuality: vi.fn(),
  sonarrSeriesMeta: vi.fn(),
  radarrMovieMeta: vi.fn(),
  tautulliShowTmdb: vi.fn(),
  matchOverseerrUserId: vi.fn(() => undefined),
  bustCache: vi.fn(),
}));

import { getSessionUser } from "@/lib/session";
import { getServiceSecret } from "@/lib/integrations/registry";
import * as C from "@/lib/integrations/clients";
import { submitRequest, reviewRequest, deleteRequest, editRequest, getQualityProfiles } from "@/app/(portal)/requests/actions";

const session = vi.mocked(getSessionUser);
const secret = vi.mocked(getServiceSecret);
const movie = { id: "603", title: "The Matrix", kind: "movie" } as never;
const admin = { id: "a", email: "a@x", role: "admin" } as never;
const member = { id: "m", email: "m@x", role: "user" } as never;

beforeEach(() => {
  vi.clearAllMocks();
  secret.mockResolvedValue("secret"); // overseerrOn = true by default
  session.mockResolvedValue(member);
  vi.mocked(C.matchOverseerrUserId).mockReturnValue(undefined);
});

describe("submitRequest", () => {
  it("short-circuits to a pending message when Overseerr is off", async () => {
    secret.mockResolvedValue(null);
    expect(await submitRequest(movie, [])).toEqual({ ok: true, message: 'Requested "The Matrix" — pending approval' });
  });

  it("creates a request; status 2 = auto-approved", async () => {
    vi.mocked(C.overseerrCreateRequest).mockResolvedValue({ status: 2 } as never);
    const r = await submitRequest(movie, []);
    expect(r).toMatchObject({ ok: true, autoApproved: true });
    expect(C.bustCache).toHaveBeenCalledWith("overseerr:requests");
  });

  it("blocks when the user's movie quota is restricted", async () => {
    vi.mocked(C.matchOverseerrUserId).mockReturnValue(7);
    vi.mocked(C.overseerrUserQuota).mockResolvedValue({ movie: { restricted: true, used: 3, limit: 3 }, tv: { restricted: false } } as never);
    expect(await submitRequest(movie, [])).toMatchObject({ ok: false, message: expect.stringMatching(/movie request limit/i) });
    expect(C.overseerrCreateRequest).not.toHaveBeenCalled();
  });

  it("returns the error message when creation throws", async () => {
    vi.mocked(C.overseerrCreateRequest).mockRejectedValue(new Error("boom"));
    expect(await submitRequest(movie, [])).toEqual({ ok: false, message: "boom" });
  });
});

describe("reviewRequest", () => {
  it("forbids non-admins", async () => {
    expect(await reviewRequest("os-1", "approve")).toEqual({ ok: false, message: "forbidden" });
  });

  it("approves and posts a note when given a media id", async () => {
    session.mockResolvedValue(admin);
    vi.mocked(C.overseerrComment).mockResolvedValue(undefined as never); // .catch() needs a promise
    const r = await reviewRequest("os-5", "approve", "looks good", 42);
    expect(r).toMatchObject({ ok: true });
    expect(C.overseerrReview).toHaveBeenCalledWith(5, "approve");
    expect(C.overseerrComment).toHaveBeenCalledWith(42, "looks good");
  });

  it("surfaces upstream failure", async () => {
    session.mockResolvedValue(admin);
    vi.mocked(C.overseerrReview).mockRejectedValue(new Error("nope"));
    expect(await reviewRequest("os-5", "decline")).toEqual({ ok: false, message: "nope" });
  });
});

describe("deleteRequest", () => {
  it("cancels a pending request the user owns (admin)", async () => {
    session.mockResolvedValue(admin);
    vi.mocked(C.overseerrRequestDetails).mockResolvedValue({ status: "pending" } as never);
    expect(await deleteRequest("os-9")).toEqual({ ok: true, message: "Request cancelled" });
    expect(C.overseerrDeleteRequest).toHaveBeenCalledWith(9);
  });

  it("refuses to cancel an available request", async () => {
    session.mockResolvedValue(admin);
    vi.mocked(C.overseerrRequestDetails).mockResolvedValue({ status: "available" } as never);
    expect(await deleteRequest("os-9")).toMatchObject({ ok: false });
    expect(C.overseerrDeleteRequest).not.toHaveBeenCalled();
  });

  it("forbids a member who doesn't own the request", async () => {
    vi.mocked(C.overseerrRequestDetails).mockResolvedValue({ status: "pending", requesterId: 99, requesterEmail: "other@x" } as never);
    expect(await deleteRequest("os-9")).toEqual({ ok: false, message: "forbidden" });
  });
});

describe("editRequest", () => {
  it("edits a pending request", async () => {
    session.mockResolvedValue(admin);
    vi.mocked(C.overseerrRequestDetails).mockResolvedValue({ status: "pending" } as never);
    expect(await editRequest("os-3", [1, 2], "7")).toEqual({ ok: true, message: "Request updated" });
    expect(C.overseerrEditRequest).toHaveBeenCalledWith(3, { seasons: [1, 2], profileId: 7 });
  });

  it("only allows editing pending requests", async () => {
    session.mockResolvedValue(admin);
    vi.mocked(C.overseerrRequestDetails).mockResolvedValue({ status: "approved" } as never);
    expect(await editRequest("os-3", [], undefined)).toMatchObject({ ok: false });
  });
});

describe("getQualityProfiles", () => {
  it("falls back to the static list when Overseerr is off", async () => {
    secret.mockResolvedValue(null);
    expect((await getQualityProfiles("movie")).length).toBeGreaterThan(0);
  });

  it("returns live profiles when available", async () => {
    vi.mocked(C.overseerrMovieProfiles).mockResolvedValue([{ id: "1", label: "HD" }] as never);
    expect(await getQualityProfiles("movie")).toEqual([{ id: "1", label: "HD" }]);
  });
});
