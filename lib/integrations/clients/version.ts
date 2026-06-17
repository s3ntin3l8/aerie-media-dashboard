// ============================================================
// AERIE — Version detection (server-only)
// Detect version for saved services or probe with transient credentials.
// ============================================================
import "server-only";
import { IntegrationError, type HttpOpts } from "../http";
import { authedFetchJson, authedFetchRaw } from "../forwardAuth";
import { getServiceCredentials } from "../registry";
import { splitQbitCreds } from "./download";
import { splitBeszelCreds } from "./monitoring";

type ServiceKind =
  | "jellyfin"
  | "overseerr"
  | "arr" // Sonarr/Radarr/Whisparr — /api/v3
  | "arr-v1" // Prowlarr/Lidarr/Readarr — /api/v1
  | "bazarr" // own Flask API — /api/system/status?apikey=
  | "agregarr" // /api/v1/status (public)
  | "traefik" // raw Traefik /api/version, or the aggregator /api/snapshot (connectivity probe)
  | "wizarr" // /api/swagger.json info.version (X-API-Key)
  | "audiobookshelf" // /api/libraries (Bearer; no version field)
  | "nzbhydra" // /internalapi/updates/infos?apikey= → currentVersion
  | "nzbget" // JSON-RPC /jsonrpc "version" (Basic auth from "username:password" secret)
  | "qbittorrent" // WebUI v2 /api/v2/app/version (cookie session from "username:password" secret)
  | "tautulli"
  | "prometheus"
  | "gatus" // /api/v1/endpoints/statuses (optional Bearer; no version field)
  | "beszel" // PocketBase auth → /api/health (no version field)
  | "unraid" // GraphQL /graphql (x-api-key) → info.versions.core.unraid
  | "lazylibrarian" // /api?cmd=getVersion&apikey= → current_version (short SHA); always HTTP 200
  | "listenarr" // own /api/v1 (NOT the shared *arr API) — X-Api-Key; /system/info → version
  | "authentik" // /api/v3/admin/version/ (Bearer) → version_current; admin-namespaced ⇒ superuser check
  | "plex"; // /identity (no auth needed) → MediaContainer.version

function serviceKind(id: string): ServiceKind | null {
  const l = id.toLowerCase();
  if (l.includes("jellyfin") || l.includes("emby")) return "jellyfin";
  if (l.includes("overseerr") || l.includes("jellyseerr") || l.includes("seerr")) return "overseerr";
  // Order matters: match the specific apps before the v3 *arr family below
  // (e.g. "bazarr"/"agregarr" must not fall through to the v3 branch).
  if (l.includes("bazarr")) return "bazarr";
  if (l.includes("agregarr")) return "agregarr";
  if (l.includes("wizarr")) return "wizarr";
  if (l.includes("audiobookshelf")) return "audiobookshelf";
  if (l.includes("nzbget")) return "nzbget";
  if (l.includes("nzbhydra") || l.includes("hydra")) return "nzbhydra";
  if (l.includes("qbittorrent") || l.includes("qbit")) return "qbittorrent";
  if (l.includes("listenarr")) return "listenarr";
  if (l.includes("prowlarr") || l.includes("lidarr") || l.includes("readarr")) return "arr-v1";
  if (l.includes("sonarr") || l.includes("radarr") || l.includes("whisparr")) return "arr";
  if (l.includes("tautulli")) return "tautulli";
  if (l.includes("authentik")) return "authentik";
  if (l.includes("prometheus")) return "prometheus";
  if (l.includes("gatus")) return "gatus";
  if (l.includes("beszel")) return "beszel";
  if (l.includes("unraid")) return "unraid";
  if (l.includes("lazylib")) return "lazylibrarian";
  if (l.includes("plex")) return "plex";
  if (l.includes("traefik")) return "traefik"; // traefik / traefik-viewer / traefik-aggregator / raw instances
  return null;
}

/** Strip a leading "v"/"V" so stored versions are bare (the UI prepends its own "v"). */
function normalizeVersion(v: string | undefined | null): string | null {
  if (!v) return null;
  const s = v.trim().replace(/^v/i, "");
  // dev builds: "develop-{fullSHA}" → "develop-{7chars}"
  const dev = s.match(/^(develop-[0-9a-f]{7})[0-9a-f]*/i);
  return (dev ? dev[1] : s) || null;
}

