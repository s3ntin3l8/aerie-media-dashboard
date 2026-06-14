import { describe, it, expect, vi, beforeEach } from "vitest";

// Drive the real getSnapshot facade with a traefik-dashboard-aggregator source, so the whole
// aggregator path runs end-to-end: source selection → /api/snapshot map → per-service route
// enrichment (instance + middlewareDetail) → traefikInstances() → scopeTraefikInstances.

const svc = (id: string, cat: string, extra: Record<string, unknown> = {}) => ({
  id, name: id, cat, icon: "dns", logoSlug: null, embeddable: false, central: false, centralLabel: null,
  host: `${id}.test`, baseUrl: `https://${id}.test`, internalUrl: null, version: null, note: null,
  sortOrder: 0, monitoringKey: null, insecureTls: false, active: true, keepAlive: false, ...extra,
});

const CONFIGS = [
  svc("sonarr", "automation"),
  svc("radarr", "automation"),
  // One aggregator source; its own host has no router, so it gets no route of its own.
  svc("traefik-aggregator", "infra"),
];

const logoOf = (c: { id: string; logoSlug: string | null }, slug: string) => c.logoSlug === slug || c.id === slug;
vi.mock("@/lib/integrations/registry", () => ({
  getServiceConfigs: vi.fn(async () => CONFIGS),
  getServiceSecret: vi.fn(async () => null), // aggregator needs no secret; gates stay open on active
  getServiceCredentials: vi.fn(async (id: string) => ({ baseUrl: `https://${id}.test`, apiKey: null, insecureTls: false })),
  isConfigured: vi.fn(async () => false),
  configMatchesLogo: vi.fn((c: { id: string; logoSlug: string | null }, slug: string) => logoOf(c, slug)),
  getServiceConfigsByLogo: vi.fn(async (slug: string) => CONFIGS.filter((c) => logoOf(c, slug))),
  getGroups: vi.fn(async () => []),
  getVisibility: vi.fn(async () => []),
  getMembers: vi.fn(async () => []),
  getDeploymentSetting: vi.fn(async () => null),
  updateServiceVersion: vi.fn(async () => {}),
}));

vi.mock("@/lib/env", () => ({
  env: { adminGroup: "admins", adminEmails: [], brand: "AERIE", portalUrl: "https://x", encryptionKey: "0".repeat(64), authSecret: "test", databaseUrl: "file::memory:" },
  authConfigured: true,
}));

const AGG_SNAPSHOT = {
  httpRouters: [
    { name: "sonarr@docker", rule: "Host(`sonarr.test`)", host: "sonarr.test", instance: "node-01", serviceStatus: "ok", middlewares: ["authentik@docker"], tls: true, status: "enabled", authentik: { application: "Sonarr" } },
    { name: "radarr@docker", rule: "Host(`radarr.test`)", host: "radarr.test", instance: "node-02", serviceStatus: "down", middlewares: [], tls: true, status: "error" },
    // Three unmatched hosts, arriving out of alphabetical order, all on node-99 (scoped out of node
    // health) → exercise traefikDiscovered's alphabetical sort.
    { name: "grafana@docker", rule: "Host(`grafana.lan`)", host: "grafana.lan", instance: "node-99", serviceStatus: "ok", middlewares: [], tls: true, status: "enabled" },
    { name: "zebra@docker", rule: "Host(`zebra.lan`)", host: "zebra.lan", instance: "node-99", serviceStatus: "ok", middlewares: [], tls: true, status: "enabled" },
    { name: "alpha@docker", rule: "Host(`alpha.lan`)", host: "alpha.lan", instance: "node-99", serviceStatus: "ok", middlewares: [], tls: true, status: "enabled" },
  ],
  middlewares: [{ name: "authentik", fullName: "authentik@docker", type: "forwardauth", usedByRouters: ["sonarr@docker"] }],
  certificates: [{ domain: "sonarr.test", sans: [], resolver: "letsencrypt", issuer: "Let's Encrypt", keyType: "EC256", notAfter: (Math.floor(Date.now() / 1000) + 20 * 86400) * 1000 }],
  instances: [
    { name: "node-01", role: "gateway", status: "ok", version: "3.1.0", counts: { routers: 5, services: 4, middlewares: 2, warnings: 0 } },
    { name: "node-02", status: "degraded", version: "3.0.4", counts: { routers: 2, services: 1, middlewares: 0, warnings: 1 } },
    { name: "node-99", status: "ok", version: "3.1.0" }, // serves only grafana.lan (no AERIE service) → scoped out
  ],
};

vi.mock("@/lib/integrations/http", () => ({
  fetchJson: vi.fn(async (url: string) => {
    if (url.includes("/api/snapshot")) return AGG_SNAPSHOT;
    return {}; // every other client → empty/throws → safe() → null
  }),
  fetchJsonRaw: vi.fn(async () => ({})),
  fetchRaw: vi.fn(async () => ({ status: 200, headers: { get: () => null } })),
  IntegrationError: class IntegrationError extends Error {
    service: string;
    constructor(service: string, message: string) { super(message); this.service = service; }
  },
}));

import { getSnapshot } from "@/lib/data/snapshot";

beforeEach(() => vi.clearAllMocks());

describe("getSnapshot — aggregator source", () => {
  it("uses the aggregator and enriches each route with serving node + middleware type", async () => {
    const snap = await getSnapshot();
    expect(snap.traefikConfigured).toBe(true);
    const sonarr = snap.services.find((s) => s.id === "sonarr");
    expect(sonarr?.route).toMatchObject({ serviceId: "sonarr", instance: "node-01", forwardAuth: true, serverStatus: "up" });
    expect(sonarr?.route?.middlewareDetail).toEqual([{ name: "authentik@docker", type: "forwardauth" }]);
    expect(sonarr?.route?.cert).toMatchObject({ issuer: "Let's Encrypt", resolver: "letsencrypt", keyType: "EC256" });
  });

  it("surfaces Traefik node health scoped to only nodes serving a configured service", async () => {
    const snap = await getSnapshot();
    // node-99 serves only grafana.lan (no configured service) → excluded.
    expect(snap.traefikInstances.map((n) => n.name).sort()).toEqual(["node-01", "node-02"]);
    expect(snap.traefikInstances.find((n) => n.name === "node-01")).toMatchObject({ status: "ok", role: "gateway", serves: ["sonarr"] });
    expect(snap.traefikInstances.find((n) => n.name === "node-02")).toMatchObject({ status: "degraded", serves: ["radarr"] });
  });

  it("still lists the unmatched host under traefikDiscovered", async () => {
    const snap = await getSnapshot();
    expect(snap.traefikDiscovered.map((r) => r.hosts[0])).toContain("grafana.lan");
  });

  it("sorts traefikDiscovered alphabetically by host (stable across 2+ sources/nodes)", async () => {
    const snap = await getSnapshot();
    // grafana/zebra/alpha arrive out of order in the snapshot → must come back sorted.
    expect(snap.traefikDiscovered.map((r) => r.hosts[0])).toEqual(["alpha.lan", "grafana.lan", "zebra.lan"]);
  });
});
