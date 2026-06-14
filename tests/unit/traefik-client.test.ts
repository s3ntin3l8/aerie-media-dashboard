import { describe, it, expect, vi, beforeEach } from "vitest";

// Same harness as clients-extra.test.ts: stub the HTTP layer + registry creds so the real
// traefik normalizer runs against controlled payloads, with no DB or network.
vi.mock("@/lib/integrations/http", () => ({
  fetchJson: vi.fn(),
  fetchJsonRaw: vi.fn(),
  fetchRaw: vi.fn(),
  IntegrationError: class IntegrationError extends Error {
    service: string;
    constructor(service: string, message: string) { super(`[${service}] ${message}`); this.service = service; }
  },
}));
vi.mock("@/lib/integrations/registry", () => ({ getServiceCredentials: vi.fn(), getDeploymentSetting: vi.fn(), getServiceConfigs: vi.fn(), getServiceConfigsByLogo: vi.fn(), configMatchesLogo: vi.fn() }));
vi.mock("@/lib/env", () => ({ env: { encryptionKey: "0".repeat(64), authSecret: "test", configFile: "/dev/null", databaseUrl: "file::memory:" }, authConfigured: false }));

import { fetchJson, fetchRaw } from "@/lib/integrations/http";
import { getServiceCredentials, getServiceConfigs, configMatchesLogo } from "@/lib/integrations/registry";
import { clearCache, traefikRoutes, hostsFromRule, parseCertMetric } from "@/lib/integrations/clients";

const mockJson = vi.mocked(fetchJson);
const mockRaw = vi.mocked(fetchRaw);

// Raw Traefik instances (logo "traefik"). raw-vs-aggregator is auto-detected per-source by probing
// /api/snapshot; the default fetchJson returns [] for that URL → these probe as raw and use the
// per-instance scrape path.
const wireInstances = (instances: { id: string; name: string; active: boolean }[]) =>
  vi.mocked(getServiceConfigs).mockResolvedValue(
    instances.map((i) => ({ ...i, logoSlug: "traefik" })) as never,
  );

beforeEach(() => {
  vi.clearAllMocks();
  clearCache();
  vi.mocked(configMatchesLogo).mockImplementation((c: { logoSlug: string | null }, slug: string) => c.logoSlug === slug);
  vi.mocked(getServiceCredentials).mockResolvedValue({ baseUrl: "http://traefik:8080", apiKey: "user:pass", insecureTls: false } as never);
  // One active Traefik instance by default.
  wireInstances([{ id: "traefik", name: "traefik", active: true }]);
});

describe("hostsFromRule", () => {
  it("extracts hosts from Host(), unions, multi-arg, and HostRegexp", () => {
    expect(hostsFromRule("Host(`sonarr.lan`)")).toEqual(["sonarr.lan"]);
    expect(hostsFromRule("Host(`A.com`) || Host(`b.com`)")).toEqual(["a.com", "b.com"]);
    expect(hostsFromRule("Host(`a.com`,`c.com`)")).toEqual(["a.com", "c.com"]);
    expect(hostsFromRule("HostRegexp(`{sub:.+}.x.com`)")).toEqual(["{sub:.+}.x.com"]);
  });
  it("returns nothing for non-host rules", () => {
    expect(hostsFromRule("PathPrefix(`/api`)")).toEqual([]);
    expect(hostsFromRule("")).toEqual([]);
  });
});

describe("parseCertMetric", () => {
  it("extracts cn/sans domains + the unix-ts value, ignoring other lines", () => {
    const text = [
      "# HELP traefik_tls_certs_not_after The expiration date of certificates.",
      'traefik_tls_certs_not_after{cn="Example.com",sans="example.com,www.example.com",serial="ab"} 1.7568288e+09',
      "some_other_metric 42",
      'traefik_tls_certs_not_after{cn="x.lan",sans="",serial="cd"} 1756828800',
    ].join("\n");
    const out = parseCertMetric(text);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ domains: ["example.com", "www.example.com"], notAfter: 1756828800 });
    expect(out[1]).toEqual({ domains: ["x.lan"], notAfter: 1756828800 });
  });
});

