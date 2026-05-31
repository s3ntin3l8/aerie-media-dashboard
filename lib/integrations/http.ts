// ============================================================
// AERIE — integration HTTP helper (server-only)
// Every upstream call goes through a bounded-timeout fetch that
// throws typed errors, so the data facade can degrade per-panel.
// ============================================================
import "server-only";

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
}

export async function fetchJson<T>(url: string, opts: HttpOpts): Promise<T> {
  const { service, timeoutMs = 5000, headers = {}, method = "GET", body } = opts;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      headers: { Accept: "application/json", ...headers },
      body: body != null ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new IntegrationError(service, `HTTP ${res.status} for ${url}`, res.status);
    return (await res.json()) as T;
  } catch (e) {
    if (e instanceof IntegrationError) throw e;
    throw new IntegrationError(service, e instanceof Error ? e.message : String(e));
  } finally {
    clearTimeout(timer);
  }
}
