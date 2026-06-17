// ============================================================
// AERIE — shared TTL cache infrastructure (server-only)
// Generic module-scope TTL cache for slow-changing upstream reads. getSnapshot()
// polls every 3–12s, but disk space / calendars / leaderboards / issues change on
// the order of minutes-to-hours — caching avoids hammering self-hosted upstreams.
// Only successful results are cached (fn throws before we store), so a transient
// failure (turned into null by the facade's safe()) retries on the next poll.
// ============================================================
import "server-only";

const ttlCache = new Map<string, { at: number; value: unknown }>();
const ttlInflight = new Map<string, Promise<unknown>>();

export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = ttlCache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  // Coalesce concurrent refreshes so overlapping polls don't stack duplicate upstream calls.
  let refresh = ttlInflight.get(key) as Promise<T> | undefined;
  if (!refresh) {
    refresh = fn()
      .then((value) => {
        ttlCache.set(key, { at: Date.now(), value });
        return value;
      })
      .finally(() => ttlInflight.delete(key));
    ttlInflight.set(key, refresh);
  }
  // Stale-while-revalidate: serve a stale value instantly and refresh in the background,
  // so an upstream that's slow only when cold (e.g. Overseerr after idle) never blocks the
  // snapshot. Only a true cold miss (no prior value) awaits the fetch. On error the stale
  // value is kept and retried next poll (a cold miss rejects → caller's safe() → null).
  if (hit) {
    void refresh.catch(() => {});
    return hit.value as T;
  }
  return refresh;
}

export function bustCache(key: string): void {
  ttlCache.delete(key);
}

/** Drop every cached TTL entry. Tests use this between cases; do not call from request paths. */
export function clearTtlCache(): void {
  ttlCache.clear();
  ttlInflight.clear();
}
