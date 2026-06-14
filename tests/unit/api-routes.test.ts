import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { NextRequest } from "next/server";

// Route handlers resolve the session, registry creds, and integration clients — all stubbed
// so the tests exercise only the handler logic (auth gating, config-missing empties, success
// shaping, and the catch → empty fallbacks).
vi.mock("@/lib/session", () => ({ getSessionUser: vi.fn() }));
vi.mock("@/lib/integrations/registry", () => ({ getServiceCredentials: vi.fn(), getServiceSecret: vi.fn(), getServiceConfigs: vi.fn() }));
vi.mock("@/lib/integrations/clients", () => ({
  tautulliStreamHistory: vi.fn(),
  gatusHealth: vi.fn(),
  beszelSystems: vi.fn(),
  prometheusInstances: vi.fn(),
  overseerrSearch: vi.fn(),
  traefikRoutes: vi.fn(),
  authentikApps: vi.fn(),
  lokiTail: vi.fn(),
  lokiSelectorFor: vi.fn(),
}));

import { getSessionUser } from "@/lib/session";
import { getServiceCredentials, getServiceSecret, getServiceConfigs } from "@/lib/integrations/registry";
import { tautulliStreamHistory, gatusHealth, beszelSystems, prometheusInstances, overseerrSearch, traefikRoutes, authentikApps, lokiTail, lokiSelectorFor } from "@/lib/integrations/clients";

import { GET as historyGET } from "@/app/api/history/route";
import { GET as lokiGET } from "@/app/api/loki/logs/route";
import { GET as gatusGET } from "@/app/api/gatus-endpoints/route";
import { GET as beszelGET } from "@/app/api/beszel/systems/route";
import { GET as promGET } from "@/app/api/prometheus/instances/route";
import { GET as traefikGET } from "@/app/api/traefik/routes/route";
import { GET as authentikGET } from "@/app/api/authentik/apps/route";
import { GET as discoverGET } from "@/app/api/discover/route";
import { GET as iconsGET } from "@/app/api/icons/route";

const admin = { id: "a", name: "Admin", email: "admin@x", role: "admin", groups: [] };
const user = (name: string, email: string) => ({ id: email, name, email, role: "user", groups: [] });
const req = (qs = ""): NextRequest => ({ nextUrl: new URL(`http://localhost/api?${qs}`) }) as unknown as NextRequest;

beforeEach(() => vi.clearAllMocks());

describe("GET /api/history", () => {
  it("401s without a session", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null as never);
    expect((await historyGET()).status).toBe(401);
  });

  it("returns all history for an admin", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(admin as never);
    vi.mocked(tautulliStreamHistory).mockResolvedValue([{ user: "Ada" }, { user: "Bo" }] as never);
    const body = await (await historyGET()).json();
    expect(body.history).toHaveLength(2);
  });

  it("scopes a non-admin to their own streams (matching display name OR email local-part)", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(user("Ada Lovelace", "ada@x") as never);
    vi.mocked(tautulliStreamHistory).mockResolvedValue([{ user: "Ada Lovelace" }, { user: "ada" }, { user: "bob" }] as never);
    const body = await (await historyGET()).json();
    // "Ada Lovelace" matches the display name; "ada" matches the email local-part; "bob" is dropped.
    expect(body.history.map((h: { user: string }) => h.user)).toEqual(["Ada Lovelace", "ada"]);
  });
});

describe("admin-gated proxy routes", () => {
  it("gatus-endpoints: 403 for non-admins, [] when unconfigured, mapped on success, [] on throw", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(user("U", "u@x") as never);
    expect((await gatusGET()).status).toBe(403);

    vi.mocked(getSessionUser).mockResolvedValue(admin as never);
    vi.mocked(getServiceCredentials).mockResolvedValue(null as never);
    expect(await (await gatusGET()).json()).toEqual([]);

    vi.mocked(getServiceCredentials).mockResolvedValue({ baseUrl: "http://g", apiKey: "k" } as never);
    vi.mocked(gatusHealth).mockResolvedValue([{ key: "k1", name: "n1", group: "g1", extra: "dropped" }] as never);
    expect(await (await gatusGET()).json()).toEqual([{ key: "k1", name: "n1", group: "g1" }]);

    vi.mocked(gatusHealth).mockRejectedValue(new Error("down"));
    expect(await (await gatusGET()).json()).toEqual([]);
  });

  it("beszel/systems: 403, unconfigured [], and success passthrough", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(user("U", "u@x") as never);
    expect((await beszelGET()).status).toBe(403);

    vi.mocked(getSessionUser).mockResolvedValue(admin as never);
    vi.mocked(getServiceCredentials).mockResolvedValue(null as never);
    expect(await (await beszelGET()).json()).toEqual([]);

    vi.mocked(getServiceCredentials).mockResolvedValue({ baseUrl: "http://b", apiKey: "e:p" } as never);
    vi.mocked(beszelSystems).mockResolvedValue([{ id: "s1" }] as never);
    expect(await (await beszelGET()).json()).toEqual([{ id: "s1" }]);

    vi.mocked(beszelSystems).mockRejectedValue(new Error("x"));
    expect(await (await beszelGET()).json()).toEqual([]);
  });

  it("prometheus/instances: 403, unconfigured [], and success passthrough", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(user("U", "u@x") as never);
    expect((await promGET()).status).toBe(403);

    vi.mocked(getSessionUser).mockResolvedValue(admin as never);
    vi.mocked(getServiceCredentials).mockResolvedValue({ baseUrl: "http://p", apiKey: "" } as never);
    vi.mocked(prometheusInstances).mockResolvedValue(["node1"] as never);
    expect(await (await promGET()).json()).toEqual(["node1"]);
  });

  it("traefik/routes: 403 for non-admins, [] when unconfigured, passthrough, [] on throw", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(user("U", "u@x") as never);
    expect((await traefikGET()).status).toBe(403);

    vi.mocked(getSessionUser).mockResolvedValue(admin as never);
    // Unconfigured: traefikRoutes() throws "not configured" → caught → [].
    vi.mocked(traefikRoutes).mockRejectedValue(new Error("not configured"));
    expect(await (await traefikGET()).json()).toEqual([]);

    vi.mocked(traefikRoutes).mockResolvedValue([{ router: "sonarr@docker", serviceId: "" }] as never);
    expect(await (await traefikGET()).json()).toEqual([{ router: "sonarr@docker", serviceId: "" }]);

    vi.mocked(traefikRoutes).mockRejectedValue(new Error("down"));
    expect(await (await traefikGET()).json()).toEqual([]);
  });

  it("authentik/apps: 403 for non-admins, [] when unconfigured, passthrough, [] on throw", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(user("U", "u@x") as never);
    expect((await authentikGET()).status).toBe(403);

    vi.mocked(getSessionUser).mockResolvedValue(admin as never);
    vi.mocked(getServiceCredentials).mockResolvedValue(null as never);
    expect(await (await authentikGET()).json()).toEqual([]);

    vi.mocked(getServiceCredentials).mockResolvedValue({ baseUrl: "http://a", apiKey: "tok" } as never);
    vi.mocked(authentikApps).mockResolvedValue([{ appSlug: "sonarr", serviceId: "" }] as never);
    expect(await (await authentikGET()).json()).toEqual([{ appSlug: "sonarr", serviceId: "" }]);

    vi.mocked(authentikApps).mockRejectedValue(new Error("down"));
    expect(await (await authentikGET()).json()).toEqual([]);
  });
});

