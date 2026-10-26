// Guards the demo's fake upstream (scripts/demo/upstream.mjs) against drifting from what Aerie's
// real clients parse: the REAL integration clients run against it over real HTTP, with only the
// credential lookup stubbed (so no DB is pulled in). If a client starts reading a field or
// endpoint the fake doesn't serve, the matching assertion here fails before the screenshots do.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { parse } from "yaml";
import { mockClientsRegistry, mockEnv } from "./clientsMocks";

const demo = vi.hoisted(() => ({ url: "", keys: {} as Record<string, string> }));

vi.mock("@/lib/integrations/registry", () => mockClientsRegistry());
vi.mock("@/lib/env", () => mockEnv());

import { getServiceCredentials, getServiceSecret, getDeploymentSetting } from "@/lib/integrations/registry";
import {
  clearCache,
  clearTtlCache,
  tautulliActivity,
  tautulliUsers,
  tautulliLibraries,
  tautulliPlays24h,
  tautulliStreamHistory,
  tautulliRecentlyAdded,
  tautulliHomeStats,
  overseerrRequests,
  overseerrRequestCounts,
  overseerrUsers,
  overseerrIssues,
  overseerrVersion,
  overseerrUserQuota,
  overseerrTrending,
  overseerrPopularMovies,
  overseerrPopularTv,
  overseerrUpcomingMovies,
  overseerrWatchlist,
  arrQueue,
  arrDiskSpace,
  arrHealth,
  arrCalendar,
  arrHistory,
  gatusHealth,
  prometheusMetrics,
  nzbgetStatus,
  nzbgetQueue,
} from "@/lib/integrations/clients";
import { fileSchema } from "@/lib/config/services";
import { startUpstream } from "../../scripts/demo/upstream.mjs";
import { aerieYaml, SERVICES } from "../../scripts/demo/config.mjs";
import { CATALOG, REQUESTS, SETTLE_TITLES, USERS } from "../../scripts/demo/catalog.mjs";
import { posterForRef, posterSvg } from "../../scripts/demo/posters.mjs";

let now = Date.parse("2026-10-26T12:00:00Z");
let upstream: { url: string; close: () => Promise<void> };

beforeAll(async () => {
  upstream = await startUpstream({ port: 0, clock: () => now });
  demo.url = upstream.url;
  // Same keys config.mjs hands to Aerie; services without one are key-optional (or launch-only).
  demo.keys = Object.fromEntries(SERVICES.flatMap((s) => (s.apiKey ? [[s.id, s.apiKey]] : [])));
});
afterAll(async () => {
  await upstream.close();
});

beforeEach(() => {
  clearCache();
  vi.mocked(getServiceCredentials).mockImplementation((async (id: string) => ({
    baseUrl: `${demo.url}/${id}`,
    apiKey: demo.keys[id] ?? null,
    insecureTls: false,
  })) as never);
  vi.mocked(getServiceSecret).mockResolvedValue(null as never);
  vi.mocked(getDeploymentSetting).mockResolvedValue(null as never);
});

describe("catalogue", () => {
  it("only references titles and people it defines", () => {
    const ids = new Set(CATALOG.map((t: { tmdbId: number }) => t.tmdbId));
    for (const r of REQUESTS) expect(ids.has(r.tmdbId)).toBe(true);
    const people = new Set(USERS.map((u: { id: number }) => u.id));
    for (const r of REQUESTS) expect(people.has(r.userId)).toBe(true);
    expect(SETTLE_TITLES).toHaveLength(3);
  });

  it("renders every poster kind as SVG without any network", () => {
    for (const kind of ["poster", "backdrop", "avatar"]) {
      const svg = posterSvg({ title: "A & B <T>", year: 2024, palette: ["#111111", "#eeeeee"], kind });
      expect(svg).toContain("<svg");
      // Avatars show the initial only; posters and backdrops show the escaped title.
      expect(svg).toContain(kind === "avatar" ? ">A<" : "A &amp; B &lt;T&gt;");
    }
    expect(posterForRef("/demo-9101.jpg").contentType).toBe("image/svg+xml");
  });
});

