// ============================================================
// AERIE — in-memory brute-force rate limiter for local login
// Pure module (no next-auth, no DB, no server-only) so it stays out of the
// edge-middleware bundle that imports auth.ts, and is unit-testable.
//
// Keyed by client IP, NOT email: keying on email would let anyone who knows a
// username lock that account out, and wouldn't slow an attacker rotating
// through addresses. State is per-process (resets on restart, not shared
// across instances) — sufficient for the single-container self-hosted deploy.
// ============================================================
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1_000; // 15 min
// Hard-cap the map so spoofed X-Forwarded-For values can't grow it without
// bound (mirrors the registry secretCache trim). Stale entries are swept on a
// throttled schedule; the cap is a backstop for a sustained distinct-IP spray.
const MAX_ENTRIES = 4_096;
const TRIM_INTERVAL_MS = 60_000;

type Attempt = { count: number; until: number };
const attempts = new Map<string, Attempt>();
let lastTrimAt = 0;

/** Best-effort client IP from proxy headers (Traefik sets X-Forwarded-For).
 *  Falls back to "unknown" — all un-attributable requests then share one
 *  bucket, which is the safe (more-limiting) default. */
export function clientIp(req: Request | undefined): string {
  const xff = req?.headers?.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = req?.headers?.get("x-real-ip")?.trim();
  return real || "unknown";
}

/** Evict expired entries, then hard-cap the map (drop soonest-to-expire first). */
function trim(now: number): void {
  for (const [k, v] of attempts) if (now > v.until) attempts.delete(k);
  if (attempts.size > MAX_ENTRIES) {
    const sorted = [...attempts.entries()].sort((a, b) => a[1].until - b[1].until);
    for (let i = 0; i < sorted.length - MAX_ENTRIES; i++) attempts.delete(sorted[i][0]);
  }
}

function maybeTrim(now: number): void {
  if (now - lastTrimAt > TRIM_INTERVAL_MS) {
    trim(now);
    lastTrimAt = now;
  }
}

export function isRateLimited(key: string, now: number = Date.now()): boolean {
  const entry = attempts.get(key);
  if (!entry) return false;
  if (now > entry.until) {
    attempts.delete(key);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}

export function recordFailedAttempt(key: string, now: number = Date.now()): void {
  maybeTrim(now);
  const entry = attempts.get(key);
  if (!entry || now > entry.until) {
    attempts.set(key, { count: 1, until: now + WINDOW_MS });
  } else {
    entry.count++;
  }
}

export function clearAttempts(key: string): void {
  attempts.delete(key);
}

/** Test-only: wipe all rate-limiter state. */
export function __resetRateLimiter(): void {
  attempts.clear();
  lastTrimAt = 0;
}

/** Test-only: number of tracked keys (to assert the cap/sweep bounds growth). */
export function __attemptCount(): number {
  return attempts.size;
}
