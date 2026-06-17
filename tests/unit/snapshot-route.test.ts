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

import { auth } from "@/auth";
import { getSnapshot } from "@/lib/data/snapshot";
import { GET } from "@/app/api/snapshot/route";

beforeEach(() => vi.clearAllMocks());

describe("GET /api/snapshot", () => {
  it("returns the snapshot from getSnapshot() as JSON", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1", name: "User", email: "u@x" } } as never);
    const snap = { services: [{ id: "sonarr" }], nowPlaying: [], plays24h: [1, 2, 3] };
    vi.mocked(getSnapshot).mockResolvedValue(snap as never);

    const res = await GET();
    expect(getSnapshot).toHaveBeenCalledTimes(1);
    expect(await res.json()).toEqual(snap);
  });

  it("sets a no-store Cache-Control header so the poller always gets fresh data", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1", name: "User", email: "u@x" } } as never);
    vi.mocked(getSnapshot).mockResolvedValue({ services: [] } as never);
    const res = await GET();
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("401s for anonymous guests", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const res = await GET();
    expect(res.status).toBe(401);
  });
});
