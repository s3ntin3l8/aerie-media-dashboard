import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

vi.mock("@/app/(portal)/admin/actions", () => ({ setQueueSource: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/portal/PortalProvider", () => ({
  usePortal: () => ({ role: "admin", user: { id: "u1" }, modalOpen: false, setModalOpen: vi.fn() }),
}));
vi.mock("@/components/portal/DataProvider", () => ({ useData: vi.fn(), useRefresh: () => vi.fn() }));
import { useData } from "@/components/portal/DataProvider";
import { CardSettingsModal } from "@/components/modals/CardSettingsModal";
import type { Tile } from "@/components/portal/gridLayout";

const tile = (type: string, settings?: Record<string, string | number | boolean>): Tile => ({
  uid: `${type}-1`, type, x: 0, y: 0, w: 4, h: 4, ...(settings ? { settings } : {}),
});

beforeEach(() => {
  vi.mocked(useData).mockReturnValue({
    services: [{ id: "tautulli", name: "Tautulli" }, { id: "jellyfin", name: "Jellyfin" }],
    libraryAll: [
      { id: "movies", label: "Movies", count: "100", icon: "movie", delta: "", source: "tautulli" },
      { id: "shows", label: "Shows", count: "9", icon: "tv", delta: "", source: "jellyfin" },
    ],
  } as never);
});

describe("CardSettingsModal — source picker", () => {
  it("renders a source select with Auto + configured providers", () => {
    render(<CardSettingsModal open tile={tile("nowPlaying")} onClose={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByText("Data source")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /auto/i })).toBeInTheDocument();
    // Plex is available because tautulli is configured; Jellyfin because jellyfin is.
    expect(screen.getByRole("option", { name: "Plex" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Jellyfin" })).toBeInTheDocument();
  });

  it("lists library cards for the tile's chosen source (libraryIds resolves by source)", () => {
    render(<CardSettingsModal open tile={tile("libraryStats", { source: "jellyfin" })} onClose={vi.fn()} onSave={vi.fn()} />);
    // jellyfin source → only the Shows card is toggleable, not the tautulli Movies card.
    expect(screen.getByText("Shows")).toBeInTheDocument();
    expect(screen.queryByText("Movies")).toBeNull();
  });
});
