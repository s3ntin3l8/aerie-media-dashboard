// ============================================================
// AERIE — shared pure helpers used by multiple client modules
// ============================================================

/** Extract a TMDB id from a Plex/Tautulli guids array, e.g. ["tmdb://1234", …]. */
export function tmdbFromGuids(guids?: string[]): number | undefined {
  if (!Array.isArray(guids)) return undefined;
  for (const g of guids) {
    const m = /tmdb:\/\/(\d+)/.exec(String(g));
    if (m) return Number(m[1]);
  }
  return undefined;
}

/** Parse a numeric-ish field to a number, defaulting to 0 when empty. */
export const n = (v: string | number | undefined) => (v == null ? 0 : Number(v));

/** Format a number with en-US locale grouping. */
export const fmt = (v: number) => v.toLocaleString("en-US");

/** Strip channel-layout qualifiers, e.g. "5.1(side)" → "5.1". */
export const cleanLayout = (v: string | undefined): string | undefined => v?.replace(/\s*\([^)]*\)\s*/g, "").trim() || undefined;

/** Format seconds into a human-readable ETA string. */
export function fmtEtaSeconds(sec: number): string {
  if (sec <= 0) return "—";
  if (sec < 60) return `${Math.round(sec)}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
  return `${Math.floor(sec / 86400)}d`;
}
