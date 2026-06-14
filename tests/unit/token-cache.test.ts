import { describe, it, expect, vi } from "vitest";
import { createAuthCache } from "@/lib/integrations/tokenCache";

describe("createAuthCache", () => {
  it("serves a fresh cached value without re-minting", async () => {
    const mint = vi.fn(async () => ({ v: "tok" }));
    const cache = createAuthCache<{ v: string }>({ fresh: () => true });
    expect(await cache.get("k", mint)).toEqual({ v: "tok" });
    expect(await cache.get("k", mint)).toEqual({ v: "tok" });
    expect(mint).toHaveBeenCalledTimes(1); // second call served from cache
  });

  it("re-mints when the cached value is stale", async () => {
    let fresh = true;
    let n = 0;
    const mint = vi.fn(async () => ({ n: ++n }));
    const cache = createAuthCache<{ n: number }>({ fresh: () => fresh });
    expect(await cache.get("k", mint)).toEqual({ n: 1 });
    fresh = false; // cached value is now considered stale
    expect(await cache.get("k", mint)).toEqual({ n: 2 });
    expect(mint).toHaveBeenCalledTimes(2);
  });

  it("force re-mints even when the cached value is fresh", async () => {
    let n = 0;
    const mint = vi.fn(async () => ({ n: ++n }));
    const cache = createAuthCache<{ n: number }>({ fresh: () => true });
    await cache.get("k", mint);
    expect(await cache.get("k", mint, true)).toEqual({ n: 2 });
    expect(mint).toHaveBeenCalledTimes(2);
  });

  it("coalesces concurrent mints for the same key (single-flight)", async () => {
    let resolve!: (v: { n: number }) => void;
    const mint = vi.fn(() => new Promise<{ n: number }>((r) => (resolve = r)));
    const cache = createAuthCache<{ n: number }>({ fresh: () => true });
    const a = cache.get("k", mint);
    const b = cache.get("k", mint); // arrives while the first mint is in flight
    resolve({ n: 1 });
    expect(await a).toEqual({ n: 1 });
    expect(await b).toEqual({ n: 1 });
    expect(mint).toHaveBeenCalledTimes(1); // both callers shared one mint
  });

  it("keeps separate entries per key", async () => {
    const mint = vi.fn(async (key: string): Promise<{ id: string }> => ({ id: key }));
    const cache = createAuthCache<{ id: string }>({ fresh: () => true });
    expect(await cache.get("a", () => mint("a"))).toEqual({ id: "a" });
    expect(await cache.get("b", () => mint("b"))).toEqual({ id: "b" });
    expect(await cache.get("a", () => mint("a"))).toEqual({ id: "a" }); // a still cached
    expect(mint).toHaveBeenCalledTimes(2); // one mint per distinct key
  });

  it("clear(key) drops one entry; clear() drops all", async () => {
    let n = 0;
    const mint = vi.fn(async () => ({ n: ++n }));
    const cache = createAuthCache<{ n: number }>({ fresh: () => true });
    await cache.get("a", mint); // n=1
    await cache.get("b", mint); // n=2
    cache.clear("a");
    expect(await cache.get("a", mint)).toEqual({ n: 3 }); // a re-minted
    expect(await cache.get("b", mint)).toEqual({ n: 2 }); // b still cached
    cache.clear(); // drop everything
    expect(await cache.get("b", mint)).toEqual({ n: 4 }); // b re-minted
  });

  it("does not cache a failed mint (next call retries)", async () => {
    let attempt = 0;
    const mint = vi.fn(async () => {
      attempt++;
      if (attempt === 1) throw new Error("boom");
      return { ok: true };
    });
    const cache = createAuthCache<{ ok: boolean }>({ fresh: () => true });
    await expect(cache.get("k", mint)).rejects.toThrow("boom");
    expect(await cache.get("k", mint)).toEqual({ ok: true }); // retried, then cached
    expect(mint).toHaveBeenCalledTimes(2);
  });
});
