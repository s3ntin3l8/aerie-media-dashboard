"use client";
// ============================================================
// AERIE — Status / uptime dashboard (Gatus + Prometheus)
// ============================================================
import React, { useEffect, useMemo, useState, useTransition } from "react";
import { usePortal } from "@/components/portal/PortalProvider";
import { useData, useRefresh } from "@/components/portal/DataProvider";
import { useVisibleServices } from "@/components/hooks/useVisibleServices";
import { Icon, Pill, Eyebrow, StatusDot, Heartbeat, Sparkline, ProgressBar, TRUNCATE, listDivider } from "@/components/primitives";
import { PanelShell, timeAgo } from "@/components/panels";
import { fmtBytes, fmtPercent } from "@/lib/format";
import { ServiceLogo } from "@/components/ServiceLogo";
import { PageHeader, StatTile, RouteHealthBadge, CertCell, SsoCell, KeepAliveCell } from "@/components/views/shared";
import { setPrometheusInstance, setMetricsSource, setBeszelSystem } from "@/app/(portal)/admin/actions";

const HEALTH_STATUS_ORDER: Record<string, number> = { up: 0, degraded: 1, down: 2, unknown: 3 };

/** Shared style for the metrics-section pickers (node instance / Beszel system). */
const PICKER_SELECT_STYLE: React.CSSProperties = {
  marginLeft: "auto",
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  padding: "3px 8px",
  borderRadius: 6,
  border: "1px solid var(--outline-variant)",
  background: "var(--surface-container)",
  color: "var(--on-surface)",
  cursor: "pointer",
};

/** seconds → compact uptime ("12d 4h", "4h 12m", "12m"). */
function fmtUptime(sec: number | null): string {
  if (sec == null) return "—";
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
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
    <select value={value} onChange={handleChange} disabled={pending} style={{ ...PICKER_SELECT_STYLE, opacity: pending ? 0.5 : 1 }}>
      <option value="">All nodes</option>
      {instances.map((inst) => (
        <option key={inst} value={inst}>{inst}</option>
      ))}
    </select>
  );
}

/** Segmented Prometheus ⇄ Beszel toggle, shown only when both sources are configured. */
function SourceToggle({ current }: { current: "prometheus" | "beszel" }) {
  const refresh = useRefresh();
  const [pending, startTransition] = useTransition();
  const pick = (src: "prometheus" | "beszel") => {
    if (src === current || pending) return;
    startTransition(async () => {
      await setMetricsSource(src);
      refresh();
    });
  };
  const opts: { id: "prometheus" | "beszel"; label: string }[] = [
    { id: "prometheus", label: "Prometheus" },
    { id: "beszel", label: "Beszel" },
  ];
  return (
    <div style={{ display: "inline-flex", borderRadius: 6, border: "1px solid var(--outline-variant)", overflow: "hidden", opacity: pending ? 0.5 : 1 }}>
      {opts.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => pick(o.id)}
          disabled={pending}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            padding: "3px 9px",
            border: "none",
            cursor: o.id === current ? "default" : "pointer",
            background: o.id === current ? "var(--primary)" : "var(--surface-container)",
            color: o.id === current ? "var(--on-primary)" : "var(--on-surface-variant)",
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Beszel system picker — option value = system id, label = system name. */
function BeszelSystemSelect({ current }: { current: string | null }) {
  const refresh = useRefresh();
  const [systems, setSystems] = useState<{ id: string; name: string; status: string }[]>([]);
  const [value, setValue] = useState<string>(current ?? "");
  const [pending, startTransition] = useTransition();

  useEffect(() => { setValue(current ?? ""); }, [current]);

  useEffect(() => {
    fetch("/api/beszel/systems", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { id: string; name: string; status: string }[]) => setSystems(d))
      .catch(() => {});
  }, []);

  if (systems.length === 0) return null;
  // Reflect the effective selection: the persisted id, else the first system.
  const effective = value || systems[0]?.id || "";

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value;
    setValue(next);
    startTransition(async () => {
      await setBeszelSystem(next || null);
      refresh();
    });
  }

  return (
    <select value={effective} onChange={handleChange} disabled={pending} style={{ ...PICKER_SELECT_STYLE, opacity: pending ? 0.5 : 1 }}>
      {systems.map((s) => (
        <option key={s.id} value={s.id}>{s.name}</option>
      ))}
    </select>
  );
}

