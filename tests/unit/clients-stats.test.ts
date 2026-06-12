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
  getServiceCredentials: vi.fn(),
  getDeploymentSetting: vi.fn(),
}));
vi.mock("@/lib/env", () => ({
  env: { encryptionKey: "0".repeat(64), authSecret: "test", configFile: "/dev/null", databaseUrl: "file::memory:" },
  authConfigured: false,
}));

import { fetchJson } from "@/lib/integrations/http";
import { getServiceCredentials } from "@/lib/integrations/registry";
import {
  clearCache, wizarrStats, prowlarrStats, bazarrWanted, nzbhydra2Stats,
  lazylibrarianStats, listenarrStats, agregarrStatus,
} from "@/lib/integrations/clients";

const mockJson = vi.mocked(fetchJson);
const mockCreds = vi.mocked(getServiceCredentials);

// Route each upstream call by URL substring.
const route = (map: Record<string, unknown>) =>
  mockJson.mockImplementation(async (url: string) => {
    const hit = Object.entries(map).find(([frag]) => url.includes(frag));
    if (!hit) throw new Error(`unexpected url ${url}`);
    return hit[1] as never;
  });

beforeEach(() => {
  vi.clearAllMocks();
  clearCache();
  mockCreds.mockResolvedValue({ baseUrl: "http://svc", apiKey: "key", insecureTls: false } as never);
});

describe("stat clients", () => {
  it("wizarrStats normalizes with defaults", async () => {
    route({ "/api/status": { users: 9, invites: 4, pending: 2 } });
    expect(await wizarrStats()).toEqual({ users: 9, invites: 4, pending: 2, expired: 0 });
  });

  it("prowlarrStats counts enabled indexers and sums stats", async () => {
    route({
      "/api/v1/indexerstats": { indexers: [{ numberOfQueries: 10, numberOfGrabs: 3, numberOfFailedGrabs: 1 }, { numberOfQueries: 5 }] },
      "/api/v1/indexer": [{ enable: true }, { enable: true }, { enable: false }],
    });
    expect(await prowlarrStats()).toEqual({ total: 3, enabled: 2, queries: 15, grabs: 3, failedGrabs: 1 });
  });

  it("bazarrWanted reads both wanted endpoints", async () => {
    route({ "episodes/wanted": { total: 7 }, "movies/wanted": { total: 2 } });
    expect(await bazarrWanted()).toEqual({ episodes: 7, movies: 2 });
  });

  it("nzbhydra2Stats classifies enabled/disabled/errored", async () => {
    route({ "/api/stats/indexers": [
      { state: "ENABLED" },
      { state: "DISABLED_USER" },
      { state: "DISABLED_SYSTEM" },
      { state: "ENABLED", lastError: "boom" },
    ] });
    expect(await nzbhydra2Stats()).toEqual({ total: 4, enabled: 2, disabled: 2, errored: 2 });
  });

  it("lazylibrarianStats tallies books, authors, on-disk and wanted/snatched", async () => {
    route({ "cmd=getAllBooks": [
      { AuthorID: "a1", Status: "Open", AudioStatus: "Skipped" },
      { AuthorID: "a1", Status: "Wanted" },
      { AuthorID: "a2", Status: "Snatched", AudioStatus: "Open" },
    ] });
    const s = await lazylibrarianStats();
    expect(s.totalBooks).toBe(3);
    expect(s.authors).toBe(2);
    expect(s.wanted).toBe(1);
    expect(s.snatched).toBe(1);
  });

  it("lazylibrarianStats throws when the response isn't a list", async () => {
    route({ "cmd=getAllBooks": { Success: false } });
    await expect(lazylibrarianStats()).rejects.toThrow();
  });

  it("listenarrStats counts audiobooks, distinct authors, monitored and wanted", async () => {
    route({ "/api/v1/library": [
      { monitored: true, wanted: false, authorAsins: ["X1"] },
      { monitored: true, wanted: true, authorAsins: ["X1"] },
      { monitored: false, wanted: false, authors: ["Some Author"] },
    ] });
    const s = await listenarrStats();
    expect(s).toEqual({ audiobooks: 3, authors: 2, monitored: 2, wanted: 1 });
  });

  it("agregarrStatus reads collections + best-effort sync status", async () => {
    route({
      "/api/v1/collections/sync/status": { running: true, collectionsNeedingSync: 4, progress: 50, currentStage: "Syncing" },
      "/api/v1/collections": { collectionConfigs: [{ isActive: true }, { isActive: false }] },
    });
    const s = await agregarrStatus();
    expect(s).toMatchObject({ collections: 2, activeCollections: 1, running: true, needingSync: 4, progress: 50, currentStage: "Syncing" });
  });
});
