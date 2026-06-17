import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

// Mobile single-column behaviour of the dashboard panels: in the stacked layout a tile has no
// fixed height, so panels must render at natural content height (no internal scroll / no fixed
// height:100%) and collapse wide internals to a single/wrapping column — otherwise content
// overflows its (formerly fixed) box and overlaps the next widget. Panels read the flag via
// useStacked(); we wrap them in StackedContext.Provider to exercise that branch.
vi.mock("@/app/(portal)/admin/actions", () => ({ setQueueSource: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/portal/PortalProvider", () => ({
  usePortal: () => ({ role: "admin", user: { id: "u1" }, modalOpen: false, setModalOpen: vi.fn() }),
}));
vi.mock("@/components/portal/DataProvider", () => ({ useData: vi.fn(), useRefresh: () => vi.fn() }));

import { useData } from "@/components/portal/DataProvider";
import { CentralServices, LibraryStats, ServiceTiles, QueuePanel, DownloadsPanel, Empty } from "@/components/panels";
import { StackedContext } from "@/components/portal/StackedContext";

const data = (over: Record<string, unknown>) => vi.mocked(useData).mockReturnValue(over as never);
beforeEach(() => vi.mocked(useData).mockReset());

const Stacked = ({ children }: { children: React.ReactNode }) => (
  <StackedContext.Provider value={true}>{children}</StackedContext.Provider>
);

const svc = (over: Record<string, unknown> = {}) => ({
  id: "plex", name: "Plex", cat: "stream", status: "up", uptime: 99.9, ms: 12,
  host: "plex.example.com", note: "", embeddable: false, central: true, centralLabel: "CORE",
  beats: [1, 1, 1, 1, 1], version: "1.0", lastIncidentAt: null, ...over,
});

// Find a rendered element by an inline style property React actually set.
const byStyle = (root: HTMLElement, prop: keyof CSSStyleDeclaration, val: string) =>
  [...root.querySelectorAll<HTMLElement>("*")].find((el) => el.style[prop] === val);

describe("CentralServices — mobile stack", () => {
  it("uses a single-column grid (not the desktop auto-fit) and doesn't scroll internally", () => {
    data({ services: [svc(), svc({ id: "seerr", name: "Seerr" })], visibility: [] });
    const { container } = render(<Stacked><CentralServices fill /></Stacked>);
    const grid = byStyle(container, "gridTemplateColumns", "1fr");
    expect(grid).toBeTruthy();
    // fill is neutralised on the stack → the grid is not an internal scroll region.
    expect(grid!.style.overflowY).toBe("");
    expect(screen.getByText("Plex")).toBeInTheDocument();
    expect(screen.getByText("Seerr")).toBeInTheDocument();
  });

  it("keeps the desktop multi-column auto-fit grid when not stacked", () => {
    data({ services: [svc()], visibility: [] });
    const { container } = render(<CentralServices fill />);
    expect(byStyle(container, "gridTemplateColumns", "1fr")).toBeFalsy();
    expect(byStyle(container, "gridTemplateColumns", "repeat(auto-fit, minmax(248px, 1fr))")).toBeTruthy();
  });
});

describe("LibraryStats — mobile stack", () => {
  const libraryAll = [
    { id: "movies", label: "Movies", count: "2375", icon: "movie", delta: "", source: "tautulli" },
    { id: "shows", label: "TV Shows", count: "606", icon: "tv", delta: "", source: "tautulli" },
  ];

  it("renders at natural height (no fixed height:100%) so rows can't overflow the next widget", () => {
    data({ libraryAll });
    const { container } = render(<Stacked><LibraryStats fill /></Stacked>);
    const grid = container.querySelector<HTMLElement>(".aerie-lib-grid")!;
    expect(grid.style.height).toBe("");
    expect(screen.getByText("2375")).toBeInTheDocument();
  });

  it("pins to the tile height (fixed) on desktop", () => {
    data({ libraryAll });
    const { container } = render(<LibraryStats fill />);
    expect(container.querySelector<HTMLElement>(".aerie-lib-grid")!.style.height).toBe("100%");
  });
});

describe("ServiceTiles (FlowGrid) — mobile stack", () => {
  it("shows every tile in a wrapping grid with no horizontal-scroll container", () => {
    data({ services: [svc({ central: false }), svc({ id: "radarr", name: "Radarr", central: false })], visibility: [] });
    const { container } = render(<Stacked><ServiceTiles fill /></Stacked>);
    expect(screen.getByText("Plex")).toBeInTheDocument();
    expect(screen.getByText("Radarr")).toBeInTheDocument();
    // The desktop FlowGrid is a horizontally-scrollable flex column; the stacked grid is not.
    expect(byStyle(container, "overflowX", "auto")).toBeFalsy();
  });
});

describe("Queue & Downloads — mobile stack render at natural height", () => {
  it("renders queue rows in the stacked layout", () => {
    data({ queue: [{ id: "q1", svc: "radarr", title: "A Movie", speed: "1 MB/s", pct: 50, eta: "1m" }], queueSource: "arr", arrQueueConfigured: true, nzbgetConfigured: false, qbittorrentConfigured: false, qbittorrent: null });
    render(<Stacked><QueuePanel fill /></Stacked>);
    expect(screen.getByText("A Movie")).toBeInTheDocument();
  });

  it("renders download rows in the stacked layout", () => {
    data({ downloads: [{ id: "d1", svc: "radarr", title: "A Download", when: "2026-06-16T00:00:00Z", size: "1 GB" }] });
    render(<Stacked><DownloadsPanel fill /></Stacked>);
    expect(screen.getByText("A Download")).toBeInTheDocument();
  });

  it("shows a card-filling empty placeholder when the queue is empty (#109)", () => {
    // QueuePanel had no empty state before — an empty queue rendered a blank body.
    data({ queue: [], queueSource: "arr", arrQueueConfigured: true, nzbgetConfigured: false, qbittorrentConfigured: false, qbittorrent: null });
    const { container } = render(<QueuePanel fill />);
    expect(screen.getByText(/no active downloads/i)).toBeInTheDocument();
    // The idle-empty placeholder uses the card-filling `art` variant (badge ring present).
    expect(byStyle(container, "boxShadow", "inset 0 0 0 1px var(--outline-variant)")).toBeTruthy();
  });
});

describe("Empty — idle-empty (art) vs needs-setup (plain) variants", () => {
  it("art variant fills the card and sets the icon in a tinted badge ring", () => {
    const { container } = render(<Empty art icon="downloading" line="No active downloads" sub="Grabbed items appear here." />);
    expect(screen.getByText("No active downloads")).toBeInTheDocument();
    // Card-filling: the outer wrapper grows to the tile height (height:100%, flex:1)…
    const filling = byStyle(container, "height", "100%");
    expect(filling).toBeTruthy();
    // …and the icon sits inside the tinted badge ring (distinct from the plain variant).
    expect(byStyle(container, "boxShadow", "inset 0 0 0 1px var(--outline-variant)")).toBeTruthy();
  });

  it("plain variant stays compact with no badge ring, keeping idle vs needs-setup distinct", () => {
    const { container } = render(<Empty icon="memory" line="No host metrics" sub="Add Prometheus or Beszel." />);
    expect(screen.getByText("No host metrics")).toBeInTheDocument();
    expect(byStyle(container, "height", "100%")).toBeFalsy();
    expect(byStyle(container, "boxShadow", "inset 0 0 0 1px var(--outline-variant)")).toBeFalsy();
  });
});
