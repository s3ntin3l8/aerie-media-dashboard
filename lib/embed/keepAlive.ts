// ============================================================
// AERIE — keep-alive embed helpers (pure, client-safe)
// Extracted from EmbedHost so the lazy-mount + prune logic is unit-testable
// without standing up the full provider/iframe tree.
// ============================================================

/** Parse the service id out of a `/s/<id>` pathname, else null. */
export function serviceIdFromPath(pathname: string | null | undefined): string | null {
  if (!pathname) return null;
  const m = /^\/s\/([^/]+)/.exec(pathname);
  return m ? decodeURIComponent(m[1]) : null;
}

/**
 * Reduce the set of mounted (kept-alive) embed ids.
 * - Lazy: the active id is added the first time it's opened.
 * - Prune: ids no longer in `keepIds` (flag turned off, service deactivated/deleted) drop out.
 * Returns the SAME array reference when nothing changed, so callers can skip a re-render.
 */
export function nextMountedIds(prev: string[], keepIds: string[], activeId: string | null): string[] {
  const allowed = new Set(keepIds);
  const kept = prev.filter((id) => allowed.has(id));
  const next = activeId && allowed.has(activeId) && !kept.includes(activeId) ? [...kept, activeId] : kept;
  return next.length === prev.length && next.every((id, i) => id === prev[i]) ? prev : next;
}
