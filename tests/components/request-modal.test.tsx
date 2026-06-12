import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import type { DiscoverItem } from "@/lib/types";

vi.mock("@/components/portal/DataProvider", () => ({
  useData: () => ({ users: [{ id: "u1", name: "Me" }], services: [] }),
  useRefresh: () => vi.fn(),
}));
vi.mock("@/components/portal/PortalProvider", () => ({
  usePortal: () => ({ user: { id: "u1" }, setModalOpen: vi.fn() }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/app/(portal)/requests/actions", () => ({
  getQualityProfiles: vi.fn().mockResolvedValue([]),
  getMediaDetail: vi.fn().mockResolvedValue({}),
}));

import { RequestModal } from "@/components/modals/RequestModal";
import type { MediaRequest } from "@/lib/types";

const movie = (state: DiscoverItem["state"]): DiscoverItem => ({
  id: "603",
  title: "Dune",
  kind: "movie",
  year: 2021,
  rating: 8,
  state,
  overview: "Spice.",
});

const request = (over: Partial<MediaRequest> = {}): MediaRequest => ({
  id: "os-1",
  title: "Dune",
  kind: "movie",
  year: 2021,
  user: "u1",
  status: "pending",
  requested: "1 Jan",
  overview: "Spice.",
  ...over,
});

const noop = vi.fn();

describe("RequestModal — header + footer behaviour", () => {
  it("shows the 'Available' header for an available pick (opened from a widget)", async () => {
    render(<RequestModal open mode="request" initialPick={movie("available")} onClose={noop} onSubmit={noop} onAct={noop} />);
    expect(await screen.findByRole("heading", { name: "Available" })).toBeInTheDocument();
    // baseline footer is present, and there's no "Back to results" (didn't come from search)
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
    expect(screen.queryByText(/Back to results/)).not.toBeInTheDocument();
  });

  it("shows the 'Requested' header for a pending pick", async () => {
    render(<RequestModal open mode="request" initialPick={movie("pending")} onClose={noop} onSubmit={noop} onAct={noop} />);
    expect(await screen.findByRole("heading", { name: "Requested" })).toBeInTheDocument();
  });

  it("shows the request flow for a not-requested pick, with Submit and no Back (came from a widget)", async () => {
    render(<RequestModal open mode="request" initialPick={movie(null)} onClose={noop} onSubmit={noop} onAct={noop} />);
    expect(await screen.findByRole("heading", { name: "Request media" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Submit request/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Back" })).not.toBeInTheDocument();
    // a baseline Close still lets the user dismiss it
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });
});

describe("RequestModal — review & detail modes", () => {
  it("review mode shows Approve/Decline for a pending request", async () => {
    render(<RequestModal open mode="review" request={request({ status: "pending" })} onClose={noop} onSubmit={noop} onAct={noop} />);
    expect(await screen.findByRole("heading", { name: "Review request" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Approve/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Decline/ })).toBeInTheDocument();
  });

  it("review mode shows only Close for a non-actionable (available) request", async () => {
    render(<RequestModal open mode="review" request={request({ status: "available" })} onClose={noop} onSubmit={noop} onAct={noop} />);
    await screen.findByRole("heading", { name: "Review request" });
    expect(screen.queryByRole("button", { name: /Approve/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });

  it("detail mode is read-only (no note field, Close footer)", async () => {
    render(<RequestModal open mode="detail" request={request({ status: "available" })} onClose={noop} onSubmit={noop} onAct={noop} />);
    expect(await screen.findByRole("heading", { name: "Request details" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Overseerr/)).not.toBeInTheDocument();
  });

  it("renders a 'Watch on Plex' action when the request has a Plex url", async () => {
    render(<RequestModal open mode="detail" request={request({ status: "available", plexUrl: "https://app.plex.tv/x" })} onClose={noop} onSubmit={noop} onAct={noop} />);
    expect(await screen.findByRole("link", { name: /Watch on Plex/ })).toBeInTheDocument();
  });
});
