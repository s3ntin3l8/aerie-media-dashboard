import { describe, it, expect, vi, beforeEach } from "vitest";

// Drive the real getSnapshot facade: registry is mocked to enable a realistic service
// set, and http.fetchJson returns controlled/empty payloads so the real clients run and
// their results flow through the assembly (safe() isolates the throwers → null).

const svc = (id: string, cat: string, extra: Record<string, unknown> = {}) => ({
  id, name: id, cat, icon: "dns", logoSlug: null, embeddable: false, central: false, centralLabel: null,
  host: `${id}.test`, baseUrl: `https://${id}.test`, internalUrl: null, version: null, note: null,
  sortOrder: 0, monitoringKey: null, insecureTls: false, active: true, keepAlive: false, ...extra,
});

const CONFIGS = [
  svc("gatus", "monitor"), svc("prometheus", "monitor"), svc("sonarr", "automation"),
  svc("radarr", "automation"), svc("tautulli", "stream"), svc("overseerr", "request"),
  svc("nzbget", "automation"), svc("qbittorrent", "automation"), svc("prowlarr", "automation"),
  svc("traefik", "infra"), svc("authentik", "infra"),
  // Subdomain services for outpost-correlation tests: one under the proxy outpost (lan.test),
  // one under the OAuth2 app's host (oauth.test) which must NOT inherit.
  svc("under-outpost", "automation", { host: "app.lan.test" }),
  svc("under-oauth", "automation", { host: "app.oauth.test" }),
];

const logoOf = (c: { id: string; logoSlug: string | null }, slug: string) => c.logoSlug === slug || c.id === slug;
// Default batched-secret reads: every service carries an apiKey, none carry forward-auth.
const allKeysMap = () => new Map<string, string>(CONFIGS.map((c) => [c.id, "key"]));
vi.mock("@/lib/integrations/registry", () => ({
  getServiceConfigs: vi.fn(async () => CONFIGS),
  getServiceSecret: vi.fn(async (_id: string, kind?: string) => (kind === "forwardAuth" ? null : "key")),
  getAllServiceSecrets: vi.fn(async (kind?: string) => (kind === "forwardAuth" ? new Map<string, string>() : allKeysMap())),
  getServiceCredentials: vi.fn(async (id: string) => ({ baseUrl: `https://${id}.test`, apiKey: "key", insecureTls: false })),
  isConfigured: vi.fn(async () => true),
  configMatchesLogo: vi.fn((c: { id: string; logoSlug: string | null }, slug: string) => logoOf(c, slug)),
  getServiceConfigsByLogo: vi.fn(async (slug: string) => CONFIGS.filter((c) => logoOf(c, slug))),
  getGroups: vi.fn(async () => [{ name: "admins", label: "Admins" }, { name: "friends", label: "Friends" }]),
  getVisibility: vi.fn(async () => [{ serviceId: "sonarr", groupName: "friends", visible: false }]),
  getMembers: vi.fn(async () => [{ id: "u1", name: "Ada", email: "ada@x", role: "user", linked: true }]),
  getDeploymentSetting: vi.fn(async () => null),
  updateServiceVersion: vi.fn(async () => {}),
}));

vi.mock("@/lib/env", () => ({
  env: { adminGroup: "admins", adminEmails: [], prometheusInstance: undefined, brand: "AERIE", portalUrl: "https://x", encryptionKey: "0".repeat(64), authSecret: "test", databaseUrl: "file::memory:" },
  authConfigured: true,
}));

