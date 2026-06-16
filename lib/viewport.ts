// ============================================================
// AERIE — viewport heuristics (client-safe; NO "server-only")
// ============================================================

/**
 * Classify a request `User-Agent` as a phone-class device.
 *
 * This is only used to **seed the first paint** server-side so the SSR shell and
 * the client's first render agree (no flash, no hydration mismatch). Authoritative
 * width detection happens client-side via `matchMedia` after mount, which refines
 * edge cases (desktop window resize, tablets). `iPad` is intentionally omitted —
 * iPadOS reports a desktop (Mac) UA, and landscape iPads are a legitimate desktop
 * target; the post-mount refinement corrects genuinely narrow viewports. A missing
 * or empty UA seeds desktop (`false`), matching the prior "desktop when unsure" default.
 */
export function isMobileUserAgent(ua: string | null | undefined): boolean {
  if (!ua) return false;
  return /Android|iPhone|iPod|Windows Phone|BlackBerry|Opera Mini|IEMobile|Mobile/i.test(ua);
}
