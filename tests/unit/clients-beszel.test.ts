import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockHttp, mockClientsRegistry, mockEnv, MockIntegrationError } from "./clientsMocks";

vi.mock("@/lib/integrations/http", () => mockHttp());
vi.mock("@/lib/integrations/registry", () => mockClientsRegistry());
vi.mock("@/lib/env", () => mockEnv());

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

  it("auto-discovers first system when no beszelSystem deployment setting is stored", async () => {
    mockCreds.mockResolvedValue({ baseUrl: "http://bz-nodeploy", apiKey: "admin@nd:pw", insecureTls: false } as never);
    mockSetting.mockResolvedValue(null);
    mockJson.mockImplementation(async (url: string) => {
      if (url.includes("auth-with-password")) return { token: "tok-nd" } as never;
      if (url.includes("perPage=100")) return { items: [{ id: "auto-sys", name: "auto-node", status: "up" }] } as never;
      if (url.includes("auto-sys")) return { id: "auto-sys", name: "auto-node", status: "up", info: { u: 0 } } as never;
      if (url.includes("system_stats")) return { items: [] } as never;
      throw new Error(`unexpected url ${url}`);
    });
    const m = await beszelMetrics();
    expect(m.instance).toBe("auto-node");
  });

  it("falls back to first system when the stored systemId returns 404", async () => {
    // Use a distinct baseUrl so the Beszel token cache doesn't bleed from other tests
    mockCreds.mockResolvedValue({ baseUrl: "http://bz-404", apiKey: "admin@f:pw", insecureTls: false } as never);
    mockSetting.mockImplementation(async (k: string) => (k === "beszelSystem" ? "sys-deleted" : null));
    mockJson.mockImplementation(async (url: string) => {
      if (url.includes("auth-with-password")) return { token: "tok-404" } as never;
      if (url.includes("sys-deleted")) throw new MockIntegrationError("beszel", "HTTP 404", 404);
      if (url.includes("perPage=100")) return { items: [{ id: "sys-first", name: "fallback-node", status: "up" }] } as never;
      if (url.includes("sys-first")) return { id: "sys-first", name: "fallback-node", status: "up", info: { u: 100 } } as never;
      if (url.includes("system_stats")) return { items: [] } as never;
      throw new Error(`unexpected url ${url}`);
    });
    const m = await beszelMetrics();
    expect(m.instance).toBe("fallback-node");
    expect(m.uptimeSec).toBe(100);
  });
});

describe("beszelGet — 401 re-auth retry", () => {
  it("re-authenticates and retries beszelSystems on 401", async () => {
    // Unique baseUrl to bypass the token cache populated by other tests
    mockCreds.mockResolvedValue({ baseUrl: "http://bz-retry", apiKey: "admin@r:pw", insecureTls: false } as never);
    let authCalls = 0;
    mockJson.mockImplementation(async (url: string) => {
      if (url.includes("auth-with-password")) { authCalls++; return { token: `tok-${authCalls}` } as never; }
      if (authCalls === 1) throw new MockIntegrationError("beszel", "HTTP 401", 401);
      return { items: [{ id: "r1", name: "retry-node", status: "up" }] } as never;
    });
    const systems = await beszelSystems();
    expect(systems[0].name).toBe("retry-node");
    // Initial auth + force-refresh = 2 auth calls
    expect(authCalls).toBe(2);
  });
});
