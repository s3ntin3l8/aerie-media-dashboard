// The demo preloads scripts/demo/fetch-hook.mjs into `next dev` so Overseerr posters (fetched
// server-side from image.tmdb.org by /api/artwork) are served by the fake upstream instead.
import { describe, expect, it, vi } from "vitest";
import { installTmdbRewrite } from "../../scripts/demo/fetch-hook.mjs";

const UPSTREAM = "http://127.0.0.1:3931";

function hooked() {
  const real = vi.fn(async (_input: unknown, _init?: unknown) => new Response("ok"));
  const target = { fetch: real } as unknown as typeof globalThis;
  installTmdbRewrite(target, UPSTREAM);
  return { real, fetch: target.fetch };
}

describe("installTmdbRewrite", () => {
  it("sends image.tmdb.org to the fake upstream, whether given a string, URL or Request", async () => {
    const { real, fetch } = hooked();
    const url = "https://image.tmdb.org/t/p/w342/demo-9101.jpg";
    await fetch(url, { cache: "no-store" });
    await fetch(new URL(url));
    await fetch(new Request(url));
    expect(real.mock.calls.map((c) => c[0])).toEqual(Array(3).fill(`${UPSTREAM}/tmdb/t/p/w342/demo-9101.jpg`));
    // The caller's options are passed through untouched.
    expect(real.mock.calls[0][1]).toEqual({ cache: "no-store" });
  });

  it("leaves every other host alone, including look-alikes", async () => {
    const { real, fetch } = hooked();
    for (const url of [
      "http://127.0.0.1:3931/tautulli/api/v2",
      "https://example.com/",
      "https://image.tmdb.org.evil.example/x.jpg",
      "http://image.tmdb.org/x.jpg",
    ])
      await fetch(url);
    expect(real.mock.calls.map((c) => c[0])).toEqual([
      "http://127.0.0.1:3931/tautulli/api/v2",
      "https://example.com/",
      "https://image.tmdb.org.evil.example/x.jpg",
      "http://image.tmdb.org/x.jpg",
    ]);
  });
});