describe("GET /api/loki/logs", () => {
  it("403s for non-admins", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(user("U", "u@x") as never);
    expect((await lokiGET(req("serviceId=sonarr"))).status).toBe(403);
  });

  it("400s without a serviceId", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(admin as never);
    expect((await lokiGET(req(""))).status).toBe(400);
  });

  it("404s for an unknown service", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(admin as never);
    vi.mocked(getServiceConfigs).mockResolvedValue([{ id: "radarr" }] as never);
    expect((await lokiGET(req("serviceId=sonarr"))).status).toBe(404);
  });

  it("resolves the selector and returns the tail; [] on throw", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(admin as never);
    vi.mocked(getServiceConfigs).mockResolvedValue([{ id: "sonarr", lokiQuery: null }] as never);
    vi.mocked(lokiSelectorFor).mockReturnValue('{container="sonarr"}');
    vi.mocked(lokiTail).mockResolvedValue([{ tsNs: "1", ts: "t", line: "hello" }] as never);
    expect(await (await lokiGET(req("serviceId=sonarr"))).json()).toEqual([{ tsNs: "1", ts: "t", line: "hello" }]);
    expect(lokiSelectorFor).toHaveBeenCalledWith({ id: "sonarr", lokiQuery: null });

    vi.mocked(lokiTail).mockRejectedValue(new Error("loki down"));
    expect(await (await lokiGET(req("serviceId=sonarr"))).json()).toEqual([]);
  });
});

describe("GET /api/discover", () => {
  it("returns [] when Overseerr has no stored secret", async () => {
    vi.mocked(getServiceSecret).mockResolvedValue(null as never);
    expect(await (await discoverGET(req("q=dune"))).json()).toEqual([]);
    expect(overseerrSearch).not.toHaveBeenCalled();
  });

  it("returns search results when configured", async () => {
    vi.mocked(getServiceSecret).mockResolvedValue("key" as never);
    vi.mocked(overseerrSearch).mockResolvedValue([{ id: "1" }] as never);
    expect(await (await discoverGET(req("q=dune"))).json()).toEqual([{ id: "1" }]);
  });

  it("swallows upstream errors into []", async () => {
    vi.mocked(getServiceSecret).mockResolvedValue("key" as never);
    vi.mocked(overseerrSearch).mockRejectedValue(new Error("boom"));
    expect(await (await discoverGET(req("q=dune"))).json()).toEqual([]);
  });
});

describe("GET /api/icons", () => {
  const origFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = origFetch; });

  it("returns [] for an empty query without fetching metadata", async () => {
    const f = vi.fn();
    globalThis.fetch = f as never;
    expect(await (await iconsGET(req("q="))).json()).toEqual([]);
    expect(f).not.toHaveBeenCalled();
  });

  it("returns [] when the metadata fetch fails", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("cdn down")) as never;
    expect(await (await iconsGET(req("q=plex"))).json()).toEqual([]);
  });

  it("scores and ranks matches (exact slug first), capped output shape", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        plex: { base: "png", aliases: [], categories: ["media"] },
        plexamp: { base: "png", aliases: [], categories: ["media"] },
        sonarr: { base: "png", aliases: ["plex-helper"], categories: [] },
      }),
    }) as never;
    const out = await (await iconsGET(req("q=plex"))).json();
    expect(out[0].slug).toBe("plex"); // exact match outranks prefix + alias
    expect(out[0].name).toBe("Plex"); // slugToName title-cases
    expect(out.map((r: { slug: string }) => r.slug)).toEqual(["plex", "plexamp", "sonarr"]);
  });
});
