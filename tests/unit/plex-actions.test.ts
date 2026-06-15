import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({ getSessionUser: vi.fn() }));
vi.mock("@/lib/integrations/registry", () => ({ isConfigured: vi.fn(), getServiceSecret: vi.fn() }));
vi.mock("@/lib/integrations/clients", () => ({
  plexSections: vi.fn(),
  plexButlerTasks: vi.fn(),
  plexScanSection: vi.fn(),
  plexAnalyzeSection: vi.fn(),
  plexEmptyTrash: vi.fn(),
  plexCleanBundles: vi.fn(),
  plexOptimizeDb: vi.fn(),
  plexRunButlerTask: vi.fn(),
}));

import { getSessionUser } from "@/lib/session";
import { isConfigured, getServiceSecret } from "@/lib/integrations/registry";
import { plexSections, plexButlerTasks, plexScanSection, plexCleanBundles } from "@/lib/integrations/clients";
import { getPlexPanelData, scanSectionAction, cleanBundlesAction } from "@/app/(portal)/admin/plex-actions";

const asAdmin = () => vi.mocked(getSessionUser).mockResolvedValue({ role: "admin" } as never);
const asUser = () => vi.mocked(getSessionUser).mockResolvedValue({ role: "user" } as never);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isConfigured).mockResolvedValue(true);
  vi.mocked(getServiceSecret).mockResolvedValue("tok");
});

describe("getPlexPanelData", () => {
  it("rejects a non-admin caller", async () => {
    asUser();
    await expect(getPlexPanelData()).rejects.toThrow("forbidden");
  });

  it("returns hasToken:false (and no upstream reads) when no token is stored", async () => {
    asAdmin();
    vi.mocked(getServiceSecret).mockResolvedValue(null);
    const data = await getPlexPanelData();
    expect(data).toMatchObject({ configured: true, hasToken: false, sections: [], tasks: [] });
    expect(plexSections).not.toHaveBeenCalled();
  });

  it("returns sections + tasks when configured", async () => {
    asAdmin();
    vi.mocked(plexSections).mockResolvedValue([{ id: "1", title: "Movies", type: "movie", agent: "", refreshing: false }]);
    vi.mocked(plexButlerTasks).mockResolvedValue([{ name: "BackupDatabase", title: "Back up", description: "", enabled: true, interval: 0 }]);
    const data = await getPlexPanelData();
    expect(data.hasToken).toBe(true);
    expect(data.sections).toHaveLength(1);
    expect(data.tasks).toHaveLength(1);
  });

  it("still renders the library table when butler reads fail (e.g. no Plex Pass)", async () => {
    asAdmin();
    vi.mocked(plexSections).mockResolvedValue([{ id: "1", title: "Movies", type: "movie", agent: "", refreshing: false }]);
    vi.mocked(plexButlerTasks).mockRejectedValue(new Error("404"));
    const data = await getPlexPanelData();
    expect(data.sections).toHaveLength(1);
    expect(data.tasks).toEqual([]);
    expect(data.error).toBeUndefined();
  });

  it("surfaces an error string when the sections read fails", async () => {
    asAdmin();
    vi.mocked(plexSections).mockRejectedValue(new Error("ECONNREFUSED"));
    vi.mocked(plexButlerTasks).mockResolvedValue([]);
    const data = await getPlexPanelData();
    expect(data.sections).toEqual([]);
    expect(data.error).toMatch(/Plex/);
  });
});

describe("action wrappers", () => {
  it("scanSectionAction returns ok + a started message", async () => {
    asAdmin();
    vi.mocked(plexScanSection).mockResolvedValue(undefined);
    expect(await scanSectionAction("1")).toEqual({ ok: true, message: "Library scan started" });
    expect(await scanSectionAction("1", true)).toEqual({ ok: true, message: "Metadata refresh started" });
  });

  it("returns ok:false with the error message when the client throws", async () => {
    asAdmin();
    vi.mocked(plexCleanBundles).mockRejectedValue(new Error("[plex] HTTP 401"));
    expect(await cleanBundlesAction()).toEqual({ ok: false, message: "[plex] HTTP 401" });
  });

  it("rejects a non-admin caller", async () => {
    asUser();
    await expect(cleanBundlesAction()).rejects.toThrow("forbidden");
  });
});
