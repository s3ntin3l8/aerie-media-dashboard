import { describe, it, expect, vi, beforeEach } from "vitest";

// Same harness as traefik-client.test.ts: stub the HTTP layer + registry creds so the real
// aggregator normalizer runs against a controlled /api/snapshot payload, with no DB or network.
vi.mock("@/lib/integrations/http", () => ({
  fetchJson: vi.fn(),
  fetchJsonRaw: vi.fn(),
  fetchRaw: vi.fn(),
  IntegrationError: class IntegrationError extends Error {
    service: string;
    constructor(service: string, message: string) { super(`[${service}] ${message}`); this.service = service; }
  },
}));
vi.mock("@/lib/integrations/registry", () => ({ getServiceCredentials: vi.fn(), getDeploymentSetting: vi.fn(), getServiceConfigsByLogo: vi.fn() }));
vi.mock("@/lib/env", () => ({ env: { encryptionKey: "0".repeat(64), authSecret: "test", configFile: "/dev/null", databaseUrl: "file::memory:" }, authConfigured: false }));

import { fetchJson } from "@/lib/integrations/http";
import { getServiceCredentials, getServiceConfigsByLogo } from "@/lib/integrations/registry";
import { clearCache, traefikRoutes } from "@/lib/integrations/clients";

const mockJson = vi.mocked(fetchJson);

// Resolve aggregator services for the "traefik-aggregator" logo, none for raw "traefik".
const wireConfigs = (aggregators: { id: string; name: string; active: boolean }[]) =>
  vi.mocked(getServiceConfigsByLogo).mockImplementation(async (slug: string) =>
    (slug === "traefik-aggregator" ? aggregators.map((a) => ({ ...a, logoSlug: "traefik-aggregator" })) : []) as never,
  );

const futureMs = (days: number) => (Math.floor(Date.now() / 1000) + days * 86400) * 1000;

const snapshot = (overrides: Record<string, unknown> = {}) => ({
  httpRouters: [
    { name: "sonarr@docker", rule: "Host(`sonarr.lan`)", host: "sonarr.lan", serviceStatus: "ok", middlewares: ["authentik@docker"], tls: true, status: "enabled", authentik: { application: "Sonarr" } },
    { name: "radarr@docker", rule: "Host(`radarr.lan`)", host: "radarr.lan", serviceStatus: "down", middlewares: [], tls: true, status: "error" },
    { name: "lidarr@file", rule: "", host: "lidarr.lan", serviceStatus: "degraded", middlewares: [], tls: false, status: "enabled" }, // host-only fallback
    { name: "api@internal", rule: "PathPrefix(`/api`)", serviceStatus: "ok", status: "enabled" }, // no host → skipped
  ],
  certificates: [
    { domain: "sonarr.lan", sans: ["sonarr.lan"], notAfter: futureMs(30) },
    { domain: "stale.lan", sans: [], notAfter: 0 }, // absent upstream → ignored
  ],
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  clearCache();
  vi.mocked(getServiceCredentials).mockResolvedValue({ baseUrl: "http://aggregator:8080", apiKey: null, insecureTls: false } as never);
  wireConfigs([{ id: "traefik-aggregator", name: "traefik-aggregator", active: true }]);
  mockJson.mockImplementation(async (url: string) => {
    if (url.includes("/api/snapshot")) return snapshot() as never;
    return [] as never;
  });
});

describe("traefikRoutes via the aggregator", () => {
  it("maps routers, deriving forwardAuth, serverStatus, error→warning, and tls", async () => {
    const routes = await traefikRoutes();
    // api@internal has no host → skipped; the other three map.
    expect(routes).toHaveLength(3);

    const sonarr = routes.find((r) => r.router === "sonarr@docker")!;
    expect(sonarr).toMatchObject({ hosts: ["sonarr.lan"], forwardAuth: true, serverStatus: "up", tls: true, status: "enabled", serviceId: "", via: "traefik-aggregator" });

    const radarr = routes.find((r) => r.router === "radarr@docker")!;
    // serviceStatus "down" → "down"; aggregator status "error" → AERIE "warning"; no authentik/auth mw.
    expect(radarr).toMatchObject({ serverStatus: "down", status: "warning", forwardAuth: false });

    // No rule host → falls back to the aggregator's single `host` field; "degraded" → "mixed".
    const lidarr = routes.find((r) => r.router === "lidarr@file")!;
    expect(lidarr).toMatchObject({ hosts: ["lidarr.lan"], serverStatus: "mixed", tls: false });
  });

  it("matches a cert from the snapshot (ms→s) and computes daysRemaining; skips notAfter=0", async () => {
    const routes = await traefikRoutes();
    const sonarr = routes.find((r) => r.router === "sonarr@docker")!;
    expect(sonarr.cert?.notAfter).toBeGreaterThan(1_000_000_000); // unix seconds, not ms
    expect(sonarr.cert?.notAfter).toBeLessThan(2_000_000_000);
    expect(sonarr.cert?.daysRemaining).toBeGreaterThanOrEqual(29);
    expect(sonarr.cert?.daysRemaining).toBeLessThanOrEqual(30);
    // radarr.lan has no covering cert (stale.lan was notAfter=0 → ignored) → undefined.
    expect(routes.find((r) => r.router === "radarr@docker")!.cert).toBeUndefined();
  });

  it("aggregates across multiple aggregator services, tagging each route with its source (via)", async () => {
    wireConfigs([
      { id: "agg-a", name: "agg a", active: true },
      { id: "agg-b", name: "agg b", active: true },
    ]);
    const routes = await traefikRoutes();
    expect(routes.filter((r) => r.via === "agg-a")).toHaveLength(3);
    expect(routes.filter((r) => r.via === "agg-b")).toHaveLength(3);
  });

  it("throws when the snapshot fetch fails", async () => {
    mockJson.mockRejectedValue(new Error("HTTP 502"));
    await expect(traefikRoutes()).rejects.toThrow();
  });

  it("never falls back to the raw per-instance scrape while an aggregator is active", async () => {
    await traefikRoutes();
    // Only /api/snapshot is read — no /api/http/routers or /api/http/services calls.
    const urls = mockJson.mock.calls.map((c) => c[0] as string);
    expect(urls.every((u) => u.includes("/api/snapshot"))).toBe(true);
    expect(urls.some((u) => u.includes("/api/http/routers"))).toBe(false);
  });
});
