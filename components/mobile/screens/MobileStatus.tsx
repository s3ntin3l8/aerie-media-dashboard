"use client";
import React from "react";
import { Eyebrow, StatusDot, Heartbeat } from "@/components/primitives";
import { ServiceLogo } from "@/components/ServiceLogo";
import { useVisibleServices } from "@/components/hooks/useVisibleServices";
import { usePortal } from "@/components/portal/PortalProvider";
import { MiniStat } from "@/components/mobile/mcommon";
import { CertCell, SsoCell, KeepAliveCell } from "@/components/views/shared";

export function MobileStatus() {
  const services = useVisibleServices("status");
  const { keptAliveIds } = usePortal();
  const up = services.filter((s) => s.status === "up").length;
  const avgUp =
    services.length > 0
      ? services.reduce((a, s) => a + s.uptime, 0) / services.length
      : 0;
  const reporting24h = services.filter((s) => s.uptime24h != null);
  const avgUp24hText =
    reporting24h.length > 0
      ? (reporting24h.reduce((a, s) => a + (s.uptime24h ?? 0), 0) / reporting24h.length).toFixed(2) + "%"
      : "—";
  const avgMs =
    services.length > 0
      ? Math.round(services.reduce((a, s) => a + s.ms, 0) / services.length)
      : 0;
  const incidents = services.filter(
    (s) => s.status === "down" || s.status === "degraded"
  ).length;
  const overallOk = incidents === 0;

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
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
        }}
      >
        <div>
          <Eyebrow color="var(--originator-own)">Gatus · Live health</Eyebrow>
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
            System Status
          </div>
        </div>
        {!overallOk && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "5px 10px",
              borderRadius: 9999,
              background: "color-mix(in srgb, var(--amber) 14%, transparent)",
              border:
                "1px solid color-mix(in srgb, var(--amber) 32%, transparent)",
              marginTop: 4,
            }}
          >
            <StatusDot status="degraded" size={6} />
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                fontWeight: 600,
                color: "var(--amber)",
              }}
            >
              DEGRADED
            </span>
          </span>
        )}
      </div>

      {/* Summary stats */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 13,
        }}
      >
        <MiniStat
          label="Services up"
          value={`${up}/${services.length}`}
          icon="check_circle"
          color="var(--originator-own)"
        />
        <MiniStat
          label="Avg uptime 24h"
          value={avgUp24hText}
          icon="schedule"
          color="var(--primary)"
        />
        <MiniStat
          label="Avg uptime 30d"
          value={avgUp.toFixed(2) + "%"}
          icon="trending_up"
          color="var(--primary)"
        />
        <MiniStat
          label="Avg response"
          value={avgMs + "ms"}
          icon="bolt"
          color="var(--primary)"
        />
        <MiniStat
          label="Incidents"
          value={incidents}
          icon="warning"
          color={incidents > 0 ? "var(--amber)" : "var(--originator-own)"}
        />
      </div>

      {/* Service list */}
      <div>
        <div
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--on-surface)",
            marginBottom: 10,
          }}
        >
          Service Health
        </div>
        <div
          className="card"
          style={{
            padding: "2px 15px",
            borderRadius: 18,
            background: "var(--surface-container)",
          }}
        >
          {services.length === 0 ? (
            <div
              style={{
                padding: "16px 0",
                fontSize: 12,
                color: "var(--on-surface-variant)",
                textAlign: "center",
              }}
            >
              No services configured.
            </div>
          ) : (
            services.map((s, i) => (
              <div
                key={s.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 11,
                  padding: "12px 0",
                  borderTop: i
                    ? "1px solid var(--outline-variant)"
                    : "none",
                }}
              >
                <ServiceLogo service={s} size={32} radius={8} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <StatusDot status={s.status} size={6} />
                    {/* Keep-alive sits right after the reachability dot, before the title. */}
                    <KeepAliveCell service={s} live={keptAliveIds.includes(s.id)} iconOnly />
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: "var(--on-surface)",
                      }}
                    >
                      {s.name}
                    </span>
                    {/* Compact cert + SSO icon rail (full detail on tap/hover) — now behind the
                        title rather than by the host, mirroring the desktop Cert/SSO columns. */}
                    <CertCell route={s.route} iconOnly />
                    <SsoCell route={s.route} iconOnly />
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      marginTop: 2,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 10,
                        color: "var(--on-surface-variant)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        minWidth: 0,
                      }}
                    >
                      {s.host}
                    </span>
                  </div>
                  <div style={{ marginTop: 6 }}>
                    <Heartbeat beats={s.beats} h={15} barW={3.5} gap={1.5} />
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 12,
                      fontWeight: 700,
                      color:
                        s.status === "up"
                          ? "var(--on-surface)"
                          : "var(--amber)",
                    }}
                  >
                    {s.uptime.toFixed(2)}
                    <span style={{ fontSize: 9, opacity: 0.7 }}>%</span>
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      color: "var(--on-surface-variant)",
                      marginTop: 2,
                    }}
                  >
                    {s.ms}ms
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
