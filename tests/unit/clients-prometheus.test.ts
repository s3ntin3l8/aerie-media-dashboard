import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/integrations/http", () => ({
  fetchJson: vi.fn(),
  fetchJsonRaw: vi.fn(),
  fetchRaw: vi.fn(),
  IntegrationError: class IntegrationError extends Error {
    service: string;
    constructor(service: string, message: string) { super(`[${service}] ${message}`); this.service = service; }
  },
}));
vi.mock("@/lib/integrations/registry", () => ({
  getServiceSecret: vi.fn(), getServiceCredentials: vi.fn(),
  getDeploymentSetting: vi.fn(),
}));
vi.mock("@/lib/env", () => ({
  env: { encryptionKey: "0".repeat(64), authSecret: "test", configFile: "/dev/null", databaseUrl: "file::memory:", prometheusInstance: undefined },
  authConfigured: false,
}));

import { fetchJson } from "@/lib/integrations/http";
import { getServiceCredentials, getDeploymentSetting } from "@/lib/integrations/registry";
import { clearCache, prometheusQuery, prometheusQueryAll, prometheusRange, prometheusInstances, prometheusMetrics } from "@/lib/integrations/clients";

const mockJson = vi.mocked(fetchJson);
const mockCreds = vi.mocked(getServiceCredentials);
const mockSetting = vi.mocked(getDeploymentSetting);

const scalar = (v: string) => ({ data: { result: [{ value: [0, v] }] } });

beforeEach(() => {
  vi.clearAllMocks();
  clearCache();
  mockCreds.mockResolvedValue({ baseUrl: "http://prom/", apiKey: "tok", insecureTls: false } as never);
  mockSetting.mockResolvedValue(null);
});

describe("prometheus query helpers", () => {
  it("prometheusQuery returns the first scalar value", async () => {
    mockJson.mockResolvedValue(scalar("42") as never);
    expect(await prometheusQuery("up")).toBe(42);
  });

  it("prometheusQuery returns null with no result", async () => {
    mockJson.mockResolvedValue({ data: { result: [] } } as never);
    expect(await prometheusQuery("up")).toBeNull();
  });

  it("prometheusQueryAll maps metric+value pairs", async () => {
    mockJson.mockResolvedValue({ data: { result: [{ metric: { mountpoint: "/" }, value: [0, "100"] }] } } as never);
    expect(await prometheusQueryAll("x")).toEqual([{ metric: { mountpoint: "/" }, value: 100 }]);
  });

  it("prometheusRange front-pads to the requested point count", async () => {
    mockJson.mockResolvedValue({ data: { result: [{ values: [[0, "5"], [0, "9"]] }] } } as never);
    const out = await prometheusRange("x", 4);
    expect(out).toEqual([5, 5, 5, 9]);
  });

  it("prometheusRange returns zeros on error", async () => {
    mockJson.mockRejectedValue(new Error("down"));
    expect(await prometheusRange("x", 3)).toEqual([0, 0, 0]);
  });

  it("prometheusInstances lists label values", async () => {
    mockJson.mockResolvedValue({ data: ["node-a", "node-b"] } as never);
    expect(await prometheusInstances()).toEqual(["node-a", "node-b"]);
  });
});

describe("prometheusMetrics", () => {
  it("assembles NodeMetrics from instant + range queries and per-mount filesystems", async () => {
    mockJson.mockImplementation(async (url: string) => {
      const q = decodeURIComponent(url);
      if (url.includes("query_range")) return { data: { result: [{ values: [[0, "10"], [0, "20"], [0, "30"]] }] } } as never;
      if (q.includes("node_filesystem_size_bytes") && q.includes("avail") === false && q.startsWith("http://prom/api/v1/query?query=node_filesystem_size_bytes"))
        return { data: { result: [{ metric: { mountpoint: "/" }, value: [0, "100"] }, { metric: { mountpoint: "/data" }, value: [0, "50"] }] } } as never;
      if (q.includes("node_filesystem_avail_bytes") && q.startsWith("http://prom/api/v1/query?query=node_filesystem_avail_bytes"))
        return { data: { result: [{ metric: { mountpoint: "/" }, value: [0, "40"] }, { metric: { mountpoint: "/data" }, value: [0, "10"] }] } } as never;
      return scalar("7") as never; // all other instant scalars (memTotal, load5/15, uptime, swap, diskTotal…)
    });

    const m = await prometheusMetrics();
    expect(m.instance).toBeNull();
    expect(m.cpuPct).toBe(30); // last point of the range
    expect(m.cpuHistory).toHaveLength(40);
    expect(m.memTotalBytes).toBe(7);
    expect(m.load5).toBe(7);
    expect(m.load15).toBe(7);
    expect(m.uptimeSec).toBe(7);
    expect(m.swapTotalBytes).toBe(7);
    expect(m.swapUsedBytes).toBe(0); // total(7) - free(7)
    expect(m.filesystems.map((f) => f.mount)).toEqual(["/", "/data"]);
    expect(m.filesystems[0]).toEqual({ mount: "/", usedBytes: 60, totalBytes: 100 });
  });
});
