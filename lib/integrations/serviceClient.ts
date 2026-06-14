// ============================================================
// AERIE — per-service request client (server-only)
// One place that owns everything needed to reach an upstream service: its
// baseUrl, decrypted apiKey, the self-signed-TLS preference, and any authentik
// forward-auth — all resolved ONCE per call. Clients build their app-specific
// auth header (X-Api-Key / Bearer / query-param / cookie / …) from `apiKey`,
// but no longer repeat `service:` / `insecureTls:` / the forward-auth wiring.
// ============================================================
import "server-only";
import { fetchJson, fetchRaw, IntegrationError, type HttpOpts } from "./http";
import { getServiceCredentials } from "./registry";
import { getForwardAuthConfig, forwardAuthHeaders } from "./forwardAuth";

/** Request options for a ServiceClient call: HttpOpts minus the bits the client owns.
 *  `service` (the log label) defaults to the service id; override only when a friendlier
 *  label helps. `path` is appended to baseUrl unless it's already an absolute URL. */
export type ServiceReqOpts = Omit<HttpOpts, "service" | "insecureTls"> & { service?: string };

export interface ServiceClient {
  id: string;
  baseUrl: string;        // trailing slash stripped
  apiKey: string | null;  // decrypted; null only when constructed with requireKey:false
  insecureTls: boolean;
  json<T>(path: string, opts?: ServiceReqOpts): Promise<T>;
  raw(path: string, opts?: ServiceReqOpts): Promise<Response>;
}

const joinUrl = (baseUrl: string, path: string) => (/^https?:\/\//i.test(path) ? path : `${baseUrl}${path}`);

/**
 * Build a request client for a configured service. Resolves credentials + forward-auth config
 * once; `json`/`raw` then apply the service id (for forward-auth), insecureTls and the log label
 * automatically, merging the forward-auth Authorization LAST (it wins over the app's own), and
 * re-minting + retrying once on a bearer 401/403.
 *
 * `requireKey` (default true) throws when no apiKey is stored — matching the old `creds()` guard;
 * pass `false` for key-optional sources (gatus, prometheus, loki, traefik/agregarr public).
 */
export async function serviceClient(id: string, opts?: { requireKey?: true }): Promise<ServiceClient & { apiKey: string }>;
export async function serviceClient(id: string, opts: { requireKey: false }): Promise<ServiceClient>;
export async function serviceClient(id: string, opts: { requireKey?: boolean } = {}): Promise<ServiceClient> {
  const { requireKey = true } = opts;
  const c = await getServiceCredentials(id);
  if (!c) throw new IntegrationError(id, "not configured");
  if (requireKey && !c.apiKey) throw new IntegrationError(id, "not configured (no API key)");
  const baseUrl = c.baseUrl.replace(/\/$/, "");
  const insecureTls = c.insecureTls;
  const faCfg = await getForwardAuthConfig(id);

  const buildOpts = async (o: ServiceReqOpts, force: boolean): Promise<HttpOpts> => ({
    ...o,
    service: o.service ?? id,
    insecureTls,
    headers: { ...o.headers, ...(faCfg ? await forwardAuthHeaders(id, faCfg, force) : {}) },
  });

  return {
    id,
    baseUrl,
    apiKey: c.apiKey,
    insecureTls,
    async json<T>(path: string, o: ServiceReqOpts = {}): Promise<T> {
      const url = joinUrl(baseUrl, path);
      const run = async (force: boolean) => fetchJson<T>(url, await buildOpts(o, force));
      try {
        return await run(false);
      } catch (e) {
        // A bearer outpost can expire mid-poll; re-mint once and retry. (No retry for raw — its
        // callers, e.g. qBittorrent login, inspect status themselves.)
        if (faCfg?.method === "bearer" && e instanceof IntegrationError && (e.status === 401 || e.status === 403)) {
          return run(true);
        }
        throw e;
      }
    },
    async raw(path: string, o: ServiceReqOpts = {}): Promise<Response> {
      return fetchRaw(joinUrl(baseUrl, path), await buildOpts(o, false));
    },
  };
}
