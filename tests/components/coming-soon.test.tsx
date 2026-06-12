import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import type { UpcomingItem } from "@/lib/types";

// panels.tsx imports a server action (server-only) + the data/portal providers.
vi.mock("@/app/(portal)/admin/actions", () => ({ setQueueSource: vi.fn() }));
vi.mock("@/components/portal/DataProvider", () => ({ useData: vi.fn(), useRefresh: () => vi.fn() }));
vi.mock("@/components/portal/PortalProvider", () => ({
  usePortal: () => ({ setModalOpen: vi.fn(), modalOpen: false, paletteOpen: false, favorites: [], toggleFavorite: vi.fn() }),
}));

import { useData } from "@/components/portal/DataProvider";
import { UpcomingPanel, RecentlyAdded } from "@/components/panels";
import { UpcomingDetailModal } from "@/components/modals/UpcomingDetailModal";

const movie: UpcomingItem = {
  id: "radarr-1",
  title: "Dune: Part Two",
  kind: "movie",
  when: "2099-01-01T00:00:00Z", // far future so it survives the panel's time-window filter
  svc: "radarr",
  year: 2024,
  runtime: 166,
  rating: 8.3,
  genres: ["Sci-Fi", "Adventure"],
  overview: "Paul Atreides unites with the Fremen.",
  deepPath: "/movie/dune-part-two",
};

describe("UpcomingPanel — onSelect", () => {
  beforeEach(() => vi.mocked(useData).mockReset());

  it("invokes onSelect with the clicked item", () => {
    vi.mocked(useData).mockReturnValue({ upcoming: [movie] } as never);
    const onSelect = vi.fn();
    render(<UpcomingPanel onSelect={onSelect} />);
    fireEvent.click(screen.getByTitle("Dune: Part Two"));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "radarr-1" }));
  });

  it("does not crash and shows no pointer affordance without onSelect", () => {
    vi.mocked(useData).mockReturnValue({ upcoming: [movie] } as never);
    render(<UpcomingPanel />);
    expect(screen.getByTitle("Dune: Part Two")).toHaveStyle({ cursor: "default" });
  });
});

describe("RecentlyAdded — onSelect", () => {
  beforeEach(() => vi.mocked(useData).mockReset());

  it("opens the detail hint for a movie tile (carries tmdbId)", () => {
    vi.mocked(useData).mockReturnValue({
      recentAll: [{ id: "ra-0", title: "Fight Club", kind: "movie", year: 1999, cat: "stream", tmdbId: 550, source: "tautulli" }],
    } as never);
    const onSelect = vi.fn();
    render(<RecentlyAdded onSelect={onSelect} />);
    fireEvent.click(screen.getByText("Fight Club"));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ kind: "movie", tmdbId: 550 }));
  });
});

describe("UpcomingDetailModal", () => {
  it("renders the rich detail fields", () => {
    render(<UpcomingDetailModal item={movie} onClose={vi.fn()} onOpenService={vi.fn()} />);
    expect(screen.getByText("Dune: Part Two")).toBeInTheDocument();
    expect(screen.getByText("Sci-Fi")).toBeInTheDocument();
    expect(screen.getByText(/Paul Atreides/)).toBeInTheDocument();
    expect(screen.getByText(/Movie · 2024 · 166 min/)).toBeInTheDocument();
  });

  it("opens the service at the deep path when the button is clicked", () => {
    const onOpenService = vi.fn();
    render(<UpcomingDetailModal item={movie} onClose={vi.fn()} onOpenService={onOpenService} />);
    fireEvent.click(screen.getByRole("button", { name: /Open in Radarr/i }));
    expect(onOpenService).toHaveBeenCalledWith("radarr", "/movie/dune-part-two");
  });

  it("falls back to no deep path when the item has none", () => {
    const onOpenService = vi.fn();
    const noSlug = { ...movie, deepPath: undefined };
    render(<UpcomingDetailModal item={noSlug} onClose={vi.fn()} onOpenService={onOpenService} />);
    fireEvent.click(screen.getByRole("button", { name: /Open in Radarr/i }));
    expect(onOpenService).toHaveBeenCalledWith("radarr", undefined);
  });

  it("renders release-date rows, studio and download/monitor badges for a movie", () => {
    const rich: UpcomingItem = {
      ...movie,
      studio: "Legendary",
      monitored: true,
      hasFile: true,
      inCinemas: "2024-03-01T00:00:00Z",
      digitalRelease: "2024-04-16T00:00:00Z",
      physicalRelease: "2024-05-14T00:00:00Z",
    };
    render(<UpcomingDetailModal item={rich} onClose={vi.fn()} onOpenService={vi.fn()} />);
    expect(screen.getByText("In cinemas")).toBeInTheDocument();
    expect(screen.getByText("Digital")).toBeInTheDocument();
    expect(screen.getByText("Physical")).toBeInTheDocument();
    expect(screen.getByText("Legendary")).toBeInTheDocument();
    expect(screen.getByText("Downloaded")).toBeInTheDocument();
    expect(screen.getByText("Monitored")).toBeInTheDocument();
  });

  it("shows the empty-state synopsis and a Close footer when no overview", () => {
    const bare: UpcomingItem = { ...movie, overview: undefined };
    render(<UpcomingDetailModal item={bare} onClose={vi.fn()} onOpenService={vi.fn()} />);
    expect(screen.getByText("No synopsis available.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });
});
