// ============================================================
// AERIE — integration HTTP helper (server-only)
// Every upstream call goes through a bounded-timeout fetch that
// throws typed errors, so the data facade can degrade per-panel.
// ============================================================
import "server-only";
import { fetch as undiciFetch, Agent } from "undici";

// One shared dispatcher (with its own connection pool) for cert-verification-off calls.
// Created lazily so normal deployments never instantiate it. Node's *global* fetch rejects
// a dispatcher from the installed undici (different internal instance — "invalid onRequestStart
// method"), so the insecure path below uses undici's own fetch, which matches this Agent.
let insecureAgent: Agent | undefined;
const getInsecureAgent = (): Agent => (insecureAgent ??= new Agent({ connect: { rejectUnauthorized: false } }));

export class IntegrationError extends Error {
  constructor(
    public service: string,
    message: string,
    public status?: number,
  ) {
    super(`[${service}] ${message}`);
    this.name = "IntegrationError";
  }
}

export interface HttpOpts {
  service: string;
  timeoutMs?: number;
  headers?: Record<string, string>;
  method?: string;
  body?: unknown;
  /** skip TLS cert verification (self-signed/internal hosts). Off by default. */
  insecureTls?: boolean;
}

/**
 * Like fetchJson but returns the raw Response object instead of parsing JSON.
 * Use for endpoints that return non-JSON bodies (e.g. qBittorrent login → text/plain)
 * or where you need response headers (Set-Cookie).
 * Does NOT throw on non-2xx — the caller must inspect res.status / res.ok.
 */
export async function fetchRaw(url: string, opts: HttpOpts): Promise<Response> {
  const { service, timeoutMs = 5000, headers = {}, method = "GET", body, insecureTls = false } = opts;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const init = {
      method,
      headers: { ...headers },
      body: body != null ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
      signal: ctrl.signal,
      cache: "no-store" as const,
    };
    return (insecureTls
      ? await undiciFetch(url, { ...init, dispatcher: getInsecureAgent() })
      : await fetch(url, init)) as unknown as Response;
  } catch (e) {
    if (e instanceof IntegrationError) throw e;
    throw new IntegrationError(service, e instanceof Error ? e.message : String(e));
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson<T>(url: string, opts: HttpOpts): Promise<T> {
  const { service, timeoutMs = 5000, headers = {}, method = "GET", body, insecureTls = false } = opts;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const init = {
      method,
      headers: { Accept: "application/json", ...headers },
      body: body != null ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
      cache: "no-store" as const,
    };
    // insecureTls → undici's own fetch with a verification-off dispatcher; otherwise the
    // standard global fetch (which keeps normal cert validation for every other upstream).
    const res = insecureTls
      ? await undiciFetch(url, { ...init, dispatcher: getInsecureAgent() })
      : await fetch(url, init);
    if (!res.ok) throw new IntegrationError(service, `HTTP ${res.status} for ${url}`, res.status);
    return (await res.json()) as T;
  } catch (e) {
    if (e instanceof IntegrationError) throw e;
    throw new IntegrationError(service, e instanceof Error ? e.message : String(e));
  } finally {
    clearTimeout(timer);
  }
}
