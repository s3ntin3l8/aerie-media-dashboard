import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import type { MediaRequest } from "@/lib/types";

const available: MediaRequest = {
  id: "os-1",
  title: "Dune",
  kind: "movie",
  year: 2021,
  user: "u1",
  status: "available",
  requested: "1 Jan",
  portalUser: "u1",
  fileInfo: { label: "2160p Blu-ray", sizeBytes: 8e9 },
};

vi.mock("@/components/portal/DataProvider", () => ({
  useData: () => ({ requests: [available], users: [{ id: "u1", name: "Me" }], issues: null, requestCounts: null, recent: [], nowPlaying: [], services: [] }),
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

describe("Requests view", () => {
  it("wraps the body in the wide content tier (#101)", () => {
    const { container } = render(<Requests />);
    expect(container.querySelector(".aerie-page-pad.aerie-page-pad--wide")).not.toBeNull();
  });

  it("renders the member's request card with status and resolution badge", () => {
    render(<Requests />);
    expect(screen.getByText("Dune")).toBeInTheDocument();
    // available movie shows its downloaded resolution badge
    expect(screen.getByText("2160p")).toBeInTheDocument();
  });

  it("groups the status + quality badges in their own row (not the title row)", () => {
    render(<Requests />);
    const quality = screen.getByText("2160p");
    const badgeRow = quality.parentElement!;
    // The status Pill sits in the same dedicated badges row as the quality badge…
    expect(badgeRow.textContent).toContain("Available");
    // …which is not the title element's container, so a long title can't clip them.
    expect(screen.getByText("Dune").parentElement).not.toBe(badgeRow);
  });

  it("opens the read-only detail modal when a member clicks their card", async () => {
    render(<Requests />);
    fireEvent.click(screen.getByText("Dune"));
    expect(await screen.findByRole("heading", { name: "Request details" })).toBeInTheDocument();
  });
});
