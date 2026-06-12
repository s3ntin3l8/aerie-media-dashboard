import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/integrations/http", () => ({
  fetchJson: vi.fn(),
  fetchJsonRaw: vi.fn(),
  fetchRaw: vi.fn(),
  IntegrationError: class IntegrationError extends Error {
    service: string; status?: number;
    constructor(service: string, message: string, status?: number) { super(`[${service}] ${message}`); this.service = service; this.status = status; }
  },
}));
vi.mock("@/lib/integrations/registry", () => ({
  getServiceCredentials: vi.fn(),
  getDeploymentSetting: vi.fn(),
}));
vi.mock("@/lib/env", () => ({
  env: { encryptionKey: "0".repeat(64), authSecret: "test", configFile: "/dev/null", databaseUrl: "file::memory:" },
  authConfigured: false,
}));

import { fetchJson } from "@/lib/integrations/http";
import { getServiceCredentials, getDeploymentSetting } from "@/lib/integrations/registry";
import { clearCache, beszelSystems, beszelMetrics } from "@/lib/integrations/clients";

const mockJson = vi.mocked(fetchJson);
const mockCreds = vi.mocked(getServiceCredentials);
const mockSetting = vi.mocked(getDeploymentSetting);
const GIB = 1073741824;

const route = (map: Record<string, unknown>) =>
  mockJson.mockImplementation(async (url: string) => {
    const hit = Object.entries(map).find(([frag]) => url.includes(frag));
    if (!hit) throw new Error(`unexpected url ${url}`);
    return hit[1] as never;
  });

beforeEach(() => {
  vi.clearAllMocks();
  clearCache();
  mockCreds.mockResolvedValue({ baseUrl: "http://bz", apiKey: "admin@x:pw", insecureTls: false } as never);
});

describe("beszelSystems", () => {
  it("authenticates then lists systems", async () => {
    route({
      "auth-with-password": { token: "tok" },
      "systems/records?perPage": { items: [{ id: "s1", name: "node1", status: "up" }, { id: "s2", name: "node2", status: "down" }] },
    });
    const systems = await beszelSystems();
    expect(systems).toEqual([{ id: "s1", name: "node1", status: "up" }, { id: "s2", name: "node2", status: "down" }]);
  });

  it("rejects an apiKey that isn't email:password", async () => {
    // Fresh baseUrl so the superuser-token cache (not cleared by clearCache) doesn't skip auth.
    mockCreds.mockResolvedValue({ baseUrl: "http://bz-nocolon", apiKey: "nopassword", insecureTls: false } as never);
    route({ "systems/records?perPage": { items: [] } });
    await expect(beszelSystems()).rejects.toThrow(/email:password/);
  });
});

describe("beszelMetrics", () => {
  it("normalizes PocketBase stats into NodeMetrics (GiB→bytes, bytes/s→bits/s)", async () => {
    mockSetting.mockImplementation(async (k: string) => (k === "beszelSystem" ? "sys1" : null));
    route({
      "auth-with-password": { token: "tok" },
      "systems/records/sys1": { id: "sys1", name: "node1", status: "up", info: { u: 86400 } },
      "system_stats": { items: [{ created: "t1", stats: {
        cpu: 12.5, m: 8, mu: 4, s: 2, su: 1, d: 100, du: 40,
        b: [1000, 2000], la: [0.5, 0.6, 0.7], efs: { "/mnt": { d: 50, du: 10 } },
      } }] },
    });

    const m = await beszelMetrics();
    expect(m.instance).toBe("node1");
    expect(m.cpuPct).toBe(12.5);
    expect(m.memUsedBytes).toBe(4 * GIB);
    expect(m.memTotalBytes).toBe(8 * GIB);
    expect(m.diskUsedBytes).toBe(40 * GIB);
    expect(m.diskTotalBytes).toBe(100 * GIB);
    expect(m.swapUsedBytes).toBe(1 * GIB);
    expect(m.swapTotalBytes).toBe(2 * GIB);
    expect(m.netOutBps).toBe(8000); // 1000 bytes/s × 8
    expect(m.netInBps).toBe(16000); // 2000 bytes/s × 8
    expect(m.sysLoad).toBe(0.5);
    expect(m.load5).toBe(0.6);
    expect(m.load15).toBe(0.7);
    expect(m.uptimeSec).toBe(86400);
    // root + extra filesystem, largest total first
    expect(m.filesystems.map((f) => f.mount)).toEqual(["/", "/mnt"]);
    expect(m.filesystems[0]).toEqual({ mount: "/", usedBytes: 40 * GIB, totalBytes: 100 * GIB });
  });
});
