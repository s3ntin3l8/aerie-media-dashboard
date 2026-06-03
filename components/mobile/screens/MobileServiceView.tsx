"use client";
import React from "react";
import { Icon } from "@/components/primitives";
import { ServiceLogo } from "@/components/ServiceLogo";
import { LaunchScreen } from "@/components/views/Launcher";
import { useEmbedProbe } from "@/components/hooks/useEmbedProbe";
import { usePortal } from "@/components/portal/PortalProvider";
import { catColor } from "@/lib/categories";
import type { Service } from "@/lib/types";

export function MobileServiceView({ s, onClose }: { s: Service; onClose: () => void }) {
  const { embedState, badge, onLoad, onError } = useEmbedProbe(s);
  const { paletteOpen, modalOpen } = usePortal();
  const loaded = embedState === "ok";
  const c = catColor(s.cat);
  const url = `${s.scheme}://${s.host}`;

  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 90, background: "var(--background)", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div
        className="aerie-app-bar"
        style={{
          flexShrink: 0,
          paddingLeft: 6, paddingRight: 12, paddingBottom: 8, paddingTop: 8,
          display: "flex", alignItems: "center", gap: 10,
          background: "color-mix(in srgb, var(--background) 86%, transparent)",
          backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
          borderBottom: "1px solid color-mix(in srgb, var(--outline-variant) 60%, transparent)",
          position: "sticky", top: 0, zIndex: 10,
        }}
      >
        <button
          onClick={onClose}
          aria-label="Back to services"
          style={{ width: 40, height: 40, borderRadius: 11, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--on-surface)" }}
        >
          <Icon name="arrow_back" size={22} />
        </button>
        <ServiceLogo service={s} size={30} radius={8} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontFamily: "var(--font-headline)", fontWeight: 800, fontSize: 15, color: "var(--on-surface)", lineHeight: 1.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--on-surface-variant)" }}>v{String(s.version).replace(/^v/i, "")} · {s.embeddable ? "embedded" : "external"}</div>
        </div>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          aria-label="Open in new tab"
          style={{ width: 38, height: 38, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--on-surface-variant)", textDecoration: "none" }}
        >
          <Icon name="open_in_new" size={18} />
        </a>
      </div>

      {s.embeddable ? (
        <>
          {/* Forward-auth bar */}
          <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 8, padding: "7px 14px", borderBottom: "1px solid var(--outline-variant)", background: "color-mix(in srgb, var(--surface-container) 60%, transparent)" }}>
            <Icon name={s.scheme === "https" ? "lock" : "lock_open"} size={12} color={s.scheme === "https" ? "var(--originator-own)" : "var(--amber)"} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--on-surface-variant)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>{url}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, padding: "1px 7px", borderRadius: 4, background: `color-mix(in srgb, ${badge.color} 12%, transparent)`, color: badge.color, fontWeight: 700, flexShrink: 0 }}>{badge.label}</span>
          </div>

          {/* Embedded content area */}
          <div style={{ flex: 1, position: "relative", overflow: "hidden", background: "var(--surface-container-low)" }}>
            {/* Loading state */}
            {!loaded && embedState !== "unverified" && (
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, zIndex: 1 }}>
                <Icon name="sync" size={26} color={c} style={{ animation: "aerieSpin 1s linear infinite" }} />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--on-surface-variant)" }}>Loading embedded session…</span>
              </div>
            )}
            {/* Unverified state */}
            {embedState === "unverified" && !loaded && (
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, zIndex: 1, padding: 24, textAlign: "center" }}>
                <Icon name="help" size={30} color={badge.color} />
                <div style={{ fontFamily: "var(--font-headline)", fontWeight: 700, fontSize: 15, color: "var(--on-surface)" }}>Couldn&apos;t confirm the embed</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--on-surface-variant)", maxWidth: 280 }}>
                  The page didn&apos;t load in time — it may be slow or block framing.
                </div>
                <a href={url} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm" style={{ marginTop: 4 }}>
                  <Icon name="open_in_new" size={15} /> Open in new tab
                </a>
              </div>
            )}
            <iframe
              src={url}
              title={`${s.name} (embedded)`}
              onLoad={onLoad}
              onError={onError}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none", opacity: loaded ? 1 : 0, transition: "opacity .2s" }}
            />
            {/* Cover iframe during overlay so palette/modal backdrop works */}
            {(paletteOpen || modalOpen) && <div style={{ position: "absolute", inset: 0, zIndex: 2 }} />}
          </div>
        </>
      ) : (
        <LaunchScreen s={s} />
      )}
    </div>
  );
}
