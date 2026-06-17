import { describe, it, expect } from "vitest";
import { scrubForMember } from "@/lib/data/scrub";
import type { Snapshot } from "@/lib/data/snapshot";
import type { Service } from "@/lib/types";

function makeService(overrides: Partial<Service> = {}): Service {
  return {
    id: "sonarr",
    name: "Sonarr",
    cat: "automation",
    icon: "television_classic",
    logoSlug: null,
    embeddable: false,
    central: false,
    centralLabel: null,
    host: "sonarr.example.com",
    scheme: "https",
    version: "4.0.0",
    note: "",
    active: true,
    keepAlive: false,
    status: "up",
    uptime: 99.9,
    ms: 50,
    beats: [],
    internalUrl: "http://sonarr:8989",
    insecureTls: false,
    monitoringKey: "sonarr",
    lokiQuery: '{container="sonarr"}',
    hasSecret: true,
    route: {
      router: "sonarr@docker",
      serviceId: "sonarr",
      instanceId: null,
      rule: "Host(`sonarr.example.com`)",
      middlewares: [],
      tls: true,
      cert: null,
    },
    authentik: { appSlug: "sonarr", everyone: true, groups: [], users: [], policyGated: false },
    forwardAuthConfig: { method: "bearer", username: "client", tokenUrl: "https://auth/token", clientId: "sonarr-id" },
    ...overrides,
  } as Service;
}

function makeSnapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    services: [makeService()],
    nowPlaying: [],
    requests: [],
    users: [{ id: "u1", name: "Admin", email: "admin@x", role: "admin", groups: ["admins"] }],
    library: [],
    libraryAll: [],
    recent: [],
    recentAll: [],
    queue: [{ id: "q1", title: "Movie", svc: "nzbget", pct: 50, eta: "1h", speed: "5 MB/s" }],
    plays24h: [1, 2, 3],
    bandwidth: null,
    storage: [{ mount: "/mnt/data", free: 100, total: 500 }],
    issues: null,
    arrHealth: [{ source: "sonarr", type: "warning", message: "test" }],
    upcoming: [],
    downloads: [{ source: "sonarr", title: "Ep", date: "2024-01-01" }],
    queueSource: "nzbget",
    arrQueueConfigured: true,
    nzbgetConfigured: true,
    nzbgetStatus: { downloadRate: 5000, remainingMB: 100, paused: false, standby: false, downloadedMB: 500, postJobs: 0, freeDiskMB: 9999, uptimeSec: 3600 },
    qbittorrentConfigured: true,
    qbittorrent: { dlSpeed: 1000, upSpeed: 200, downloaded: 0, uploaded: 0, downloading: 1, seeding: 2, torrents: 3, connectionStatus: "connected" },
    topStats: null,
    groups: [{ name: "admins", label: "Admins" }],
    visibility: [{ serviceId: "sonarr", groupName: "admins", visible: true }],
    adminGroup: "admins",
    metrics: null,
    metricsBySource: { prometheus: null, beszel: null },
    metricsSource: "prometheus",
    prometheusConfigured: true,
    beszelConfigured: false,
    beszelSystemId: null,
    discover: null,
    requestCounts: null,
    wizarr: null,
    prowlarr: null,
    agregarr: null,
    bazarrWanted: null,
    nzbhydra: null,
    lazylibrarian: null,
    listenarr: null,
    traefikConfigured: true,
    traefikDiscovered: [{ router: "test@docker", serviceId: "test", instanceId: null, rule: "Host(`test.example.com`)", middlewares: [], tls: false, cert: null }],
    traefikDismissed: ["old.host"],
    traefikInstances: [],
    authentikConfigured: true,
    lokiConfigured: true,
    ...overrides,
  } as Snapshot;
}

