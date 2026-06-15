import { describe, it, expect, vi, beforeEach } from "vitest";

// The /api/snapshot GET handler is a thin pass-through over the data facade: it calls
// getSnapshot() and serializes the result as no-store JSON for the client poller.
vi.mock("@/lib/data/snapshot", () => ({ getSnapshot: vi.fn() }));

import { getSnapshot } from "@/lib/data/snapshot";
import { GET } from "@/app/api/snapshot/route";

beforeEach(() => vi.clearAllMocks());

describe("GET /api/snapshot", () => {
  it("returns the snapshot from getSnapshot() as JSON", async () => {
    const snap = { services: [{ id: "sonarr" }], nowPlaying: [], plays24h: [1, 2, 3] };
    vi.mocked(getSnapshot).mockResolvedValue(snap as never);

    const res = await GET();
    expect(getSnapshot).toHaveBeenCalledTimes(1);
    expect(await res.json()).toEqual(snap);
  });

  it("sets a no-store Cache-Control header so the poller always gets fresh data", async () => {
    vi.mocked(getSnapshot).mockResolvedValue({ services: [] } as never);
    const res = await GET();
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});
