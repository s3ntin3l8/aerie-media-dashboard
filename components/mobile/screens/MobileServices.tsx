"use client";
import React, { useState } from "react";
import { Icon, Pill, StatusDot, Eyebrow } from "@/components/primitives";
import { ServiceLogo } from "@/components/ServiceLogo";
import { useVisibleServices } from "@/components/hooks/useVisibleServices";
import { usePortal } from "@/components/portal/PortalProvider";
import { embedAuthSummary } from "@/components/views/embedAuth";
import { KeepAliveCell } from "@/components/views/shared";
import { CAT, CAT_ORDER } from "@/lib/categories";
import type { Service } from "@/lib/types";

export function MobileServices({ onOpen }: { onOpen: (s: Service) => void }) {
  const [q, setQ] = useState("");
  const services = useVisibleServices("launcher");
  const { user, oidc, keptAliveIds, favorites, toggleFavorite } = usePortal();
  const who = user.name || user.email || "session";

  const grouped = CAT_ORDER.map((cat) => ({
    cat,
    meta: CAT[cat],
    items: services.filter(
      (s) =>
        s.cat === cat &&
        (!q || s.name.toLowerCase().includes(q.toLowerCase()))
    ),
  })).filter((g) => g.items.length > 0);

  return (
    <div
      style={{
        padding: 18,
        paddingTop: 4,
        display: "flex",
        flexDirection: "column",
        gap: 13,
      }}
    >
      {/* Header */}
      <div>
        <Eyebrow color="var(--primary)">Service directory</Eyebrow>
        <div
          style={{
            fontFamily: "var(--font-headline)",
            fontSize: 24,
            fontWeight: 800,
            letterSpacing: "-0.02em",
            color: "var(--on-surface)",
            marginTop: 4,
          }}
        >
          Services
        </div>
        <div
          style={{
            fontSize: 11.5,
            color: "var(--on-surface-variant)",
            marginTop: 3,
          }}
        >
          {services.length} services · embeddable open in-portal
        </div>
      </div>

      {/* Search input */}
      <div style={{ position: "relative" }}>
        <Icon
          name="search"
          size={16}
          color="var(--on-surface-variant)"
          style={{
            position: "absolute",
            left: 12,
            top: "50%",
            transform: "translateY(-50%)",
            pointerEvents: "none",
          }}
        />
        <input
          className="input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter services…"
          style={{
            paddingLeft: 36,
            height: 42,
            borderRadius: 12,
            width: "100%",
            boxSizing: "border-box",
          }}
        />
      </div>

      {grouped.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: 24,
            fontSize: 13,
            color: "var(--on-surface-variant)",
          }}
        >
          No services match.
        </div>
      ) : (
        grouped.map((g) => (
          <div key={g.cat}>
            {/* Category header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 10,
              }}
            >
              <span
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: 3,
                  background: g.meta.token,
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "var(--on-surface)",
                }}
              >
                {g.meta.label}
              </span>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: "var(--on-surface-variant)",
                }}
              >
                {g.items.length}
              </span>
            </div>

            {/* Service cards */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {g.items.map((s) => {
                const { lockColor, lockTitle, behindSso, authColor, authTitle } = embedAuthSummary(s, who, oidc);
                return (
                <div
                  key={s.id}
                  onClick={() => onOpen(s)}
                  className="req-card card"
                  style={{
                    padding: 15,
                    borderRadius: 18,
                    background: "var(--surface-container)",
                    borderLeft: `3px solid ${g.meta.token}`,
                    display: "flex",
                    flexDirection: "column",
                    gap: 11,
                    cursor: "pointer",
                  }}
                >
                  {/* Service row */}
                  <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                    <ServiceLogo service={s} size={38} radius={9} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 700,
                          color: "var(--on-surface)",
                        }}
                      >
                        {s.name}
                      </div>
                      <div
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 10.5,
                          color: "var(--on-surface-variant)",
                          marginTop: 2,
                        }}
                      >
                        {s.host}
                      </div>
                    </div>
                    {/* Favorite pin — tap-stop so it toggles without opening the service. */}
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleFavorite(s.id); }}
                      aria-label={favorites.includes(s.id) ? "Unpin" : "Pin to favorites"}
                      title={favorites.includes(s.id) ? "Unpin" : "Pin to favorites"}
                      style={{ flexShrink: 0, width: 32, height: 32, borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: favorites.includes(s.id) ? "var(--amber)" : "var(--on-surface-variant)" }}
                    >
                      <Icon name="star" size={16} fill={favorites.includes(s.id)} />
                    </button>
                    <Icon
                      name={s.embeddable ? "open_in_full" : "open_in_new"}
                      size={16}
                      color="var(--on-surface-variant)"
                    />
                  </div>

                  {/* Optional note */}
                  {s.note && (
                    <div
                      style={{
                        fontSize: 11.5,
                        color: "var(--on-surface-variant)",
                      }}
                    >
                      {s.note}
                    </div>
                  )}

                  {/* Footer: status + badge */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      borderTop: "1px solid var(--outline-variant)",
                      paddingTop: 10,
                    }}
                  >
                    <StatusDot status={s.status} size={6} />
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 11,
                        color:
                          s.status === "up"
                            ? "var(--on-surface-variant)"
                            : "var(--amber)",
                      }}
                    >
                      {s.status === "up"
                        ? `${s.uptime.toFixed(2)}% · ${s.ms}ms`
                        : s.status}
                    </span>
                    {/* Security + keep-alive signals — mirrors the desktop launcher card. */}
                    <span title={lockTitle} style={{ display: "inline-flex", alignItems: "center" }}>
                      <Icon name={s.scheme === "https" ? "lock" : "lock_open"} size={13} color={lockColor} />
                    </span>
                    {behindSso && (
                      <span title={authTitle} style={{ display: "inline-flex", alignItems: "center" }}>
                        <Icon name="shield_person" size={13} color={authColor} />
                      </span>
                    )}
                    <KeepAliveCell service={s} live={keptAliveIds.includes(s.id)} iconOnly />
                    <span style={{ flex: 1 }} />
                    <Pill tone={s.embeddable ? "primary" : "amber"} style={{ fontSize: 9 }}>
                      {s.embeddable ? "EMBED" : "LAUNCH"}
                    </Pill>
                  </div>
                </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
