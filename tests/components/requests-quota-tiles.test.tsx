import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import type { OverseerrQuota } from "@/lib/types";

// The member Requests view renders movie/TV quota StatTiles from the matching member
// (`me?.movieQuota != null && …`). Exercises both the limited/unrestricted and the
// unlimited/restricted treatments so the guarded ternaries are fully covered.
vi.mock("@/components/portal/DataProvider", () => ({ useData: vi.fn(), useRefresh: () => vi.fn() }));
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

import { useData } from "@/components/portal/DataProvider";
import { Requests } from "@/components/views/Requests";

const quota = (over: Partial<OverseerrQuota> = {}): OverseerrQuota => ({
  limit: 5, days: 7, used: 2, remaining: 3, restricted: false, ...over,
});
const member = (over: Record<string, unknown>) => ({
  id: "u1", name: "Me", linked: true, movieQuota: null, tvQuota: null, ...over,
});
const data = (users: unknown[]) =>
  vi.mocked(useData).mockReturnValue({ requests: [], users, issues: null, requestCounts: null, recent: [], nowPlaying: [], services: [] } as never);

beforeEach(() => vi.mocked(useData).mockReset());

describe("Requests view — member quota tiles", () => {
  it("renders limited, unrestricted movie/TV quota tiles", () => {
    data([member({ movieQuota: quota({ used: 2, limit: 5 }), tvQuota: quota({ used: 1, limit: 3 }) })]);
    render(<Requests />);
    expect(screen.getByText("Movies")).toBeInTheDocument();
    expect(screen.getByText("2/5")).toBeInTheDocument();
    expect(screen.getByText("1/3")).toBeInTheDocument();
  });

  it("renders unlimited (∞) and restricted (amber) quota tiles", () => {
    data([member({ movieQuota: quota({ used: 9, limit: null, restricted: true }), tvQuota: quota({ used: 4, limit: null, restricted: true }) })]);
    render(<Requests />);
    expect(screen.getByText("9/∞")).toBeInTheDocument();
    expect(screen.getByText("4/∞")).toBeInTheDocument();
  });
});
