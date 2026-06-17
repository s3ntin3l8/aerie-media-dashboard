import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number; headers?: Record<string, string> }) => {
      const headers = new Headers(init?.headers);
      return new Response(JSON.stringify(body), { status: init?.status, headers });
    },
  },
}));
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/data/snapshot", () => ({ getSnapshot: vi.fn() }));
vi.mock("@/lib/data/scrub", () => ({ scrubForMember: vi.fn((s: unknown) => s) }));

import { auth } from "@/auth";
import { getSnapshot } from "@/lib/data/snapshot";
import { scrubForMember } from "@/lib/data/scrub";
import { GET } from "@/app/api/snapshot/route";

beforeEach(() => vi.clearAllMocks());

describe("GET /api/snapshot", () => {
  it("returns the full snapshot for admins", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1", name: "Admin", email: "a@x", role: "admin" } } as never);
    const snap = { services: [{ id: "sonarr" }], nowPlaying: [], plays24h: [1, 2, 3] };
    vi.mocked(getSnapshot).mockResolvedValue(snap as never);

    const res = await GET();
    expect(scrubForMember).not.toHaveBeenCalled();
    expect(await res.json()).toEqual(snap);
  });

  it("scrubs the snapshot for non-admin members", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u2", name: "User", email: "u@x", role: "user" } } as never);
    vi.mocked(getSnapshot).mockResolvedValue({ services: [] } as never);
    const res = await GET();
    expect(scrubForMember).toHaveBeenCalledTimes(1);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("401s for anonymous guests", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const res = await GET();
    expect(res.status).toBe(401);
  });
});