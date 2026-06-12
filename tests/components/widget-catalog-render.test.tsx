import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

vi.mock("@/app/(portal)/admin/actions", () => ({ setQueueSource: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/portal/PortalProvider", () => ({
  usePortal: () => ({ role: "admin", user: { id: "u1" }, modalOpen: false, setModalOpen: vi.fn(), favorites: [], toggleFavorite: vi.fn(), paletteOpen: false, oidc: true }),
}));
vi.mock("@/components/portal/DataProvider", () => ({ useData: vi.fn(), useRefresh: () => vi.fn() }));
import { useData } from "@/components/portal/DataProvider";
import { WIDGET_CATALOG, resolveSettings, type WidgetCtx } from "@/components/portal/widgetCatalog";

const m = { cpuPct: 10, memUsedBytes: 1e9, memTotalBytes: 4e9, diskUsedBytes: 5e9, diskTotalBytes: 1e10, netOutBps: 2e6, netInBps: 1e6, sysLoad: 0.4, uptimeSec: 90000 };

// One superset snapshot covering every field any catalog widget reads.
const SNAP = {
  nowPlaying: [],
  services: [],
  users: [],
  visibility: [],
  requests: [],
  libraryAll: [{ id: "movies", label: "Movies", count: "100", icon: "movie", delta: "", source: "tautulli" }],
  library: [{ id: "movies", label: "Movies", count: "100", icon: "movie", delta: "", source: "tautulli" }],
  recentAll: [{ id: "r1", title: "Dune", kind: "movie", year: 2021, cat: "stream", source: "tautulli" }],
  recent: [{ id: "r1", title: "Dune", kind: "movie", year: 2021, cat: "stream", source: "tautulli" }],
  upcoming: [],
  downloads: [],
  queue: [],
  queueSource: "arr",
  arrQueueConfigured: false,
  nzbgetConfigured: false,
  qbittorrentConfigured: false,
  nzbgetStatus: null,
  topStats: null,
  bandwidth: null,
  plays24h: [1, 2, 3],
  prowlarr: { enabled: 5, total: 6, queries: 100, grabs: 12, failedGrabs: 1 },
  nzbhydra: null,
  lazylibrarian: { totalBooks: 10, authors: 3, wanted: 2, snatched: 1 },
  listenarr: null,
  wizarr: { users: 3, invites: 2, pending: 1, expired: 0 },
  agregarr: { activeCollections: 2, collections: 2, needingSync: 0, running: false, progress: 0, currentStage: "", lastSyncAt: null, nextSyncAt: null, error: false },
  bazarrWanted: { episodes: 1, movies: 2 },
  qbittorrent: { dlSpeed: 1, upSpeed: 1, downloading: 1, seeding: 2, torrents: 3 },
  discover: { trending: [], popularMovies: [], popularTv: [], upcomingMovies: [], watchlist: [] },
  metricsBySource: { prometheus: m, beszel: null },
  metrics: m,
  metricsSource: "prometheus",
  arrHealth: [{ svc: "sonarr", type: "warning", message: "Indexer down" }],
  storage: [{ path: "/a", label: "/a", totalBytes: 100, freeBytes: 40 }],
};

const ctx: WidgetCtx = {
  role: "admin",
  onNavigate: vi.fn(),
  onOpenService: vi.fn(),
  onAct: vi.fn(),
  onRequest: vi.fn(),
  onSelectUpcoming: vi.fn(),
  onSelectMedia: vi.fn(),
};

beforeEach(() => vi.mocked(useData).mockReturnValue(SNAP as never));

// type → a text we expect to see, proving the render arrow + body executed.
const CASES: [string, RegExp][] = [
  ["nowPlaying", /nothing playing/i],
  ["libraryStats", /Movies/],
  ["recentlyAdded", /Dune/],
  ["indexers", /Queries/],
  ["books", /Authors/],
  ["hostStats", /CPU/],
  ["storage", /\/a/],
  ["serviceWarnings", /Indexer down/],
  ["activity", /Activity/],
];

describe("WIDGET_CATALOG.render — changed/new entries", () => {
  it.each(CASES)("renders the %s widget with default settings", (type, expected) => {
    const entry = WIDGET_CATALOG[type];
    expect(entry).toBeDefined();
    render(<div>{entry.render(ctx, resolveSettings(type, {}))}</div>);
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it("honours an explicit per-tile source setting (indexers → nzbhydra)", () => {
    vi.mocked(useData).mockReturnValue({ ...SNAP, nzbhydra: { enabled: 2, total: 3, disabled: 1, errored: 0 }, prowlarr: { enabled: 5, total: 6, queries: 1, grabs: 1, failedGrabs: 0 } } as never);
    render(<div>{WIDGET_CATALOG.indexers.render(ctx, resolveSettings("indexers", { source: "nzbhydra" }))}</div>);
    expect(screen.getByText("Errored")).toBeInTheDocument();
  });

  // Smoke-render EVERY catalog widget so each render() + body executes (no throw).
  it.each(Object.keys(WIDGET_CATALOG))("smoke-renders the %s catalog entry", (type) => {
    const entry = WIDGET_CATALOG[type];
    const { container } = render(<div>{entry.render(ctx, resolveSettings(type, {}))}</div>);
    expect(container.firstChild).not.toBeNull();
  });
});
