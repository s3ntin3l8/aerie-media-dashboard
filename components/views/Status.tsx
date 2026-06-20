"use client";
// ============================================================
// AERIE — Services (merged browse + launch + health)
// ─────────────────────────────────────────────────────────────
// Formerly two separate views at /services (Launcher) and
// /status (health table). Now a single enhanced card grid at
// /status: browse all services by category, launch them, and
// see live Gatus health signals on every card.
//
// Admin-only sections below the grid: Service Warnings
// (*arr health), system metrics (Prometheus/Beszel), Filesystems.
// Per-service container restart stays in Admin → Services.
// ============================================================
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { usePortal } from "@/components/portal/PortalProvider";
import { useData } from "@/components/portal/DataProvider";
import { useVisibleServices } from "@/components/hooks/useVisibleServices";
import { Icon, Pill, Eyebrow, StatusDot, Sparkline, ProgressBar, SearchField, TRUNCATE, listDivider } from "@/components/primitives";
import { PanelShell, Empty } from "@/components/panels";
import { fmtBytes, fmtPercent } from "@/lib/format";
import { ServiceCard } from "@/components/views/ServiceCard";
import { CAT, CAT_ORDER, catColor } from "@/lib/categories";
import { PageHeader, StatTile } from "@/components/views/shared";
import { SourceToggle, InstanceSelect, BeszelSystemSelect, useSecondsAgo, fmtUptime } from "@/components/status/metricsControls";

// Admin-only system-metrics card (CPU / memory / network / etc.).
function MetricCard({ title, value, unit, color, data }: { title: string; value: string; unit: string; color: string; data: number[] }) {
  return (
    <div style={{ padding: 16, borderRadius: 14, background: "var(--surface-container-lowest)", border: "1px solid var(--outline-variant)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <Eyebrow>{title}</Eyebrow>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--on-surface-variant)" }}>{unit}</span>
      </div>
      <div style={{ fontFamily: "var(--font-headline)", fontWeight: 800, fontSize: 24, letterSpacing: "-0.02em", color: "var(--on-surface)", marginBottom: 10 }}>{value}</div>
      <Sparkline data={data} w={260} h={40} color={color} strokeW={1.5} fluid />
    </div>
  );
}

