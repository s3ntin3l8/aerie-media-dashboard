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
    baseUrl: "https://sonarr.example.com",
    internalUrl: null,
    version: "4.0.0",
    note: null,
    sortOrder: 0,
    monitoringKey: null,
    lokiQuery: null,
    insecureTls: false,
    active: true,
    keepAlive: false,
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
    forwardAuthConfig: undefined,
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
    nzbgetStatus: { downloadRate: 0, remainingMB: 0, paused: false, standby: true, downloadedMB: 0, postJobs: 0, freeDiskMB: 0, uptimeSec: 0 },
    qbittorrentConfigured: true,
    qbittorrent: { dlSpeed: 0, upSpeed: 0, downloaded: 0, uploaded: 0, downloading: 0, seeding: 0, torrents: 0, connectionStatus: "connected" },
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
    lokiConfigured: false,
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
    expect(scrubbed.arrHealth).toEqual([]);
    expect(scrubbed.downloads).toEqual([]);
    expect(scrubbed.queue).toEqual([]);
    expect(scrubbed.storage).toEqual([]);
    expect(scrubbed.arrQueueConfigured).toBe(false);
    expect(scrubbed.nzbgetConfigured).toBe(false);
    expect(scrubbed.qbittorrentConfigured).toBe(false);
    expect(scrubbed.prometheusConfigured).toBe(false);
    expect(scrubbed.beszelConfigured).toBe(false);
    expect(scrubbed.traefikConfigured).toBe(false);
    expect(scrubbed.lokiConfigured).toBe(false);
    expect(scrubbed.beszelSystemId).toBeNull();
  });

  it("strips authentik from services but keeps route", () => {
    const s = makeSnapshot();
    const scrubbed = scrubForMember(s);
    expect(scrubbed.services[0].authentik).toBeUndefined();
    expect(scrubbed.services[0].route).toBeDefined();
  });

  it("preserves member-visible fields", () => {
    const s = makeSnapshot();
    const scrubbed = scrubForMember(s);
    expect(scrubbed.services).toHaveLength(1);
    expect(scrubbed.services[0].id).toBe("sonarr");
    expect(scrubbed.nowPlaying).toEqual([]);
    expect(scrubbed.requests).toEqual([]);
    expect(scrubbed.library).toEqual([]);
    expect(scrubbed.recent).toEqual([]);
    expect(scrubbed.plays24h).toEqual([1, 2, 3]);
    expect(scrubbed.metricsSource).toBe("prometheus");
    expect(scrubbed.nzbgetStatus).toBeDefined();
    expect(scrubbed.qbittorrent).toBeDefined();
  });

  it("preserves discover and requestCounts for members", () => {
    const s = makeSnapshot({ discover: { trending: [], popularMovies: [], popularTv: [], upcomingMovies: [], watchlist: [] }, requestCounts: { total: 5, pending: 1, approved: 2, processing: 1, failed: 0, available: 1 } });
    const scrubbed = scrubForMember(s);
    expect(scrubbed.discover).toBeDefined();
    expect(scrubbed.requestCounts).toBeDefined();
  });
});