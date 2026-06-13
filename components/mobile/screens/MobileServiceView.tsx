"use client";
import React, { useEffect } from "react";
import { Icon } from "@/components/primitives";
import { ServiceLogo } from "@/components/ServiceLogo";
import { LaunchScreen } from "@/components/views/Launcher";
import { useEmbedProbe } from "@/components/hooks/useEmbedProbe";
import { usePortal } from "@/components/portal/PortalProvider";
import { useData } from "@/components/portal/DataProvider";
import { NowPlayingChip } from "@/components/views/NowPlayingChip";
import { catColor } from "@/lib/categories";
import type { Service } from "@/lib/types";

export function MobileServiceView({ s, onClose }: { s: Service; onClose: () => void }) {
  const { embedState, badge, onLoad, onError, reload, reloadKey } = useEmbedProbe(s);
  const { paletteOpen, modalOpen } = usePortal();
  const { nowPlaying = [] } = useData();
  // Live sessions for this service (matched on the now-playing source id, e.g. "plex").
  const sessions = nowPlaying.filter((np) => np.src === s.id);
  const npAccent = s.id === "plex" ? "var(--originator-third-party)" : "var(--primary)";
  const loaded = embedState === "ok";
  const c = catColor(s.cat);
  const url = `${s.scheme}://${s.host}`;
  const cert = s.route?.cert;
  const lockColor = cert
    ? cert.daysRemaining < 3 ? "var(--error)" : cert.daysRemaining < 14 ? "var(--amber)" : "var(--originator-own)"
    : s.scheme === "https" ? "var(--originator-own)" : "var(--amber)";
  const lockTitle = cert
    ? `TLS cert for ${cert.domains.join(", ")} — expires ${new Date(cert.notAfter * 1000).toLocaleDateString()} (${cert.daysRemaining < 0 ? "expired" : `${cert.daysRemaining}d left`})`
    : s.scheme === "https" ? "HTTPS" : "HTTP — not encrypted";

  // Self-heal: a failed embed (likely an expired SSO session redirected to a non-framable login)
  // reloads when the tab regains focus, after the user re-authenticates top-level. Only subscribe
  // while failed so a healthy embed is never reloaded on a tab switch.
  useEffect(() => {
    if (!s.embeddable || embedState !== "unverified") return;
    const onReturn = () => {
      if (document.visibilityState === "visible") reload();
    };
    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("focus", onReturn);
    return () => {
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("focus", onReturn);
    };
  }, [s.embeddable, embedState, reload]);

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

      {/* Live now-playing for this service (Plex/Jellyfin/ABS) — own strip so it's visible on mobile. */}
      {sessions.length > 0 && (
        <div style={{ flexShrink: 0, display: "flex", alignItems: "center", padding: "6px 10px", borderBottom: "1px solid color-mix(in srgb, var(--outline-variant) 60%, transparent)", background: "color-mix(in srgb, var(--surface-container) 50%, transparent)" }}>
          <NowPlayingChip sessions={sessions} accent={npAccent} compact />
        </div>
      )}

      {s.embeddable ? (
        <>
          {/* Forward-auth bar */}
          <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 8, padding: "7px 14px", borderBottom: "1px solid var(--outline-variant)", background: "color-mix(in srgb, var(--surface-container) 60%, transparent)" }}>
            <span title={lockTitle} style={{ display: "inline-flex", alignItems: "center", cursor: cert ? "help" : undefined }}>
              <Icon name={s.scheme === "https" ? "lock" : "lock_open"} size={12} color={lockColor} />
            </span>
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
            {/* Unverified state — most often an expired upstream SSO session redirected the frame
                to a login page that refuses framing. Re-authenticate top-level; returning reloads it. */}
            {embedState === "unverified" && !loaded && (
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, zIndex: 1, padding: 24, textAlign: "center" }}>
                <Icon name="lock_reset" size={30} color={badge.color} />
                <div style={{ fontFamily: "var(--font-headline)", fontWeight: 700, fontSize: 15, color: "var(--on-surface)" }}>Session may have expired</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--on-surface-variant)", maxWidth: 280 }}>
                  Your sign-on session for this service has likely expired. Re-authenticate in a new tab, then come back — the embed reloads itself.
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                  <a href={url} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm" style={{ color: "var(--primary)" }}>
                    <Icon name="open_in_new" size={15} /> Re-authenticate
                  </a>
                  <button type="button" onClick={reload} className="btn btn-secondary btn-sm">
                    <Icon name="refresh" size={15} /> Retry
                  </button>
                </div>
              </div>
            )}
            <iframe
              key={reloadKey}
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
