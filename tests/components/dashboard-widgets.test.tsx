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
import { IndexersWidget, BooksWidget, HostStatsWidget, HealthWidget, ActivityWidget } from "@/components/widgets";

const data = (over: Record<string, unknown>) => vi.mocked(useData).mockReturnValue(over as never);

beforeEach(() => vi.mocked(useData).mockReset());

describe("IndexersWidget (Prowlarr + NZBHydra2 merge)", () => {
  it("auto-prefers Prowlarr and shows its stats", () => {
    data({ prowlarr: { enabled: 5, total: 6, queries: 100, grabs: 12, failedGrabs: 1 }, nzbhydra: { enabled: 2, total: 2, disabled: 0, errored: 0 } });
    render(<IndexersWidget />);
    expect(screen.getByText("Queries")).toBeInTheDocument(); // a Prowlarr-only metric
    expect(screen.getByText("5/6")).toBeInTheDocument();
  });

  it("honours an explicit nzbhydra source", () => {
    data({ prowlarr: { enabled: 5, total: 6, queries: 100, grabs: 12, failedGrabs: 1 }, nzbhydra: { enabled: 2, total: 3, disabled: 1, errored: 0 } });
    render(<IndexersWidget source="nzbhydra" />);
    expect(screen.getByText("Errored")).toBeInTheDocument(); // NZBHydra-only metric
    expect(screen.getByText("2/3")).toBeInTheDocument();
  });

  it("renders an empty state when neither is connected", () => {
    data({ prowlarr: null, nzbhydra: null });
    render(<IndexersWidget />);
    expect(screen.getByText(/no indexer source connected/i)).toBeInTheDocument();
  });
});

describe("BooksWidget (LazyLibrarian + Listenarr merge)", () => {
  it("auto-prefers LazyLibrarian", () => {
    data({ lazylibrarian: { totalBooks: 10, authors: 3, wanted: 2, snatched: 1 }, listenarr: { audiobooks: 4, authors: 2, monitored: 4, wanted: 0 } });
    render(<BooksWidget />);
    expect(screen.getByText("10")).toBeInTheDocument(); // LazyLibrarian total books
  });

  it("shows Listenarr when picked", () => {
    data({ lazylibrarian: { totalBooks: 10, authors: 3, wanted: 2, snatched: 1 }, listenarr: { audiobooks: 4, authors: 2, monitored: 4, wanted: 0 } });
    render(<BooksWidget source="listenarr" />);
    expect(screen.getByText("Audiobooks")).toBeInTheDocument();
  });
});

describe("HostStatsWidget", () => {
  const m = { cpuPct: 12.5, memUsedBytes: 1e9, memTotalBytes: 4e9, diskUsedBytes: 5e9, diskTotalBytes: 1e10, netOutBps: 2e6, netInBps: 1e6, sysLoad: 0.4, uptimeSec: 90000 };

  it("uses metricsBySource for the chosen source", () => {
    data({ metricsBySource: { prometheus: m, beszel: null }, metrics: m, metricsSource: "prometheus" });
    render(<HostStatsWidget source="prometheus" />);
    expect(screen.getByText("CPU")).toBeInTheDocument();
    expect(screen.getByText("13")).toBeInTheDocument(); // 12.5 rounded
  });

  it("empty-states when the chosen source has no data", () => {
    data({ metricsBySource: { prometheus: null, beszel: null }, metrics: null, metricsSource: "prometheus" });
    render(<HostStatsWidget source="beszel" />);
    expect(screen.getByText(/no host metrics/i)).toBeInTheDocument();
  });
});

describe("HealthWidget", () => {
  it("lists *arr warnings, else a clean state", () => {
    data({ arrHealth: [{ svc: "sonarr", type: "warning", message: "Indexer unavailable" }] });
    render(<HealthWidget />);
    expect(screen.getByText("Indexer unavailable")).toBeInTheDocument();

    data({ arrHealth: [] });
    render(<HealthWidget />);
    expect(screen.getByText(/no warnings/i)).toBeInTheDocument();
  });
});

describe("ActivityWidget", () => {
  it("totals 24h plays, else empty", () => {
    data({ plays24h: [1, 2, 3] });
    render(<ActivityWidget />);
    expect(screen.getByText("6")).toBeInTheDocument();

    data({ plays24h: [] });
    render(<ActivityWidget />);
    expect(screen.getByText(/no activity data/i)).toBeInTheDocument();
  });
});
