"use client";
// ============================================================
// AERIE — shared media-detail body
// One presentational body for every media-detail surface (Coming Soon modal,
// the request flow's info/confirm/review steps, and the Requests-list card),
// so poster size, meta row, badges, genre chips and overview stay consistent.
// Section order (full): serviceLinks bar → poster + details → release rows →
// overview → children (optional, e.g. quality selector / available qualities).
// Pure presentational: callers pass a normalized shape + optional slots
// (serviceLinks/badges/releaseRows/children/footer); no upstream/data concerns here.
// ============================================================
import React from "react";
import type { MediaKind } from "@/lib/types";
import { Icon, Chip, PosterTile } from "@/components/primitives";

export interface MediaDetailBodyProps {
  title: string;
  kind: MediaKind;
  art?: string;
  /** "full" = modals (poster 120, 18px title, overview/genres); "compact" = Requests-list card (poster 58, 14px title). */
  variant?: "full" | "compact";
  /** Backend "open in" links bar (Overseerr / Radarr / Sonarr), rendered at the very top (full variant). */
  serviceLinks?: React.ReactNode;
  /** Render the title inside the body. Off when the title already lives in the ModalShell header (Coming Soon). */
  showTitle?: boolean;
  /** Ordered meta parts joined with " · " after the kind icon, e.g. ["Movie","2024","166 min"]. */
  meta: string[];
  /** Critic/star rating (0–10); rendered amber after the meta when > 0. */
  rating?: number;
  /** Right-aligned node on the title row (e.g. a request-state Pill or resolution badge). */
  titleRight?: React.ReactNode;
  /** Episode label for series, e.g. "S02E05 · Title". */
  ep?: string;
  /** Status pills / studio etc., rendered below the meta row (full variant). */
  badges?: React.ReactNode;
  /** Genre names — capped at 5, rendered as <Chip> (full variant). */
  genres?: string[];
  /** Synopsis paragraph (full variant). */
  overview?: string;
  /** Fallback copy when there's no overview (full variant). Omit to render nothing. */
  emptyOverview?: string;
  /** Extra rows under the poster block, full width (e.g. release-date rows). */
  releaseRows?: React.ReactNode;
  /** Section-4 content under the overview (e.g. quality selector / available qualities). */
  children?: React.ReactNode;
  /** Compact-only: node pinned to the bottom of the meta column (e.g. the card's action row). */
  footer?: React.ReactNode;
}

export function MediaDetailBody({
  title,
  kind,
  art,
  variant = "full",
  serviceLinks,
  showTitle = variant === "compact",
  meta,
  rating,
  titleRight,
  ep,
  badges,
  genres,
  overview,
  emptyOverview,
  releaseRows,
  children,
  footer,
}: MediaDetailBodyProps) {
  const compact = variant === "compact";
  const isSeries = kind === "series";
  const posterW = compact ? 58 : 120;

  const metaRow = (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: compact ? 6 : 8,
        marginTop: showTitle ? 3 : 0,
        fontFamily: "var(--font-mono)",
        fontSize: compact ? 11 : 11.5,
        color: "var(--on-surface-variant)",
        flexWrap: "wrap",
      }}
    >
      <Icon name={isSeries ? "live_tv" : "movie"} size={compact ? 12 : 13} color="var(--on-surface-variant)" />
      {meta.join(" · ")}
      {rating != null && rating > 0 && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 3, color: "var(--amber)" }}>
          <Icon name="star" size={compact ? 11 : 13} fill />
          {rating}
        </span>
      )}
    </div>
  );

  const titleBlock = showTitle ? (
    compact ? (
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontFamily: "var(--font-headline)",
            fontWeight: 800,
            fontSize: 14,
            color: "var(--on-surface)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {title}
        </div>
        {metaRow}
      </div>
    ) : (
      <>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
          <h3 style={{ margin: 0, fontFamily: "var(--font-headline)", fontWeight: 800, fontSize: 18, color: "var(--on-surface)", lineHeight: 1.15 }}>
            {title}
          </h3>
          {titleRight && <span style={{ marginLeft: "auto" }}>{titleRight}</span>}
        </div>
        {metaRow}
      </>
    )
  ) : (
    metaRow
  );

  return (
    <>
      {!compact && serviceLinks && <div style={{ marginBottom: 16 }}>{serviceLinks}</div>}

      <div style={{ display: "flex", gap: compact ? 13 : 16, alignItems: "flex-start" }}>
        <PosterTile title={title} kind={kind} cat="request" w={posterW} art={art} />
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          {compact && titleRight ? (
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
              {titleBlock}
              <div style={{ display: "flex", gap: 5, alignItems: "center", flexShrink: 0 }}>{titleRight}</div>
            </div>
          ) : (
            titleBlock
          )}

          {ep && <div style={{ marginTop: 7, fontSize: 12.5, fontWeight: 600, color: "var(--on-surface)" }}>{ep}</div>}

          {badges && <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 9, flexWrap: "wrap" }}>{badges}</div>}

          {genres && genres.length > 0 && (
            <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
              {genres.slice(0, 5).map((g) => (
                <Chip key={g}>{g}</Chip>
              ))}
            </div>
          )}

          {footer && <div style={{ marginTop: "auto", paddingTop: 12 }}>{footer}</div>}
        </div>
      </div>

      {!compact && releaseRows}

      {!compact &&
        (overview ? (
          <p style={{ fontSize: 13, color: "var(--on-surface-variant)", marginTop: 16, lineHeight: 1.55 }}>{overview}</p>
        ) : emptyOverview ? (
          <p style={{ fontSize: 12.5, color: "var(--on-surface-variant)", marginTop: 16, fontStyle: "italic" }}>{emptyOverview}</p>
        ) : null)}

      {!compact && children}
    </>
  );
}
