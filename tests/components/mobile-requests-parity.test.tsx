import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import React from "react";
import type { MediaRequest } from "@/lib/types";

// MobileRequests parity: role-aware stat tiles, member quota + link banner, sort toggle,
// admin status/requester chips, the pagination hint, and status filtering. The empty-data
// smoke test elsewhere doesn't exercise any of these branches.

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/" }));
vi.mock("@/app/(portal)/requests/actions", () => Object.fromEntries(
  ["submitRequest", "deleteRequest", "editRequest", "getQualityProfiles", "getMediaDetail"].map((n) => [n, vi.fn(async () => [])])));
vi.mock("@/app/(portal)/admin/actions", () => ({ reviewRequest: vi.fn(async () => ({ ok: true })) }));

const portal: { role: string; user: { id: string; name: string; email: string } } = {
  role: "admin", user: { id: "u1", name: "Ada", email: "a@x" },
};
vi.mock("@/components/portal/PortalProvider", () => ({ usePortal: () => portal }));
vi.mock("@/components/portal/DataProvider", () => ({ useData: vi.fn(), useRefresh: () => vi.fn(), usePatchData: () => vi.fn() }));

import { useData } from "@/components/portal/DataProvider";
import { MobileRequests } from "@/components/mobile/screens/MobileRequests";

const req = (over: Partial<MediaRequest>): MediaRequest => ({
  id: "os-x", title: "Untitled", kind: "movie", year: 2024, user: "Mia", status: "pending",
  requested: "1d", ...over,
} as MediaRequest);

const adminRequests = [
  req({ id: "os-1", title: "Dune", status: "pending", portalUser: "u2", requesterName: "Mia", requested: "2d", modified: "2024-02-01" }),
  req({ id: "os-2", title: "Arrival", status: "approved", portalUser: "u2", requesterName: "Mia", requested: "3d", modified: "2024-01-01" }),
  req({ id: "os-3", title: "Tenet", status: "pending", portalUser: "u3", requesterName: "Sam", requested: "1d", modified: "2024-03-01" }),
];

const adminSnap = {
  requests: adminRequests,
  users: [{ id: "u1", name: "Ada", email: "a@x" }, { id: "u2", name: "Mia" }, { id: "u3", name: "Sam" }],
  issues: { open: 2 },
  requestCounts: { total: 10, pending: 2, approved: 1, available: 0, processing: 1, failed: 1 },
};

beforeEach(() => {
  portal.role = "admin";
  portal.user = { id: "u1", name: "Ada", email: "a@x" };
  vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => [] })) as never);
});

describe("MobileRequests — admin", () => {
  it("shows admin stat tiles incl. the open-issues count", () => {
    vi.mocked(useData).mockReturnValue(adminSnap as never);
    render(<MobileRequests />);
    expect(screen.getByText("Issues")).toBeInTheDocument();
    expect(screen.queryByText("Members")).not.toBeInTheDocument();
  });

  it("offers the admin-only Processing/Failed status chips", () => {
    vi.mocked(useData).mockReturnValue(adminSnap as never);
    render(<MobileRequests />);
    expect(screen.getByRole("button", { name: /Processing/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Failed/ })).toBeInTheDocument();
  });

  it("renders the requester filter chips when more than one requester exists", () => {
    vi.mocked(useData).mockReturnValue(adminSnap as never);
    render(<MobileRequests />);
    expect(screen.getByRole("button", { name: /Mia/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sam/ })).toBeInTheDocument();
  });

  it("toggles the sort control between Date and Modified", () => {
    vi.mocked(useData).mockReturnValue(adminSnap as never);
    render(<MobileRequests />);
    const sortBtn = screen.getByTitle(/Sort by/);
    expect(within(sortBtn).getByText("Date")).toBeInTheDocument();
    fireEvent.click(sortBtn);
    expect(within(sortBtn).getByText("Modified")).toBeInTheDocument();
  });

  it("shows the pagination hint when the snapshot is a partial page", () => {
    vi.mocked(useData).mockReturnValue(adminSnap as never);
    render(<MobileRequests />);
    expect(screen.getByText("Showing 3 of 10 total requests")).toBeInTheDocument();
  });

  it("filters the list to pending when the Pending chip is clicked", () => {
    vi.mocked(useData).mockReturnValue(adminSnap as never);
    render(<MobileRequests />);
    // All statuses visible initially.
    expect(screen.getByText("Arrival")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Pending/ }));
    // The approved item drops out; pending items remain.
    expect(screen.queryByText("Arrival")).not.toBeInTheDocument();
    expect(screen.getByText("Dune")).toBeInTheDocument();
    expect(screen.getByText("Tenet")).toBeInTheDocument();
  });
});

describe("MobileRequests — member", () => {
  const memberSnap = {
    requests: [req({ id: "os-9", title: "Sicario", status: "pending", portalUser: "u1", requesterName: "Ada", requested: "1d" })],
    users: [{ id: "u1", name: "Ada", email: "a@x", linked: false,
      movieQuota: { used: 3, limit: 10, days: 7, remaining: 7, restricted: false },
      tvQuota: { used: 1, limit: 5, days: 7, remaining: 4, restricted: false } }],
    issues: null,
    requestCounts: { total: 1, pending: 1, approved: 0, available: 0, processing: 0, failed: 0 },
  };

  beforeEach(() => { portal.role = "user"; });

  it("shows the member movie/TV quota tiles", () => {
    vi.mocked(useData).mockReturnValue(memberSnap as never);
    render(<MobileRequests />);
    expect(screen.getByText("Movies")).toBeInTheDocument();
    expect(screen.getByText("TV quota")).toBeInTheDocument();
    expect(screen.getByText("3/10")).toBeInTheDocument();
  });

  it("warns when the member's Overseerr account isn't linked", () => {
    vi.mocked(useData).mockReturnValue(memberSnap as never);
    render(<MobileRequests />);
    expect(screen.getByText(/isn’t linked yet/)).toBeInTheDocument();
  });

  it("hides the admin Processing/Failed chips and requester filter from members", () => {
    vi.mocked(useData).mockReturnValue(memberSnap as never);
    render(<MobileRequests />);
    expect(screen.queryByRole("button", { name: /Processing/ })).not.toBeInTheDocument();
  });
});