describe("traefikRoutes", () => {
  const wire = (opts: { metricsOk?: boolean; metricsText?: string } = {}) => {
    mockJson.mockImplementation(async (url: string) => {
      if (url.includes("/api/http/routers")) {
        return [
          { name: "sonarr@docker", rule: "Host(`sonarr.lan`)", service: "sonarr", provider: "docker", status: "enabled", middlewares: ["authentik@docker"], tls: {} },
          { name: "radarr@docker", rule: "Host(`radarr.lan`)", service: "radarr@docker", provider: "docker", status: "enabled", middlewares: [], tls: {} },
          { name: "api@internal", rule: "PathPrefix(`/api`)", service: "api@internal" }, // no host → skipped
        ] as never;
      }
      if (url.includes("/api/http/services")) {
        return [
          { name: "sonarr@docker", serverStatus: { "http://10.0.0.2:8989": "UP" } },
          { name: "radarr@docker", serverStatus: { "http://10.0.0.3:7878": "DOWN" } },
        ] as never;
      }
      return [] as never;
    });
    mockRaw.mockResolvedValue({ ok: opts.metricsOk ?? true, text: async () => opts.metricsText ?? "" } as never);
  };

  it("correlates routers→hosts, derives forwardAuth + serverStatus, and skips host-less routers", async () => {
    wire();
    const routes = await traefikRoutes();
    expect(routes).toHaveLength(2);
    const sonarr = routes.find((r) => r.router === "sonarr@docker")!;
    expect(sonarr).toMatchObject({ hosts: ["sonarr.lan"], forwardAuth: true, serverStatus: "up", tls: true, status: "enabled", serviceId: "" });
    const radarr = routes.find((r) => r.router === "radarr@docker")!;
    expect(radarr).toMatchObject({ forwardAuth: false, serverStatus: "down" });
  });

  it("matches a TLS cert to the route host (soonest-expiring) and computes daysRemaining", async () => {
    const notAfter = Math.floor(Date.now() / 1000) + 30 * 86400;
    wire({ metricsText: `traefik_tls_certs_not_after{cn="sonarr.lan",sans="sonarr.lan",serial="x"} ${notAfter}\n` });
    const routes = await traefikRoutes();
    const sonarr = routes.find((r) => r.router === "sonarr@docker")!;
    expect(sonarr.cert?.notAfter).toBe(notAfter);
    expect(sonarr.cert?.daysRemaining).toBeGreaterThanOrEqual(29);
    expect(sonarr.cert?.daysRemaining).toBeLessThanOrEqual(30);
    // radarr.lan has no matching cert → undefined
    expect(routes.find((r) => r.router === "radarr@docker")!.cert).toBeUndefined();
  });

  it("still returns routes when the /metrics endpoint is unavailable (best-effort cert)", async () => {
    wire({ metricsOk: false });
    mockRaw.mockRejectedValueOnce(new Error("404"));
    const routes = await traefikRoutes();
    expect(routes).toHaveLength(2);
    expect(routes.every((r) => r.cert === undefined)).toBe(true);
  });

  it("throws when not configured and when the routers call fails", async () => {
    // No active Traefik source → "not configured".
    vi.mocked(getServiceConfigs).mockResolvedValue([] as never);
    await expect(traefikRoutes()).rejects.toThrow();
    wireInstances([{ id: "traefik", name: "traefik", active: true }]);

    // One instance configured, but its routers call fails → every instance failed → throws.
    mockJson.mockRejectedValue(new Error("HTTP 500"));
    mockRaw.mockResolvedValue({ ok: true, text: async () => "" } as never);
    await expect(traefikRoutes()).rejects.toThrow();
  });

  it("aggregates routes across multiple Traefik instances, tagging each with its source (via)", async () => {
    wire();
    wireInstances([
      { id: "traefik-unraid", name: "traefik unraid", active: true },
      { id: "traefik-dockerhost", name: "traefik dockerhost", active: true },
    ]);
    const routes = await traefikRoutes();
    // Two routers per instance × two instances = 4 routes; each tagged by its source id.
    expect(routes).toHaveLength(4);
    expect(routes.filter((r) => r.via === "traefik-unraid")).toHaveLength(2);
    expect(routes.filter((r) => r.via === "traefik-dockerhost")).toHaveLength(2);
  });

  it("keeps a healthy instance's routes when another instance fails", async () => {
    wireInstances([
      { id: "traefik-ok", name: "ok", active: true },
      { id: "traefik-bad", name: "bad", active: true },
    ]);
    // The bad instance has no credentials (traefikRoutesFor throws); the good one wires normally.
    vi.mocked(getServiceCredentials).mockImplementation(async (id: string) =>
      id === "traefik-bad" ? null : ({ baseUrl: "http://traefik:8080", apiKey: "user:pass", insecureTls: false }) as never,
    );
    wire();
    const routes = await traefikRoutes();
    expect(routes).toHaveLength(2);
    expect(routes.every((r) => r.via === "traefik-ok")).toBe(true);
  });
});
