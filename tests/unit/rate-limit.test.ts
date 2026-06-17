import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  isRateLimited,
  recordFailedAttempt,
  clearAttempts,
  clientIp,
  __resetRateLimiter,
  __attemptCount,
} from "@/lib/auth/rateLimit";

// ── helpers ──────────────────────────────────────────────────
const ip = "1.2.3.4";
const now = 1_000_000; // arbitrary fixed base ms

beforeEach(() => {
  __resetRateLimiter();
  vi.useFakeTimers();
  vi.setSystemTime(now);
});
afterEach(() => {
  vi.useRealTimers();
});

// ── clientIp ─────────────────────────────────────────────────
describe("clientIp()", () => {
  const makeReq = (headers: Record<string, string> = {}) =>
    new Request("http://localhost/api/auth/callback/credentials", { headers });

  it("extracts the first IP from X-Forwarded-For (Traefik)", () => {
    expect(clientIp(makeReq({ "x-forwarded-for": "10.0.0.1, 10.0.0.2" }))).toBe("10.0.0.1");
  });

  it("falls back to X-Real-IP when X-Forwarded-For is absent", () => {
    expect(clientIp(makeReq({ "x-real-ip": "10.1.2.3" }))).toBe("10.1.2.3");
  });

  it("returns 'unknown' when neither header is present", () => {
    expect(clientIp(makeReq())).toBe("unknown");
  });

  it("returns 'unknown' when request is undefined", () => {
    expect(clientIp(undefined)).toBe("unknown");
  });

  it("trims whitespace from X-Forwarded-For entries", () => {
    expect(clientIp(makeReq({ "x-forwarded-for": "  192.168.1.1  , 10.0.0.1" }))).toBe(
      "192.168.1.1",
    );
  });
});

// ── isRateLimited / recordFailedAttempt basics ────────────────
describe("rate limiter — core logic", () => {
  it("is not limited initially", () => {
    expect(isRateLimited(ip, now)).toBe(false);
  });

  it("is not limited after fewer than MAX_ATTEMPTS failures", () => {
    recordFailedAttempt(ip, now);
    recordFailedAttempt(ip, now);
    recordFailedAttempt(ip, now);
    recordFailedAttempt(ip, now);
    expect(isRateLimited(ip, now)).toBe(false);
  });

  it("is limited after MAX_ATTEMPTS (5) failures within the window", () => {
    for (let i = 0; i < 5; i++) recordFailedAttempt(ip, now);
    expect(isRateLimited(ip, now)).toBe(true);
  });

  it("remains limited after additional failures beyond MAX_ATTEMPTS", () => {
    for (let i = 0; i < 8; i++) recordFailedAttempt(ip, now);
    expect(isRateLimited(ip, now)).toBe(true);
  });
});

// ── window expiry ─────────────────────────────────────────────
describe("rate limiter — window expiry", () => {
  it("is no longer limited after the 15-min window expires", () => {
    for (let i = 0; i < 5; i++) recordFailedAttempt(ip, now);
    const afterWindow = now + 15 * 60 * 1_000 + 1;
    expect(isRateLimited(ip, afterWindow)).toBe(false);
  });

  it("still limited 1 ms before window expires", () => {
    for (let i = 0; i < 5; i++) recordFailedAttempt(ip, now);
    const justBefore = now + 15 * 60 * 1_000 - 1;
    expect(isRateLimited(ip, justBefore)).toBe(true);
  });

  it("new window starts fresh after the old one expires", () => {
    for (let i = 0; i < 5; i++) recordFailedAttempt(ip, now);
    const afterWindow = now + 15 * 60 * 1_000 + 1;
    // One more failure after the old window → new window starts at count 1
    recordFailedAttempt(ip, afterWindow);
    expect(isRateLimited(ip, afterWindow)).toBe(false);
  });
});

// ── clearAttempts ─────────────────────────────────────────────
describe("clearAttempts()", () => {
  it("resets a limited IP after a successful login", () => {
    for (let i = 0; i < 5; i++) recordFailedAttempt(ip, now);
    expect(isRateLimited(ip, now)).toBe(true);
    clearAttempts(ip);
    expect(isRateLimited(ip, now)).toBe(false);
  });

  it("is a no-op when the IP has no tracked failures", () => {
    expect(() => clearAttempts("9.9.9.9")).not.toThrow();
  });

  it("only clears the targeted IP, not others", () => {
    const other = "5.6.7.8";
    for (let i = 0; i < 5; i++) recordFailedAttempt(ip, now);
    for (let i = 0; i < 5; i++) recordFailedAttempt(other, now);
    clearAttempts(ip);
    expect(isRateLimited(ip, now)).toBe(false);
    expect(isRateLimited(other, now)).toBe(true);
  });
});

// ── per-IP independence ───────────────────────────────────────
describe("rate limiter — per-IP isolation", () => {
  it("tracks different IPs independently", () => {
    const ip2 = "9.9.9.9";
    for (let i = 0; i < 5; i++) recordFailedAttempt(ip, now);
    expect(isRateLimited(ip, now)).toBe(true);
    expect(isRateLimited(ip2, now)).toBe(false);
  });
});

// ── memory-growth protection (trim / cap) ─────────────────────
describe("rate limiter — bounded memory growth", () => {
  it("caps the map at MAX_ENTRIES (4096) after a trim sweep", () => {
    // maybeTrim fires once per 60s window (keyed by time, not entry count).
    // On the very first call, lastTrimAt=0 so the trim fires immediately —
    // but the map is empty so nothing is removed. Subsequent calls in the
    // same time window don't trigger another trim.
    //
    // Strategy: add 5000 unique IPs at the same timestamp `now` so only the
    // first call triggers the (empty-map) trim. Then advance the clock past
    // TRIM_INTERVAL and add one more entry — that fires the real trim, which
    // sweeps stale entries and hard-caps at MAX_ENTRIES. The final size should
    // be MAX_ENTRIES (post-cap) + 1 (the trigger entry itself).
    for (let i = 0; i < 5_000; i++) {
      recordFailedAttempt(`10.${Math.floor(i / 65536) % 256}.${Math.floor(i / 256) % 256}.${i % 256}`, now);
    }
    expect(__attemptCount()).toBe(5_000); // no trim has fired since the empty-map one

    // Trigger a trim sweep by advancing past TRIM_INTERVAL_MS (60 s).
    const sweep = now + 60_001;
    recordFailedAttempt("1.1.1.1", sweep);

    // cap trim: 5000 → 4096, then +1 for the trigger entry itself = 4097
    expect(__attemptCount()).toBeLessThanOrEqual(4_097);
  });

  it("stale entries are evicted when the trim fires", () => {
    // Fill with entries that will be stale by sweep time
    for (let i = 0; i < 10; i++) recordFailedAttempt(`192.168.0.${i}`, now);
    // Advance past both the 15-min window AND the 60s trim interval
    const afterWindowAndTrim = now + 15 * 60 * 1_000 + 60_001;
    // One new record after the trim interval triggers the sweep
    recordFailedAttempt("1.1.1.1", afterWindowAndTrim);
    // All the stale IPs should be gone; only the new entry remains
    expect(__attemptCount()).toBe(1);
  });
});
