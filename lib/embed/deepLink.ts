// ============================================================
// AERIE — embed deep-link helpers (pure, client-safe)
// Builds the iframe src for a service embed, optionally at a deep path
// (e.g. Radarr `/movie/{slug}`). Kept pure + unit-testable, like keepAlive.ts.
// ============================================================

/**
 * Accept only a root-relative path (`/movie/x`). Reject anything that could
 * point the frame off the configured host: protocol-relative `//host`, an
 * absolute URL with a scheme (`http:`), or backslashes. Returns undefined when
 * the input is empty or unsafe, so callers fall back to the base URL.
 */
export function sanitizeEmbedPath(at?: string | null): string | undefined {
  if (!at || !at.startsWith("/") || at.startsWith("//") || /[\\:]/.test(at)) return undefined;
  return at;
}

/** Compose the embed iframe src from the service origin plus an optional deep path. */
export function embedSrc(scheme: string, host: string, at?: string | null): string {
  const base = `${scheme}://${host}`;
  const path = sanitizeEmbedPath(at);
  return path ? base + path : base;
}
