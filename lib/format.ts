// ============================================================
// AERIE — shared value formatting (client-safe; NO "server-only")
// Pairs with lib/time.ts (durations / relative dates). Keep number/byte
// formatting here so panels, widgets and the integration clients all agree.
// ============================================================

/** Human-readable byte size ("1.4 TB", "820 GB", "512 MB", "—" for null). */
export function fmtBytes(b: number | null | undefined): string {
  if (b == null) return "—";
  const tb = b / 1_099_511_627_776;
  if (tb >= 1) return `${tb.toFixed(1)} TB`;
  const gb = b / 1_073_741_824;
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(b / 1_048_576).toFixed(0)} MB`;
}

/** Integer percentage of value/max, clamped to 0–100. Returns 0 when max is 0/absent. */
export function fmtPercent(value: number, max: number | null | undefined): number {
  if (!max) return 0;
  return Math.min(100, Math.max(0, Math.round((value / max) * 100)));
}

/** Bytes/sec → one-decimal megabit/sec string ("12.3"); caller appends the "Mbps" unit. */
export function fmtMbps(bps: number): string {
  return (bps / 1e6).toFixed(1);
}
