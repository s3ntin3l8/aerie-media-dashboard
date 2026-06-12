import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/integrations/http", () => ({
  fetchJson: vi.fn(),
  fetchJsonRaw: vi.fn(),
  fetchRaw: vi.fn(),
  IntegrationError: class IntegrationError extends Error {
    service: string;
    status?: number;
    constructor(service: string, message: string, status?: number) {
      super(`[${service}] ${message}`);
      this.name = "IntegrationError";
      this.service = service;
      this.status = status;
    }
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

import { fetchJson, fetchRaw } from "@/lib/integrations/http";
import { getServiceCredentials } from "@/lib/integrations/registry";
import { nzbgetStatus, nzbgetQueue, qbittorrentStats } from "@/lib/integrations/clients";

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