export function Status() {
  const router = useRouter();
  const { role } = usePortal();
  const { metrics, arrHealth, metricsSource, prometheusConfigured, beszelConfigured, beszelSystemId } = useData();
  const metricsAge = useSecondsAgo(metrics);
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

  // "launcher" mode: excludes infra + prometheus/beszel for non-admins; admins see all.
  // Consistent with the old Launcher view (and CommandPalette) — health signals surface
  // on each card rather than in a separate status table.
  const list = useVisibleServices("launcher");

  // Search filter — wires the previously-decorative SearchField (Launcher had no value/onChange).
  const [q, setQ] = useState("");
  const ql = q.toLowerCase();
  const filtered = ql
    ? list.filter((s) => s.name.toLowerCase().includes(ql) || s.host.toLowerCase().includes(ql))
    : list;

  // Category groups for the card grid (same grouping logic as the old Launcher).
  const grouped = CAT_ORDER
    .map((cat) => ({ cat, items: filtered.filter((s) => s.cat === cat) }))
    .filter((g) => g.items.length > 0);

  // Summary stats — derived from all visible services (not filtered) so the stat row
  // stays stable while the user types in the search field.
  const up = list.filter((s) => s.status === "up").length;
  const deg = list.filter((s) => s.status === "degraded").length;
  const down = list.filter((s) => s.status === "down").length;
  const monitored = list.filter((s) => s.status !== "unknown");
  const avgMsText = monitored.length ? `${Math.round(monitored.reduce((a, s) => a + s.ms, 0) / monitored.length)}ms` : "—";
  const avgUpText = monitored.length ? `${(monitored.reduce((a, s) => a + s.uptime, 0) / monitored.length).toFixed(2)}%` : "—";
  const monitored24h = monitored.filter((s) => s.uptime24h != null);
  const avgUp24hText = monitored24h.length ? `${(monitored24h.reduce((a, s) => a + (s.uptime24h ?? 0), 0) / monitored24h.length).toFixed(2)}%` : "—";

  return (
    <section style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--surface)" }}>
      <PageHeader eyebrow="Service directory · live health" title="Services" icon="apps" accent="var(--primary)" sub={`${list.length} services · embeddable ones open in-portal, the rest launch in a new tab.`}>
        {/* Operational status pill */}
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            padding: "7px 13px",
            borderRadius: 9999,
            background: down ? "color-mix(in srgb, var(--error) 12%, transparent)" : deg ? "color-mix(in srgb, var(--amber) 12%, transparent)" : up > 0 ? "color-mix(in srgb, var(--primary) 12%, transparent)" : "color-mix(in srgb, var(--on-surface-variant) 12%, transparent)",
          }}
        >
          <StatusDot status={down ? "down" : deg ? "degraded" : up > 0 ? "up" : "unknown"} size={8} />
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: down ? "var(--error)" : deg ? "var(--amber)" : up > 0 ? "var(--primary)" : "var(--on-surface-variant)" }}>
            {down ? "Incident" : deg ? "Degraded" : up > 0 ? "Operational" : "No data"}
          </span>
        </span>
        <SearchField placeholder="Filter services…" width={240} value={q} onChange={setQ} />
      </PageHeader>

      <div className="custom-scrollbar" style={{ flex: 1, overflowY: "auto" }}>
        <div className="aerie-page-pad aerie-page-pad--wide" style={{ display: "flex", flexDirection: "column", gap: 18 }}>

          {/* 5-tile health stat row */}
          <div className="aerie-stat-row">
            <StatTile label="Services up" value={`${up}/${list.length}`} color="var(--primary)" icon="check_circle" />
            <StatTile label="Avg uptime 24h" value={avgUp24hText} color="var(--on-surface)" icon="schedule" />
            <StatTile label="Avg uptime 30d" value={avgUpText} color="var(--on-surface)" icon="trending_up" />
            <StatTile label="Avg response" value={avgMsText} color="var(--primary)" icon="bolt" />
            <StatTile label="Incidents" value={deg + down} color={deg + down ? "var(--amber)" : "var(--on-surface)"} icon="warning" />
          </div>

          {/* Category-grouped enhanced card grid */}
          {list.length === 0 && (
            <section style={{ background: "var(--surface-container-lowest)", border: "1px solid var(--outline-variant)", borderRadius: "var(--radius-xl)", boxShadow: "var(--shadow-sm)" }}>
              <Empty icon="apps" line="No services available" sub="Ask an admin to add services in Admin → Services." />
            </section>
          )}
          {list.length > 0 && filtered.length === 0 && (
            <section style={{ background: "var(--surface-container-lowest)", border: "1px solid var(--outline-variant)", borderRadius: "var(--radius-xl)", boxShadow: "var(--shadow-sm)" }}>
              <Empty icon="search_off" line="No services match" sub="Try a different name or host." />
            </section>
          )}
          {grouped.map((g) => (
            <div key={g.cat}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 13 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: catColor(g.cat) }} />
                <h2 style={{ fontFamily: "var(--font-headline)", fontSize: 12.5, fontWeight: 700, letterSpacing: "0.13em", textTransform: "uppercase", color: "var(--on-surface)" }}>{CAT[g.cat].label}</h2>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--on-surface-variant)" }}>{g.items.length}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(248px, 1fr))", gap: 13 }}>
                {g.items.map((s) => (
                  <ServiceCard key={s.id} s={s} onOpen={() => router.push(`/s/${s.id}`)} />
                ))}
              </div>
            </div>
          ))}

          {/* ── Admin-only sections ─────────────────────────────────── */}

          {role === "admin" && arrHealth.length > 0 && (
            <PanelShell title="Service Warnings" icon="warning" accent="var(--amber)" count={`${arrHealth.length}`}>
              <div style={{ display: "flex", flexDirection: "column" }}>
                {arrHealth.map((h, i) => {
                  const isError = h.type.toLowerCase() === "error";
                  const c = isError ? "var(--error)" : "var(--amber)";
                  return (
                    <div key={`${h.svc}-${i}`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderTop: listDivider(i) }}>
                      <Icon name={isError ? "error" : "warning"} size={15} color={c} />
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase", color: c, flex: "0 0 56px" }}>{h.svc}</span>
                      <span style={{ fontSize: 12, color: "var(--on-surface)", flex: 1 }}>{h.message}</span>
                      {h.wikiUrl && (
                        <a href={h.wikiUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "var(--primary)", whiteSpace: "nowrap" }}>
                          docs
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            </PanelShell>
          )}

          {role === "admin" && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                <Icon name={sourceMeta.icon} size={16} color="var(--primary)" />
                <h2 style={{ fontFamily: "var(--font-headline)", fontSize: 12.5, fontWeight: 700, letterSpacing: "0.13em", textTransform: "uppercase", color: "var(--on-surface)" }}>{sourceMeta.title}</h2>
                <Pill tone="primary" style={{ marginLeft: 4 }}>Admin</Pill>
                {bothConfigured && <SourceToggle current={metricsSource} />}
                {metrics != null && (
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: metricsAge === "live" ? "var(--originator-own)" : "var(--on-surface-variant)", marginLeft: 2 }}>
                    {metricsAge}
                  </span>
                )}
                {metrics != null && (metricsSource === "beszel"
                  ? <BeszelSystemSelect current={beszelSystemId} />
                  : <InstanceSelect current={metrics.instance} />)}
              </div>
              {metrics == null ? (
                <div style={{ padding: "18px 20px", borderRadius: 14, background: "var(--surface-container-lowest)", border: "1px solid var(--outline-variant)", color: "var(--on-surface-variant)", fontSize: 13 }}>
                  {emptyMetricsMsg}
                </div>
              ) : (
                <div className="aerie-metrics-grid">
                  <MetricCard title="CPU load" value={metrics.cpuPct != null ? `${metrics.cpuPct.toFixed(1)}%` : "—"} unit={metrics.instance ? `node: ${metrics.instance}` : "all nodes"} color="var(--primary)" data={metrics.cpuHistory} />
                  <MetricCard title="Memory" value={fmtBytes(metrics.memUsedBytes)} unit={`of ${fmtBytes(metrics.memTotalBytes)}`} color="var(--originator-court)" data={metrics.memHistory} />
                  <MetricCard title="Network out" value={metrics.netOutBps != null ? `${(metrics.netOutBps / 1e6).toFixed(1)} Mbps` : "—"} unit="transmit" color="var(--originator-third-party)" data={metrics.netHistory} />
                  <MetricCard title="Network in" value={metrics.netInBps != null ? `${(metrics.netInBps / 1e6).toFixed(1)} Mbps` : "—"} unit="receive" color="var(--originator-court)" data={metrics.netInHistory} />
                  <MetricCard title="Disk" value={metrics.diskUsedBytes != null && metrics.diskTotalBytes ? `${fmtPercent(metrics.diskUsedBytes, metrics.diskTotalBytes)}%` : "—"} unit={`${fmtBytes(metrics.diskUsedBytes)} of ${fmtBytes(metrics.diskTotalBytes)}`} color="var(--amber)" data={metrics.diskHistory} />
                  <MetricCard title="System load" value={metrics.sysLoad != null ? metrics.sysLoad.toFixed(2) : "—"} unit={metrics.load5 != null && metrics.load15 != null ? `${metrics.load5.toFixed(2)} · ${metrics.load15.toFixed(2)} (5m·15m)` : "1-min avg"} color="var(--originator-own)" data={metrics.sysLoadHistory} />
                  {metrics.swapTotalBytes != null && metrics.swapTotalBytes > 0 && (
                    <MetricCard title="Swap" value={fmtBytes(metrics.swapUsedBytes)} unit={`of ${fmtBytes(metrics.swapTotalBytes)}`} color="var(--originator-third-party)" data={[]} />
                  )}
                  {metrics.uptimeSec != null && (
                    <MetricCard title="Uptime" value={fmtUptime(metrics.uptimeSec)} unit="since boot" color="var(--primary)" data={[]} />
                  )}
                </div>
              )}
              {metrics != null && metrics.filesystems.length > 0 && (
                <PanelShell title="Filesystems" icon="storage" accent="var(--amber)" count={`${metrics.filesystems.length}`} style={{ marginTop: 4 }}>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {metrics.filesystems.map((f, i) => {
                      const pct = f.totalBytes > 0 ? (f.usedBytes / f.totalBytes) * 100 : 0;
                      const c = pct >= 90 ? "var(--error)" : pct >= 75 ? "var(--amber)" : "var(--originator-own)";
                      return (
                        <div key={f.mount} style={{ padding: "10px 16px", borderTop: listDivider(i) }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--on-surface)", flex: 1, ...TRUNCATE }}>{f.mount}</span>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--on-surface-variant)" }}>{fmtBytes(f.usedBytes)} / {fmtBytes(f.totalBytes)}</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ flex: 1 }}>
                              <ProgressBar pct={pct} color={c} h={5} />
                            </div>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, fontWeight: 600, color: c, minWidth: 36, textAlign: "right" }}>{Math.round(pct)}%</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </PanelShell>
              )}
            </>
          )}

        </div>
      </div>
    </section>
  );
}