function useSecondsAgo(dep: unknown): string {
  const [lastSeen, setLastSeen] = useState(() => Date.now());
  const [ago, setAgo] = useState(0);
  useEffect(() => { setLastSeen(Date.now()); setAgo(0); }, [dep]);
  useEffect(() => {
    const t = setInterval(() => setAgo(Math.floor((Date.now() - lastSeen) / 1000)), 1000);
    return () => clearInterval(t);
  }, [lastSeen]);
  return ago < 5 ? "live" : `${ago}s ago`;
}

export function Status() {
  const { role, keptAliveIds } = usePortal();
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
  const list = useVisibleServices("status");
  const [healthSort, setHealthSort] = useState<"name" | "status" | "uptime" | "ms" | "cert" | "sso">("name");
  const sortedList = useMemo(() => [...list].sort((a, b) => {
    switch (healthSort) {
      case "name":   return a.name.localeCompare(b.name);
      case "status": return HEALTH_STATUS_ORDER[a.status] - HEALTH_STATUS_ORDER[b.status];
      case "uptime": return b.uptime - a.uptime;
      case "ms":     return (a.ms ?? Infinity) - (b.ms ?? Infinity);
      // Soonest-expiring cert first; services with no cert sink to the bottom. SSO-protected
      // services first. Both fall back to name so ties read in a stable, alphabetical order.
      case "cert":   return ((a.route?.cert?.daysRemaining ?? Infinity) - (b.route?.cert?.daysRemaining ?? Infinity)) || a.name.localeCompare(b.name);
      case "sso":    return ((b.route?.forwardAuth ? 1 : 0) - (a.route?.forwardAuth ? 1 : 0)) || a.name.localeCompare(b.name);
      default:       return 0;
    }
  }), [list, healthSort]);
  // Cert / SSO sorts are only meaningful when Traefik route data exists, so only offer them
  // when at least one visible service actually carries that data.
  const sortOpts = useMemo(() => {
    const opts: Array<"name" | "status" | "uptime" | "ms" | "cert" | "sso"> = ["name", "status", "uptime", "ms"];
    if (list.some((s) => s.route?.cert)) opts.push("cert");
    if (list.some((s) => s.route?.forwardAuth)) opts.push("sso");
    return opts;
  }, [list]);
  const up = list.filter((s) => s.status === "up").length;
  const deg = list.filter((s) => s.status === "degraded").length;
  const down = list.filter((s) => s.status === "down").length;
  // Averages only over services with real Gatus data — never let an
  // unmonitored ("unknown") service skew uptime/latency to a fake number.
  const monitored = list.filter((s) => s.status !== "unknown");
  const avgMsText = monitored.length ? `${Math.round(monitored.reduce((a, s) => a + s.ms, 0) / monitored.length)}ms` : "—";
  const avgUpText = monitored.length ? `${(monitored.reduce((a, s) => a + s.uptime, 0) / monitored.length).toFixed(2)}%` : "—";
  // 24h average only over monitored services that actually report a 24h figure (Gatus may omit it).
  const monitored24h = monitored.filter((s) => s.uptime24h != null);
  const avgUp24hText = monitored24h.length ? `${(monitored24h.reduce((a, s) => a + (s.uptime24h ?? 0), 0) / monitored24h.length).toFixed(2)}%` : "—";

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
            <StatTile label="Avg uptime 24h" value={avgUp24hText} color="var(--on-surface)" icon="schedule" />
            <StatTile label="Avg uptime 30d" value={avgUpText} color="var(--on-surface)" icon="trending_up" />
            <StatTile label="Avg response" value={avgMsText} color="var(--primary)" icon="bolt" />
            <StatTile label="Incidents" value={deg + down} color={deg + down ? "var(--amber)" : "var(--on-surface)"} icon="warning" />
          </div>

          <PanelShell title="Service Health" icon="favorite" accent="var(--originator-own)" count={`${list.length}`}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 16px", borderBottom: "1px solid color-mix(in srgb, var(--outline-variant) 45%, transparent)" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--on-surface-variant)", marginRight: 4 }}>Sort</span>
                {sortOpts.map((opt) => {
                  const labels: Record<string, string> = { name: "Name", status: "Status", uptime: "Uptime", ms: "Response", cert: "Cert", sso: "SSO" };
                  const active = healthSort === opt;
                  return (
                    <button
                      key={opt}
                      onClick={() => setHealthSort(opt)}
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 10.5,
                        padding: "4px 10px",
                        borderRadius: 9999,
                        cursor: "pointer",
                        border: "1px solid " + (active ? "color-mix(in srgb, var(--originator-own) 40%, transparent)" : "var(--outline-variant)"),
                        background: active ? "color-mix(in srgb, var(--originator-own) 13%, transparent)" : "transparent",
                        color: active ? "var(--originator-own)" : "var(--on-surface-variant)",
                      }}
                    >
                      {labels[opt]}
                    </button>
                  );
                })}
              </div>
              {sortedList.map((s, i) => (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 16px", borderTop: listDivider(i) }}>
                  <ServiceLogo service={s} size={30} radius={8} />
                  <div style={{ flex: "0 0 200px", minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <StatusDot status={s.status} size={7} />
                      <span style={{ fontWeight: 700, fontSize: 13, color: "var(--on-surface)" }}>{s.name}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6, rowGap: 4, marginTop: 2 }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--on-surface-variant)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>
                        {s.lastIncidentAt ? `incident ${timeAgo(s.lastIncidentAt)}` : s.host}
                      </span>
                      {s.route && <RouteHealthBadge route={s.route} />}
                    </div>
                  </div>
                  <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
                    <Heartbeat beats={s.beats} h={24} barW={5} />
                  </div>
                  {/* Cert + SSO get their own reserved columns (a muted "—" when a service carries
                      no Traefik/Authentik data) so they line up across rows like response/uptime. */}
                  <div style={{ flex: "0 0 78px", display: "flex", justifyContent: "flex-end" }}>
                    <CertCell route={s.route} reserve />
                  </div>
                  <div style={{ flex: "0 0 70px", display: "flex", justifyContent: "flex-end" }}>
                    <SsoCell route={s.route} reserve />
                  </div>
                  {/* Keep-alive: dedicated reserved column (muted "—" when off) so it lines up
                      with Cert/SSO across rows. Filled + glowing when the embed is live now. */}
                  <div style={{ flex: "0 0 46px", display: "flex", justifyContent: "flex-end" }}>
                    <KeepAliveCell service={s} live={keptAliveIds.includes(s.id)} reserve iconOnly />
                  </div>
                  {/* Always reserve this column (even when empty) so heartbeats stay aligned
                      across monitored and unmonitored rows. */}
                  <div style={{ flex: "0 0 70px", display: "flex", justifyContent: "flex-end" }} title="response time, last 30 checks">
                    {s.msHistory && s.msHistory.length > 1 && (
                      <Sparkline data={s.msHistory} w={64} h={24} color="var(--primary)" strokeW={1.25} />
                    )}
                  </div>
                  <div style={{ flex: "0 0 60px", textAlign: "right" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: s.status === "down" ? "var(--error)" : s.status === "degraded" ? "var(--amber)" : "var(--on-surface)" }}>{s.status === "unknown" ? "—" : `${s.uptime.toFixed(2)}%`}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--on-surface-variant)" }}>{s.status === "unknown" ? "—" : `${s.ms}ms`}</div>
                  </div>
                </div>
              ))}
            </div>
          </PanelShell>

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
                <Pill tone="primary" style={{ marginLeft: 4 }}>
                  Admin
                </Pill>
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
                    value={metrics.diskUsedBytes != null && metrics.diskTotalBytes ? `${fmtPercent(metrics.diskUsedBytes, metrics.diskTotalBytes)}%` : "—"}
                    unit={`${fmtBytes(metrics.diskUsedBytes)} of ${fmtBytes(metrics.diskTotalBytes)}`}
                    color="var(--amber)"
                    data={metrics.diskHistory}
                  />
                  <MetricCard
                    title="System load"
                    value={metrics.sysLoad != null ? metrics.sysLoad.toFixed(2) : "—"}
                    unit={metrics.load5 != null && metrics.load15 != null ? `${metrics.load5.toFixed(2)} · ${metrics.load15.toFixed(2)} (5m·15m)` : "1-min avg"}
                    color="var(--originator-own)"
                    data={metrics.sysLoadHistory}
                  />
                  {metrics.swapTotalBytes != null && metrics.swapTotalBytes > 0 && (
                    <MetricCard
                      title="Swap"
                      value={fmtBytes(metrics.swapUsedBytes)}
                      unit={`of ${fmtBytes(metrics.swapTotalBytes)}`}
                      color="var(--originator-third-party)"
                      data={[]}
                    />
                  )}
                  {metrics.uptimeSec != null && (
                    <MetricCard
                      title="Uptime"
                      value={fmtUptime(metrics.uptimeSec)}
                      unit="since boot"
                      color="var(--primary)"
                      data={[]}
                    />
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
