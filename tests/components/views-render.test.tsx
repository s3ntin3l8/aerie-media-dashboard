import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

// Integration smoke: render the big authenticated views with a realistic snapshot so their
// composition (panels, tables, metric cards, modals' closed state) executes end-to-end.

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }), usePathname: () => "/" }));
vi.mock("@/app/(portal)/admin/actions", () => Object.fromEntries(
  ["setVisibility", "setUserOverseerrQuota", "setServiceSecret", "upsertService", "setServiceActive",
    "setServiceKeepAlive", "serviceExists", "deleteService", "detectServiceVersion", "probeServiceVersion",
    "testStoredConnection", "setPrometheusInstance", "setMetricsSource", "setQueueSource", "setBeszelSystem",
  ].map((n) => [n, vi.fn(async () => [])])));
vi.mock("@/app/(portal)/requests/actions", () => Object.fromEntries(
  ["getQualityProfiles", "submitRequest", "reviewRequest", "deleteRequest", "editRequest",
    "getSeasonQuality", "getMediaDetail", "resolveDiscoverItem", "getWatchlist",
  ].map((n) => [n, vi.fn(async () => [])])));
vi.mock("@/app/(portal)/actions", () => ({ signOutAction: vi.fn(), setFavoritesAction: vi.fn(), setDashboardsAction: vi.fn() }));

const portal = { role: "admin", realRole: "admin", user: { id: "u1", name: "Ada", email: "a@x" }, favorites: [], toggleFavorite: vi.fn(), modalOpen: false, setModalOpen: vi.fn(), theme: "dark", oidc: true };
vi.mock("@/components/portal/PortalProvider", () => ({ usePortal: () => portal }));
vi.mock("@/components/portal/DataProvider", () => ({ useData: vi.fn(), useRefresh: () => vi.fn(), usePatchData: () => vi.fn() }));
vi.mock("@/components/mobile/useIsMobile", () => ({ useIsMobile: () => false }));

import { useData } from "@/components/portal/DataProvider";
import { Status } from "@/components/views/Status";
import { Admin } from "@/components/views/Admin";
import { Streams } from "@/components/views/Streams";
import { Home } from "@/components/views/Home";

const metrics = {
  instance: "node1", cpuPct: 12, cpuHistory: [1, 2], memUsedBytes: 1e9, memTotalBytes: 4e9, memHistory: [1],
  netOutBps: 2e6, netHistory: [1], netInBps: 1e6, netInHistory: [1], diskUsedBytes: 5e9, diskTotalBytes: 1e10, diskHistory: [1],
  sysLoad: 0.5, sysLoadHistory: [1], load5: 0.4, load15: 0.3, uptimeSec: 90000, swapUsedBytes: 0, swapTotalBytes: 0,
  filesystems: [{ mount: "/", usedBytes: 5e9, totalBytes: 1e10 }],
};
const service = { id: "sonarr", name: "Sonarr", cat: "automation", icon: "dns", host: "sonarr.test", scheme: "https", status: "up", uptime: 99.9, ms: 12, beats: new Array(30).fill(1), msHistory: [10, 12], active: true, embeddable: false, keepAlive: false };

const SNAP = {
  services: [service], allServices: [service], users: [{ id: "u1", name: "Ada", email: "a@x", role: "admin", linked: true, groups: ["admins"] }],
  groups: [{ name: "admins", label: "Admins" }, { name: "friends", label: "Friends" }],
  visibility: [], adminGroup: "admins",
  metrics, metricsSource: "prometheus", prometheusConfigured: true, beszelConfigured: false, beszelSystemId: null,
  arrHealth: [{ svc: "sonarr", type: "warning", message: "Indexer slow" }],
  nowPlaying: [], bandwidth: { totalMbps: 0, wanMbps: 0 }, requests: [], requestCounts: null, issues: null,
  library: [{ id: "movies", label: "Movies", count: "100", icon: "movie", delta: "" }], libraryAll: [], recent: [], recentAll: [],
  upcoming: [], downloads: [], queue: [], storage: [], plays24h: [1, 2, 3], topStats: { users: [], media: [] },
  discover: null, qbittorrent: null, nzbgetStatus: null, lazylibrarian: null, listenarr: null, wizarr: null, prowlarr: null,
  agregarr: null, bazarrWanted: null, nzbhydra: null, metricsBySource: { prometheus: null, beszel: null },
  queueSource: "arr", arrQueueConfigured: false, nzbgetConfigured: false, qbittorrentConfigured: false,
};

beforeEach(() => {
  vi.mocked(useData).mockReturnValue(SNAP as never);
  // Status' InstanceSelect fetches the instance list.
  vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => [] })) as never);
});

describe("view smoke renders", () => {
  it("Status renders the health header, a service row and metric cards", () => {
    render(<Status />);
    expect(screen.getByText("System Status")).toBeInTheDocument();
    expect(screen.getByText("Sonarr")).toBeInTheDocument();
    expect(screen.getByText("CPU load")).toBeInTheDocument();
    expect(screen.getByText("Indexer slow")).toBeInTheDocument(); // arr warnings panel
  });

  it("Admin renders without crashing and shows the managed service", () => {
    const { container } = render(<Admin />);
    expect(container.textContent).toBeTruthy();
    expect(screen.getAllByText(/Sonarr/i).length).toBeGreaterThan(0);
  });

  it("Admin renders each tab (services → members → visibility)", () => {
    render(<Admin />);
    fireEvent.click(screen.getByText("Members"));
    expect(screen.getByText("Ada")).toBeInTheDocument(); // member row
    fireEvent.click(screen.getByText("Visibility"));
    // visibility matrix lists the service + a group column
    expect(screen.getAllByText(/Sonarr/i).length).toBeGreaterThan(0);
  });

  it("Streams renders its scaffold", () => {
    const { container } = render(<Streams />);
    expect(container.textContent).toBeTruthy();
  });

  it("Home renders the dashboard grid with default widgets", () => {
    const { container } = render(<Home />);
    expect(container.textContent).toBeTruthy();
  });
});
