import { describe, it, expect } from "vitest";
import { migrateLayout, type Tile } from "@/components/portal/gridLayout";

const tile = (type: string, settings?: Record<string, string | number | boolean>): Tile => ({
  uid: `${type}-1`, type, x: 0, y: 0, w: 3, h: 4, ...(settings ? { settings } : {}),
});

describe("migrateLayout — deprecated widget types", () => {
  it("rewrites prowlarr/nzbhydra to indexers with a seeded source", () => {
    const out = migrateLayout([tile("prowlarr"), tile("nzbhydra")]);
    expect(out.map((t) => t.type)).toEqual(["indexers", "indexers"]);
    expect(out[0].settings?.source).toBe("prowlarr");
    expect(out[1].settings?.source).toBe("nzbhydra");
  });

  it("rewrites lazylibrarian/listenarr to books with a seeded source", () => {
    const out = migrateLayout([tile("lazylibrarian"), tile("listenarr")]);
    expect(out.map((t) => t.type)).toEqual(["books", "books"]);
    expect(out[0].settings?.source).toBe("lazylibrarian");
    expect(out[1].settings?.source).toBe("listenarr");
  });

  it("rewrites qbittorrent to downloadClient, preserving its toggles", () => {
    const out = migrateLayout([tile("qbittorrent", { showSeeding: false })]);
    expect(out[0].type).toBe("downloadClient");
    expect(out[0].settings).toMatchObject({ source: "qbittorrent", showSeeding: false });
  });

  it("preserves existing settings and an explicit source override", () => {
    const out = migrateLayout([tile("lazylibrarian", { showWanted: false, source: "listenarr" })]);
    expect(out[0].settings).toMatchObject({ showWanted: false, source: "listenarr" });
  });

  it("leaves current widget types untouched and returns the same array reference", () => {
    const input = [tile("nowPlaying"), tile("indexers", { source: "prowlarr" })];
    expect(migrateLayout(input)).toBe(input);
  });
});