describe("tautulli", () => {
  it("serves live sessions that advance with the clock", async () => {
    const a = await tautulliActivity();
    expect(a.sessions).toHaveLength(4);
    expect(a.totalKbps).toBeGreaterThan(0);
    expect(a.wanKbps).toBeGreaterThan(0);
    expect(a.sessions.some((s) => s.paused)).toBe(true);
    expect(a.sessions.some((s) => s.play === "transcode")).toBe(true);
    const names = new Set(USERS.map((u: { name: string }) => u.name));
    for (const s of a.sessions) expect(names.has(s.user)).toBe(true);
    expect(a.sessions[0].art).toContain("/api/artwork?svc=tautulli");

    now += 10 * 60_000;
    const b = await tautulliActivity();
    expect(b.sessions[0].pos).toBeGreaterThan(a.sessions[0].pos);
    expect(b.sessions[3].pos).toBe(a.sessions[3].pos); // paused stays put
  });

  it("serves users, libraries, history, recently added and the leaderboard", async () => {
    expect((await tautulliUsers()).length).toBeGreaterThan(USERS.length);
    const libs = await tautulliLibraries();
    expect(libs.map((l) => l.id)).toEqual(["movies", "shows", "music"]);
    const plays = await tautulliPlays24h();
    expect(plays.total).toBeGreaterThan(0);
    expect(plays.hourly.reduce((x, y) => x + y, 0)).toBeGreaterThan(0);
    expect((await tautulliStreamHistory()).length).toBeGreaterThan(20);
    expect(await tautulliRecentlyAdded()).toHaveLength(6);
    const top = await tautulliHomeStats();
    expect(top.users).toHaveLength(5);
    expect(top.media.length).toBeGreaterThan(0);
  });

  it("serves artwork for refs and avatars, and 404s unknown paths", async () => {
    const poster = await fetch(`${demo.url}/tautulli/api/v2?cmd=pms_image_proxy&img=${encodeURIComponent("/library/metadata/9101/thumb/1")}`);
    expect(poster.headers.get("content-type")).toBe("image/svg+xml");
    expect(await poster.text()).toContain("Lantern");
    const avatar = await fetch(`${demo.url}/tautulli/api/v2?cmd=pms_image_proxy&img=${encodeURIComponent("/users/2/avatar")}`);
    expect(avatar.status).toBe(200);
    expect((await fetch(`${demo.url}/tautulli/api/v2?cmd=nope`)).status).toBe(404);
    expect((await fetch(`${demo.url}/unknown/anything`)).status).toBe(404);
  });
});

describe("overseerr", () => {
  it("resolves every request to a catalogue title once enrichment lands", async () => {
    let requests = await overseerrRequests();
    for (let i = 0; i < 50 && requests.some((r) => /^Request \d+$/.test(r.title)); i++) {
      await new Promise((r) => setTimeout(r, 50));
      clearTtlCache(); // keep the enrichment cache, refetch the list
      requests = await overseerrRequests();
    }
    expect(requests).toHaveLength(REQUESTS.length);
    const titles = requests.map((r) => r.title);
    for (const title of SETTLE_TITLES) expect(titles).toContain(title);
    expect(requests.every((r) => r.art?.startsWith("/api/artwork?svc=overseerr&ref=%2Fdemo-"))).toBe(true);
    expect(requests.every((r) => r.requesterName && r.requesterEmail)).toBe(true);
    expect(requests.map((r) => r.status)).toEqual(expect.arrayContaining(["pending", "available", "processing"]));
  });

  it("serves counts, users, quota, issues, version and the discover feeds", async () => {
    const counts = await overseerrRequestCounts();
    expect(counts.total).toBe(REQUESTS.length);
    expect(counts.pending).toBeGreaterThan(0);
    const users = await overseerrUsers();
    expect(users.map((u) => u.email)).toContain("demo@aerie.invalid");
    const quota = await overseerrUserQuota(2);
    expect(quota.movie.limit).toBe(5);
    expect((await overseerrIssues()).open).toBe(2);
    expect(await overseerrVersion()).toBe("1.34.0");
    for (const feed of [overseerrTrending, overseerrPopularMovies, overseerrPopularTv, overseerrUpcomingMovies, overseerrWatchlist]) {
      const items = await feed();
      expect(items.length).toBeGreaterThan(0);
      expect(items[0].art).toContain("/api/artwork?svc=overseerr");
    }
  });
});

