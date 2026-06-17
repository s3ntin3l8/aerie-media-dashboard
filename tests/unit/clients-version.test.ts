import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mockHttp, mockClientsRegistry, mockEnv } from "./clientsMocks";

vi.mock("@/lib/integrations/http", () => mockHttp());
vi.mock("@/lib/integrations/registry", () => mockClientsRegistry());
vi.mock("@/lib/env", () => mockEnv());

import { fetchJson, fetchRaw } from "@/lib/integrations/http";
import { getServiceCredentials } from "@/lib/integrations/registry";
import { detectVersion, probeVersion } from "@/lib/integrations/clients";

const mockFetchJson = vi.mocked(fetchJson);
const mockFetchRaw = vi.mocked(fetchRaw);
const mockGetCreds = vi.mocked(getServiceCredentials);

describe("serviceKind — via detectVersion and probeVersion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("detectVersion — unknown service kind returns null", () => {
    it("returns null for an unrecognized service id", async () => {
      mockGetCreds.mockResolvedValue({ baseUrl: "http://svc", apiKey: "key", insecureTls: false });
      const result = await detectVersion("unknown-service");
      expect(result).toBeNull();
    });
  });

  describe("probeVersion — version detection per service kind", () => {
    it("detects Sonarr version via /api/v3/system/status", async () => {
      mockFetchJson.mockResolvedValue({ version: "4.0.11.2680" });
      const result = await probeVersion("http://sonarr:8989", "key", "sonarr");
      expect(result).toBe("4.0.11.2680");
      expect(mockFetchJson).toHaveBeenCalledWith(
        expect.stringContaining("/api/v3/system/status"),
        expect.objectContaining({ service: "version-detect" }),
      );
    });

    it("detects Radarr version via /api/v3/system/status", async () => {
      mockFetchJson.mockResolvedValue({ version: "5.14.0.9383" });
      const result = await probeVersion("http://radarr:7878", "key", "radarr");
      expect(result).toBe("5.14.0.9383");
    });

    it("detects Prowlarr version via /api/v1/system/status (v1 API)", async () => {
      mockFetchJson.mockResolvedValue({ version: "1.31.2.6552" });
      const result = await probeVersion("http://prowlarr:9696", "key", "prowlarr");
      expect(result).toBe("1.31.2.6552");
      expect(mockFetchJson).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/system/status"),
        expect.anything(),
      );
    });

    it("detects Jellyfin version via /System/Info", async () => {
      mockFetchJson.mockResolvedValue({ Version: "10.9.11" });
      const result = await probeVersion("http://jellyfin:8096", "key", "jellyfin");
      expect(result).toBe("10.9.11");
      expect(mockFetchJson).toHaveBeenCalledWith(
        expect.stringContaining("/System/Info"),
        expect.anything(),
      );
    });

    it("detects Overseerr version via /api/v1/status", async () => {
      mockFetchJson.mockResolvedValue({ version: "1.34.0" });
      const result = await probeVersion("http://overseerr:5055", "key", "overseerr");
      expect(result).toBe("1.34.0");
    });

    it("detects Authentik version via /api/v3/admin/version/ with a Bearer token", async () => {
      mockFetchJson.mockResolvedValue({ version_current: "2026.5.2" });
      const result = await probeVersion("https://authentik.test", "tok", "authentik");
      expect(result).toBe("2026.5.2");
      expect(mockFetchJson).toHaveBeenCalledWith(
        expect.stringContaining("/api/v3/admin/version/"),
        expect.objectContaining({ service: "version-detect", headers: { Authorization: "Bearer tok" } }),
      );
    });

    it("detectVersion('authentik') returns null when the token is rejected (403 throws)", async () => {
      mockGetCreds.mockResolvedValue({ baseUrl: "https://authentik.test", apiKey: "bad", insecureTls: false });
      mockFetchJson.mockRejectedValue(new Error("[version-detect] HTTP 403"));
      expect(await detectVersion("authentik")).toBeNull();
    });

    it("detects Jellyseerr as overseerr kind", async () => {
      mockFetchJson.mockResolvedValue({ version: "2.0.0" });
      const result = await probeVersion("http://jellyseerr:5055", "key", "jellyseerr");
      expect(result).toBe("2.0.0");
      expect(mockFetchJson).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/status"),
        expect.anything(),
      );
    });

    it("detects raw Traefik version via /api/version", async () => {
      mockFetchJson.mockResolvedValue({ Version: "3.7.1" });
      const result = await probeVersion("http://traefik:8080", "", "traefik");
      expect(result).toBe("3.7.1");
      expect(mockFetchJson).toHaveBeenCalledWith(
        expect.stringContaining("/api/version"),
        expect.objectContaining({ service: "version-detect" }),
      );
    });

    it("traefik aggregator: falls back to /api/snapshot when /api/version is absent → connected, no version", async () => {
      mockFetchJson
        .mockRejectedValueOnce(new Error("[version-detect] HTTP 404"))
        .mockResolvedValueOnce({ httpRouters: [] });
      const result = await probeVersion("http://aggregator:8080", "", "traefik-viewer");
      expect(result).toBe(""); // reachable, no version field
      const urls = mockFetchJson.mock.calls.map((c) => c[0] as string);
      expect(urls.some((u) => u.includes("/api/version"))).toBe(true);
      expect(urls.some((u) => u.includes("/api/snapshot"))).toBe(true);
    });

    it("traefik aggregator: surfaces a top-level `version` from /api/snapshot when present", async () => {
      mockFetchJson
        .mockRejectedValueOnce(new Error("404"))
        .mockResolvedValueOnce({ version: "1.4.0", httpRouters: [] });
      expect(await probeVersion("http://aggregator:8080", "", "traefik-aggregator")).toBe("1.4.0");
    });

    it("traefik: returns null when both probes fail (→ 'could not connect')", async () => {
      mockFetchJson.mockRejectedValue(new Error("unreachable"));
      expect(await probeVersion("http://traefik:8080", "", "traefik-viewer")).toBeNull();
    });

    it("strips leading v from version via normalizeVersion", async () => {
      mockFetchJson.mockResolvedValue({ version: "v1.2.3" });
      const result = await probeVersion("http://svc:8080", "key", "sonarr");
      expect(result).toBe("1.2.3");
    });

    it("strips leading V from version via normalizeVersion", async () => {
      mockFetchJson.mockResolvedValue({ version: "V2.0.0" });
      const result = await probeVersion("http://svc:8080", "key", "radarr");
      expect(result).toBe("2.0.0");
    });

    it("shortens develop-SHA versions via normalizeVersion", async () => {
      mockFetchJson.mockResolvedValue({ version: "develop-abcdef12345678" });
      const result = await probeVersion("http://svc:8080", "key", "sonarr");
      expect(result).toBe("develop-abcdef1");
    });

    it("returns null for null/undefined version", async () => {
      mockFetchJson.mockResolvedValue({ version: undefined });
      const result = await probeVersion("http://svc:8080", "key", "sonarr");
      expect(result).toBeNull();
    });

    it("returns null for unrecognized kind", async () => {
      const result = await probeVersion("http://svc:8080", "key", "random-tool");
      expect(result).toBeNull();
    });

    it("handles Tautulli version detection", async () => {
      mockFetchJson.mockResolvedValue({ response: { data: { tautulli_version: "v2.14.5" } } });
      const result = await probeVersion("http://tautulli:8181", "key", "tautulli");
      expect(result).toBe("2.14.5");
    });

    it("handles Gatus (connectivity check, returns empty string)", async () => {
      mockFetchJson.mockResolvedValue({});
      const result = await probeVersion("http://gatus:8080", "key", "gatus");
      expect(result).toBe("");
    });

    it("returns null on fetch error", async () => {
      mockFetchJson.mockRejectedValue(new Error("connection refused"));
      const result = await probeVersion("http://svc:8080", "key", "sonarr");
      expect(result).toBeNull();
    });

    it("detects Bazarr version via /api/system/status?apikey=", async () => {
      mockFetchJson.mockResolvedValue({ data: { bazarr_version: "1.4.3" } });
      expect(await probeVersion("http://bazarr:6767", "key", "bazarr")).toBe("1.4.3");
      expect(mockFetchJson).toHaveBeenCalledWith(expect.stringContaining("/api/system/status?apikey="), expect.anything());
    });

    it("detects Agregarr version via /api/v1/status (public)", async () => {
      mockFetchJson.mockResolvedValue({ version: "0.9.0" });
      expect(await probeVersion("http://agregarr:80", "", "agregarr")).toBe("0.9.0");
    });

    it("detects Wizarr version via /api/swagger.json info.version", async () => {
      mockFetchJson.mockResolvedValue({ info: { version: "4.1.2" } });
      expect(await probeVersion("http://wizarr:5690", "key", "wizarr")).toBe("4.1.2");
      expect(mockFetchJson).toHaveBeenCalledWith(expect.stringContaining("/api/swagger.json"), expect.anything());
    });

    it("returns empty string for Wizarr when version is absent", async () => {
      mockFetchJson.mockResolvedValue({});
      expect(await probeVersion("http://wizarr:5690", "key", "wizarr")).toBe("");
    });

    it("detects Audiobookshelf version via /status after validating /api/libraries", async () => {
      mockFetchJson
        .mockResolvedValueOnce([]) // /api/libraries (auth check)
        .mockResolvedValueOnce({ serverVersion: "2.14.0" }); // /status
      expect(await probeVersion("http://abs:13378", "tok", "audiobookshelf")).toBe("2.14.0");
    });

    it("detects NZBGet version via JSON-RPC", async () => {
      mockFetchJson.mockResolvedValue({ result: "21.1" });
      expect(await probeVersion("http://nzb:6789", "user:pass", "nzbget")).toBe("21.1");
      expect(mockFetchJson).toHaveBeenCalledWith(expect.stringContaining("/jsonrpc"), expect.objectContaining({ method: "POST" }));
    });

    it("detects qBittorrent version via SID cookie session", async () => {
      mockFetchRaw
        .mockResolvedValueOnce({ status: 200, headers: { get: (k: string) => k === "set-cookie" ? "SID=abc123" : null } } as never)
        .mockResolvedValueOnce({ ok: true, text: async () => "5.0.2" } as never);
      expect(await probeVersion("http://qb:8080", "user:pass", "qbittorrent")).toBe("5.0.2");
    });

    it("qBittorrent: returns null on IP ban (403 from login)", async () => {
      mockFetchRaw.mockResolvedValueOnce({ status: 403, headers: { get: () => null } } as never);
      expect(await probeVersion("http://qb:8080", "user:pass", "qbittorrent")).toBeNull();
    });

    it("qBittorrent: returns null on invalid credentials (no set-cookie)", async () => {
      mockFetchRaw.mockResolvedValueOnce({ status: 200, headers: { get: () => null } } as never);
      expect(await probeVersion("http://qb:8080", "user:pass", "qbittorrent")).toBeNull();
    });

    it("qBittorrent: returns null when version fetch fails", async () => {
      mockFetchRaw
        .mockResolvedValueOnce({ status: 200, headers: { get: (k: string) => k === "set-cookie" ? "SID=tok" : null } } as never)
        .mockResolvedValueOnce({ ok: false, status: 500 } as never);
      expect(await probeVersion("http://qb:8080", "user:pass", "qbittorrent")).toBeNull();
    });

    it("detects NZBHydra2 version via /internalapi/updates/infos", async () => {
      mockFetchJson.mockResolvedValue({ currentVersion: "7.8.0" });
      expect(await probeVersion("http://hydra:5076", "key", "nzbhydra")).toBe("7.8.0");
    });

    it("detects Beszel version (empty string — PocketBase auth check)", async () => {
      mockFetchJson
        .mockResolvedValueOnce({ token: "jwt.tok.sig" }) // auth-with-password
        .mockResolvedValueOnce({}); // /api/health
      expect(await probeVersion("http://bz:8090", "admin@x:pw", "beszel")).toBe("");
    });

    it("Beszel: returns null when auth returns no token", async () => {
      mockFetchJson.mockResolvedValueOnce({}); // no token
      expect(await probeVersion("http://bz:8090", "admin@x:pw", "beszel")).toBeNull();
    });

    it("detects Unraid version via GraphQL /graphql", async () => {
      mockFetchJson.mockResolvedValue({ data: { info: { versions: { core: { unraid: "7.1.4" } } } } });
      expect(await probeVersion("http://unraid", "apikey", "unraid")).toBe("7.1.4");
    });

    it("Unraid: falls back to flat versions.unraid when nested is absent", async () => {
      mockFetchJson
        .mockResolvedValueOnce({ data: { info: { versions: { core: {} } } } }) // nested miss
        .mockResolvedValueOnce({ data: { info: { versions: { unraid: "7.0.0" } } } }); // flat
      expect(await probeVersion("http://unraid", "key", "unraid")).toBe("7.0.0");
    });

    it("detects LazyLibrarian version when Success=true", async () => {
      mockFetchJson.mockResolvedValue({ Success: true, current_version: "v220-0g1234567" });
      expect(await probeVersion("http://ll:5299", "key", "lazylibrarian")).toBe("220-0g1234567");
    });

    it("LazyLibrarian: returns null when Success=false (bad key)", async () => {
      mockFetchJson.mockResolvedValue({ Success: false });
      expect(await probeVersion("http://ll:5299", "badkey", "lazylibrarian")).toBeNull();
    });

    it("detects Listenarr version via /api/v1/system/info", async () => {
      mockFetchJson.mockResolvedValue({ version: "1.2.3" });
      expect(await probeVersion("http://listenarr:8686", "key", "listenarr")).toBe("1.2.3");
      expect(mockFetchJson).toHaveBeenCalledWith(expect.stringContaining("/api/v1/system/info"), expect.anything());
    });

    it("detects Plex version via /identity (no auth needed)", async () => {
      mockFetchJson.mockResolvedValue({ MediaContainer: { version: "1.40.5.9003" } });
      expect(await probeVersion("http://plex:32400", "", "plex")).toBe("1.40.5.9003");
      expect(mockFetchJson).toHaveBeenCalledWith(expect.stringContaining("/identity"), expect.anything());
    });

    it("Plex: returns empty string when version is absent from /identity", async () => {
      mockFetchJson.mockResolvedValue({ MediaContainer: {} });
      expect(await probeVersion("http://plex:32400", "", "plex")).toBe("");
    });
  });
});