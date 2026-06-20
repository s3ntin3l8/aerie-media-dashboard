import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

// Merged Services view (/status) — search filter, category grouping, and layout.
// The old sort-chip table is replaced by a category-grouped card grid with a live
// search field that narrows the grid by service name or host.

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }), usePathname: () => "/" }));
vi.mock("@/app/(portal)/admin/actions", () => Object.fromEntries(
  ["setPrometheusInstance", "setMetricsSource", "setQueueSource", "setBeszelSystem"].map((n) => [n, vi.fn(async () => [])])));
const portal = { role: "admin", realRole: "admin", user: { id: "u1", name: "Ada", email: "a@x" }, favorites: [], toggleFavorite: vi.fn(), modalOpen: false, setModalOpen: vi.fn(), theme: "dark", oidc: true, keptAliveIds: [] };
vi.mock("@/components/portal/PortalProvider", () => ({ usePortal: () => portal }));
vi.mock("@/components/portal/DataProvider", () => ({ useData: vi.fn(), useRefresh: () => vi.fn(), usePatchData: () => vi.fn() }));
vi.mock("@/components/mobile/useIsMobile", () => ({ useIsMobile: () => false }));

import { useData } from "@/components/portal/DataProvider";
import { Status } from "@/components/views/Status";

const mkSvc = (over: Record<string, unknown> = {}) => ({
  id: "svc", name: "Svc", cat: "automation", icon: "dns", host: "svc.test", scheme: "https",
  status: "up", uptime: 99.9, uptime24h: 99.9, ms: 12, beats: new Array(30).fill(1), msHistory: [10, 12],
  active: true, embeddable: false, keepAlive: false, ...over,
});

const snap = (services: unknown[]) => ({
  services, allServices: services, users: [], groups: [], visibility: [], adminGroup: "admins",
  metrics: null, metricsSource: "prometheus", prometheusConfigured: false, beszelConfigured: false, beszelSystemId: null,
  arrHealth: [], metricsBySource: { prometheus: null, beszel: null },
});

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => [] })) as never);
});

describe("Status (merged Services) — layout and search", () => {
  it("wraps the body in the wide content tier (#101)", () => {
    vi.mocked(useData).mockReturnValue(snap([mkSvc()]) as never);
    const { container } = render(<Status />);
    expect(container.querySelector(".aerie-page-pad.aerie-page-pad--wide")).not.toBeNull();
  });

  it("renders the page title 'Services' and the service name in the grid", () => {
    vi.mocked(useData).mockReturnValue(snap([mkSvc({ id: "sonarr", name: "Sonarr", host: "sonarr.test" })]) as never);
    render(<Status />);
    expect(screen.getByText("Services")).toBeInTheDocument();
    expect(screen.getByText("Sonarr")).toBeInTheDocument();
  });

  it("filters the card grid by service name when the user types in the search field", () => {
    vi.mocked(useData).mockReturnValue(snap([
      mkSvc({ id: "sonarr", name: "Sonarr", host: "sonarr.test" }),
      mkSvc({ id: "radarr", name: "Radarr", host: "radarr.test" }),
    ]) as never);
    render(<Status />);

    // Both services are visible before filtering.
    expect(screen.getByText("Sonarr")).toBeInTheDocument();
    expect(screen.getByText("Radarr")).toBeInTheDocument();

    // Type "sonarr" → only Sonarr should remain.
    const input = screen.getByPlaceholderText("Filter services…");
    fireEvent.change(input, { target: { value: "sonarr" } });
    expect(screen.getByText("Sonarr")).toBeInTheDocument();
    expect(screen.queryByText("Radarr")).not.toBeInTheDocument();
  });

  it("filters by host as well as by name", () => {
    vi.mocked(useData).mockReturnValue(snap([
      mkSvc({ id: "sonarr", name: "Sonarr", host: "sonarr.media.lan" }),
      mkSvc({ id: "radarr", name: "Radarr", host: "radarr.media.lan" }),
    ]) as never);
    render(<Status />);

    const input = screen.getByPlaceholderText("Filter services…");
    // Filter by host substring.
    fireEvent.change(input, { target: { value: "radarr.media" } });
    expect(screen.queryByText("Sonarr")).not.toBeInTheDocument();
    expect(screen.getByText("Radarr")).toBeInTheDocument();
  });

  it("shows the 'no services match' empty state when the filter matches nothing", () => {
    vi.mocked(useData).mockReturnValue(snap([mkSvc({ id: "sonarr", name: "Sonarr", host: "sonarr.test" })]) as never);
    render(<Status />);

    const input = screen.getByPlaceholderText("Filter services…");
    fireEvent.change(input, { target: { value: "zzz" } });
    expect(screen.getByText("No services match")).toBeInTheDocument();
    expect(screen.queryByText("Sonarr")).not.toBeInTheDocument();
  });

  it("renders category headings when services span multiple categories", () => {
    vi.mocked(useData).mockReturnValue(snap([
      mkSvc({ id: "sonarr", name: "Sonarr", cat: "automation" }),
      mkSvc({ id: "plex", name: "Plex", cat: "stream" }),
    ]) as never);
    render(<Status />);
    // Category labels from lib/categories.
    expect(screen.getByText("Automation")).toBeInTheDocument();
    expect(screen.getByText("Streaming")).toBeInTheDocument();
  });
});
