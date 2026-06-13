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
import { Icon, PosterTile, ProgressBar } from "@/components/primitives";

export function NowPlayingChip({ sessions, accent }: { sessions: NowPlaying[]; accent: string }) {
  const router = useRouter();
  const s = sessions[0]; // primary = first session; extras summarised as "+N"
  const { pct } = useStreamProgress(s);
  const extra = sessions.length - 1;
  return (
    <button
      onClick={() => router.push("/streams")}
      className="btn btn-ghost btn-sm"
      title={sessions.map((x) => `${x.title} — ${x.user}${x.paused ? " (paused)" : ""}`).join("\n")}
      style={{ display: "inline-flex", alignItems: "center", gap: 8, maxWidth: 260, minWidth: 0, padding: "4px 8px" }}
    >
      <PosterTile title={s.title} kind={s.kind} cat="stream" w={18} ratio={s.kind === "track" ? 1 : 1.4} rounded={3} art={s.art} />
      <Icon name={s.paused ? "pause" : "play_arrow"} size={13} color={accent} />
      <span style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 3, flex: 1 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--on-surface)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 150 }}>
          {s.title}{extra > 0 ? ` +${extra}` : ""}
        </span>
        <span style={{ width: 90 }}><ProgressBar pct={pct} h={3} color={accent} /></span>
      </span>
    </button>
  );
}