vi.mock("@/lib/integrations/http", () => ({
  fetchJson: vi.fn(async (url: string) => {
    // Gatus → one healthy endpoint named "sonarr"; everything else → empty-ish payload
    // (most clients then return [] or throw → safe() → null).
    if (url.includes("/api/v1/endpoints/statuses")) {
      return [{ name: "sonarr", group: "auto", results: [{ success: true, duration: 1_000_000, timestamp: "t1" }] }];
    }
    // Traefik: a router for the sonarr service host (behind forward-auth), plus a routed host
    // with NO matching AERIE service (grafana.lan) declared twice — http + https — to exercise
    // discovered-dedupe (https preferred).
    if (url.includes("/api/http/routers")) {
      return [
        { name: "sonarr@docker", rule: "Host(`sonarr.test`)", service: "sonarr", provider: "docker", status: "enabled", middlewares: ["authentik@docker"], tls: {} },
        { name: "grafana-http@docker", rule: "Host(`grafana.lan`)", service: "grafana", provider: "docker", status: "enabled", middlewares: [] },
        { name: "grafana@docker", rule: "Host(`grafana.lan`)", service: "grafana", provider: "docker", status: "enabled", middlewares: [], tls: {} },
      ];
    }
    if (url.includes("/api/http/services")) {
      return [{ name: "sonarr@docker", serverStatus: { "http://10.0.0.2:8989": "UP" } }];
    }
    // Authentik apps: an exact-host proxy app (sonarr), a forward-auth proxy OUTPOST launching at a
    // parent domain (lan.test → covers *.lan.test), and an OAuth2 app at a parent domain (oauth.test)
    // which must NOT suffix-match subdomains (only proxy outposts do).
    if (url.includes("/core/applications/")) {
      return { results: [
        { pk: "a1", name: "Sonarr", slug: "sonarr", meta_launch_url: "https://sonarr.test/", provider_obj: { name: "sonarr-proxy", verbose_name: "Proxy Provider" } },
        { pk: "op1", name: "lan-forward-auth", slug: "lan-forward-auth", meta_launch_url: "https://lan.test/", provider_obj: { name: "lan-proxy", verbose_name: "Proxy Provider" } },
        { pk: "oa1", name: "oauth-app", slug: "oauth-app", meta_launch_url: "https://oauth.test/", provider_obj: { name: "oauth-prov", verbose_name: "OAuth2/OpenID Provider" } },
      ] };
    }
    if (url.includes("/policies/bindings/")) {
      return { results: [
        { target: "a1", group: "g1", group_obj: { name: "media" }, enabled: true },
        { target: "op1", group: "g2", group_obj: { name: "infra" }, enabled: true },
      ] };
    }
    return {};
  }),
  fetchJsonRaw: vi.fn(async () => ({})),
  fetchRaw: vi.fn(async () => ({ status: 200, headers: { get: () => null } })),
  IntegrationError: class IntegrationError extends Error {
    service: string; status?: number;
    constructor(service: string, message: string, status?: number) { super(message); this.service = service; this.status = status; }
  },
}));

import { getSnapshot, getSnapshotFast } from "@/lib/data/snapshot";

beforeEach(() => vi.clearAllMocks());

