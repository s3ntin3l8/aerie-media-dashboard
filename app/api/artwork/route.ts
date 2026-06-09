import { NextRequest, NextResponse } from "next/server";
import { getServiceCredentials } from "@/lib/integrations/registry";

// Server-side cover-art proxy. Resolves the upstream image URL with the
// service's stored credentials (never exposed to the client) and streams
// the bytes back. Used by PosterTile via /api/artwork?svc=…&ref=…
export const dynamic = "force-dynamic";

type Kind = "poster" | "backdrop" | "avatar";

// Target dimensions per artwork kind: tall poster, wide backdrop, square avatar.
const DIMS: Record<Kind, { w: number; h: number }> = {
  poster: { w: 300, h: 450 },
  backdrop: { w: 960, h: 540 },
  avatar: { w: 80, h: 80 },
};

// Browser cache lifetime per kind. Posters/backdrops for a given ref are immutable
// (a movie's artwork doesn't change), so cache them for a month and skip revalidation.
// Avatars can change (a user swaps their photo) so keep them shorter.
const CACHE_CONTROL: Record<Kind, string> = {
  poster: "private, max-age=2592000, immutable",
  backdrop: "private, max-age=2592000, immutable",
  avatar: "private, max-age=86400",
};

// Blocks SSRF via user-supplied `ref` URLs for sonarr/radarr remoteUrl passthrough.
function isPrivateHost(url: string): boolean {
  try {
    const { hostname, protocol } = new URL(url);
    if (protocol !== "http:" && protocol !== "https:") return true;
    return (
      hostname === "localhost" ||
      hostname === "::1" ||
      /^127\./.test(hostname) ||
      /^10\./.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^169\.254\./.test(hostname) ||
      hostname.endsWith(".local")
    );
  } catch {
    return true;
  }
}

function upstreamUrl(svc: string, baseUrl: string, apiKey: string | null, ref: string, kind: Kind): string | null {
  const base = baseUrl.replace(/\/$/, "");
  const { w, h } = DIMS[kind];
  switch (svc) {
    case "tautulli":
      if (!apiKey) return null;
      // pms_image_proxy proxies both Plex library image paths and external URLs
      // (e.g. a plex.tv user_thumb avatar), so the same call serves every kind.
      return `${base}/api/v2?apikey=${apiKey}&cmd=pms_image_proxy&img=${encodeURIComponent(ref)}&width=${w}&height=${h}&fallback=${kind === "backdrop" ? "art" : "poster"}`;
    case "jellyfin": {
      if (kind === "avatar") {
        // ref is a Jellyfin user id
        return `${base}/Users/${encodeURIComponent(ref)}/Images/Primary?width=${w}&height=${h}&quality=90${apiKey ? `&api_key=${apiKey}` : ""}`;
      }
      const imageType = kind === "backdrop" ? "Backdrop" : "Primary";
      return `${base}/Items/${encodeURIComponent(ref)}/Images/${imageType}?fillHeight=${h}&fillWidth=${w}&quality=${kind === "backdrop" ? 85 : 90}${apiKey ? `&api_key=${apiKey}` : ""}`;
    }
    case "audiobookshelf":
      if (!apiKey) return null;
      // ref is a library-item id (li_…); the cover endpoint accepts ?token= for GET requests.
      // ABS now-playing only requests "poster" kind (tracks have no backdrop).
      return `${base}/api/items/${encodeURIComponent(ref)}/cover?token=${encodeURIComponent(apiKey)}`;
    case "overseerr":
      // ref is a TMDB poster_path (e.g. "/b8VtW6I.jpg"); proxy through to avoid
      // exposing the TMDB CDN directly and to apply our cache headers.
      return `https://image.tmdb.org/t/p/w342${ref}`;
    case "sonarr":
    case "radarr":
      // ref is either a full external URL (remoteUrl) or a local path (/MediaCover/…)
      if (ref.startsWith("http")) return ref;
      return `${base}${ref}?apikey=${apiKey ?? ""}`;
    default:
      return null;
  }
}

export async function GET(req: NextRequest) {
  const svc = req.nextUrl.searchParams.get("svc") || "";
  const ref = req.nextUrl.searchParams.get("ref") || "";
  const kindParam = req.nextUrl.searchParams.get("kind") || "poster";
  const kind: Kind = kindParam === "backdrop" || kindParam === "avatar" ? kindParam : "poster";
  if (!svc || !ref) return new NextResponse("missing svc/ref", { status: 400 });

  const creds = await getServiceCredentials(svc);
  if (!creds) return new NextResponse("unknown service", { status: 404 });

  const url = upstreamUrl(svc, creds.baseUrl, creds.apiKey, ref, kind);
  if (!url) return new NextResponse("unsupported", { status: 400 });
  if (isPrivateHost(url)) return new NextResponse("forbidden", { status: 403 });

  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(6000) }); // lgtm[js/request-forgery]
    if (!res.ok || !res.body) return new NextResponse("upstream error", { status: 502 });
    return new NextResponse(res.body, {
      status: 200,
      headers: {
        "Content-Type": res.headers.get("content-type") || "image/jpeg",
        "Cache-Control": CACHE_CONTROL[kind],
      },
    });
  } catch {
    return new NextResponse("fetch failed", { status: 502 });
  }
}
