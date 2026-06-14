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
  getServiceSecret: vi.fn(), getServiceCredentials: vi.fn(),
  getDeploymentSetting: vi.fn(),
}));
vi.mock("@/lib/env", () => ({
  env: { encryptionKey: "0".repeat(64), authSecret: "test", configFile: "/dev/null", databaseUrl: "file::memory:" },
  authConfigured: false,
}));

import { fetchJson } from "@/lib/integrations/http";
import { getServiceCredentials } from "@/lib/integrations/registry";
import { clearCache, arrQueue, arrHistory, arrHealth, arrDiskSpace, arrCalendar, gatusHealth } from "@/lib/integrations/clients";

const mockJson = vi.mocked(fetchJson);
const mockCreds = vi.mocked(getServiceCredentials);

beforeEach(() => {
  vi.clearAllMocks();
  clearCache();
  mockCreds.mockResolvedValue({ baseUrl: "http://svc/", apiKey: "key", insecureTls: false } as never);
});

describe("*arr clients", () => {
  it("arrQueue computes percent from size/sizeleft", async () => {
    mockJson.mockResolvedValue({ records: [{ title: "Rel", size: 100, sizeleft: 25, timeleft: "1h" }] } as never);
    const q = await arrQueue("radarr");
    expect(q[0]).toMatchObject({ title: "Rel", svc: "radarr", pct: 75, eta: "1h" });
  });

  it("arrHistory keeps grabbed/imported events and labels them", async () => {
    mockJson.mockResolvedValue({ records: [
      { id: 1, eventType: "grabbed", sourceTitle: "Src", date: "2020" },
      { id: 2, eventType: "downloadFolderImported", series: { title: "Show" }, date: "2021" },
      { id: 3, eventType: "downloadIgnored", date: "2022" },
    ] } as never);
    const h = await arrHistory("sonarr");
    expect(h.map((e) => e.event)).toEqual(["grabbed", "imported"]);
    expect(h[1].title).toBe("Show");
  });

  it("arrHealth maps records to HealthIssues tagged with the service", async () => {
    mockJson.mockResolvedValue([{ type: "error", message: "broken", source: "Indexer", wikiUrl: "u" }] as never);
    const issues = await arrHealth("radarr");
    expect(issues[0]).toEqual({ svc: "radarr", type: "error", message: "broken", source: "Indexer", wikiUrl: "u" });
  });

  it("arrDiskSpace drops zero-total mounts and normalizes bytes", async () => {
    mockJson.mockResolvedValue([
      { path: "/data", label: "Data", freeSpace: 50, totalSpace: 100 },
      { path: "/empty", totalSpace: 0 },
    ] as never);
    const mounts = await arrDiskSpace("sonarr");
    expect(mounts).toEqual([{ path: "/data", label: "Data", freeBytes: 50, totalBytes: 100 }]);
  });

  it("arrCalendar (radarr) yields a movie with a deep path", async () => {
    mockJson.mockResolvedValue([{ id: 7, title: "Mov", digitalRelease: "2999-01-01", year: 2999, titleSlug: "mov" }] as never);
    const up = await arrCalendar("radarr");
    expect(up[0]).toMatchObject({ kind: "movie", title: "Mov", svc: "radarr", deepPath: "/movie/mov" });
  });

  it("arrCalendar (sonarr) yields a series with an SxxExx label", async () => {
    mockJson.mockResolvedValue([{ id: 8, airDateUtc: "2999-01-01", seasonNumber: 1, episodeNumber: 2, title: "Pilot", series: { title: "Show", titleSlug: "show" } }] as never);
    const up = await arrCalendar("sonarr");
    expect(up[0]).toMatchObject({ kind: "series", title: "Show", ep: "S01E02 · Pilot", deepPath: "/series/show" });
  });
});

describe("gatusHealth", () => {
  it("derives status, uptime, beats and last-incident from results", async () => {
    mockCreds.mockResolvedValue({ baseUrl: "http://gatus", apiKey: "k", insecureTls: false } as never);
    mockJson.mockResolvedValue([
      { name: "Plex", group: "media", results: [
        { success: true, duration: 1_000_000, timestamp: "t1" },
        { success: false, duration: 2_000_000, timestamp: "t2" },
      ] },
    ] as never);
    const [h] = await gatusHealth();
    expect(h).toMatchObject({ key: "plex", name: "Plex", status: "down", uptime: 50, ms: 2, lastIncidentAt: "t2" });
    expect(h.beats).toEqual([1, 0]);
  });
});
