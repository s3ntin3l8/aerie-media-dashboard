// ============================================================
// AERIE — state-aware "open in" links (pure, client-safe, unit-testable)
// Maps a media item's request state → an ordered list of link targets so a user
// can always jump to the right place: the request page, the *arr that's fetching
// it, or the media server it's available to watch on. Embed targets reuse the
// generic deep-link from #25 (/s/{svc}?at=path); external targets are absolute
// URLs (opened in a new tab). Kept pure like lib/embed/deepLink.ts.
// ============================================================
import type { MediaKind, RequestStatus } from "@/lib/types";
import { sanitizeEmbedPath } from "@/lib/embed/deepLink";

/** What a single resolved link points at. */
export type MediaLink =
  // opened inside the portal embed: router.push(`/s/${svc}?at=${deepPath}`) — no deepPath = service root
  | { svc: string; label: string; icon: string; kind: "embed"; deepPath?: string }
  // opened in a new tab at an absolute URL
  | { svc: string; label: string; icon: string; kind: "external"; href: string };

export interface MediaLinkItem {
  kind: MediaKind;
  state: RequestStatus | null;
  /** TMDB id (DiscoverItem.id is itself the TMDB id; MediaRequest carries tmdbId). */
  tmdbId?: number;
  /** Explicit *arr web path, e.g. "/movie/{slug}" (UpcomingItem.deepPath). */
  arrDeepPath?: string;
  /** Absolute *arr URL Overseerr resolved (we extract the path for the embed). */
  serviceUrl?: string;
  /** Absolute Plex web URL (from Overseerr) for an available item. */
  plexUrl?: string;
  /** Jellyfin library item id (from Overseerr) for an available item. */
  jellyfinItemId?: string;
}

export interface MediaLinkCtx {
  /** Active service ids (e.g. "overseerr", "radarr", "sonarr", "jellyfin"). */
  active: Set<string>;
  /** Service ids whose embed iframe is allowed. */
  embeddable: Set<string>;
  /** scheme://host for the Overseerr request/status page. */
  overseerrBase?: string;
  /** scheme://host for the Jellyfin external-tab fallback when it isn't embeddable. */
  jellyfinBase?: string;
}

/** Minimal service shape needed to resolve link context (subset of Service). */
export interface LinkServiceInfo {
  id: string;
  active: boolean;
  embeddable: boolean;
  scheme: string;
  host: string;
}

/** Build the link context from the client's (active-only) services list. */
export function linkCtxFromServices(services: LinkServiceInfo[]): MediaLinkCtx {
  const active = new Set<string>();
  const embeddable = new Set<string>();
  let overseerrBase: string | undefined;
  let jellyfinBase: string | undefined;
  for (const s of services) {
    if (!s.active) continue;
    active.add(s.id);
    if (s.embeddable) embeddable.add(s.id);
    const base = `${s.scheme}://${s.host}`;
    if (s.id === "overseerr") overseerrBase = base;
    if (s.id === "jellyfin") jellyfinBase = base;
  }
  return { active, embeddable, overseerrBase, jellyfinBase };
}

/** Pull a safe root-relative path out of an absolute URL (for embedding an *arr deep link). */
function pathFromUrl(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    return sanitizeEmbedPath(u.pathname + u.search + u.hash);
  } catch {
    return undefined;
  }
}

/**
 * Resolve the ordered "open in" links for a media item, by state:
 *   null                          → Overseerr (request page)
 *   pending/approved/processing   → Overseerr + Sonarr/Radarr
 *   available                     → Sonarr/Radarr + Plex and/or Jellyfin (watch)
 *   declined/failed               → Overseerr (status)
 * Only links whose service is active (and whose id is available) are emitted;
 * everything degrades to the service root / is dropped when ids are missing.
 */
export function mediaLinks(item: MediaLinkItem, ctx: MediaLinkCtx): MediaLink[] {
  const arrSvc = item.kind === "series" ? "sonarr" : "radarr";
  const arrLabel = item.kind === "series" ? "Sonarr" : "Radarr";

  const overseerr = (): MediaLink | null => {
    if (!ctx.active.has("overseerr") || !ctx.overseerrBase || item.tmdbId == null) return null;
    const path = `/${item.kind === "series" ? "tv" : "movie"}/${item.tmdbId}`;
    return { svc: "overseerr", label: "Open in Overseerr", icon: "open_in_new", kind: "external", href: ctx.overseerrBase + path };
  };

  const arr = (): MediaLink | null => {
    if (!ctx.active.has(arrSvc)) return null;
    // Prefer the explicit *arr slug path; else extract a path from Overseerr's serviceUrl; else root.
    const deepPath = sanitizeEmbedPath(item.arrDeepPath) ?? pathFromUrl(item.serviceUrl);
    return { svc: arrSvc, label: `Open in ${arrLabel}`, icon: "open_in_new", kind: "embed", deepPath };
  };

  // Plex's deep-link from Overseerr is a self-contained absolute URL (app.plex.tv),
  // so its presence is the signal Plex is the configured server — open it externally.
  const plex = (): MediaLink | null => {
    if (!item.plexUrl) return null;
    return { svc: "plex", label: "Watch on Plex", icon: "play_arrow", kind: "external", href: item.plexUrl };
  };

  const jellyfin = (): MediaLink | null => {
    if (!item.jellyfinItemId || !ctx.active.has("jellyfin")) return null;
    const path = `/web/#/details?id=${encodeURIComponent(item.jellyfinItemId)}`;
    if (ctx.embeddable.has("jellyfin")) {
      return { svc: "jellyfin", label: "Watch on Jellyfin", icon: "play_arrow", kind: "embed", deepPath: path };
    }
    if (ctx.jellyfinBase) {
      return { svc: "jellyfin", label: "Watch on Jellyfin", icon: "play_arrow", kind: "external", href: ctx.jellyfinBase + path };
    }
    return null;
  };

  let candidates: Array<MediaLink | null>;
  switch (item.state) {
    case "pending":
    case "approved":
    case "processing":
      candidates = [overseerr(), arr()];
      break;
    case "available":
      candidates = [arr(), plex(), jellyfin()];
      break;
    case "declined":
    case "failed":
    case null:
      candidates = [overseerr()];
      break;
    default:
      candidates = [];
  }
  return candidates.filter((l): l is MediaLink => l != null);
}
