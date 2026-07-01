import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

// Regression (#login-first-run): on a fresh deployment with no Overseerr members,
// `users` is empty so `me = users.find(...) ?? users[0]` is undefined. The member
// view must not dereference `me.movieQuota`/`me.linked` and crash the whole render.
vi.mock("@/components/portal/DataProvider", () => ({
  useData: () => ({ requests: [], users: [], issues: null, requestCounts: null, recent: [], nowPlaying: [], services: [] }),
  useRefresh: () => vi.fn(),
}));
vi.mock("@/components/portal/PortalProvider", () => ({
  usePortal: () => ({ role: "user", user: { id: "u1" }, setModalOpen: vi.fn() }),
}));
vi.mock("@/components/hooks/useRequestReview", () => ({
  useRequestReview: () => ({ acted: {}, onAct: vi.fn(), applyActed: (l: unknown) => l }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/app/(portal)/admin/actions", () => ({ setQueueSource: vi.fn() }));
vi.mock("@/app/(portal)/requests/actions", () => ({
  submitRequest: vi.fn(),
  deleteRequest: vi.fn(),
  editRequest: vi.fn(),
  getQualityProfiles: vi.fn().mockResolvedValue([]),
  getMediaDetail: vi.fn().mockResolvedValue({}),
}));

import { Requests } from "@/components/views/Requests";

describe("Requests view — empty members (no Overseerr configured)", () => {
  it("renders without crashing when there is no matching member (me is undefined)", () => {
    expect(() => render(<Requests />)).not.toThrow();
    // Header still renders — the quota StatTiles and unlinked banner are simply skipped.
    expect(screen.getByText("My Requests")).toBeInTheDocument();
    // No quota tile is shown because `me?.movieQuota` short-circuits.
    expect(screen.queryByText("Movies")).not.toBeInTheDocument();
  });
});
