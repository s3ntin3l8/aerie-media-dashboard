import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

// The metric-source controls extracted from Status.tsx (shared by desktop + MobileStatus).
// They drive the persisted source/instance/system selection via server actions.

const { setMetricsSource, setPrometheusInstance, setBeszelSystem, refresh } = vi.hoisted(() => ({
  setMetricsSource: vi.fn(async () => {}),
  setPrometheusInstance: vi.fn(async () => {}),
  setBeszelSystem: vi.fn(async () => {}),
  refresh: vi.fn(),
}));

vi.mock("@/components/portal/DataProvider", () => ({ useRefresh: () => refresh }));
vi.mock("@/app/(portal)/admin/actions", () => ({ setMetricsSource, setPrometheusInstance, setBeszelSystem }));

import { SourceToggle, InstanceSelect, BeszelSystemSelect, fmtUptime } from "@/components/status/metricsControls";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fmtUptime", () => {
  it("formats null, minutes, hours, and days", () => {
    expect(fmtUptime(null)).toBe("—");
    expect(fmtUptime(45)).toBe("0m");
    expect(fmtUptime(12 * 60)).toBe("12m");
    expect(fmtUptime(4 * 3600 + 12 * 60)).toBe("4h 12m");
    expect(fmtUptime(12 * 86400 + 4 * 3600)).toBe("12d 4h");
  });
});

describe("SourceToggle", () => {
  it("renders both sources and switches to the inactive one on click", async () => {
    render(<SourceToggle current="prometheus" />);
    const beszel = screen.getByRole("button", { name: "Beszel" });
    fireEvent.click(beszel);
    await waitFor(() => expect(setMetricsSource).toHaveBeenCalledWith("beszel"));
    expect(refresh).toHaveBeenCalled();
  });

  it("does nothing when the current source is clicked", () => {
    render(<SourceToggle current="prometheus" />);
    fireEvent.click(screen.getByRole("button", { name: "Prometheus" }));
    expect(setMetricsSource).not.toHaveBeenCalled();
  });
});

describe("InstanceSelect", () => {
  it("loads node instances and persists the chosen one", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => ["node-a", "node-b"] })) as never);
    render(<InstanceSelect current={null} />);
    // "All nodes" + the two fetched options become available once the effect resolves.
    expect(await screen.findByRole("option", { name: "node-b" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "node-b" } });
    await waitFor(() => expect(setPrometheusInstance).toHaveBeenCalledWith("node-b"));
  });

  it("persists null when 'All nodes' is reselected", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => ["node-a"] })) as never);
    render(<InstanceSelect current="node-a" />);
    await screen.findByRole("option", { name: "node-a" });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "" } });
    await waitFor(() => expect(setPrometheusInstance).toHaveBeenCalledWith(null));
  });

  it("renders nothing until instances are discovered", () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => [] })) as never);
    const { container } = render(<InstanceSelect current={null} />);
    expect(container.querySelector("select")).toBeNull();
  });
});

describe("BeszelSystemSelect", () => {
  it("loads systems by id and persists the selection", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => [
      { id: "sys1", name: "Hub", status: "up" },
      { id: "sys2", name: "Node 2", status: "up" },
    ] })) as never);
    render(<BeszelSystemSelect current={null} />);
    expect(await screen.findByRole("option", { name: "Node 2" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "sys2" } });
    await waitFor(() => expect(setBeszelSystem).toHaveBeenCalledWith("sys2"));
  });
});
