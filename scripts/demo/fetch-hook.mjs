/**
 * Preloaded into the demo's `next dev` (`NODE_OPTIONS=--import …`). Aerie's artwork proxy fetches
 * Overseerr posters server-side from `https://image.tmdb.org`, which a browser-side route can't
 * intercept and an offline demo can't reach. This rewrites exactly that host to the demo's fake
 * upstream, below the app's own host pin (which checks the URL before it calls fetch), so the
 * posters render in any browser, including the audit capture's. Without `DEMO_UPSTREAM_URL`
 * (every non-demo run) it does nothing.
 */
const TMDB = "https://image.tmdb.org/";

/** Wraps `target.fetch` so image.tmdb.org URLs go to `<upstreamUrl>/tmdb/…`. */
export function installTmdbRewrite(target, upstreamUrl) {
  const real = target.fetch;
  target.fetch = (input, init) => {
    const href = typeof input === "string" ? input : input instanceof URL ? input.href : input?.url;
    if (typeof href === "string" && href.startsWith(TMDB)) {
      const rewritten = `${upstreamUrl}/tmdb/${href.slice(TMDB.length)}`;
      // A Request carries its own signal, redirect mode, method and headers; rebuild it so the
      // caller's guards (e.g. redirect: "manual", an abort timeout) survive the rewrite.
      return real(input instanceof Request ? new Request(rewritten, input) : rewritten, init);
    }
    return real(input, init);
  };
}

if (process.env.DEMO_UPSTREAM_URL) installTmdbRewrite(globalThis, process.env.DEMO_UPSTREAM_URL);
