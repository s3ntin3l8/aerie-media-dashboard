import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

// Unit tests for AdminMetrics — the new Admin → Metrics tab that houses the
// source toggle and host/system selector (moved from the /services view).

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/admin" }));
vi.mock("@/app/(portal)/admin/actions", () => ({
  setMetricsSource: vi.fn(async () => {}),
  setPrometheusInstance: vi.fn(async () => {}),
  setBeszelSystem: vi.fn(async () => {}),
}));
vi.mock("@/components/portal/DataProvider", () => ({ useData: vi.fn(), useRefresh: () => vi.fn() }));
// panels.tsx → PortalProvider → @/app/(portal)/actions → @/auth (next-auth): mock to break
// the server-only import chain (same pattern as mobile-status-admin.test.tsx).
vi.mock("@/components/portal/PortalProvider", () => ({ usePortal: () => ({ role: "admin" }) }));

import { useData } from "@/components/portal/DataProvider";
import { AdminMetrics } from "@/components/views/admin/AdminMetrics";

const baseMetrics = {
  instance: "node1", cpuPct: 12, cpuHistory: [1, 2], memUsedBytes: 1e9, memTotalBytes: 4e9, memHistory: [1],
  netOutBps: 2e6, netHistory: [1], netInBps: 1e6, netInHistory: [1], diskUsedBytes: 5e9, diskTotalBytes: 1e10, diskHistory: [1],
  sysLoad: 0.5, sysLoadHistory: [1], load5: 0.4, load15: 0.3, uptimeSec: 90000, swapUsedBytes: 0, swapTotalBytes: 0,
  filesystems: [{ mount: "/", usedBytes: 5e9, totalBytes: 1e10 }],
};

beforeEach(() => {
  // InstanceSelect and BeszelSystemSelect fetch live lists.
  vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => [] })) as never);
});

describe("AdminMetrics", () => {
  it("shows the no-source-configured hint when neither source is set up", () => {
    vi.mocked(useData).mockReturnValue({
      metrics: null, metricsSource: "prometheus", prometheusConfigured: false, beszelConfigured: false, beszelSystemId: null,
    } as never);
    render(<AdminMetrics isMobile={false} />);
    expect(screen.getByText(/No metrics source configured/)).toBeInTheDocument();
  });

  it("shows the InstanceSelect (not BeszelSystemSelect) when prometheus is the source", () => {
    vi.mocked(useData).mockReturnValue({
      metrics: baseMetrics, metricsSource: "prometheus", prometheusConfigured: true, beszelConfigured: false, beszelSystemId: null,
    } as never);
    render(<AdminMetrics isMobile={false} />);
    expect(screen.getByText("Metrics Source")).toBeInTheDocument();
    expect(screen.getByText(/Active source/i)).toBeInTheDocument();
    expect(screen.getByText("Prometheus")).toBeInTheDocument();
    // No source toggle when only one source is configured.
    expect(screen.queryByRole("button", { name: "Beszel" })).not.toBeInTheDocument();
  });

  it("shows SourceToggle when both sources are configured", () => {
    vi.mocked(useData).mockReturnValue({
      metrics: baseMetrics, metricsSource: "prometheus", prometheusConfigured: true, beszelConfigured: true, beszelSystemId: null,
    } as never);
    render(<AdminMetrics isMobile={false} />);
    // SourceToggle renders a button for each source.
    expect(screen.getByRole("button", { name: "Prometheus" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Beszel" })).toBeInTheDocument();
  });

  it("shows BeszelSystemSelect (not InstanceSelect) when beszel is the source", () => {
    vi.mocked(useData).mockReturnValue({
      metrics: baseMetrics, metricsSource: "beszel", prometheusConfigured: false, beszelConfigured: true, beszelSystemId: "sys-1",
    } as never);
    render(<AdminMetrics isMobile={false} />);
    // BeszelSystemSelect renders a <select>; InstanceSelect does too — distinguish by label.
    expect(screen.getByText("System")).toBeInTheDocument();
    expect(screen.queryByText("Instance")).not.toBeInTheDocument();
    expect(screen.getByText("Beszel")).toBeInTheDocument(); // active source indicator
  });

  it("handles null metrics gracefully (instance selector gets null current)", () => {
    vi.mocked(useData).mockReturnValue({
      metrics: null, metricsSource: "prometheus", prometheusConfigured: true, beszelConfigured: false, beszelSystemId: null,
    } as never);
    // Should not throw even when metrics is null.
    expect(() => render(<AdminMetrics isMobile={false} />)).not.toThrow();
    expect(screen.getByText("Instance")).toBeInTheDocument();
  });
});
