import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import type { OverseerrQuota } from "@/lib/types";

// MyRequestsPanel's member-mode quota block reads `me = users.find(...) ?? users[0]`.
// It must render the quota bars when a matching member exists, and — the regression
// guarded here — must NOT crash when `users` is empty (fresh deployment, no Overseerr),
// where `me` is undefined and every `me?.movieQuota` read short-circuits.
vi.mock("@/app/(portal)/admin/actions", () => ({ setQueueSource: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/portal/PortalProvider", () => ({
  usePortal: () => ({ role: "user", user: { id: "u1" }, modalOpen: false, setModalOpen: vi.fn() }),
}));
vi.mock("@/components/portal/DataProvider", () => ({ useData: vi.fn(), useRefresh: () => vi.fn() }));

import { useData } from "@/components/portal/DataProvider";
import { MyRequestsPanel } from "@/components/panels";

const data = (over: Record<string, unknown>) => vi.mocked(useData).mockReturnValue(over as never);
beforeEach(() => vi.mocked(useData).mockReset());

const quota = (over: Partial<OverseerrQuota> = {}): OverseerrQuota => ({
  limit: 5, days: 7, used: 2, remaining: 3, restricted: false, ...over,
});

describe("MyRequestsPanel — member quota block", () => {
  it("renders the movie & TV quota usage for the matching member", () => {
    data({ users: [{ id: "u1", name: "Me", movieQuota: quota({ used: 2, limit: 5 }), tvQuota: quota({ used: 1, limit: 3 }) }], requests: [] });
    render(<MyRequestsPanel role="user" view="mine" />);
    expect(screen.getByText("2/5")).toBeInTheDocument();
    expect(screen.getByText("1/3")).toBeInTheDocument();
  });

  it("shows unlimited (∞) usage and the restricted (amber) treatment", () => {
    data({ users: [{ id: "u1", name: "Me", movieQuota: quota({ used: 9, limit: null, restricted: true }), tvQuota: quota({ used: 4, limit: null, restricted: true }) }], requests: [] });
    render(<MyRequestsPanel role="user" view="mine" />);
    // limit === null → "used/∞" (covers the `limit ?? "∞"` and `limit ? … : 0` branches)…
    expect(screen.getByText("9/∞")).toBeInTheDocument();
    expect(screen.getByText("4/∞")).toBeInTheDocument();
  });

  it("renders without crashing when there is no matching member (empty users, me undefined)", () => {
    data({ users: [], requests: [] });
    expect(() => render(<MyRequestsPanel role="user" view="mine" />)).not.toThrow();
    // Quota label still renders; the bars/usage are simply omitted.
    expect(screen.getByText("Quota")).toBeInTheDocument();
    expect(screen.queryByText("2/5")).not.toBeInTheDocument();
  });
});
