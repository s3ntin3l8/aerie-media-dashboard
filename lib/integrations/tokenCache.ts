// ============================================================
// AERIE — generic auth-credential cache (server-only)
// Several upstreams need a short-lived credential (a JWT, a session cookie)
// minted from a longer-lived secret, then reused until it nears expiry. This
// is the shared shape behind beszel's superuser JWT, qBittorrent's SID cookie,
// and authentik forward-auth's bearer JWT: cache per key, coalesce concurrent
// mints (single-flight), and force a re-mint on expiry or a 401/403.
// ============================================================
import "server-only";

export interface AuthCache<T> {
  /** Return a fresh cached credential for `key`, or mint (coalescing concurrent callers). */
  get(key: string, mint: () => Promise<T>, force?: boolean): Promise<T>;
  /** Drop a cached credential (one key, or all). Used after a hard auth failure / in tests. */
  clear(key?: string): void;
}

/**
 * Build a per-key credential cache. `fresh(value)` decides whether a cached value is still
 * usable (e.g. JWT exp minus a 30s skew, or cookie age under its TTL); when it returns false
 * (or `force` is set) the value is re-minted. Concurrent mints for the same key share one
 * in-flight promise so a snapshot fan-out never stacks duplicate logins.
 */
export function createAuthCache<T>({ fresh }: { fresh: (value: T) => boolean }): AuthCache<T> {
  const cache = new Map<string, T>();
  const inflight = new Map<string, Promise<T>>();

  return {
    async get(key, mint, force = false) {
      if (!force) {
        const hit = cache.get(key);
        if (hit !== undefined && fresh(hit)) return hit;
        const pending = inflight.get(key);
        if (pending) return pending;
      }
      const p = (async () => {
        const value = await mint();
        cache.set(key, value);
        return value;
      })();
      inflight.set(key, p);
      try {
        return await p;
      } finally {
        inflight.delete(key);
      }
    },
    clear(key) {
      if (key === undefined) {
        cache.clear();
        inflight.clear();
      } else {
        cache.delete(key);
        inflight.delete(key);
      }
    },
  };
}