describe("sonarr and radarr", () => {
  it("serves a download queue that moves with the clock", async () => {
    for (const svc of ["sonarr", "radarr"] as const) {
      const q = await arrQueue(svc);
      expect(q.length).toBeGreaterThan(0);
      expect(q.every((i) => i.pct > 0 && i.pct < 100 && i.eta !== "—")).toBe(true);
    }
    const before = await arrQueue("sonarr");
    now += 5_000;
    const after = await arrQueue("sonarr");
    expect(after[0].pct).toBeGreaterThanOrEqual(before[0].pct);
    expect(after.map((i) => i.pct)).not.toEqual(before.map((i) => i.pct));
  });

  it("serves disk space, health, calendar and history", async () => {
    for (const svc of ["sonarr", "radarr"] as const) {
      expect((await arrDiskSpace(svc)).length).toBe(3);
      const cal = await arrCalendar(svc);
      expect(cal.length).toBeGreaterThan(0);
      expect(cal[0].art).toContain(`/api/artwork?svc=${svc}`);
      expect(cal[0].deepPath).toBeTruthy();
      const hist = await arrHistory(svc);
      expect(new Set(hist.map((h) => h.event))).toEqual(new Set(["grabbed", "imported"]));
    }
    expect((await arrHealth("sonarr")).length).toBe(1);
    expect(await arrHealth("radarr")).toEqual([]);
  });
});

describe("nzbget", () => {
  it("serves status and queue over JSON-RPC", async () => {
    const s = await nzbgetStatus();
    expect(s.downloadRate).toBeGreaterThan(0);
    expect(s.paused).toBe(false);
    expect(await nzbgetQueue()).toHaveLength(2);
  });
});

describe("gatus", () => {
  it("reports every service, with exactly one blip in the recent beats", async () => {
    const health = await gatusHealth();
    expect(health.map((h) => h.name).sort()).toEqual(SERVICES.map((s) => s.name).sort());
    expect(health.every((h) => h.status === "up")).toBe(true);
    expect(health.every((h) => h.beats.length === 30 && h.msHistory.length === 30)).toBe(true);
    const blipped = health.filter((h) => h.beats.includes(0));
    expect(blipped.map((h) => h.name)).toEqual(["NZBGet"]);
    expect(blipped[0].uptime).toBeLessThan(100);
    expect(blipped[0].lastIncidentAt).toBeTruthy();
    expect(health.find((h) => h.name === "Plex")?.uptime24h).toBe(100);
  });
});

describe("prometheus", () => {
  it("serves a full node_exporter bundle", async () => {
    const m = await prometheusMetrics();
    expect(m.cpuPct).toBeGreaterThan(0);
    expect(m.cpuHistory).toHaveLength(40);
    expect(new Set(m.cpuHistory).size).toBeGreaterThan(10);
    expect(m.memTotalBytes).toBe(64 * 1024 ** 3);
    expect(m.memUsedBytes).toBeGreaterThan(0);
    expect(m.netInBps).toBeGreaterThan(0);
    expect(m.netOutBps).toBeGreaterThan(0);
    expect(m.diskUsedBytes).toBeGreaterThan(0);
    expect(m.diskTotalBytes).toBeGreaterThan(m.diskUsedBytes ?? 0);
    expect(m.load5).toBeGreaterThan(0);
    expect(m.load15).toBeGreaterThan(0);
    expect(m.uptimeSec).toBeGreaterThan(86_400);
    expect(m.swapTotalBytes).toBeGreaterThan(0);
    expect(m.filesystems.map((f) => f.mount)).toContain("/mnt/media");
  });
});

describe("aerieYaml", () => {
  it("parses against Aerie's config schema and only points at loopback", () => {
    const text = aerieYaml("http://127.0.0.1:3931/");
    const file = fileSchema.parse(parse(text));
    expect(file.services).toHaveLength(SERVICES.length);
    expect(new Set(file.services.map((s) => s.id)).size).toBe(file.services.length);
    for (const s of file.services) {
      expect(s.internalUrl).toBe(`http://127.0.0.1:3931/${s.id}`);
      expect(s.baseUrl).toBeUndefined(); // so Aerie never builds a URL from the display host
      expect(s.host).toMatch(/\.aerie\.example$/);
      expect(s.embeddable).toBe(false);
      expect(s.apiKey ?? "").not.toContain("${");
    }
    expect(file.services.filter((s) => s.central).length).toBeGreaterThanOrEqual(3);
    expect(text).not.toMatch(/https?:\/\/(?!127\.0\.0\.1)/);
  });
});
