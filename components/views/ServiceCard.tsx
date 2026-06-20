"use client";
// ============================================================
// AERIE — ServiceCard
// ─────────────────────────────────────────────────────────────
// Enhanced browse+launch+health card used in the merged
// Services page (/status). Adds a full-width Heartbeat (uptime
// graph) between the divider and the footer status row.
//
// Card anatomy:
//   logo · name · host · pin star          ← header
//   note line (reserved, single line)      ← meta
//   ─── Divider ───
//   ▁▃▅▇▇▇▅▇▇▇   24h  OR  "not monitored" ← heartbeat strip
//   ● 99.9% · 12ms  🔒 🛡 keep-alive EMBED ← status footer
// ============================================================
import type { Service } from "@/lib/types";
import { catColor } from "@/lib/categories";
import { usePortal } from "@/components/portal/PortalProvider";
import { Icon, StatusDot, Heartbeat, Divider, hoverGlow, TRUNCATE } from "@/components/primitives";
import { ServiceLogo } from "@/components/ServiceLogo";
import { KeepAliveCell } from "@/components/views/shared";
import { embedAuthSummary } from "@/components/views/embedAuth";

export function ServiceCard({ s, onOpen }: { s: Service; onOpen: () => void }) {
  const c = catColor(s.cat);
  const { favorites, toggleFavorite, user, oidc, keptAliveIds } = usePortal();
  const pinned = favorites.includes(s.id);
  const who = user.name || user.email || "session";
  const { lockColor, lockTitle, behindSso, authColor, authTitle } = embedAuthSummary(s, who, oidc);
  const monitored = s.status !== "unknown";

  return (
    <a
      onClick={onOpen}
      title={s.note || undefined}
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        gap: 13,
        padding: 16,
        borderRadius: 14,
        cursor: "pointer",
        textDecoration: "none",
        background: "var(--surface-container-lowest)",
        border: "1px solid var(--outline-variant)",
        overflow: "hidden",
        transition: "border-color .18s, box-shadow .18s, transform .1s",
      }}
      {...hoverGlow(c)}
    >
      {/* Category accent strip */}
      <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: c }} />

      {/* Pin star */}
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          toggleFavorite(s.id);
        }}
        title={pinned ? "Unpin from rail" : "Pin to rail"}
        style={{
          position: "absolute",
          top: 10,
          right: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 26,
          height: 26,
          borderRadius: 8,
          border: "none",
          background: "transparent",
          cursor: "pointer",
          color: pinned ? "var(--primary)" : "var(--on-surface-variant)",
          opacity: pinned ? 1 : 0.55,
          transition: "color .15s, opacity .15s, background .15s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.opacity = "1";
          e.currentTarget.style.background = "color-mix(in srgb, var(--surface-container-high) 70%, transparent)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.opacity = pinned ? "1" : "0.55";
          e.currentTarget.style.background = "transparent";
        }}
      >
        <Icon name={pinned ? "star" : "star_border"} size={17} fill={pinned} />
      </button>

      {/* Logo + name + host */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <ServiceLogo service={s} size={44} radius={12} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, paddingRight: 22 }}>
            <span style={{ fontFamily: "var(--font-headline)", fontWeight: 800, fontSize: 15, color: "var(--on-surface)", ...TRUNCATE }}>{s.name}</span>
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--on-surface-variant)", marginTop: 3, ...TRUNCATE }}>{s.host}</div>
        </div>
      </div>

      {/* Note line — always reserve one line so the Divider lands at the same height on every
          card in a row (the grid stretches card height; an un-reserved note shifts the divider). */}
      <div
        style={{
          fontSize: 12,
          color: "var(--on-surface-variant)",
          lineHeight: "17px",
          height: 17,
          whiteSpace: "nowrap",
          overflow: "hidden",
          maskImage: "linear-gradient(to right, #000 78%, transparent)",
          WebkitMaskImage: "linear-gradient(to right, #000 78%, transparent)",
        }}
      >
        {s.note}
      </div>

      <Divider />

      {/* Heartbeat strip — full-width 24h uptime graph (Gatus). For unmonitored services
          ("unknown" status) render a same-height "not monitored" label so card heights stay
          uniform — cards in a row stretch to the tallest, not inner content. */}
      {monitored ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Heartbeat beats={s.beats} h={20} barW={3} gap={1.5} />
          </div>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--on-surface-variant)", flexShrink: 0 }}>24h</span>
        </div>
      ) : (
        <div style={{ height: 20, display: "flex", alignItems: "center" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--on-surface-variant)", opacity: 0.5 }}>not monitored</span>
        </div>
      )}

      {/* Status footer: dot · uptime%·ms · lock · SSO shield · keep-alive · EMBED/LAUNCH */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <StatusDot status={s.status} size={7} />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: s.status === "degraded" ? "var(--amber)" : s.status === "down" ? "var(--error)" : "var(--on-surface-variant)" }}>
          {s.status === "up" ? `${s.uptime.toFixed(2)}% · ${s.ms}ms` : s.status === "unknown" ? "no data" : s.status}
        </span>
        {/* Security signals — TLS (always) + SSO (only when behind forward-auth), mirrors
            the embed subheader's lock/shield (see ServiceView in Launcher.tsx). */}
        <span title={lockTitle} style={{ display: "inline-flex", alignItems: "center", marginLeft: 4, cursor: s.route?.cert ? "help" : undefined }}>
          <Icon name={s.scheme === "https" ? "lock" : "lock_open"} size={13} color={lockColor} />
        </span>
        {behindSso && (
          <span title={authTitle} style={{ display: "inline-flex", alignItems: "center", cursor: "help" }}>
            <Icon name="shield_person" size={13} color={authColor} />
          </span>
        )}
        {/* Keep-alive: dim when flagged-idle, filled + glowing when the embed is live now. */}
        <KeepAliveCell service={s} live={keptAliveIds.includes(s.id)} iconOnly />
        <span
          style={{
            marginLeft: "auto",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            padding: "2px 7px",
            borderRadius: 4,
            fontWeight: 700,
            letterSpacing: "0.04em",
            background: s.embeddable
              ? "color-mix(in srgb, var(--primary) 12%, transparent)"
              : "color-mix(in srgb, var(--originator-third-party) 12%, transparent)",
            color: s.embeddable ? "var(--primary)" : "var(--originator-third-party)",
          }}
        >
          {s.embeddable ? "EMBED" : "LAUNCH"}
        </span>
      </div>
    </a>
  );
}