async function fetchServiceVersion(serviceId: string, base: string, apiKey: string, kind: ServiceKind, insecureTls = false): Promise<string | null> {
  const b = base.replace(/\/$/, "");
  // Inject the service's TLS preference (and any authentik forward-auth) into every probe below
  // without touching each call site: these local bindings shadow the module afetch* for the rest
  // of this function only. A self-signed LAN host (e.g. Unraid) is reachable when its "allow
  // self-signed TLS" toggle is on, and a forward-auth'd service's stored outpost credential is
  // applied when serviceId names a saved service (a blank id / add-mode probe is a passthrough).
  const afetchJson = <T,>(url: string, opts: HttpOpts): Promise<T> => authedFetchJson<T>(serviceId, url, { ...opts, insecureTls });
  const afetchRaw = (url: string, opts: HttpOpts): Promise<Response> => authedFetchRaw(serviceId, url, { ...opts, insecureTls });
  if (kind === "jellyfin") {
    const d = await afetchJson<{ Version?: string }>(`${b}/System/Info`, {
      service: "version-detect",
      headers: apiKey ? { Authorization: `MediaBrowser Token="${apiKey}"` } : {},
    });
    return normalizeVersion(d.Version);
  }
  if (kind === "overseerr") {
    const d = await afetchJson<{ version?: string }>(`${b}/api/v1/status`, {
      service: "version-detect",
      headers: apiKey ? { "X-Api-Key": apiKey } : {},
    });
    return normalizeVersion(d.version);
  }
  if (kind === "arr" || kind === "arr-v1") {
    const apiVer = kind === "arr-v1" ? "v1" : "v3";
    const d = await afetchJson<{ version?: string }>(`${b}/api/${apiVer}/system/status`, {
      service: "version-detect",
      headers: apiKey ? { "X-Api-Key": apiKey } : {},
    });
    return normalizeVersion(d.version);
  }
  if (kind === "bazarr") {
    // Bazarr has its own (non-*arr) API; auth via ?apikey= like Tautulli.
    const d = await afetchJson<{ data?: { bazarr_version?: string } }>(
      `${b}/api/system/status?apikey=${encodeURIComponent(apiKey)}`,
      { service: "version-detect" },
    );
    return normalizeVersion(d.data?.bazarr_version);
  }
  if (kind === "agregarr") {
    // Public status endpoint (no auth) exposes the version.
    const d = await afetchJson<{ version?: string }>(`${b}/api/v1/status`, {
      service: "version-detect",
    });
    return normalizeVersion(d.version);
  }
  if (kind === "wizarr") {
    // The auto-generated swagger spec's info.version holds the app version.
    // /api/swagger.json is accessible without auth (or with the API key).
    const d = await afetchJson<{ info?: { version?: string } }>(`${b}/api/swagger.json`, {
      service: "version-detect",
      headers: apiKey ? { "X-API-Key": apiKey } : {},
    });
    return normalizeVersion(d.info?.version) ?? "";
  }
  if (kind === "audiobookshelf") {
    // Validate the token against an authenticated endpoint so a bad key fails the
    // connection test, then read the public /status endpoint for the server version.
    await afetchJson<unknown>(`${b}/api/libraries`, {
      service: "version-detect",
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    });
    const d = await afetchJson<{ serverVersion?: string }>(`${b}/status`, {
      service: "version-detect",
    });
    return normalizeVersion(d.serverVersion) ?? "";
  }
  if (kind === "nzbget") {
    // JSON-RPC "version"; the "apiKey" is the "username:password" Basic-auth pair.
    const d = await afetchJson<{ result?: string }>(`${b}/jsonrpc`, {
      service: "version-detect",
      method: "POST",
      headers: { Authorization: `Basic ${Buffer.from(apiKey).toString("base64")}`, "Content-Type": "application/json" },
      body: { method: "version", params: [] },
    });
    return normalizeVersion(d.result);
  }
  if (kind === "qbittorrent") {
    // Login with form-encoded credentials (SID cookie), then GET plain-text version.
    // The local afetchJson override (injecting insecureTls) doesn't work for the raw login
    // fetch, so we pass insecureTls explicitly via HttpOpts.
    const { username, password } = splitQbitCreds(apiKey);
    const loginRes = await afetchRaw(`${b}/api/v2/auth/login`, {
      service: "version-detect",
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Referer: b, Origin: b },
      body: `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
      insecureTls,
    });
    if (loginRes.status === 403) throw new IntegrationError("version-detect", "IP temporarily banned by qBittorrent");
    const setCookie = loginRes.headers.get("set-cookie") ?? "";
    // <5.x: "SID=…"; ≥5.x: "QBT_SID_<port>=…" — capture the full name=value pair.
    const cookieMatch = setCookie.match(/((?:QBT_SID_\w+|SID)=([^;]+))/);
    if (!cookieMatch) throw new IntegrationError("version-detect", "invalid qBittorrent credentials");
    const cookie = cookieMatch[1];
    const verRes = await afetchRaw(`${b}/api/v2/app/version`, {
      service: "version-detect",
      headers: { Cookie: cookie, Referer: b, Origin: b },
      insecureTls,
    });
    if (!verRes.ok) throw new IntegrationError("version-detect", `HTTP ${verRes.status}`);
    return normalizeVersion(await verRes.text());
  }
  if (kind === "nzbhydra") {
    // Spring Boot actuator /info is empty in the default LSIO package; use the internal
    // updates API which exposes currentVersion as plain JSON.
    const d = await afetchJson<{ currentVersion?: string }>(
      `${b}/internalapi/updates/infos?apikey=${encodeURIComponent(apiKey)}`,
      { service: "version-detect" },
    );
    return normalizeVersion(d.currentVersion) ?? "";
  }
  if (kind === "tautulli") {
    const d = await afetchJson<{ response?: { data?: { tautulli_version?: string } } }>(
      `${b}/api/v2?apikey=${encodeURIComponent(apiKey)}&cmd=get_tautulli_info`,
      { service: "version-detect" },
    );
    return normalizeVersion(d.response?.data?.tautulli_version);
  }
  if (kind === "gatus") {
    // Gatus exposes no version endpoint; hit the status endpoint to verify connectivity.
    await afetchJson<unknown>(`${b}/api/v1/endpoints/statuses`, {
      service: "version-detect",
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    });
    return "";
  }
  if (kind === "traefik") {
    // Two shapes: a raw Traefik exposes GET /api/version ({ Version }); the aggregator doesn't, so
    // fall back to /api/snapshot (the merged endpoint AERIE already reads) as a connectivity probe.
    // Both go through the local afetchJson → forward-auth + insecureTls aware, so this validates the
    // real outpost path. "" = connected without a version (the aggregator may surface one later via a
    // top-level `version` field). An optional basicAuth front uses "user:password".
    const headers: Record<string, string> = apiKey && apiKey.includes(":") ? { Authorization: `Basic ${Buffer.from(apiKey).toString("base64")}` } : {};
    try {
      const v = await afetchJson<{ Version?: string; version?: string }>(`${b}/api/version`, { service: "version-detect", headers });
      return normalizeVersion(v.Version ?? v.version) ?? "";
    } catch {
      const snap = await afetchJson<{ version?: string }>(`${b}/api/snapshot`, { service: "version-detect", headers });
      return normalizeVersion(snap.version) ?? "";
    }
  }
  if (kind === "beszel") {
    // Authenticate via PocketBase superuser and verify the connection; no version endpoint.
    // (Inlined rather than via beszelGet, which needs a stored ServiceClient — unavailable for
    // a transient add-mode probe. The local afetchJson still carries insecureTls + forward-auth.)
    const { identity, password } = splitBeszelCreds(apiKey);
    const auth = await afetchJson<{ token?: string }>(`${b}/api/collections/_superusers/auth-with-password`, {
      service: "version-detect",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: { identity, password },
    });
    if (!auth.token) throw new IntegrationError("version-detect", "beszel auth failed");
    await afetchJson<unknown>(`${b}/api/health`, { service: "version-detect", headers: { Authorization: auth.token } });
    return "";
  }
  if (kind === "unraid") {
    // Unraid 7.x GraphQL API: POST /graphql with an `x-api-key` header. The version lives at
    // info.versions.core.unraid (7.2+ integrated API); the older Connect plugin exposed it
    // flat at info.versions.unraid, so we fall back to that when the nested query yields nothing.
    // GraphQL surfaces field/auth errors as HTTP 400 (→ afetchJson throws → caught → null) or as
    // 200 with null data, so a bad key / wrong schema degrades to null rather than a wrong value.
    const ask = (query: string) =>
      afetchJson<{ data?: { info?: { versions?: { core?: { unraid?: string }; unraid?: string } } } }>(`${b}/graphql`, {
        service: "version-detect",
        method: "POST",
        headers: { "Content-Type": "application/json", ...(apiKey ? { "x-api-key": apiKey } : {}) },
        body: { query },
      }).catch(() => null);
    const nested = await ask("{ info { versions { core { unraid } } } }");
    const v = nested?.data?.info?.versions?.core?.unraid
      ?? (await ask("{ info { versions { unraid } } }"))?.data?.info?.versions?.unraid;
    return normalizeVersion(v);
  }
  if (kind === "lazylibrarian") {
    // LazyLibrarian always answers HTTP 200; auth failure is signalled only in the body
    // ({Success:false, Error:{Code:401}}), so check Success explicitly or a bad key would
    // falsely pass the connection test. Version fields are flat at top level, not under Data.
    const d = await afetchJson<{ Success?: boolean; current_version?: string }>(
      `${b}/api?cmd=getVersion&apikey=${encodeURIComponent(apiKey)}`,
      { service: "version-detect" },
    );
    if (!d.Success) throw new IntegrationError("version-detect", "LazyLibrarian auth failed");
    return normalizeVersion(d.current_version) ?? "";
  }
  if (kind === "listenarr") {
    // Listenarr's own /api/v1 (not the shared *arr API): /system/info carries the app
    // version and rejects bad/missing keys with 401, so it doubles as the connection test.
    const d = await afetchJson<{ version?: string }>(`${b}/api/v1/system/info`, {
      service: "version-detect",
      headers: apiKey ? { "X-Api-Key": apiKey } : {},
    });
    return normalizeVersion(d.version);
  }
  if (kind === "authentik") {
    // /api/v3/admin/version/ is admin-namespaced, so a 200 confirms the token is valid AND a
    // superuser (which AERIE requires for the apps/bindings reads). A non-superuser or bad token 403s.
    const d = await afetchJson<{ version_current?: string }>(`${b}/api/v3/admin/version/`, {
      service: "version-detect",
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    });
    return normalizeVersion(d.version_current);
  }
  if (kind === "plex") {
    // /identity is unauthenticated and returns the server version as JSON (Accept: application/json
    // is already set by afetchJson). Pass the token if available for future-proofing.
    const d = await afetchJson<{ MediaContainer?: { version?: string } }>(`${b}/identity`, {
      service: "version-detect",
      headers: apiKey ? { "X-Plex-Token": apiKey } : {},
    });
    return normalizeVersion(d.MediaContainer?.version) ?? "";
  }
  // prometheus
  const d = await afetchJson<{ data?: { version?: string } }>(`${b}/api/v1/status/buildinfo`, {
    service: "version-detect",
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
  });
  return normalizeVersion(d.data?.version);
}

/** Detect version for a saved service using its stored credentials. Returns null on failure or unknown type. */
export async function detectVersion(serviceId: string): Promise<string | null> {
  try {
    const kind = serviceKind(serviceId);
    if (!kind) return null;
    const c = await getServiceCredentials(serviceId);
    if (!c) return null;
    return await fetchServiceVersion(serviceId, c.baseUrl, c.apiKey ?? "", kind, c.insecureTls);
  } catch {
    return null;
  }
}

/** Probe a version endpoint with explicit (transient) credentials — no DB access. */
export async function probeVersion(baseUrl: string, apiKey: string, idHint: string, insecureTls = false): Promise<string | null> {
  try {
    const kind = serviceKind(idHint);
    if (!kind) return null;
    // Transient (add-mode) probe: the service isn't saved, so there's no stored forward-auth to
    // apply — pass an empty id, which authedFetch* treats as a passthrough.
    return await fetchServiceVersion("", baseUrl, apiKey, kind, insecureTls);
  } catch {
    return null;
  }
}