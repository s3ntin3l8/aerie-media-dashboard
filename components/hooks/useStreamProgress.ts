"use client";
// ============================================================
// AERIE — useStreamProgress
// ------------------------------------------------------------
// Live playback position interpolation, extracted from the
// NowPlayingPanel render loop. Both NowPlayingPanel and
// MobileStreams derive their progress bars and elapsed-time
// counters from this hook — one source of truth.
//
// Design notes:
// • elapsed is relative to the LAST snapshot fetch (fetchedAt),
//   not to component mount, so the clock resets on each poll and
//   stays in sync with Tautulli/Plex rather than drifting.
// • When paused, elapsed is zeroed so the bar doesn't advance.
// • cur is clamped to [0, dur*60] so we never overshoot.
// ============================================================
import { useEffect, useState } from "react";
import { useTick } from "@/components/panels";
import { useSnapshotTime } from "@/components/portal/DataProvider";
import type { NowPlaying } from "@/lib/types";

export interface StreamProgress {
  /** Current playback position in seconds. */
  cur: number;
  /** Progress as a 0–100 percentage. */
  pct: number;
}

/**
 * Returns a live-interpolated playback position for a stream.
 * Ticks every second; resets on snapshot refresh.
 */
export function useStreamProgress(s: Pick<NowPlaying, "pos" | "dur" | "paused">): StreamProgress {
  const now = useTick(1000);
  const fetchedAt = useSnapshotTime();
  // Interpolate the live position only AFTER mount. On the server render and the first client render
  // `ticking` is false, so both compute elapsed=0 → cur = pos (identical) — otherwise the ticking
  // MM:SS elapsed would diverge between server and client and cause a hydration mismatch (React
  // #418). There's no visible jump: it starts at the snapshot position and advances after mount.
  const [ticking, setTicking] = useState(false);
  useEffect(() => setTicking(true), []);
  const elapsed = ticking && !s.paused ? (now - fetchedAt) / 1000 : 0;
  const totalSec = s.dur * 60;
  const cur = Math.min(totalSec, s.pos * totalSec + elapsed);
  const pct = totalSec > 0 ? (cur / totalSec) * 100 : 0;
  return { cur, pct };
}
