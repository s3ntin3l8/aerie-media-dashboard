import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockHttp, mockClientsRegistry, mockEnv } from "./clientsMocks";

vi.mock("@/lib/integrations/http", () => mockHttp());
vi.mock("@/lib/integrations/registry", () => mockClientsRegistry());
vi.mock("@/lib/env", () => mockEnv());

import { fetchJson, fetchRaw } from "@/lib/integrations/http";
import { getServiceCredentials } from "@/lib/integrations/registry";
import {
  clearCache,
  plexSections,
  plexButlerTasks,
  plexScanSection,
  plexAnalyzeSection,
  plexEmptyTrash,
  plexCleanBundles,
  plexOptimizeDb,
  plexRunButlerTask,
} from "@/lib/integrations/clients";

const mockJson = vi.mocked(fetchJson);
const mockRaw = vi.mocked(fetchRaw);
const mockCreds = vi.mocked(getServiceCredentials);

// Inspect the (url, opts) of the last fetchRaw call.
const lastRaw = () => mockRaw.mock.calls[mockRaw.mock.calls.length - 1] as [string, { method?: string; headers?: Record<string, string> }];

beforeEach(() => {
  vi.clearAllMocks();
  clearCache();
  mockCreds.mockResolvedValue({ baseUrl: "http://plex:32400/", apiKey: "tok", insecureTls: false } as never);
  mockRaw.mockResolvedValue({ ok: true, status: 200 } as never);
});

describe("plexSections", () => {
  it("maps Directory[] (key→id) and sends the X-Plex-Token header", async () => {
    mockJson.mockResolvedValue({
      MediaContainer: { Directory: [{ key: "1", type: "movie", title: "Movies", agent: "tv.plex.agents.movie", refreshing: true, scannedAt: 1700000000 }] },
    } as never);

    const sections = await plexSections();

    expect(sections).toEqual([{ id: "1", title: "Movies", type: "movie", agent: "tv.plex.agents.movie", refreshing: true, scannedAt: 1700000000 }]);
    const [url, opts] = mockJson.mock.calls[0] as [string, { headers?: Record<string, string> }];
    expect(url).toBe("http://plex:32400/library/sections/");
    expect(opts.headers).toMatchObject({ "X-Plex-Token": "tok", Accept: "application/json" });
  });

  it("falls back to updatedAt when scannedAt is absent", async () => {
    mockJson.mockResolvedValue({
      MediaContainer: { Directory: [{ key: "2", type: "show", title: "Shows", updatedAt: 1650000000 }] },
    } as never);
    const [s] = await plexSections();
    expect(s.scannedAt).toBe(1650000000);
  });

  it("tolerates a missing MediaContainer", async () => {
    mockJson.mockResolvedValue({} as never);
    expect(await plexSections()).toEqual([]);
  });
});

describe("plexButlerTasks", () => {
  it("maps ButlerTask[] from the ButlerTasks root", async () => {
    // Plex reports `interval` in DAYS (e.g. BackupDatabase runs every 3 days), not seconds.
    mockJson.mockResolvedValue({
      ButlerTasks: { ButlerTask: [{ name: "BackupDatabase", title: "Back Up", description: "d", enabled: true, interval: 3 }] },
    } as never);

    const tasks = await plexButlerTasks();

    expect(tasks).toEqual([{ name: "BackupDatabase", title: "Back Up", description: "d", enabled: true, interval: 3 }]);
    const [url] = mockJson.mock.calls[0] as [string, unknown];
    expect(url).toBe("http://plex:32400/butler");
  });
});

describe("plex actions build the right verb + URL", () => {
  it("plexScanSection → GET refresh, force adds ?force=1", async () => {
    await plexScanSection("3");
    expect(lastRaw()[0]).toBe("http://plex:32400/library/sections/3/refresh");
    expect(lastRaw()[1].method).toBe("GET");

    await plexScanSection("3", true);
    expect(lastRaw()[0]).toBe("http://plex:32400/library/sections/3/refresh?force=1");
  });

  it("plexAnalyzeSection → PUT analyze with token header", async () => {
    await plexAnalyzeSection("3");
    expect(lastRaw()[0]).toBe("http://plex:32400/library/sections/3/analyze");
    expect(lastRaw()[1].method).toBe("PUT");
    expect(lastRaw()[1].headers).toMatchObject({ "X-Plex-Token": "tok" });
  });

  it("plexCleanBundles / plexOptimizeDb → PUT with ?async=1", async () => {
    await plexCleanBundles();
    expect(lastRaw()[0]).toBe("http://plex:32400/library/clean/bundles?async=1");
    expect(lastRaw()[1].method).toBe("PUT");

    await plexOptimizeDb();
    expect(lastRaw()[0]).toBe("http://plex:32400/library/optimize?async=1");
  });

  it("plexRunButlerTask → POST /butler/{name}", async () => {
    await plexRunButlerTask("ButlerTaskGenerateIntroMarkers");
    expect(lastRaw()[0]).toBe("http://plex:32400/butler/ButlerTaskGenerateIntroMarkers");
    expect(lastRaw()[1].method).toBe("POST");
  });

  it("plexEmptyTrash(id) hits that one section; no id iterates every section", async () => {
    await plexEmptyTrash("5");
    expect(lastRaw()[0]).toBe("http://plex:32400/library/sections/5/emptyTrash");
    expect(lastRaw()[1].method).toBe("PUT");

    mockRaw.mockClear();
    mockJson.mockResolvedValue({ MediaContainer: { Directory: [{ key: "1", title: "A" }, { key: "2", title: "B" }] } } as never);
    await plexEmptyTrash();
    expect(mockRaw.mock.calls.map((c) => c[0])).toEqual([
      "http://plex:32400/library/sections/1/emptyTrash",
      "http://plex:32400/library/sections/2/emptyTrash",
    ]);
  });

  it("throws an IntegrationError on a non-2xx (e.g. non-owner token → 401)", async () => {
    mockRaw.mockResolvedValue({ ok: false, status: 401 } as never);
    await expect(plexCleanBundles()).rejects.toThrow(/401/);
  });
});
