"use client";
// ============================================================
// AERIE — live Sonarr/Radarr detail for the media modal
// Lazily fetches getMediaDetail() (monitored / downloaded / quality) for a media
// item identified by tmdbId (movie) or arrId (series) and renders, additively to
// Overseerr's request-status pill:
//   • a badges row — Downloaded / Monitored (live *arr state)
//   • a downloaded-quality block — movie file chip, or a per-season grid
// Used by both the discover/info view (DiscoverItem) and the review/detail view
// (MediaRequest) so the same picture shows everywhere.
// ============================================================
import React, { useEffect, useState } from "react";
import type { MediaArrDetail, MediaKind } from "@/lib/types";
import { Pill } from "@/components/primitives";
import { SectionLabel } from "@/components/modals/ModalShell";
import { getMediaDetail } from "@/app/(portal)/requests/actions";

function fmtGB(bytes?: number): string | undefined {
  return bytes == null || bytes <= 0 ? undefined : `${(bytes / 1e9).toFixed(1)} GB`;
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

export function ArrDetailSection({
  kind,
  tmdbId,
  arrId,
  /** Movie FileInfo already known from the snapshot (avoids waiting on the fetch). */
  fileInfoHint,
}: {
  kind: MediaKind;
  tmdbId?: number;
  arrId?: number;
  fileInfoHint?: { label: string; sizeBytes?: number };
}) {
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

  const d = detail ?? {};
  const fileInfo = d.fileInfo ?? fileInfoHint;
  const seasons = d.seasons ?? [];
  const hasBadges = d.monitored != null || d.hasFile;
  const hasQuality = Boolean(fileInfo) || seasons.length > 0;
  if (!hasBadges && !hasQuality) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {hasBadges && (
        <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
          {d.hasFile && <Pill tone="originator-own">Downloaded</Pill>}
          {d.monitored != null && (
            <Pill rawColor={d.monitored ? "var(--originator-court)" : "var(--on-surface-variant)"}>
              {d.monitored ? "Monitored" : "Unmonitored"}
            </Pill>
          )}
        </div>
      )}
      {hasQuality && (
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
      )}
    </div>
  );
}
