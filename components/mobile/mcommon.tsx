"use client";
// Shared display helpers reused across mobile screens.
// Ported from the design's mobile/mcommon.jsx, adapted to live data.
import React from "react";
import { Icon, Avatar, Pill, PosterTile } from "@/components/primitives";
import { REQ_TONE, REQ_LABEL } from "@/lib/display";
import type { MediaRequest, Service } from "@/lib/types";

// ── SectionHead ────────────────────────────────────────────
export function SectionHead({
  icon, title, count, color = "var(--primary)", live, onAction, actionLabel = "see all",
}: {
  icon?: string; title: string; count?: string; color?: string;
  live?: boolean; onAction?: () => void; actionLabel?: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
      {icon && <Icon name={icon} size={16} color={color} />}
      <span style={{ fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--on-surface)" }}>
        {title}
      </span>
      {live && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--originator-own)" }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--originator-own)", fontWeight: 600 }}>LIVE</span>
        </span>
      )}
      {count != null && <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--on-surface-variant)" }}>{count}</span>}
      <span style={{ flex: 1 }} />
      {onAction && (
        <button onClick={onAction} style={{ display: "inline-flex", alignItems: "center", gap: 3, background: "none", border: "none", cursor: "pointer", padding: "4px 2px", color: "var(--primary)", fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 700 }}>
          {actionLabel}<Icon name="arrow_right_alt" size={14} />
        </button>
      )}
    </div>
  );
}

// ── MiniStat ────────────────────────────────────────────────
export function MiniStat({ label, value, icon, color = "var(--primary)" }: {
  label: string; value: string | number; icon: string; color?: string;
}) {
  return (
    <div className="card" style={{ padding: "11px 12px", borderRadius: 14, background: "var(--surface-container)", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontFamily: "var(--font-body)", fontSize: 9, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--on-surface-variant)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
        <Icon name={icon} size={13} color={color} />
      </div>
      <div style={{ fontFamily: "var(--font-headline)", fontSize: 22, fontWeight: 800, color: color, lineHeight: 1 }}>{value}</div>
    </div>
  );
}

// ── ApprovalRow ─────────────────────────────────────────────
// Shared request card for Home queue + Requests screen
export function ApprovalRow({ r, onReq, onTap }: { r: MediaRequest; onReq: (id: string, action: "approve" | "decline") => void; onTap?: () => void }) {
  const userName = r.requesterName || r.user;
  const isPending = r.status === "pending";

  return (
    <div
      className="req-card card"
      onClick={onTap}
      style={{
        padding: 15,
        borderRadius: 18,
        background: "var(--surface-container)",
        display: "flex",
        gap: 12,
        transition: "border-color .15s, background .15s",
        cursor: onTap ? "pointer" : "default",
      }}
    >
      <PosterTile title={r.title} kind={r.kind} cat="request" w={44} ratio={1.4} rounded={8} art={r.art} />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 700, color: "var(--on-surface)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.title}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 3, fontSize: 11, color: "var(--on-surface-variant)" }}>
              <Icon name={r.kind === "series" ? "live_tv" : "movie"} size={12} />
              <span style={{ textTransform: "capitalize" }}>{r.kind}</span>
              <span>·</span>
              <span style={{ fontFamily: "var(--font-mono)" }}>{r.year}</span>
            </div>
          </div>
          <Pill tone={REQ_TONE[r.status] || "amber"}>{REQ_LABEL[r.status] || r.status}</Pill>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <Avatar name={userName} size={18} />
          <span style={{ fontSize: 11, color: "var(--on-surface-variant)" }}>{userName}</span>
          <span style={{ width: 3, height: 3, borderRadius: 9999, background: "var(--outline-variant)" }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--on-surface-variant)" }}>{r.requested}</span>
        </div>
        {isPending && (
          <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
            <button
              className="btn btn-sm"
              onClick={() => onReq(r.id, "approve")}
              style={{ flex: 1, background: "color-mix(in srgb, var(--originator-own) 16%, transparent)", color: "var(--originator-own)", justifyContent: "center", minHeight: 38 }}
            >
              <Icon name="check" size={15} />Approve
            </button>
            <button
              className="btn btn-sm"
              onClick={() => onReq(r.id, "decline")}
              style={{ flex: 1, background: "color-mix(in srgb, var(--error) 13%, transparent)", color: "var(--error)", justifyContent: "center", minHeight: 38 }}
            >
              <Icon name="close" size={15} />Decline
            </button>
          </div>
        )}
        {!isPending && r.eta && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 1, fontFamily: "var(--font-mono)", fontSize: 11, color: r.status === "approved" ? "var(--originator-court)" : "var(--on-surface-variant)" }}>
            <Icon name="downloading" size={13} />{r.eta}
          </div>
        )}
      </div>
    </div>
  );
}
