import { describe, it, expect } from "vitest";
import { mediaLinks, linkCtxFromServices, type MediaLinkCtx, type MediaLink } from "@/lib/media/links";

// A context with everything wired: overseerr + both *arr + jellyfin (embeddable).
const fullCtx: MediaLinkCtx = {
  active: new Set(["overseerr", "radarr", "sonarr", "jellyfin"]),
  embeddable: new Set(["radarr", "sonarr", "jellyfin"]),
  overseerrBase: "https://requests.example.com",
  jellyfinBase: "https://jelly.example.com",
};

const svcs = (l: MediaLink[]) => l.map((x) => x.svc);

describe("mediaLinks — state matrix", () => {
  it("null state → Overseerr request page only", () => {
    const l = mediaLinks({ kind: "movie", state: null, tmdbId: 42 }, fullCtx);
    expect(svcs(l)).toEqual(["overseerr"]);
    expect(l[0]).toMatchObject({ kind: "external", href: "https://requests.example.com/movie/42" });
  });

  it("declined/failed → Overseerr status only", () => {
    expect(svcs(mediaLinks({ kind: "movie", state: "declined", tmdbId: 1 }, fullCtx))).toEqual(["overseerr"]);
    expect(svcs(mediaLinks({ kind: "series", state: "failed", tmdbId: 1 }, fullCtx))).toEqual(["overseerr"]);
  });

  it("pending/approved/processing → Overseerr + the matching *arr", () => {
    for (const state of ["pending", "approved", "processing"] as const) {
      const movie = mediaLinks({ kind: "movie", state, tmdbId: 7, arrDeepPath: "/movie/dune" }, fullCtx);
      expect(svcs(movie)).toEqual(["overseerr", "radarr"]);
      const series = mediaLinks({ kind: "series", state, tmdbId: 7, arrDeepPath: "/series/the-bear" }, fullCtx);
      expect(svcs(series)).toEqual(["overseerr", "sonarr"]);
    }
  });

  it("available → *arr + watch (Plex and/or Jellyfin)", () => {
    const l = mediaLinks(
      { kind: "movie", state: "available", tmdbId: 7, arrDeepPath: "/movie/dune", plexUrl: "https://app.plex.tv/x", jellyfinItemId: "abc" },
      fullCtx,
    );
    expect(svcs(l)).toEqual(["radarr", "plex", "jellyfin"]);
  });
});

describe("mediaLinks — *arr routing & embed paths", () => {
  it("movie routes to Radarr, series to Sonarr", () => {
    expect(mediaLinks({ kind: "movie", state: "approved", tmdbId: 1 }, fullCtx)[1].svc).toBe("radarr");
    expect(mediaLinks({ kind: "series", state: "approved", tmdbId: 1 }, fullCtx)[1].svc).toBe("sonarr");
  });

  it("prefers the explicit arrDeepPath for the embed", () => {
    const l = mediaLinks({ kind: "movie", state: "approved", tmdbId: 1, arrDeepPath: "/movie/dune" }, fullCtx);
    expect(l[1]).toMatchObject({ kind: "embed", deepPath: "/movie/dune" });
  });

  it("falls back to the path extracted from Overseerr's serviceUrl", () => {
    const l = mediaLinks({ kind: "movie", state: "approved", tmdbId: 1, serviceUrl: "https://radarr.lan:7878/movie/12345" }, fullCtx);
    expect(l[1]).toMatchObject({ kind: "embed", deepPath: "/movie/12345" });
  });

  it("emits an embed with no deepPath (service root) when neither slug nor serviceUrl is available", () => {
    const l = mediaLinks({ kind: "movie", state: "approved", tmdbId: 1 }, fullCtx);
    expect(l[1]).toMatchObject({ svc: "radarr", kind: "embed" });
    expect((l[1] as { deepPath?: string }).deepPath).toBeUndefined();
  });
});

