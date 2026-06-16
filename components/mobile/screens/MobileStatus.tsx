"use client";
import React from "react";
import { Icon, Eyebrow, StatusDot, Heartbeat, Sparkline, ProgressBar, TRUNCATE } from "@/components/primitives";
import { ServiceLogo } from "@/components/ServiceLogo";
import { useVisibleServices } from "@/components/hooks/useVisibleServices";
import { useData } from "@/components/portal/DataProvider";
import { usePortal } from "@/components/portal/PortalProvider";
import { MiniStat } from "@/components/mobile/mcommon";
import { CertCell, SsoCell, KeepAliveCell, RouteHealthBadge } from "@/components/views/shared";
import { SourceToggle, InstanceSelect, BeszelSystemSelect, useSecondsAgo, fmtUptime } from "@/components/status/metricsControls";
import { fmtBytes, fmtPercent } from "@/lib/format";

// Compact two-up metric tile: label + value + a small trend sparkline. Same data as the
// desktop MetricCard (lib NodeMetrics), in a phone-native tile that matches the summary grid.
function MetricTile({ label, value, unit, icon, color, data }: {
  label: string; value: string; unit: string; icon: string; color: string; data: number[];
}) {
  return (
    <div className="card" style={{ padding: "11px 12px", borderRadius: 14, background: "var(--surface-container)", minWidth: 0, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontFamily: "var(--font-body)", fontSize: 9, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--on-surface-variant)", ...TRUNCATE }}>{label}</span>
        <Icon name={icon} size={13} color={color} />
      </div>
      <div style={{ fontFamily: "var(--font-headline)", fontSize: 20, fontWeight: 800, color: "var(--on-surface)", lineHeight: 1.05 }}>{value}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--on-surface-variant)", marginTop: 2, ...TRUNCATE }}>{unit}</div>
      {data.length > 1 && (
        <div style={{ marginTop: 6 }}>
          <Sparkline data={data} w={120} h={24} color={color} strokeW={1.4} />
        </div>
      )}
    </div>
  );
}

