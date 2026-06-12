// ============================================================
// AERIE — pure snapshot assembly helpers
// Source-tagging + Auto-resolution for the multi-source capabilities, and the
// per-source metrics map. Pulled out of getSnapshot() so the logic is unit-
// testable without a DB / live upstreams. Pure + isomorphic (no server-only).
// ============================================================
import type { LibraryStat, RecentItem } from "@/lib/types";
import type { NodeMetrics } from "@/lib/integrations/clients";
import { resolveBySource } from "@/lib/widgets/capabilities";

const MEDIA_PRIORITY = ["tautulli", "jellyfin"];

/**
 * Collect every configured source's library cards, tagged with `source`, and the
 * Auto-resolved view (Tautulli/Plex wins for media; Jellyfin only when Plex has
 * none; book/audiobook cards always appended).
 */
export function buildLibrary(parts: {
  tautulli?: LibraryStat[] | null;
  jellyfin?: LibraryStat[] | null;
  lazylibrarian?: LibraryStat[] | null;
  listenarr?: LibraryStat[] | null;
  playsCard?: LibraryStat | null;
}): { libraryAll: LibraryStat[]; library: LibraryStat[] } {
  const tag = (items: LibraryStat[] | null | undefined, source: string) => (items ?? []).map((c) => ({ ...c, source }));
  const libraryAll: LibraryStat[] = [
    ...tag(parts.tautulli, "tautulli"),
    ...(parts.playsCard ? [{ ...parts.playsCard, source: "tautulli" }] : []),
    ...tag(parts.jellyfin, "jellyfin"),
    ...tag(parts.lazylibrarian, "lazylibrarian"),
    ...tag(parts.listenarr, "listenarr"),
  ];
  return { libraryAll, library: resolveBySource(libraryAll, "", MEDIA_PRIORITY) };
}

/** Collect Tautulli + Jellyfin recently-added tagged; `recent` is the Auto winner. */
export function buildRecent(
  tautulli?: RecentItem[] | null,
  jellyfin?: RecentItem[] | null,
): { recentAll: RecentItem[]; recent: RecentItem[] } {
  const recentAll: RecentItem[] = [
    ...(tautulli ?? []).map((r) => ({ ...r, source: "tautulli" })),
    ...(jellyfin ?? []).map((r) => ({ ...r, source: "jellyfin" })),
  ];
  return { recentAll, recent: resolveBySource(recentAll, "", MEDIA_PRIORITY) };
}

/**
 * Host metrics keyed by source. `active` is the result for `metricsSource`; `alt`
 * is the other configured source (or null). Lets a Host Stats tile pick a source.
 */
export function buildMetricsBySource(
  metricsSource: "prometheus" | "beszel",
  active: NodeMetrics | null,
  alt: NodeMetrics | null,
): { prometheus: NodeMetrics | null; beszel: NodeMetrics | null } {
  return metricsSource === "beszel"
    ? { beszel: active, prometheus: alt }
    : { prometheus: active, beszel: alt };
}
