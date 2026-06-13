// ============================================================
// AERIE — shared time formatting (client-safe; NO "server-only")
// ============================================================

/** Format a duration in seconds as "M:SS" (under an hour) or "H:MM:SS". */
export function fmtTime(totalSec: number): string {
  totalSec = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}
