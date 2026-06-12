"use client";
// ============================================================
// AERIE — state-aware "open in" links row
// Renders the targets resolved by lib/media/links.ts: embed targets navigate the
// in-app service embed (/s/{svc}?at=path) via onOpenService; external targets are
// plain new-tab anchors. Used inside MediaDetailBody's `links` slot.
// ============================================================
import React from "react";
import type { MediaLink } from "@/lib/media/links";
import { Icon } from "@/components/primitives";

export function MediaLinks({
  links,
  onOpenService,
}: {
  links: MediaLink[];
  /** Navigate the in-app embed; mirrors the (svc, at?) signature wired in Home.tsx. */
  onOpenService: (svc: string, at?: string) => void;
}) {
  if (links.length === 0) return null;
  const cls = "btn btn-secondary btn-sm";
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
      {links.map((l) =>
        l.kind === "embed" ? (
          <button
            key={`${l.svc}-${l.label}`}
            type="button"
            className={cls}
            onClick={(e) => {
              e.stopPropagation();
              onOpenService(l.svc, l.deepPath);
            }}
          >
            <Icon name={l.icon} size={15} /> {l.label}
          </button>
        ) : (
          <a key={`${l.svc}-${l.label}`} href={l.href} target="_blank" rel="noreferrer" className={cls} onClick={(e) => e.stopPropagation()}>
            <Icon name={l.icon} size={15} /> {l.label}
          </a>
        ),
      )}
    </div>
  );
}
