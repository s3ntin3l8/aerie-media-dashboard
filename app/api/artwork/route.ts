import { NextRequest, NextResponse } from "next/server";
import { getServiceCredentials } from "@/lib/integrations/registry";

// Server-side cover-art proxy. Resolves the upstream image URL with the
// service's stored credentials (never exposed to the client) and streams
// the bytes back. Used by PosterTile via /api/artwork?svc=…&ref=…
export const dynamic = "force-dynamic";

function upstreamUrl(svc: string, baseUrl: string, apiKey: string | null, ref: string): string | null {
  const base = baseUrl.replace(/\/$/, "");
  switch (svc) {
    case "tautulli":
      if (!apiKey) return null;
      return `${base}/api/v2?apikey=${apiKey}&cmd=pms_image_proxy&img=${encodeURIComponent(ref)}&width=300&height=450&fallback=poster`;
    case "jellyfin":
      return `${base}/Items/${encodeURIComponent(ref)}/Images/Primary?fillHeight=450&fillWidth=300&quality=90${apiKey ? `&api_key=${apiKey}` : ""}`;
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
  if (!svc || !ref) return new NextResponse("missing svc/ref", { status: 400 });

  const creds = await getServiceCredentials(svc);
  if (!creds) return new NextResponse("unknown service", { status: 404 });

  const url = upstreamUrl(svc, creds.baseUrl, creds.apiKey, ref);
  if (!url) return new NextResponse("unsupported", { status: 400 });

  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(6000) });
    if (!res.ok || !res.body) return new NextResponse("upstream error", { status: 502 });
    return new NextResponse(res.body, {
      status: 200,
      headers: {
        "Content-Type": res.headers.get("content-type") || "image/jpeg",
        // posters are immutable enough to cache briefly in the browser
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return new NextResponse("fetch failed", { status: 502 });
  }
}