export function MobileStatus() {
  const services = useVisibleServices("status");
  const { role, keptAliveIds } = usePortal();
  const { metrics, arrHealth, metricsSource, prometheusConfigured, beszelConfigured, beszelSystemId } = useData();
  const isAdmin = role === "admin";
  const metricsAge = useSecondsAgo(metrics);

  const up = services.filter((s) => s.status === "up").length;
  // Averages only over services with real Gatus data — never let an unmonitored ("unknown")
  // service skew uptime/latency to a fake number (mirrors the desktop Status view).
  const monitored = services.filter((s) => s.status !== "unknown");
  const avgUp =
    monitored.length > 0
      ? monitored.reduce((a, s) => a + s.uptime, 0) / monitored.length
      : 0;
  const reporting24h = monitored.filter((s) => s.uptime24h != null);
  const avgUp24hText =
    reporting24h.length > 0
      ? (reporting24h.reduce((a, s) => a + (s.uptime24h ?? 0), 0) / reporting24h.length).toFixed(2) + "%"
      : "—";
  const avgMs =
    monitored.length > 0
      ? Math.round(monitored.reduce((a, s) => a + s.ms, 0) / monitored.length)
      : 0;
  const incidents = services.filter(
    (s) => s.status === "down" || s.status === "degraded"
  ).length;
  const overallOk = incidents === 0;

  const bothConfigured = prometheusConfigured && beszelConfigured;
  const sourceMeta = metricsSource === "beszel"
    ? { icon: "dns", title: "Beszel Metrics" }
    : { icon: "query_stats", title: "Prometheus Metrics" };
  const emptyMetricsMsg = metricsSource === "beszel"
    ? (beszelConfigured
        ? "Beszel unreachable or no system data — check the credentials and that a system is reporting."
        : "Beszel not configured — add the service in Admin → Services with the API key set to email:password.")
    : (prometheusConfigured
        ? "Prometheus unreachable — check the service baseUrl in Admin → Services."
        : "Prometheus not configured — add the service and set a baseUrl in Admin → Services.");

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
          value={monitored.length > 0 ? avgUp.toFixed(2) + "%" : "—"}
          icon="trending_up"
          color="var(--primary)"
        />
        <MiniStat
          label="Avg response"
          value={monitored.length > 0 ? avgMs + "ms" : "—"}
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
                    {/* Unhealthy Traefik route badge, mirroring the desktop Status row. */}
                    {s.route && <RouteHealthBadge route={s.route} />}
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
                    {s.status === "unknown" ? "—" : s.uptime.toFixed(2)}
                    {s.status !== "unknown" && <span style={{ fontSize: 9, opacity: 0.7 }}>%</span>}
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      color: "var(--on-surface-variant)",
                      marginTop: 2,
                    }}
                  >
                    {s.status === "unknown" ? "—" : `${s.ms}ms`}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Admin: Service Warnings (arrHealth) */}
      {isAdmin && arrHealth.length > 0 && (
        <div>
          <div style={{ fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--on-surface)", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
            <Icon name="warning" size={14} color="var(--amber)" /> Service Warnings
            <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--on-surface-variant)" }}>{arrHealth.length}</span>
          </div>
          <div className="card" style={{ padding: "2px 15px", borderRadius: 18, background: "var(--surface-container)" }}>
            {arrHealth.map((h, i) => {
              const isError = h.type.toLowerCase() === "error";
              const c = isError ? "var(--error)" : "var(--amber)";
              return (
                <div key={`${h.svc}-${i}`} style={{ display: "flex", alignItems: "flex-start", gap: 9, padding: "11px 0", borderTop: i ? "1px solid var(--outline-variant)" : "none" }}>
                  <Icon name={isError ? "error" : "warning"} size={15} color={c} style={{ marginTop: 1, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, textTransform: "uppercase", color: c, fontWeight: 700 }}>{h.svc}</span>
                    <div style={{ fontSize: 12, color: "var(--on-surface)", marginTop: 2 }}>{h.message}</div>
                    {h.wikiUrl && (
                      <a href={h.wikiUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "var(--primary)" }}>docs →</a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Admin: system metrics (Prometheus / Beszel) */}
      {isAdmin && (
        <div>
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
            <Icon name={sourceMeta.icon} size={15} color="var(--primary)" />
            <span style={{ fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--on-surface)" }}>{sourceMeta.title}</span>
            {bothConfigured && <SourceToggle current={metricsSource} />}
            {metrics != null && (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: metricsAge === "live" ? "var(--originator-own)" : "var(--on-surface-variant)" }}>{metricsAge}</span>
            )}
            {metrics != null && (metricsSource === "beszel"
              ? <BeszelSystemSelect current={beszelSystemId} />
              : <InstanceSelect current={metrics.instance} />)}
          </div>

          {metrics == null ? (
            <div style={{ padding: "16px 15px", borderRadius: 14, background: "var(--surface-container)", color: "var(--on-surface-variant)", fontSize: 12.5 }}>
              {emptyMetricsMsg}
            </div>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 13 }}>
                <MetricTile
                  label="CPU load"
                  value={metrics.cpuPct != null ? `${metrics.cpuPct.toFixed(1)}%` : "—"}
                  unit={metrics.instance ? `node: ${metrics.instance}` : "all nodes"}
                  icon="memory"
                  color="var(--primary)"
                  data={metrics.cpuHistory}
                />
                <MetricTile
                  label="Memory"
                  value={fmtBytes(metrics.memUsedBytes)}
                  unit={`of ${fmtBytes(metrics.memTotalBytes)}`}
                  icon="memory_alt"
                  color="var(--originator-court)"
                  data={metrics.memHistory}
                />
                <MetricTile
                  label="Network out"
                  value={metrics.netOutBps != null ? `${(metrics.netOutBps / 1e6).toFixed(1)} Mbps` : "—"}
                  unit="transmit"
                  icon="upload"
                  color="var(--originator-third-party)"
                  data={metrics.netHistory}
                />
                <MetricTile
                  label="Network in"
                  value={metrics.netInBps != null ? `${(metrics.netInBps / 1e6).toFixed(1)} Mbps` : "—"}
                  unit="receive"
                  icon="download"
                  color="var(--originator-court)"
                  data={metrics.netInHistory}
                />
                <MetricTile
                  label="Disk"
                  value={metrics.diskUsedBytes != null && metrics.diskTotalBytes ? `${fmtPercent(metrics.diskUsedBytes, metrics.diskTotalBytes)}%` : "—"}
                  unit={`${fmtBytes(metrics.diskUsedBytes)} of ${fmtBytes(metrics.diskTotalBytes)}`}
                  icon="storage"
                  color="var(--amber)"
                  data={metrics.diskHistory}
                />
                <MetricTile
                  label="System load"
                  value={metrics.sysLoad != null ? metrics.sysLoad.toFixed(2) : "—"}
                  unit={metrics.load5 != null && metrics.load15 != null ? `${metrics.load5.toFixed(2)} · ${metrics.load15.toFixed(2)} (5m·15m)` : "1-min avg"}
                  icon="speed"
                  color="var(--originator-own)"
                  data={metrics.sysLoadHistory}
                />
                {metrics.swapTotalBytes != null && metrics.swapTotalBytes > 0 && (
                  <MetricTile
                    label="Swap"
                    value={fmtBytes(metrics.swapUsedBytes)}
                    unit={`of ${fmtBytes(metrics.swapTotalBytes)}`}
                    icon="swap_horiz"
                    color="var(--originator-third-party)"
                    data={[]}
                  />
                )}
                {metrics.uptimeSec != null && (
                  <MetricTile
                    label="Uptime"
                    value={fmtUptime(metrics.uptimeSec)}
                    unit="since boot"
                    icon="timer"
                    color="var(--primary)"
                    data={[]}
                  />
                )}
              </div>

              {metrics.filesystems.length > 0 && (
                <div style={{ marginTop: 13 }}>
                  <div style={{ fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--on-surface)", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                    <Icon name="storage" size={14} color="var(--amber)" /> Filesystems
                    <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--on-surface-variant)" }}>{metrics.filesystems.length}</span>
                  </div>
                  <div className="card" style={{ padding: "4px 15px", borderRadius: 18, background: "var(--surface-container)" }}>
                    {metrics.filesystems.map((f, i) => {
                      const pct = f.totalBytes > 0 ? (f.usedBytes / f.totalBytes) * 100 : 0;
                      const c = pct >= 90 ? "var(--error)" : pct >= 75 ? "var(--amber)" : "var(--originator-own)";
                      return (
                        <div key={f.mount} style={{ padding: "11px 0", borderTop: i ? "1px solid var(--outline-variant)" : "none" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--on-surface)", flex: 1, ...TRUNCATE }}>{f.mount}</span>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--on-surface-variant)", flexShrink: 0 }}>{fmtBytes(f.usedBytes)} / {fmtBytes(f.totalBytes)}</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ flex: 1 }}>
                              <ProgressBar pct={pct} color={c} h={5} />
                            </div>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, fontWeight: 600, color: c, minWidth: 34, textAlign: "right" }}>{Math.round(pct)}%</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
