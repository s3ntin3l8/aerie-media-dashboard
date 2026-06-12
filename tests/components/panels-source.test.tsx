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
import { LibraryStats, StoragePanel } from "@/components/panels";

const data = (over: Record<string, unknown>) => vi.mocked(useData).mockReturnValue(over as never);
beforeEach(() => vi.mocked(useData).mockReset());

const libraryAll = [
  { id: "movies", label: "Movies", count: "100", icon: "movie", delta: "", source: "tautulli" },
  { id: "movies", label: "Movies", count: "42", icon: "movie", delta: "", source: "jellyfin" },
];

describe("LibraryStats — per-widget source", () => {
  it("Auto prefers Tautulli (Plex) when both are present", () => {
    data({ libraryAll });
    render(<LibraryStats fill />);
    expect(screen.getByText("100")).toBeInTheDocument();
    expect(screen.queryByText("42")).toBeNull();
  });

  it("shows the Jellyfin cards when that source is picked", () => {
    data({ libraryAll });
    render(<LibraryStats fill source="jellyfin" />);
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.queryByText("100")).toBeNull();
  });

  it("empty-states when no source has cards", () => {
    data({ libraryAll: [] });
    render(<LibraryStats fill />);
    expect(screen.getByText(/no library stats/i)).toBeInTheDocument();
  });
});

describe("StoragePanel — fill widget", () => {
  it("renders mounts and respects a limit", () => {
    data({ storage: [
      { path: "/a", label: "/a", totalBytes: 100, freeBytes: 50 },
      { path: "/b", label: "/b", totalBytes: 100, freeBytes: 10 },
    ] });
    render(<StoragePanel fill limit={1} />);
    expect(screen.getByText("/a")).toBeInTheDocument();
    expect(screen.queryByText("/b")).toBeNull();
  });

  it("empty-states in fill mode with no storage", () => {
    data({ storage: [] });
    render(<StoragePanel fill />);
    expect(screen.getByText(/no storage data/i)).toBeInTheDocument();
  });
});
