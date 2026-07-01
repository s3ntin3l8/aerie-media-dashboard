import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import type { OverseerrQuota } from "@/lib/types";

// The request modal's DiscoverStep (search step, mode="request" with no initialPick)
// reads `me = users.find(...) ?? users[0]`. On a fresh deployment with no Overseerr
// members `me` is undefined, so the quota strip must be skipped rather than crash on
// `me.movieQuota`; when a member exists the strip renders its usage.
vi.mock("@/components/portal/DataProvider", () => ({ useData: vi.fn(), useRefresh: () => vi.fn() }));
vi.mock("@/components/portal/PortalProvider", () => ({
  usePortal: () => ({ user: { id: "u1" }, setModalOpen: vi.fn() }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/app/(portal)/requests/actions", () => ({
  getQualityProfiles: vi.fn().mockResolvedValue([]),
  getMediaDetail: vi.fn().mockResolvedValue({}),
}));

import { useData } from "@/components/portal/DataProvider";
import { RequestModal } from "@/components/modals/RequestModal";

const quota = (over: Partial<OverseerrQuota> = {}): OverseerrQuota => ({
  limit: 5, days: 7, used: 2, remaining: 3, restricted: false, ...over,
});
const data = (users: unknown[]) =>
  vi.mocked(useData).mockReturnValue({ users, services: [] } as never);
const noop = vi.fn();

beforeEach(() => {
  vi.mocked(useData).mockReset();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
});
afterEach(() => vi.unstubAllGlobals());

describe("RequestModal — discover step quota strip", () => {
  it("renders the search step without crashing and omits the quota strip when there is no member", async () => {
    data([]);
    render(<RequestModal open mode="request" onClose={noop} onSubmit={noop} onAct={noop} />);
    // The search input is the DiscoverStep; it renders even though `me` is undefined…
    expect(await screen.findByPlaceholderText(/Search movies & shows/)).toBeInTheDocument();
    // …and no quota usage strip is shown (guarded by `me?.movieQuota != null`).
    expect(screen.queryByText("Movies")).not.toBeInTheDocument();
  });

  it("renders the quota strip for a member with quotas", async () => {
    data([{ id: "u1", name: "Me", movieQuota: quota({ used: 2, limit: 5 }), tvQuota: quota({ used: 1, limit: 3 }) }]);
    render(<RequestModal open mode="request" onClose={noop} onSubmit={noop} onAct={noop} />);
    await screen.findByPlaceholderText(/Search movies & shows/);
    expect(screen.getByText("Movies")).toBeInTheDocument();
    expect(screen.getByText("2/5")).toBeInTheDocument();
    expect(screen.getByText("1/3")).toBeInTheDocument();
  });
});
