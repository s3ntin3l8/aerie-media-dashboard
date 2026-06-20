import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import type { NodeMetrics } from "@/lib/integrations/clients";

// MobileServices (merged browse + health): the admin metrics / warnings / filesystems sections
// and the monitored-only average fix. These were formerly in MobileStatus; the content is now
// in MobileServices (the merged screen routed from /status on mobile).

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/status" }));
vi.mock("@/components/portal/DataProvider", () => ({ useData: vi.fn(), useRefresh: () => vi.fn() }));
vi.mock("@/app/(portal)/admin/actions", () => ({
  setMetricsSource: vi.fn(async () => {}), setPrometheusInstance: vi.fn(async () => {}), setBeszelSystem: vi.fn(async () => {}),
}));

const portal: { role: string; keptAliveIds: string[]; favorites: string[]; toggleFavorite: () => void; user: object; oidc: boolean } = {
  role: "admin", keptAliveIds: [], favorites: [], toggleFavorite: vi.fn(), user: { name: "Ada", email: "a@x" }, oidc: true,
};
vi.mock("@/components/portal/PortalProvider", () => ({ usePortal: () => portal }));

import { fireEvent } from "@testing-library/react";
import { useData } from "@/components/portal/DataProvider";
import { MobileServices } from "@/components/mobile/screens/MobileServices";

const beats = new Array(30).fill(1);
const svc = (over: Record<string, unknown>) => ({
  id: "s", name: "S", cat: "automation", icon: "dns", host: "s.test", scheme: "https",
  status: "up", uptime: 99.5, ms: 10, uptime24h: 99.5, beats, active: true, embeddable: false, ...over,
});

// One up (99.50), one up (99.90), one UNKNOWN (50) — the unknown must be excluded from averages.
const services = [
  svc({ id: "a", name: "Alpha", status: "up", uptime: 99.5, uptime24h: 99.5, ms: 10 }),
  svc({ id: "b", name: "Bravo", status: "up", uptime: 99.9, uptime24h: 99.9, ms: 20 }),
  svc({ id: "c", name: "Charlie", status: "unknown", uptime: 50, uptime24h: null, ms: 0 }),
];

const metrics: NodeMetrics = {
  instance: "node-a", cpuPct: 34.2, cpuHistory: [30, 34, 32],
  memUsedBytes: 8e9, memTotalBytes: 16e9, memHistory: [7e9, 8e9],
  netOutBps: 4.1e6, netHistory: [3e6, 4e6], netInBps: 2.2e6, netInHistory: [1e6, 2e6],
  diskUsedBytes: 5e11, diskTotalBytes: 1e12, diskHistory: [4e11, 5e11],
  sysLoad: 1.2, sysLoadHistory: [1, 1.2], load5: 1.1, load15: 0.9,
  uptimeSec: 12 * 86400, swapUsedBytes: 0, swapTotalBytes: 0,
  filesystems: [{ mount: "/data", usedBytes: 9e11, totalBytes: 1e12 }],
};

const baseSnap = {
  services, visibility: [], metrics, metricsSource: "prometheus", prometheusConfigured: true, beszelConfigured: true,
  beszelSystemId: null, arrHealth: [{ svc: "sonarr", type: "warning", message: "Indexer unavailable" }],
};

beforeEach(() => {
  portal.role = "admin";
  portal.favorites = [];
  vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => [] })) as never);
});

