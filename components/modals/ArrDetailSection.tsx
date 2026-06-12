"use client";
// ============================================================
// AERIE — live Sonarr/Radarr detail for the media modal
// Lazily fetches getMediaDetail() (monitored / downloaded / quality) for a media
// item identified by tmdbId (movie) or arrId (series). Surfaces it in two places:
//   • arrBadges(detail)  → Downloaded / Monitored pills, rendered in the single
//     badges row below the title (next to the Overseerr status).
//   • <ArrQuality>       → the downloaded-quality block (movie file chip / per-season
//     grid), rendered below the synopsis, set off by a divider.
// One useMediaArrDetail() call per modal feeds both (single fetch).
// ============================================================
import React, { useEffect, useState } from "react";
import type { MediaArrDetail, MediaKind } from "@/lib/types";
import { Pill, Divider } from "@/components/primitives";
import { SectionLabel } from "@/components/modals/ModalShell";
import { getMediaDetail } from "@/app/(portal)/requests/actions";

function fmtGB(bytes?: number): string | undefined {
  return bytes == null || bytes <= 0 ? undefined : `${(bytes / 1e9).toFixed(1)} GB`;
}

/** Lazily load live *arr detail for a media item; null until resolved. */
export function useMediaArrDetail({ kind, tmdbId, arrId }: { kind: MediaKind; tmdbId?: number; arrId?: number }): MediaArrDetail | null {
  const [detail, setDetail] = useState<MediaArrDetail | null>(null);
  useEffect(() => {
    let live = true;
    if (tmdbId == null && arrId == null) {
      setDetail({});
      return;
    }
    getMediaDetail({ tmdbId, kind, arrId })
      .then((d) => { if (live) setDetail(d); })
      .catch(() => { if (live) setDetail({}); });
    return () => { live = false; };
  }, [kind, tmdbId, arrId]);
  return detail;
}

/** Downloaded / Monitored pills + studio for the title-area badges row (null when nothing to show). */
export function arrBadges(detail: MediaArrDetail | null): React.ReactNode {
  const d = detail ?? {};
  if (d.monitored == null && !d.hasFile && !d.studio) return null;
  return (
    <>
      {d.hasFile && <Pill tone="originator-own">Downloaded</Pill>}
      {d.monitored != null && (
        <Pill rawColor={d.monitored ? "var(--originator-court)" : "var(--on-surface-variant)"}>
          {d.monitored ? "Monitored" : "Unmonitored"}
        </Pill>
      )}
      {d.studio && <span style={{ fontSize: 11.5, color: "var(--on-surface-variant)" }}>{d.studio}</span>}
    </>
  );
}

function QualityCard({ title, label, sub }: { title: string; label: string; sub?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "8px 11px", borderRadius: 9, border: "1px solid var(--outline-variant)", background: "var(--surface-container-lowest)" }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--on-surface-variant)" }}>{title}</span>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--originator-own)" }}>{label || "—"}</span>
      {sub && <span style={{ fontSize: 10.5, color: "var(--on-surface-variant)" }}>{sub}</span>}
    </div>
  );
}

/**
 * Downloaded-quality block (below the synopsis), set off by a divider like the request
 * flow's sections. Only meaningful once the item is fully available — `available` gates
 * it so a requested-but-not-yet-available item shows nothing here (the request flow shows
 * the quality *selector* instead, and an available item shows what's downloaded).
 */
export function ArrQuality({
  kind,
  detail,
  fileInfoHint,
  available = true,
}: {
  kind: MediaKind;
  detail: MediaArrDetail | null;
  fileInfoHint?: { label: string; sizeBytes?: number };
  available?: boolean;
}) {
  const d = detail ?? {};
  const fileInfo = d.fileInfo ?? fileInfoHint;
  const seasons = d.seasons ?? [];
  const hasQuality = (kind === "movie" && Boolean(fileInfo)) || (kind === "series" && seasons.length > 0);
  if (!available || !hasQuality) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 16 }}>
      <Divider />
      <section>
        <SectionLabel hint={kind === "series" && seasons.length ? `${seasons.length} season${seasons.length === 1 ? "" : "s"}` : undefined}>
          Available quality
        </SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8 }}>
          {kind === "movie" && fileInfo && <QualityCard title="File" label={fileInfo.label} sub={fmtGB(fileInfo.sizeBytes)} />}
          {kind === "series" &&
            seasons.map((s) => (
              <QualityCard
                key={s.season}
                title={`Season ${s.season}`}
                label={s.label}
                sub={`${s.episodeCount} ep${s.episodeCount === 1 ? "" : "s"}${fmtGB(s.sizeBytes) ? ` · ${fmtGB(s.sizeBytes)}` : ""}`}
              />
            ))}
        </div>
      </section>
    </div>
  );
}
