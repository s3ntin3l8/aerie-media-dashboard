import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number; headers?: Record<string, string> }) => {
      const headers = new Headers(init?.headers);
      return new Response(JSON.stringify(body), { status: init?.status, headers });
    },
  },
}));
vi.mock("@/lib/session", () => ({ getSessionUser: vi.fn() }));
vi.mock("@/lib/data/snapshot", () => ({ getSnapshot: vi.fn() }));

import { getSessionUser } from "@/lib/session";
import { getSnapshot } from "@/lib/data/snapshot";
import { GET } from "@/app/api/snapshot/route";

beforeEach(() => vi.clearAllMocks());

describe("GET /api/snapshot", () => {
  it("returns the snapshot from getSnapshot() as JSON", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u1", name: "User", email: "u@x", role: "user", groups: [] } as never);
    const snap = { services: [{ id: "sonarr" }], nowPlaying: [], plays24h: [1, 2, 3] };
    vi.mocked(getSnapshot).mockResolvedValue(snap as never);

    const res = await GET();
    expect(getSnapshot).toHaveBeenCalledTimes(1);
    expect(await res.json()).toEqual(snap);
  });

  it("sets a no-store Cache-Control header so the poller always gets fresh data", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u1", name: "User", email: "u@x", role: "user", groups: [] } as never);
    vi.mocked(getSnapshot).mockResolvedValue({ services: [] } as never);
    const res = await GET();
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("401s for anonymous guests", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "anon", name: "Guest", email: "", role: "user", groups: [] } as never);
    const res = await GET();
    expect(res.status).toBe(401);
  });
});
