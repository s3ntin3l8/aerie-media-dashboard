"use client";
// ============================================================
// AERIE — Coming Soon detail modal (read-only)
// Surfaces the rich calendar metadata for an upcoming Radarr/Sonarr release.
// These items are already in the *arr pipeline (not requestable), so there's
// no request flow — just details + a button to open the service in our embed.
// ============================================================
import React from "react";
import type { UpcomingItem } from "@/lib/types";
import { Icon, Pill, Chip, PosterTile } from "@/components/primitives";
import { ModalShell } from "@/components/modals/ModalShell";

const ACCENT = "var(--originator-court)";

function fmtFull(iso?: string): string | undefined {
  if (!iso) return undefined;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return undefined;
  return new Date(t).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function ReleaseRow({ label, iso }: { label: string; iso?: string }) {
  const when = fmtFull(iso);
  if (!when) return null;
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 12 }}>
      <span style={{ width: 78, flexShrink: 0, color: "var(--on-surface-variant)" }}>{label}</span>
      <span style={{ fontFamily: "var(--font-mono)", color: "var(--on-surface)" }}>{when}</span>
    </div>
  );
}

export function UpcomingDetailModal({
  item,
  onClose,
  onOpenService,
}: {
  item: UpcomingItem;
  onClose: () => void;
  onOpenService: (svc: string, at?: string) => void;
}) {
  const isSeries = item.kind === "series";
  const svcLabel = item.svc.charAt(0).toUpperCase() + item.svc.slice(1);
  const meta: string[] = [isSeries ? "Series" : "Movie"];
  if (item.year) meta.push(String(item.year));
  if (item.runtime) meta.push(`${item.runtime} min`);

  const hasReleaseRows = !isSeries && (item.inCinemas || item.digitalRelease || item.physicalRelease);

  return (
    <ModalShell
      open
      onClose={onClose}
      icon="event_upcoming"
      accent={ACCENT}
      title={item.title}
      sub={fmtFull(item.when)}
      width={620}
      footer={
        <button className="btn btn-primary btn-sm" style={{ marginLeft: "auto" }} onClick={() => onOpenService(item.svc, item.deepPath)}>
          <Icon name="open_in_new" size={15} /> Open in {svcLabel}
        </button>
      }
    >
      <div style={{ padding: "18px 20px 22px" }}>
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
          <PosterTile title={item.title} kind={item.kind} cat="request" w={96} art={item.art} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--on-surface-variant)", flexWrap: "wrap" }}>
              <Icon name={isSeries ? "live_tv" : "movie"} size={13} />
              {meta.join(" · ")}
              {item.rating != null && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 3, color: "var(--amber)" }}>
                  <Icon name="star" size={13} fill />
                  {item.rating}
                </span>
              )}
            </div>

            {item.ep && (
              <div style={{ marginTop: 7, fontSize: 12.5, fontWeight: 600, color: "var(--on-surface)" }}>{item.ep}</div>
            )}

            {(item.studio || item.monitored != null || item.hasFile) && (
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 9, flexWrap: "wrap" }}>
                {item.hasFile && <Pill tone="originator-own">Downloaded</Pill>}
                {item.monitored != null && (
                  <Pill rawColor={item.monitored ? ACCENT : "var(--on-surface-variant)"}>
                    {item.monitored ? "Monitored" : "Unmonitored"}
                  </Pill>
                )}
                {item.studio && (
                  <span style={{ fontSize: 11.5, color: "var(--on-surface-variant)" }}>{item.studio}</span>
                )}
              </div>
            )}

            {item.genres && item.genres.length > 0 && (
              <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                {item.genres.slice(0, 5).map((g) => (
                  <Chip key={g}>{g}</Chip>
                ))}
              </div>
            )}
          </div>
        </div>

        {hasReleaseRows && (
          <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 16 }}>
            <ReleaseRow label="In cinemas" iso={item.inCinemas} />
            <ReleaseRow label="Digital" iso={item.digitalRelease} />
            <ReleaseRow label="Physical" iso={item.physicalRelease} />
          </div>
        )}

        {item.overview ? (
          <p style={{ fontSize: 13, color: "var(--on-surface-variant)", marginTop: 16, lineHeight: 1.55 }}>{item.overview}</p>
        ) : (
          <p style={{ fontSize: 12.5, color: "var(--on-surface-variant)", marginTop: 16, fontStyle: "italic" }}>No synopsis available.</p>
        )}
      </div>
    </ModalShell>
  );
}
