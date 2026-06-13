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
];

vi.mock("@/lib/integrations/registry", () => ({
  getServiceConfigs: vi.fn(async () => CONFIGS),
  getServiceSecret: vi.fn(async () => "key"),
  getServiceCredentials: vi.fn(async (id: string) => ({ baseUrl: `https://${id}.test`, apiKey: "key", insecureTls: false })),
  isConfigured: vi.fn(async () => true),
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
    vi.mocked(registry.getServiceSecret).mockImplementation(async (id: string) => (id === "qbittorrent" ? null : "key"));
    try {
      const snap = await getSnapshot();
      expect(snap.services.find((s) => s.id === "sonarr")?.hasSecret).toBe(true);
      expect(snap.services.find((s) => s.id === "qbittorrent")?.hasSecret).toBe(false);
    } finally {
      vi.mocked(registry.getServiceSecret).mockImplementation(async () => "key");
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
