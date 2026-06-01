"use client";
// ============================================================
// AERIE — Status / uptime dashboard (Gatus + Prometheus)
// ============================================================
import React, { useEffect, useState, useTransition } from "react";
import { usePortal } from "@/components/portal/PortalProvider";
import { useData, useRefresh } from "@/components/portal/DataProvider";
import { Icon, Pill, Eyebrow, StatusDot, Heartbeat, Sparkline } from "@/components/primitives";
import { PanelShell } from "@/components/panels";
import { ServiceLogo } from "@/components/ServiceLogo";
import { PageHeader, StatTile } from "@/components/views/shared";
import { setPrometheusInstance } from "@/app/(portal)/admin/actions";

function fmtBytes(b: number | null): string {
  if (b == null) return "—";
  const tb = b / 1_099_511_627_776;
  if (tb >= 1) return `${tb.toFixed(1)} TB`;
  const gb = b / 1_073_741_824;
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(b / 1_048_576).toFixed(0)} MB`;
}

function MetricCard({ title, value, unit, color, data }: { title: string; value: string; unit: string; color: string; data: number[] }) {
  return (
    <div style={{ padding: 16, borderRadius: 14, background: "var(--surface-container-lowest)", border: "1px solid var(--outline-variant)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <Eyebrow>{title}</Eyebrow>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--on-surface-variant)" }}>{unit}</span>
      </div>
      <div style={{ fontFamily: "var(--font-headline)", fontWeight: 800, fontSize: 24, letterSpacing: "-0.02em", color: "var(--on-surface)", marginBottom: 10 }}>{value}</div>
      <Sparkline data={data} w={260} h={40} color={color} strokeW={1.5} />
    </div>
  );
}

function InstanceSelect({ current }: { current: string | null }) {
  const refresh = useRefresh();
  const [instances, setInstances] = useState<string[]>([]);
  const [value, setValue] = useState<string>(current ?? "");
  const [pending, startTransition] = useTransition();

  useEffect(() => { setValue(current ?? ""); }, [current]);

  useEffect(() => {
    fetch("/api/prometheus/instances", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: string[]) => setInstances(d))
      .catch(() => {});
  }, []);

  if (instances.length === 0) return null;

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value;
    setValue(next);
    startTransition(async () => {
      await setPrometheusInstance(next === "" ? null : next);
      refresh();
    });
  }

  return (
    <select
      value={value}
      onChange={handleChange}
      disabled={pending}
      style={{
        marginLeft: "auto",
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        padding: "3px 8px",
        borderRadius: 6,
        border: "1px solid var(--outline-variant)",
        background: "var(--surface-container)",
        color: "var(--on-surface)",
        cursor: "pointer",
        opacity: pending ? 0.5 : 1,
      }}
    >
      <option value="">All nodes</option>
      {instances.map((inst) => (
        <option key={inst} value={inst}>{inst}</option>
      ))}
    </select>
  );
}

export function Status() {
  const { role } = usePortal();
  const { services, metrics } = useData();
  const list = services.filter((s) => (role === "admin" ? true : s.cat !== "infra"));
  const up = list.filter((s) => s.status === "up").length;
  const deg = list.filter((s) => s.status === "degraded").length;
  const down = list.filter((s) => s.status === "down").length;
  // Averages only over services with real Gatus data — never let an
  // unmonitored ("unknown") service skew uptime/latency to a fake number.
  const monitored = list.filter((s) => s.status !== "unknown");
  const avgMsText = monitored.length ? `${Math.round(monitored.reduce((a, s) => a + s.ms, 0) / monitored.length)}ms` : "—";
  const avgUpText = monitored.length ? `${(monitored.reduce((a, s) => a + s.uptime, 0) / monitored.length).toFixed(2)}%` : "—";

  return (
    <section style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--surface)" }}>
      <PageHeader eyebrow="Gatus · live health" title="System Status" icon="favorite" accent="var(--originator-own)" sub="Uptime, response latency and incident history across every service.">
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            padding: "7px 13px",
            borderRadius: 9999,
            background: down ? "color-mix(in srgb, var(--error) 12%, transparent)" : deg ? "color-mix(in srgb, var(--amber) 12%, transparent)" : up > 0 ? "color-mix(in srgb, var(--originator-own) 12%, transparent)" : "color-mix(in srgb, var(--on-surface-variant) 12%, transparent)",
          }}
        >
          <StatusDot status={down ? "down" : deg ? "degraded" : up > 0 ? "up" : "unknown"} size={8} />
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: down ? "var(--error)" : deg ? "var(--amber)" : up > 0 ? "var(--originator-own)" : "var(--on-surface-variant)" }}>
            {down ? "Incident" : deg ? "Degraded" : up > 0 ? "Operational" : "No data"}
          </span>
        </span>
      </PageHeader>

      <div className="custom-scrollbar" style={{ flex: 1, overflowY: "auto" }}>
        <div className="aerie-page-pad" style={{ maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>
          <div className="aerie-stat-row">
            <StatTile label="Services up" value={`${up}/${list.length}`} color="var(--originator-own)" icon="check_circle" />
            <StatTile label="Avg uptime 30d" value={avgUpText} color="var(--on-surface)" icon="trending_up" />
            <StatTile label="Avg response" value={avgMsText} color="var(--primary)" icon="bolt" />
            <StatTile label="Incidents" value={deg + down} color={deg + down ? "var(--amber)" : "var(--on-surface)"} icon="warning" />
          </div>

          <PanelShell title="Service Health" icon="favorite" accent="var(--originator-own)" count={`${list.length}`}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {list.map((s, i) => (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 16px", borderTop: i ? "1px solid color-mix(in srgb, var(--outline-variant) 45%, transparent)" : "none" }}>
                  <ServiceLogo service={s} size={30} radius={8} />
                  <div style={{ flex: "0 0 150px", minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <StatusDot status={s.status} size={7} />
                      <span style={{ fontWeight: 700, fontSize: 13, color: "var(--on-surface)" }}>{s.name}</span>
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--on-surface-variant)", marginTop: 2 }}>{s.host}</div>
                  </div>
                  <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
                    <Heartbeat beats={s.beats} h={24} barW={5} />
                  </div>
                  <div style={{ flex: "0 0 60px", textAlign: "right" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: s.status === "down" ? "var(--error)" : s.status === "degraded" ? "var(--amber)" : "var(--on-surface)" }}>{s.status === "unknown" ? "—" : `${s.uptime.toFixed(2)}%`}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--on-surface-variant)" }}>{s.status === "unknown" ? "—" : `${s.ms}ms`}</div>
                  </div>
                </div>
              ))}
            </div>
          </PanelShell>

          {role === "admin" && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                <Icon name="query_stats" size={16} color="var(--primary)" />
                <h2 style={{ fontFamily: "var(--font-headline)", fontSize: 12.5, fontWeight: 700, letterSpacing: "0.13em", textTransform: "uppercase", color: "var(--on-surface)" }}>Prometheus Metrics</h2>
                <Pill tone="primary" style={{ marginLeft: 4 }}>
                  Admin
                </Pill>
                {metrics != null && <InstanceSelect current={metrics.instance} />}
              </div>
              {metrics == null ? (
                <div style={{ padding: "18px 20px", borderRadius: 14, background: "var(--surface-container-lowest)", border: "1px solid var(--outline-variant)", color: "var(--on-surface-variant)", fontSize: 13 }}>
                  Prometheus not configured — add the service and set a baseUrl in <strong>Admin → Services</strong>.
                </div>
              ) : (
                <div className="aerie-metrics-grid">
                  <MetricCard
                    title="CPU load"
                    value={metrics.cpuPct != null ? `${metrics.cpuPct.toFixed(1)}%` : "—"}
                    unit={metrics.instance ? `node: ${metrics.instance}` : "all nodes"}
                    color="var(--primary)"
                    data={metrics.cpuHistory}
                  />
                  <MetricCard
                    title="Memory"
                    value={fmtBytes(metrics.memUsedBytes)}
                    unit={`of ${fmtBytes(metrics.memTotalBytes)}`}
                    color="var(--originator-court)"
                    data={metrics.memHistory}
                  />
                  <MetricCard
                    title="Network out"
                    value={metrics.netOutBps != null ? `${(metrics.netOutBps / 1e6).toFixed(1)} Mbps` : "—"}
                    unit="transmit"
                    color="var(--originator-third-party)"
                    data={metrics.netHistory}
                  />
                  <MetricCard
                    title="Network in"
                    value={metrics.netInBps != null ? `${(metrics.netInBps / 1e6).toFixed(1)} Mbps` : "—"}
                    unit="receive"
                    color="var(--originator-court)"
                    data={metrics.netInHistory}
                  />
                  <MetricCard
                    title="Disk"
                    value={metrics.diskUsedBytes != null && metrics.diskTotalBytes ? `${Math.round((metrics.diskUsedBytes / metrics.diskTotalBytes) * 100)}%` : "—"}
                    unit={`${fmtBytes(metrics.diskUsedBytes)} of ${fmtBytes(metrics.diskTotalBytes)}`}
                    color="var(--amber)"
                    data={metrics.diskHistory}
                  />
                  <MetricCard
                    title="System load"
                    value={metrics.sysLoad != null ? metrics.sysLoad.toFixed(2) : "—"}
                    unit="1-min avg"
                    color="var(--originator-own)"
                    data={metrics.sysLoadHistory}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
