import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockHttp, mockClientsRegistry, mockEnv, MockIntegrationError } from "./clientsMocks";

vi.mock("@/lib/integrations/http", () => mockHttp());
vi.mock("@/lib/integrations/registry", () => mockClientsRegistry());
vi.mock("@/lib/env", () => mockEnv());

import { fetchJson, fetchRaw } from "@/lib/integrations/http";
import { getServiceCredentials } from "@/lib/integrations/registry";
import { nzbgetStatus, nzbgetQueue, qbittorrentStats, qbittorrentQueue } from "@/lib/integrations/clients";

const mockJson = vi.mocked(fetchJson);
const mockRaw = vi.mocked(fetchRaw);
const mockCreds = vi.mocked(getServiceCredentials);

beforeEach(() => {
  vi.clearAllMocks();
  mockCreds.mockImplementation(async (id: string) =>
    id === "qbittorrent"
      ? ({ baseUrl: "http://qb:8080", apiKey: "user:pass", insecureTls: false } as never)
      : ({ baseUrl: "http://nzb:6789", apiKey: "user:pass", insecureTls: false } as never),
  );
});

describe("nzbgetStatus", () => {
  it("normalizes the status RPC including the enriched fields", async () => {
    mockJson.mockResolvedValue({
      result: {
        DownloadRate: 5_000_000, RemainingSizeMB: 1024, DownloadPaused: false, ServerStandBy: false,
        DownloadedSizeMB: 2048, PostJobCount: 3, FreeDiskSpaceMB: 99_999, UpTimeSec: 3600,
      },
    } as never);
    const s = await nzbgetStatus();
    expect(s).toEqual({
      downloadRate: 5_000_000, remainingMB: 1024, paused: false, standby: false,
      downloadedMB: 2048, postJobs: 3, freeDiskMB: 99_999, uptimeSec: 3600,
    });
  });

  it("defaults missing fields (standby true, zeros)", async () => {
    mockJson.mockResolvedValue({ result: {} } as never);
    const s = await nzbgetStatus();
    expect(s).toMatchObject({ downloadRate: 0, remainingMB: 0, paused: false, standby: true, downloadedMB: 0, postJobs: 0, freeDiskMB: 0, uptimeSec: 0 });
  });
});

describe("nzbgetQueue", () => {
  it("maps groups to queue items with a computed percent", async () => {
    mockJson.mockResolvedValue({ result: [{ NZBName: "Some.Release", FileSizeMB: 100, RemainingSizeMB: 25, Status: "DOWNLOADING" }] } as never);
    const q = await nzbgetQueue();
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ title: "Some.Release", svc: "nzbget", pct: 75 });
  });

  it("is empty-safe and names unnamed groups", async () => {
    mockJson.mockResolvedValue({ result: [{ FileSizeMB: 0 }] } as never);
    const q = await nzbgetQueue();
    expect(q[0]).toMatchObject({ title: "(unnamed)", pct: 0 });
  });
});

describe("qbittorrentStats", () => {
  it("counts downloading vs seeding torrents from their states", async () => {
    mockRaw.mockResolvedValue({ status: 200, headers: { get: (k: string) => (k === "set-cookie" ? "SID=abc" : null) } } as never);
    // qbitGet uses fetchJson (imported as `fetchJsonRaw` alias), so drive it through mockJson.
    mockJson.mockImplementation(async (url: string) => {
      // torrents/info: 2 downloading, 1 seeding, 1 paused → downloading=2, seeding=1, total=4
      if (url.includes("torrents/info")) return [{ state: "downloading" }, { state: "stalledDL" }, { state: "uploading" }, { state: "pausedDL" }] as never;
      return { dl_info_speed: 1_000_000, up_info_speed: 200_000, dl_info_data: 5e9, up_info_data: 1e9, connection_status: "connected" } as never;
    });
    const s = await qbittorrentStats();
    expect(s).toMatchObject({ dlSpeed: 1_000_000, upSpeed: 200_000, downloading: 2, seeding: 1, torrents: 4, connectionStatus: "connected" });
  });
});

describe("qbittorrentQueue", () => {
  it("maps torrent list to queue items with percent and speed", async () => {
    // Use a distinct baseUrl so qbitSidCache doesn't bleed from qbittorrentStats test
    mockCreds.mockImplementation(async (id: string) =>
      id === "qbittorrent"
        ? ({ baseUrl: "http://qb-queue:8080", apiKey: "user:pass", insecureTls: false } as never)
        : ({ baseUrl: "http://nzb:6789", apiKey: "user:pass", insecureTls: false } as never),
    );
    mockRaw.mockResolvedValue({ status: 200, headers: { get: (k: string) => (k === "set-cookie" ? "SID=q1" : null) } } as never);
    mockJson.mockResolvedValue([
      { hash: "abc", name: "My.Show.S01E01", progress: 0.75, eta: 120, dlspeed: 2_097_152, state: "downloading" },
      { hash: "def", name: "Another.Movie", progress: 1.0, eta: 8_640_000, dlspeed: 0, state: "seeding" },
    ] as never);
    const q = await qbittorrentQueue();
    expect(q).toHaveLength(2);
    expect(q[0]).toMatchObject({ title: "My.Show.S01E01", svc: "qbittorrent", pct: 75 });
    expect(q[0].speed).toContain("MB/s");
    // stalled ETA sentinel → dash
    expect(q[1].eta).toBe("—");
  });

  it("returns empty array for an empty torrent list", async () => {
    mockCreds.mockImplementation(async (id: string) =>
      id === "qbittorrent"
        ? ({ baseUrl: "http://qb-queue2:8080", apiKey: "user:pass", insecureTls: false } as never)
        : ({ baseUrl: "http://nzb:6789", apiKey: "user:pass", insecureTls: false } as never),
    );
    mockRaw.mockResolvedValue({ status: 200, headers: { get: (k: string) => (k === "set-cookie" ? "SID=q2" : null) } } as never);
    mockJson.mockResolvedValue([] as never);
    expect(await qbittorrentQueue()).toHaveLength(0);
  });
});

describe("qbitGet — 401 re-auth retry", () => {
  it("re-authenticates and retries when the first request returns 401", async () => {
    // Unique baseUrl so the qbitSidCache hasn't seen this host before
    mockCreds.mockImplementation(async (id: string) =>
      id === "qbittorrent"
        ? ({ baseUrl: "http://qb-retry:8080", apiKey: "user:pass", insecureTls: false } as never)
        : ({ baseUrl: "http://nzb:6789", apiKey: "user:pass", insecureTls: false } as never),
    );
    // Login: SID on both initial auth and force-refresh
    mockRaw.mockResolvedValue({ status: 200, headers: { get: (k: string) => (k === "set-cookie" ? "SID=fresh" : null) } } as never);
    // First json call → 401; second → success
    mockJson
      .mockRejectedValueOnce(new MockIntegrationError("qbittorrent", "HTTP 401", 401) as never)
      .mockResolvedValueOnce([{ hash: "x", name: "Retry.Torrent", progress: 0.5, eta: 60, dlspeed: 0, state: "downloading" }] as never);
    const q = await qbittorrentQueue();
    expect(q).toHaveLength(1);
    expect(q[0].title).toBe("Retry.Torrent");
    // mockRaw called twice: initial auth + force-refresh auth
    expect(mockRaw).toHaveBeenCalledTimes(2);
  });
});