describe("getSnapshot — facade aggregation", () => {
  it("maps configured services and reflects live Gatus health", async () => {
    const snap = await getSnapshot();
    expect(snap.services.map((s) => s.id).sort()).toEqual([...CONFIGS.map((c) => c.id)].sort());
    // Gatus reported "sonarr" up; an unmonitored service is "unknown".
    expect(snap.services.find((s) => s.id === "sonarr")?.status).toBe("up");
    expect(snap.services.find((s) => s.id === "qbittorrent")?.status).toBe("unknown");
  });

  it("flags hasSecret per stored secret (boolean only, value never surfaced)", async () => {
    const registry = await import("@/lib/integrations/registry");
    vi.mocked(registry.getAllServiceSecrets).mockImplementation(async (kind?: string) =>
      kind === "forwardAuth" ? new Map() : new Map(CONFIGS.filter((c) => c.id !== "qbittorrent").map((c) => [c.id, "key"])),
    );
    try {
      const snap = await getSnapshot();
      expect(snap.services.find((s) => s.id === "sonarr")?.hasSecret).toBe(true);
      expect(snap.services.find((s) => s.id === "qbittorrent")?.hasSecret).toBe(false);
    } finally {
      vi.mocked(registry.getAllServiceSecrets).mockImplementation(async (kind?: string) => (kind === "forwardAuth" ? new Map() : allKeysMap()));
    }
  });

  it("surfaces stored forward-auth config (non-secret fields) without the password", async () => {
    const registry = await import("@/lib/integrations/registry");
    const cfg = { method: "bearer", tokenUrl: "https://auth.test/application/o/token/", clientId: "cid", username: "svc", password: "super-secret", scope: "openid" };
    vi.mocked(registry.getAllServiceSecrets).mockImplementation(async (kind?: string) =>
      kind === "forwardAuth" ? new Map([["sonarr", JSON.stringify(cfg)]]) : allKeysMap(),
    );
    try {
      const snap = await getSnapshot();
      const fa = snap.services.find((s) => s.id === "sonarr")?.forwardAuthConfig;
      expect(fa).toMatchObject({ method: "bearer", tokenUrl: cfg.tokenUrl, clientId: "cid", username: "svc", scope: "openid" });
      expect(fa).not.toHaveProperty("password"); // the secret never leaves the server
      // services with no stored forward-auth carry no config
      expect(snap.services.find((s) => s.id === "radarr")?.forwardAuthConfig).toBeUndefined();
    } finally {
      vi.mocked(registry.getAllServiceSecrets).mockImplementation(async (kind?: string) => (kind === "forwardAuth" ? new Map() : allKeysMap()));
    }
  });

  it("returns well-formed (empty) collections and resolves the metrics/queue sources", async () => {
    const snap = await getSnapshot();
    for (const key of ["library", "libraryAll", "recent", "recentAll", "queue", "upcoming", "downloads", "nowPlaying", "requests"] as const) {
      expect(Array.isArray(snap[key])).toBe(true);
    }
    expect(snap.metricsSource).toBe("prometheus"); // promOn, no beszel
    expect(snap.metricsBySource).toHaveProperty("prometheus");
    expect(snap.queueSource).toBe("arr"); // sonarr/radarr active
    expect(snap.adminGroup).toBe("admins");
  });

  it("correlates a Traefik route to a service by host and flags traefikConfigured", async () => {
    const snap = await getSnapshot();
    expect(snap.traefikConfigured).toBe(true);
    const sonarr = snap.services.find((s) => s.id === "sonarr");
    expect(sonarr?.route).toMatchObject({ serviceId: "sonarr", router: "sonarr@docker", forwardAuth: true, serverStatus: "up", tls: true });
    // a service with no matching router carries no route
    expect(snap.services.find((s) => s.id === "qbittorrent")?.route).toBeUndefined();
  });

  it("surfaces unmatched routers as traefikDiscovered (deduped by host, https preferred)", async () => {
    const snap = await getSnapshot();
    expect(snap.traefikDiscovered).toHaveLength(1); // grafana.lan once (http+https collapsed)
    expect(snap.traefikDiscovered[0]).toMatchObject({ router: "grafana@docker", hosts: ["grafana.lan"], tls: true });
    // matched-host routers (sonarr.test → an AERIE service) are NOT in the discovered list
    expect(snap.traefikDiscovered.some((r) => r.hosts.includes("sonarr.test"))).toBe(false);
  });

  it("excludes admin-dismissed hosts from traefikDiscovered (and surfaces the dismissed list)", async () => {
    const registry = await import("@/lib/integrations/registry");
    vi.mocked(registry.getDeploymentSetting).mockImplementation(async (key: string) =>
      key === "traefikDismissed" ? JSON.stringify(["grafana.lan"]) : null,
    );
    try {
      const snap = await getSnapshot();
      expect(snap.traefikDiscovered.some((r) => r.hosts.includes("grafana.lan"))).toBe(false);
      expect(snap.traefikDismissed).toContain("grafana.lan");
    } finally {
      vi.mocked(registry.getDeploymentSetting).mockImplementation(async () => null);
    }
  });

  it("correlates an Authentik app to a service by launch-URL host and flags authentikConfigured", async () => {
    const snap = await getSnapshot();
    expect(snap.authentikConfigured).toBe(true);
    expect(snap.services.find((s) => s.id === "sonarr")?.authentik).toMatchObject({
      serviceId: "sonarr", appSlug: "sonarr", everyone: false, groups: ["media"], providerType: "Proxy Provider",
    });
    expect(snap.services.find((s) => s.id === "qbittorrent")?.authentik).toBeUndefined();
  });

  it("inherits a forward-auth proxy outpost's access for subdomain services (longest parent wins)", async () => {
    const snap = await getSnapshot();
    // app.lan.test has no exact app, but is covered by the lan.test proxy outpost.
    const inherited = snap.services.find((s) => s.id === "under-outpost")?.authentik;
    expect(inherited).toMatchObject({ serviceId: "under-outpost", groups: ["infra"], inheritedFrom: "lan-forward-auth" });
    // exact-host matches keep winning and are NOT marked inherited.
    const exact = snap.services.find((s) => s.id === "sonarr")?.authentik;
    expect(exact).toMatchObject({ groups: ["media"] });
    expect(exact?.inheritedFrom).toBeUndefined();
    // An OAuth2 (non-proxy) app at a parent host must NOT suffix-match its subdomains.
    expect(snap.services.find((s) => s.id === "under-oauth")?.authentik).toBeUndefined();
  });

  it("passes through groups and visibility", async () => {
    const snap = await getSnapshot();
    expect(snap.groups.map((g) => g.name)).toContain("admins");
    expect(snap.visibility).toEqual([{ serviceId: "sonarr", groupName: "friends", visible: false }]);
  });

  it("getSnapshotFast resolves a snapshot with a stale flag", async () => {
    const { snapshot, stale } = await getSnapshotFast(2000);
    expect(snapshot.services.length).toBe(CONFIGS.length);
    expect(typeof stale).toBe("boolean");
  });
});
