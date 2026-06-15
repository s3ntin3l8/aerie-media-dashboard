"use client";
// ============================================================
// AERIE — NowPlayingChip
// ------------------------------------------------------------
// Compact live now-playing indicator for the embedded service-view header
// (ServiceView, Launcher.tsx). Rendered only when there is ≥1 active session
// for the service, so useStreamProgress is always called unconditionally. It
// reuses the snapshot's now-playing data + the shared progress hook so the bar
// advances smoothly between polls. Clicking opens the full Streams view.
// ============================================================
import { useRouter } from "next/navigation";
import type { NowPlaying } from "@/lib/types";
import { useStreamProgress } from "@/components/hooks/useStreamProgress";
import { Icon, PosterTile, ProgressBar, TRUNCATE } from "@/components/primitives";
import { fmtTime } from "@/lib/time";

export function NowPlayingChip({ sessions, accent, compact = false }: { sessions: NowPlaying[]; accent: string; compact?: boolean }) {
  const router = useRouter();
  const s = sessions[0]; // primary = first session; extras summarised as "+N"
  const { cur, pct } = useStreamProgress(s);
  const extra = sessions.length - 1;
  const total = s.dur * 60;
  // `compact` (mobile header) trims to poster + icon + bar; the desktop chip is roomier and
  // adds the elapsed/total runtime under the title.
  const posterW = compact ? 20 : 26;
  const barW = compact ? 96 : 132;
  const titleMax = compact ? 130 : 190;
  return (
    <button
      onClick={() => router.push("/streams")}
      className="btn btn-ghost btn-sm"
      title={sessions.map((x) => `${x.title} — ${x.user}${x.paused ? " (paused)" : ""}`).join("\n")}
      style={{ display: "inline-flex", alignItems: "center", gap: 9, maxWidth: compact ? 230 : 340, minWidth: 0, padding: "4px 9px" }}
    >
      <PosterTile title={s.title} kind={s.kind} cat="stream" w={posterW} ratio={s.kind === "track" ? 1 : 1.4} rounded={4} art={s.art} />
      <Icon name={s.paused ? "pause" : "play_arrow"} size={15} color={accent} />
      <span style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 3, flex: 1 }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--on-surface)", ...TRUNCATE, maxWidth: titleMax }}>
          {s.title}{extra > 0 ? ` +${extra}` : ""}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ width: barW }}><ProgressBar pct={pct} h={4} color={accent} /></span>
          {total > 0 && (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--on-surface-variant)", whiteSpace: "nowrap" }}>
              {fmtTime(cur)} / {fmtTime(total)}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}