describe("MobileServices — admin metrics + averages", () => {
  it("excludes unmonitored (unknown) services from the 30d-uptime average", () => {
    vi.mocked(useData).mockReturnValue(baseSnap as never);
    render(<MobileServices onOpen={vi.fn()} />);
    // (99.5 + 99.9) / 2 = 99.70 — NOT (99.5 + 99.9 + 50) / 3 = 83.13. (Both the 24h and 30d
    // tiles read 99.70% here, since the unknown service is dropped from each average.)
    expect(screen.getAllByText("99.70%").length).toBeGreaterThan(0);
    expect(screen.queryByText(/83\.\d+%/)).not.toBeInTheDocument();
  });

  it("renders the metric tiles, filesystems and warnings for admins", () => {
    vi.mocked(useData).mockReturnValue(baseSnap as never);
    render(<MobileServices onOpen={vi.fn()} />);
    expect(screen.getByText("CPU load")).toBeInTheDocument();
    expect(screen.getByText("Memory")).toBeInTheDocument();
    expect(screen.getByText("Network out")).toBeInTheDocument();
    expect(screen.getByText("Disk")).toBeInTheDocument();
    // Filesystems list with the mount path.
    expect(screen.getByText("Filesystems")).toBeInTheDocument();
    expect(screen.getByText("/data")).toBeInTheDocument();
    // arrHealth warnings.
    expect(screen.getByText("Service Warnings")).toBeInTheDocument();
    expect(screen.getByText("Indexer unavailable")).toBeInTheDocument();
    // Both sources configured → the Prometheus⇄Beszel toggle is shown.
    expect(screen.getByRole("button", { name: "Beszel" })).toBeInTheDocument();
  });

  it("shows the unconfigured message when there is no metrics source", () => {
    vi.mocked(useData).mockReturnValue({ ...baseSnap, metrics: null, prometheusConfigured: false, beszelConfigured: false } as never);
    render(<MobileServices onOpen={vi.fn()} />);
    expect(screen.getByText(/Prometheus not configured/)).toBeInTheDocument();
    expect(screen.queryByText("CPU load")).not.toBeInTheDocument();
  });

  it("hides admin-only metrics, warnings and filesystems from members", () => {
    portal.role = "user";
    vi.mocked(useData).mockReturnValue(baseSnap as never);
    render(<MobileServices onOpen={vi.fn()} />);
    expect(screen.queryByText("CPU load")).not.toBeInTheDocument();
    expect(screen.queryByText("Service Warnings")).not.toBeInTheDocument();
    expect(screen.queryByText("Filesystems")).not.toBeInTheDocument();
  });

  it("shows 'Beszel Metrics' heading when metricsSource is beszel", () => {
    vi.mocked(useData).mockReturnValue({ ...baseSnap, metricsSource: "beszel" } as never);
    render(<MobileServices onOpen={vi.fn()} />);
    expect(screen.getByText("Beszel Metrics")).toBeInTheDocument();
  });

  it("shows error icon and 'docs →' link for arrHealth entries with type error and wikiUrl", () => {
    vi.mocked(useData).mockReturnValue({
      ...baseSnap,
      arrHealth: [
        { svc: "radarr", type: "error", message: "Database error", wikiUrl: "https://wiki.example.com/radarr" },
        { svc: "sonarr", type: "warning", message: "Indexer unavailable" },
      ],
    } as never);
    render(<MobileServices onOpen={vi.fn()} />);
    expect(screen.getByText("docs →")).toBeInTheDocument();
    expect(screen.getByText("Database error")).toBeInTheDocument();
    expect(screen.getByText("Indexer unavailable")).toBeInTheDocument();
  });

  it("shows 'No services configured.' when there are no services", () => {
    vi.mocked(useData).mockReturnValue({ ...baseSnap, services: [] } as never);
    render(<MobileServices onOpen={vi.fn()} />);
    expect(screen.getByText("No services configured.")).toBeInTheDocument();
  });
});

describe("MobileServices — browse interactions", () => {
  it("filters the service list when the search input changes", () => {
    vi.mocked(useData).mockReturnValue(baseSnap as never);
    render(<MobileServices onOpen={vi.fn()} />);
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    const input = screen.getByPlaceholderText("Filter services…");
    fireEvent.change(input, { target: { value: "Bravo" } });
    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
    expect(screen.getByText("Bravo")).toBeInTheDocument();
  });

  it("calls onOpen with the service when a card is clicked", () => {
    const onOpen = vi.fn();
    vi.mocked(useData).mockReturnValue(baseSnap as never);
    render(<MobileServices onOpen={onOpen} />);
    fireEvent.click(screen.getByText("Alpha").closest("[class*='card']") ?? screen.getByText("Alpha"));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("pin button calls toggleFavorite without triggering card open", () => {
    const onOpen = vi.fn();
    vi.mocked(useData).mockReturnValue(baseSnap as never);
    render(<MobileServices onOpen={onOpen} />);
    const pinBtn = screen.getAllByTitle("Pin to favorites")[0];
    fireEvent.click(pinBtn);
    expect(portal.toggleFavorite).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("shows 'Unpin' title on the pin button for a service already in favorites", () => {
    portal.favorites = ["a"];
    vi.mocked(useData).mockReturnValue(baseSnap as never);
    render(<MobileServices onOpen={vi.fn()} />);
    expect(screen.getByTitle("Unpin")).toBeInTheDocument();
  });

  it("renders the service note when a service has one", () => {
    vi.mocked(useData).mockReturnValue({
      ...baseSnap,
      services: [svc({ id: "a", name: "Alpha", note: "important note" })],
    } as never);
    render(<MobileServices onOpen={vi.fn()} />);
    expect(screen.getByText("important note")).toBeInTheDocument();
  });

  it("shows 'No services match.' when the search filter produces no results", () => {
    vi.mocked(useData).mockReturnValue(baseSnap as never);
    render(<MobileServices onOpen={vi.fn()} />);
    const input = screen.getByPlaceholderText("Filter services…");
    fireEvent.change(input, { target: { value: "zzz" } });
    expect(screen.getByText("No services match.")).toBeInTheDocument();
  });

  it("shows the service status text for a down service (neither up nor unknown)", () => {
    vi.mocked(useData).mockReturnValue({
      ...baseSnap,
      services: [svc({ id: "a", name: "Alpha", status: "down", uptime: 0, ms: 0 })],
    } as never);
    render(<MobileServices onOpen={vi.fn()} />);
    expect(screen.getByText("down")).toBeInTheDocument();
  });
});
