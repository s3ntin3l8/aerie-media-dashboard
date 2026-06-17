import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import type { NodeMetrics } from "@/lib/integrations/clients";

// MobileStatus parity: the admin metrics / warnings / filesystems sections and the
// monitored-only average fix. The empty-data smoke test elsewhere doesn't exercise these.

vi.mock("@/components/portal/DataProvider", () => ({ useData: vi.fn(), useRefresh: () => vi.fn() }));
vi.mock("@/app/(portal)/admin/actions", () => ({
  setMetricsSource: vi.fn(async () => {}), setPrometheusInstance: vi.fn(async () => {}), setBeszelSystem: vi.fn(async () => {}),
}));

const portal: { role: string; keptAliveIds: string[] } = { role: "admin", keptAliveIds: [] };
vi.mock("@/components/portal/PortalProvider", () => ({ usePortal: () => portal }));

import { useData } from "@/components/portal/DataProvider";
import { MobileStatus } from "@/components/mobile/screens/MobileStatus";

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
  vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => [] })) as never);
});

describe("MobileStatus — admin metrics + averages", () => {
  it("excludes unmonitored (unknown) services from the 30d-uptime average", () => {
    vi.mocked(useData).mockReturnValue(baseSnap as never);
    render(<MobileStatus />);
    // (99.5 + 99.9) / 2 = 99.70 — NOT (99.5 + 99.9 + 50) / 3 = 83.13. (Both the 24h and 30d
    // tiles read 99.70% here, since the unknown service is dropped from each average.)
    expect(screen.getAllByText("99.70%").length).toBeGreaterThan(0);
    expect(screen.queryByText(/83\.\d+%/)).not.toBeInTheDocument();
  });

  it("renders the metric tiles, filesystems and warnings for admins", () => {
    vi.mocked(useData).mockReturnValue(baseSnap as never);
    render(<MobileStatus />);
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
    render(<MobileStatus />);
    expect(screen.getByText(/Prometheus not configured/)).toBeInTheDocument();
    expect(screen.queryByText("CPU load")).not.toBeInTheDocument();
  });

  it("hides admin-only metrics, warnings and filesystems from members", () => {
    portal.role = "user";
    vi.mocked(useData).mockReturnValue(baseSnap as never);
    render(<MobileStatus />);
    expect(screen.queryByText("CPU load")).not.toBeInTheDocument();
    expect(screen.queryByText("Service Warnings")).not.toBeInTheDocument();
    expect(screen.queryByText("Filesystems")).not.toBeInTheDocument();
  });

  it("renders the route-health badge for a service with an unhealthy route", () => {
    const withBadRoute = [
      svc({ id: "d", name: "Delta", status: "down", uptime: 90, ms: 0,
        route: { serviceId: "d", router: "d@docker", rule: "", hosts: ["d.test"], status: "enabled", tls: true, forwardAuth: false, middlewares: [], serverStatus: "down" } }),
    ];
    vi.mocked(useData).mockReturnValue({ ...baseSnap, services: withBadRoute } as never);
    render(<MobileStatus />);
    expect(screen.getByText("route")).toBeInTheDocument();
  });
});
