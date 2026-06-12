"use client";
// ============================================================
// AERIE — Coming Soon detail modal (read-only)
// Surfaces the rich calendar metadata for an upcoming Radarr/Sonarr release.
// These items are already in the *arr pipeline (not requestable), so there's
// no request flow — just details + a button to open the service in our embed.
// ============================================================
import React from "react";
import type { UpcomingItem } from "@/lib/types";
import { Pill } from "@/components/primitives";
import { ModalShell } from "@/components/modals/ModalShell";
import { MediaDetailBody } from "@/components/modals/MediaDetailBody";
import { MediaLinks } from "@/components/modals/MediaLinks";
import type { MediaLink } from "@/lib/media/links";

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

  // Section 2: backend "open in" link to the *arr that's tracking this release.
  const serviceLinks: MediaLink[] = [
    { svc: item.svc, label: `Open in ${svcLabel}`, icon: "open_in_new", role: "service", kind: "embed", deepPath: item.deepPath },
  ];

  return (
    <ModalShell
      open
      onClose={onClose}
      icon="event_upcoming"
      accent={ACCENT}
      title="Coming soon"
      sub={fmtFull(item.when)}
      width={620}
    >
      <div style={{ padding: "18px 20px 22px" }}>
        <MediaDetailBody
          title={item.title}
          kind={item.kind}
          art={item.art}
          variant="full"
          showTitle
          serviceLinks={<MediaLinks links={serviceLinks} onOpenService={onOpenService} />}
          meta={meta}
          rating={item.rating}
          ep={item.ep}
          badges={
            (item.studio || item.monitored != null || item.hasFile) ? (
              <>
                {item.hasFile && <Pill tone="originator-own">Downloaded</Pill>}
                {item.monitored != null && (
                  <Pill rawColor={item.monitored ? ACCENT : "var(--on-surface-variant)"}>
                    {item.monitored ? "Monitored" : "Unmonitored"}
                  </Pill>
                )}
                {item.studio && <span style={{ fontSize: 11.5, color: "var(--on-surface-variant)" }}>{item.studio}</span>}
              </>
            ) : undefined
          }
          genres={item.genres}
          overview={item.overview}
          emptyOverview="No synopsis available."
          releaseRows={
            hasReleaseRows ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 16 }}>
                <ReleaseRow label="In cinemas" iso={item.inCinemas} />
                <ReleaseRow label="Digital" iso={item.digitalRelease} />
                <ReleaseRow label="Physical" iso={item.physicalRelease} />
              </div>
            ) : undefined
          }
        />
      </div>
    </ModalShell>
  );
}
