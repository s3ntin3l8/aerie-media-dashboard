// ============================================================
// AERIE — forward-auth (authentik) helper (server-only)
// Some upstreams sit behind authentik forward-auth: a request must satisfy the
// authentik outpost before it reaches the app. Rather than circumventing it, we
// authenticate THROUGH it with one of the two machine-to-machine flows from the
// operator handover:
//   • basic  — send the service-account user:password as HTTP Basic; the outpost
//              runs the token exchange and lets the request through.
//   • bearer — mint a short-lived JWT from authentik's token endpoint
//              (grant_type=client_credentials) and send Authorization: Bearer <jwt>.
//
// The config is stored as a JSON-encoded `forwardAuth`-kind service secret, SEPARATE
// from the upstream's own apiKey, so a service can carry both — get through the proxy
// AND authenticate to the app behind it (the app's own key must then ride a
// non-Authorization header, since forward-auth owns Authorization).
// ============================================================
import "server-only";
import { z } from "zod";
import { fetchJson, fetchRaw, IntegrationError, type HttpOpts } from "./http";
import { getServiceSecret } from "./registry";
import { createAuthCache } from "./tokenCache";

const forwardAuthSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal("basic"),
    username: z.string().min(1),
    password: z.string().min(1),
  }),
  z.object({
    method: z.literal("bearer"),
    tokenUrl: z.string().url(),
    clientId: z.string().min(1),
    username: z.string().min(1),
    password: z.string().min(1),
    scope: z.string().optional(),
  }),
]);

export type ForwardAuthConfig = z.infer<typeof forwardAuthSchema>;

/** Parse a raw forwardAuth secret JSON → validated config, or null if absent/malformed. */
export function parseForwardAuthConfig(raw: string | null): ForwardAuthConfig | null {
  if (!raw) return null;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    console.warn("[forward-auth] secret is not valid JSON, ignoring");
    return null;
  }
  const parsed = forwardAuthSchema.safeParse(json);
  if (!parsed.success) {
    console.warn(`[forward-auth] invalid config, ignoring — ${parsed.error.issues.map((i) => i.message).join("; ")}`);
    return null;
  }
  return parsed.data;
}

/** Read + validate a service's forward-auth config from its `forwardAuth`-kind secret. */
export async function getForwardAuthConfig(serviceId: string): Promise<ForwardAuthConfig | null> {
  return parseForwardAuthConfig(await getServiceSecret(serviceId, "forwardAuth"));
}

// ── Bearer JWT cache (shared single-flight cache, keyed by service id) ──
const bearerCache = createAuthCache<{ token: string; expMs: number }>({
  fresh: (v) => Date.now() < v.expMs - 30_000,
});

/** Decode a JWT's `exp` claim (no signature check) → epoch ms; fall back to +fallbackMs. */
export function jwtExpMs(token: string, fallbackMs = 30 * 60_000): number {
  try {
    const payload = token.split(".")[1];
    if (payload) {
      const json = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { exp?: number };
      if (typeof json.exp === "number") return json.exp * 1000;
    }
  } catch {
    /* unparsable — use the conservative fallback below */
  }
  return Date.now() + fallbackMs;
}

/** Mint (or reuse) a client-credentials JWT for a bearer service, cached until ~30s before expiry. */
async function mintBearer(
  serviceId: string,
  cfg: Extract<ForwardAuthConfig, { method: "bearer" }>,
  force = false,
): Promise<string> {
  // The token endpoint expects application/x-www-form-urlencoded; fetchJson JSON-stringifies
  // its body (see http.ts), so this path uses fetchRaw with a URLSearchParams body.
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: cfg.clientId,
    username: cfg.username,
    password: cfg.password,
    scope: cfg.scope || "openid",
  }).toString();
  const { token } = await bearerCache.get(
    serviceId,
    async () => {
      const res = await fetchRaw(cfg.tokenUrl, {
        service: "forward-auth",
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body,
      });
      if (!res.ok) throw new IntegrationError("forward-auth", `token endpoint HTTP ${res.status}`, res.status);
      const data = (await res.json()) as { access_token?: string };
      if (!data.access_token) throw new IntegrationError("forward-auth", "token endpoint returned no access_token");
      return { token: data.access_token, expMs: jwtExpMs(data.access_token) };
    },
    force,
  );
  return token;
}

/** The Authorization header that gets a request through this service's forward-auth outpost. */
export async function forwardAuthHeaders(
  serviceId: string,
  cfg: ForwardAuthConfig,
  force = false,
): Promise<Record<string, string>> {
  if (cfg.method === "basic") {
    return { Authorization: `Basic ${Buffer.from(`${cfg.username}:${cfg.password}`).toString("base64")}` };
  }
  return { Authorization: `Bearer ${await mintBearer(serviceId, cfg, force)}` };
}

/**
 * fetchJson, but first authenticate through the service's forward-auth outpost when one is
 * configured. No forward-auth config → a plain passthrough (zero behaviour change). The
 * forward-auth Authorization is merged LAST so it wins over any upstream Basic in opts.headers.
 * On 401/403 with a bearer flow the JWT is re-minted and the request retried once.
 */
export async function authedFetchJson<T>(serviceId: string, url: string, opts: HttpOpts): Promise<T> {
  const cfg = await getForwardAuthConfig(serviceId);
  if (!cfg) return fetchJson<T>(url, opts);
  const run = async (force: boolean) =>
    fetchJson<T>(url, { ...opts, headers: { ...opts.headers, ...(await forwardAuthHeaders(serviceId, cfg, force)) } });
  try {
    return await run(false);
  } catch (e) {
    if (cfg.method === "bearer" && e instanceof IntegrationError && (e.status === 401 || e.status === 403)) {
      return run(true);
    }
    throw e;
  }
}

/** fetchRaw counterpart of authedFetchJson. fetchRaw never throws on non-2xx, so callers that
 *  need 401-retry should use authedFetchJson; this is for best-effort/non-JSON endpoints. */
export async function authedFetchRaw(serviceId: string, url: string, opts: HttpOpts): Promise<Response> {
  const cfg = await getForwardAuthConfig(serviceId);
  if (!cfg) return fetchRaw(url, opts);
  return fetchRaw(url, { ...opts, headers: { ...opts.headers, ...(await forwardAuthHeaders(serviceId, cfg, false)) } });
}

/** Drop cached bearer tokens. Tests use this between cases; do not call from request paths. */
export function clearForwardAuthCache(): void {
  bearerCache.clear();
}