describe("mediaLinks — watch link classification", () => {
  it("Plex is an external link using the absolute plexUrl", () => {
    const l = mediaLinks({ kind: "movie", state: "available", tmdbId: 1, plexUrl: "https://app.plex.tv/desktop#!/x" }, fullCtx);
    expect(l.find((x) => x.svc === "plex")).toMatchObject({ kind: "external", href: "https://app.plex.tv/desktop#!/x" });
  });

  it("Jellyfin is an embed when jellyfin is embeddable", () => {
    const l = mediaLinks({ kind: "movie", state: "available", tmdbId: 1, jellyfinItemId: "abc" }, fullCtx);
    expect(l.find((x) => x.svc === "jellyfin")).toMatchObject({ kind: "embed", deepPath: "/web/#/details?id=abc" });
  });

  it("Jellyfin falls back to an external link when not embeddable", () => {
    const ctx: MediaLinkCtx = { ...fullCtx, embeddable: new Set(["radarr", "sonarr"]) };
    const l = mediaLinks({ kind: "movie", state: "available", tmdbId: 1, jellyfinItemId: "abc" }, ctx);
    expect(l.find((x) => x.svc === "jellyfin")).toMatchObject({ kind: "external", href: "https://jelly.example.com/web/#/details?id=abc" });
  });

  it("shows both Plex and Jellyfin when both are present", () => {
    const l = mediaLinks(
      { kind: "movie", state: "available", tmdbId: 1, plexUrl: "https://app.plex.tv/x", jellyfinItemId: "abc" },
      fullCtx,
    );
    expect(svcs(l).filter((s) => s === "plex" || s === "jellyfin")).toEqual(["plex", "jellyfin"]);
  });
});

describe("mediaLinks — graceful gating", () => {
  it("drops Overseerr when it's inactive or there's no tmdbId", () => {
    expect(mediaLinks({ kind: "movie", state: null, tmdbId: undefined }, fullCtx)).toEqual([]);
    const noOverseerr: MediaLinkCtx = { ...fullCtx, active: new Set(["radarr"]) };
    expect(mediaLinks({ kind: "movie", state: null, tmdbId: 1 }, noOverseerr)).toEqual([]);
  });

  it("drops the *arr link when that service is inactive", () => {
    const ctx: MediaLinkCtx = { ...fullCtx, active: new Set(["overseerr"]) };
    expect(svcs(mediaLinks({ kind: "movie", state: "approved", tmdbId: 1 }, ctx))).toEqual(["overseerr"]);
  });

  it("drops Jellyfin when inactive even if an id is present", () => {
    const ctx: MediaLinkCtx = { ...fullCtx, active: new Set(["radarr"]) };
    const l = mediaLinks({ kind: "movie", state: "available", tmdbId: 1, jellyfinItemId: "abc" }, ctx);
    expect(svcs(l)).toEqual(["radarr"]);
  });
});

describe("mediaLinks — roles & decoupled watch", () => {
  it("tags Overseerr/*arr as service and Plex/Jellyfin as watch", () => {
    const l = mediaLinks(
      { kind: "movie", state: "available", tmdbId: 1, arrDeepPath: "/movie/x", plexUrl: "https://app.plex.tv/x", jellyfinItemId: "abc" },
      fullCtx,
    );
    expect(l.find((x) => x.svc === "radarr")?.role).toBe("service");
    expect(l.find((x) => x.svc === "plex")?.role).toBe("watch");
    expect(l.find((x) => x.svc === "jellyfin")?.role).toBe("watch");
  });

  it("emits the watch link even when the item isn't 'available' (e.g. partially available → processing)", () => {
    const l = mediaLinks(
      { kind: "series", state: "processing", tmdbId: 1, arrDeepPath: "/series/x", plexUrl: "https://app.plex.tv/x" },
      fullCtx,
    );
    expect(svcs(l)).toEqual(["overseerr", "sonarr", "plex"]);
    expect(l.find((x) => x.svc === "plex")?.role).toBe("watch");
  });

  it("does not emit a watch link when no media-server id is present", () => {
    const l = mediaLinks({ kind: "movie", state: "available", tmdbId: 1, arrDeepPath: "/movie/x" }, fullCtx);
    expect(svcs(l)).toEqual(["radarr"]);
  });
});

describe("linkCtxFromServices", () => {
  it("builds active/embeddable sets and overseerr/jellyfin bases from the services list", () => {
    const ctx = linkCtxFromServices([
      { id: "overseerr", active: true, embeddable: true, scheme: "https", host: "requests.example.com" },
      { id: "radarr", active: true, embeddable: false, scheme: "https", host: "radarr.example.com" },
      { id: "jellyfin", active: true, embeddable: true, scheme: "http", host: "jelly.lan:8096" },
      { id: "sonarr", active: false, embeddable: true, scheme: "https", host: "sonarr.example.com" },
    ]);
    expect(ctx.active).toEqual(new Set(["overseerr", "radarr", "jellyfin"]));
    expect(ctx.embeddable).toEqual(new Set(["overseerr", "jellyfin"]));
    expect(ctx.overseerrBase).toBe("https://requests.example.com");
    expect(ctx.jellyfinBase).toBe("http://jelly.lan:8096");
  });
});