describe("scrubForMember", () => {
  it("strips admin-only top-level fields", () => {
    const s = makeSnapshot();
    const scrubbed = scrubForMember(s);
    expect(scrubbed.users).toEqual([]);
    expect(scrubbed.groups).toEqual([]);
    expect(scrubbed.visibility).toEqual([]);
    expect(scrubbed.adminGroup).toBe("");
    expect(scrubbed.traefikDiscovered).toEqual([]);
    expect(scrubbed.traefikDismissed).toEqual([]);
    expect(scrubbed.traefikInstances).toEqual([]);
    expect(scrubbed.traefikConfigured).toBe(false);
    expect(scrubbed.authentikConfigured).toBe(false);
    expect(scrubbed.arrHealth).toEqual([]);
    expect(scrubbed.downloads).toEqual([]);
    expect(scrubbed.queue).toEqual([]);
    expect(scrubbed.storage).toEqual([]);
    expect(scrubbed.arrQueueConfigured).toBe(false);
    expect(scrubbed.nzbgetConfigured).toBe(false);
    expect(scrubbed.nzbgetStatus).toBeNull();
    expect(scrubbed.qbittorrentConfigured).toBe(false);
    expect(scrubbed.qbittorrent).toBeNull();
    expect(scrubbed.prometheusConfigured).toBe(false);
    expect(scrubbed.beszelConfigured).toBe(false);
    expect(scrubbed.lokiConfigured).toBe(false);
    expect(scrubbed.beszelSystemId).toBeNull();
    expect(scrubbed.wizarr).toBeNull();
    expect(scrubbed.prowlarr).toBeNull();
    expect(scrubbed.agregarr).toBeNull();
    expect(scrubbed.nzbhydra).toBeNull();
  });

  it("strips admin-only per-service fields", () => {
    const s = makeSnapshot();
    const svc = scrubForMember(s).services[0];
    expect(svc.authentik).toBeUndefined();
    expect(svc.internalUrl).toBeUndefined();
    expect(svc.forwardAuthConfig).toBeUndefined();
    expect(svc.hasSecret).toBeUndefined();
    expect(svc.monitoringKey).toBeUndefined();
    expect(svc.lokiQuery).toBeUndefined();
    expect(svc.insecureTls).toBeUndefined();
  });

  it("preserves member-visible per-service fields", () => {
    const s = makeSnapshot();
    const svc = scrubForMember(s).services[0];
    expect(svc.id).toBe("sonarr");
    expect(svc.name).toBe("Sonarr");
    expect(svc.host).toBe("sonarr.example.com");
    expect(svc.version).toBe("4.0.0");
    expect(svc.status).toBe("up");
    // route is kept (cert status is member-visible)
    expect(svc.route).toBeDefined();
    expect(svc.route?.tls).toBe(true);
  });

  it("preserves member-visible snapshot fields", () => {
    const s = makeSnapshot();
    const scrubbed = scrubForMember(s);
    expect(scrubbed.services).toHaveLength(1);
    expect(scrubbed.nowPlaying).toEqual([]);
    expect(scrubbed.requests).toEqual([]);
    expect(scrubbed.library).toEqual([]);
    expect(scrubbed.recent).toEqual([]);
    expect(scrubbed.plays24h).toEqual([1, 2, 3]);
    expect(scrubbed.metricsSource).toBe("prometheus");
    expect(scrubbed.metrics).toBeNull();
  });

  it("preserves discover and requestCounts for members", () => {
    const s = makeSnapshot({
      discover: { trending: [], popularMovies: [], popularTv: [], upcomingMovies: [], watchlist: [] },
      requestCounts: { total: 5, pending: 1, approved: 2, processing: 1, failed: 0, available: 1 },
    });
    const scrubbed = scrubForMember(s);
    expect(scrubbed.discover).toBeDefined();
    expect(scrubbed.requestCounts).toBeDefined();
  });

  it("does not leak unrecognized future snapshot fields (allowlist not denylist)", () => {
    const s = { ...makeSnapshot(), futureSensitiveField: "secret-value" } as unknown as Snapshot;
    const scrubbed = scrubForMember(s);
    expect((scrubbed as unknown as Record<string, unknown>).futureSensitiveField).toBeUndefined();
  });

  it("does not leak unrecognized future service fields", () => {
    const svc = { ...makeService(), futureAdminField: "sensitive" } as unknown as Service;
    const s = makeSnapshot({ services: [svc] });
    const scrubbed = scrubForMember(s);
    expect((scrubbed.services[0] as unknown as Record<string, unknown>).futureAdminField).toBeUndefined();
  });
});
