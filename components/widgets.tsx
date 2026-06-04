"use client";
// ============================================================
// AERIE — modular dashboard widgets (new for the grid homescreen)
// Each is fill-aware so it can fill a grid tile. Real-data-or-empty:
// widgets read the live Snapshot and render a graceful empty state
// when their source isn't configured — no mock fallback.
// ============================================================
import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { useData } from "@/components/portal/DataProvider";
import { PanelShell, Empty, useTick } from "@/components/panels";
import { Icon, Eyebrow, StatusDot } from "@/components/primitives";
import type { ShortcutLink } from "@/components/portal/widgetCatalog";

type CSS = React.CSSProperties;

// ── responsive element size (for fluid charts) ─────────────
function useElSize() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 320, h: 80 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

// Fluid area chart that fills its container.
function FluidArea({ data, color = "var(--primary)" }: { data: number[]; color?: string }) {
  const [ref, { w, h }] = useElSize();
  const gid = useId().replace(/:/g, "");
  const path = useMemo(() => {
    if (w < 2 || h < 2 || data.length < 2) return { line: "", area: "" };
    const max = Math.max(...data, 1);
    const min = Math.min(...data, 0);
    const span = max - min || 1;
    const pts = data.map((v, i) => [(i / (data.length - 1)) * w, h - 2 - ((v - min) / span) * (h - 6)]);
    const line = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
    return { line, area: line + ` L${w} ${h} L0 ${h} Z` };
  }, [data, w, h]);
  return (
    <div ref={ref} style={{ position: "absolute", inset: 0 }}>
      <svg width={w} height={h} style={{ display: "block" }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.26" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={path.area} fill={`url(#${gid})`} />
        <path d={path.line} fill="none" stroke={color} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    </div>
  );
}

function Metric({ label, value, unit, color, icon }: { label: string; value: React.ReactNode; unit?: string; color?: string; icon?: string }) {
  return (
    <div style={{ minWidth: 72 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        {icon && <Icon name={icon} size={13} color={color} />}
        <Eyebrow>{label}</Eyebrow>
      </div>
      <div
        style={{
          fontFamily: "var(--font-headline)",
          fontWeight: 800,
          fontSize: 23,
          lineHeight: 1.05,
          letterSpacing: "-0.02em",
          color: "var(--on-surface)",
          fontVariantNumeric: "tabular-nums",
          marginTop: 3,
        }}
      >
        {value}
        {unit && <span style={{ fontSize: 11, fontWeight: 600, color: "var(--on-surface-variant)", marginLeft: 2 }}>{unit}</span>}
      </div>
    </div>
  );
}

// ── BANDWIDTH ──────────────────────────────────────────────
// Real current streaming bandwidth from Tautulli (snapshot.bandwidth) plus host
// network rates from the active metrics source. The 24h area chart is driven by
// the host network history when available, else 24h play counts as a proxy.
export function BandwidthWidget({ fill }: { fill?: boolean } = {}) {
  const { bandwidth, metrics, plays24h } = useData();
  const hostOutMbps = metrics?.netOutBps != null ? metrics.netOutBps / 1e6 : null;
  const hostInMbps = metrics?.netInBps != null ? metrics.netInBps / 1e6 : null;
  const hasAny = !!bandwidth || hostOutMbps != null || hostInMbps != null;

  const series = metrics?.netHistory?.length ? metrics.netHistory : plays24h;
  const seriesLabel = metrics?.netHistory?.length ? "host network" : "24h plays";

  return (
    <PanelShell fill={fill} title="Bandwidth" icon="speed" accent="var(--primary)" live={hasAny}>
      {!hasAny ? (
        <Empty icon="speed" line="No bandwidth data" sub="Connect Tautulli or a metrics source to see live throughput." />
      ) : (
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14, height: "100%", boxSizing: "border-box" }}>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            {bandwidth && <Metric label="Streaming" value={bandwidth.totalMbps.toFixed(1)} unit="Mbps" color="var(--primary)" icon="cloud_upload" />}
            {bandwidth && bandwidth.wanMbps > 0 && <Metric label="WAN" value={bandwidth.wanMbps.toFixed(1)} unit="Mbps" color="var(--originator-third-party)" icon="cloud_download" />}
            {hostOutMbps != null && <Metric label="Host out" value={hostOutMbps.toFixed(1)} unit="Mbps" color="var(--originator-own)" icon="lan" />}
            {hostInMbps != null && <Metric label="Host in" value={hostInMbps.toFixed(1)} unit="Mbps" color="var(--on-surface-variant)" icon="lan" />}
          </div>
          {series.length > 1 && (
            <>
              <div style={{ flex: 1, minHeight: 48, position: "relative" }}>
                <FluidArea data={series} color="var(--primary)" />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--on-surface-variant)" }}>
                <span>24h ago</span>
                <span>{seriesLabel}</span>
                <span>now</span>
              </div>
            </>
          )}
        </div>
      )}
    </PanelShell>
  );
}

// ── CLOCK & UPTIME ─────────────────────────────────────────
// Local time/date (client-side) plus monitored-host uptime from the active
// metrics source. No fabricated version string — uptime hides when no source.
export function ClockWidget({ fill }: { fill?: boolean } = {}) {
  const { metrics } = useData();
  useTick(1000);
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  const date = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  const up = metrics?.uptimeSec ?? null;
  const upDays = up != null ? Math.floor(up / 86400) : 0;
  const upHrs = up != null ? Math.floor((up % 86400) / 3600) : 0;

  return (
    <PanelShell fill={fill} title="Clock" icon="schedule" accent="var(--primary)">
      <div style={{ padding: "16px 18px", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", gap: 7, boxSizing: "border-box" }}>
        <div
          suppressHydrationWarning
          style={{
            fontFamily: "var(--font-mono)",
            fontWeight: 700,
            fontSize: "clamp(30px, 8vw, 46px)",
            lineHeight: 1,
            letterSpacing: "-0.02em",
            color: "var(--on-surface)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {hh}:{mm}
          <span style={{ fontSize: "0.42em", color: "var(--primary)", marginLeft: 4 }}>{ss}</span>
        </div>
        <div suppressHydrationWarning style={{ fontSize: 12.5, fontWeight: 600, color: "var(--on-surface-variant)" }}>
          {date}
        </div>
        {up != null && (
          <>
            <div style={{ height: 1, background: "var(--outline-variant)", margin: "5px 0" }} />
            <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11, color: "var(--on-surface-variant)" }}>
              <StatusDot status="up" size={6} />
              <span style={{ fontFamily: "var(--font-mono)" }}>
                Host up {upDays}d {upHrs}h
              </span>
            </div>
          </>
        )}
      </div>
    </PanelShell>
  );
}

// ── SHORTCUTS (backend deferred) ───────────────────────────
// Custom quick-launch links will be admin/user-authored config (a future DB
// table). Until then this renders a graceful "not configured" empty state.
export function ShortcutsWidget({ fill, links = [] }: { fill?: boolean; links?: ShortcutLink[] } = {}) {
  return (
    <PanelShell fill={fill} title="Shortcuts" icon="bolt" accent="var(--primary)">
      {links.length === 0 ? (
        <Empty icon="bolt" line="No shortcuts yet" sub="Open widget settings to add quick-launch links." />
      ) : (
        <div style={{ padding: "10px 14px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(72px, 1fr))", gap: 8, alignContent: "start" }}>
          {links.map((link, i) => (
            <a
              key={i}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              title={link.label}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 5,
                padding: "10px 6px 8px",
                borderRadius: 8,
                background: "var(--surface-container)",
                color: "var(--on-surface)",
                textDecoration: "none",
                cursor: "pointer",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-container-high)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "var(--surface-container)")}
            >
              <Icon name={link.icon || "link"} size={22} color="var(--primary)" />
              <span style={{ fontSize: 11, fontWeight: 600, textAlign: "center", lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", width: "100%" }}>
                {link.label || link.url}
              </span>
            </a>
          ))}
        </div>
      )}
    </PanelShell>
  );
}

// ── ANNOUNCEMENTS (backend deferred) ───────────────────────
export function AnnouncementsWidget({ fill }: { fill?: boolean } = {}) {
  return (
    <PanelShell fill={fill} title="Announcements" icon="campaign" accent="var(--amber)">
      <Empty icon="campaign" line="No announcements" sub="Broadcast notices will appear here once they can be posted from Admin." />
    </PanelShell>
  );
}

// ── shared layout + helpers for the stat-panel widgets ─────
function StatRow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: 16, display: "flex", gap: 20, flexWrap: "wrap", alignContent: "flex-start", height: "100%", boxSizing: "border-box" }}>
      {children}
    </div>
  );
}

function relTime(iso: string | null): string {
  if (!iso) return "never";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "recently";
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function relFuture(iso: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const s = (t - Date.now()) / 1000;
  if (s <= 0) return "due";
  if (s < 3600) return `in ${Math.max(1, Math.floor(s / 60))}m`;
  if (s < 86400) return `in ${Math.floor(s / 3600)}h`;
  return `in ${Math.floor(s / 86400)}d`;
}

// ── WIZARR — invite / user stats ───────────────────────────
export function WizarrWidget({ fill }: { fill?: boolean } = {}) {
  const { wizarr } = useData();
  return (
    <PanelShell fill={fill} title="Wizarr" icon="person_add" accent="var(--primary)" live={!!wizarr}>
      {!wizarr ? (
        <Empty icon="person_add" line="Wizarr not connected" sub="Add Wizarr and store its API key to see invite activity." />
      ) : (
        <StatRow>
          <Metric label="Users" value={wizarr.users.toLocaleString("en-US")} icon="group" color="var(--primary)" />
          <Metric label="Invites" value={wizarr.invites.toLocaleString("en-US")} icon="mail" color="var(--on-surface-variant)" />
          <Metric label="Pending" value={wizarr.pending.toLocaleString("en-US")} icon="hourglass_top" color={wizarr.pending > 0 ? "var(--amber)" : "var(--on-surface-variant)"} />
          <Metric label="Expired" value={wizarr.expired.toLocaleString("en-US")} icon="event_busy" color={wizarr.expired > 0 ? "var(--error)" : "var(--on-surface-variant)"} />
        </StatRow>
      )}
    </PanelShell>
  );
}

// ── PROWLARR — indexer health + grab/query stats ───────────
export function ProwlarrWidget({ fill }: { fill?: boolean } = {}) {
  const { prowlarr } = useData();
  return (
    <PanelShell fill={fill} title="Indexers" icon="search" accent="var(--originator-third-party)" live={!!prowlarr}>
      {!prowlarr ? (
        <Empty icon="search" line="Prowlarr not connected" sub="Add Prowlarr and store its API key to see indexer stats." />
      ) : (
        <StatRow>
          <Metric label="Indexers" value={`${prowlarr.enabled}/${prowlarr.total}`} icon="dns" color="var(--primary)" />
          <Metric label="Queries" value={prowlarr.queries.toLocaleString("en-US")} icon="travel_explore" color="var(--on-surface-variant)" />
          <Metric label="Grabs" value={prowlarr.grabs.toLocaleString("en-US")} icon="download" color="var(--originator-own)" />
          <Metric label="Failed grabs" value={prowlarr.failedGrabs.toLocaleString("en-US")} icon="error" color={prowlarr.failedGrabs > 0 ? "var(--error)" : "var(--on-surface-variant)"} />
        </StatRow>
      )}
    </PanelShell>
  );
}

// ── AGREGARR — Plex collections sync status ────────────────
export function AgregarrWidget({ fill }: { fill?: boolean } = {}) {
  const { agregarr } = useData();
  return (
    <PanelShell fill={fill} title="Collections" icon="collections" accent="var(--originator-court)" live={!!agregarr}>
      {!agregarr ? (
        <Empty icon="collections" line="Agregarr not connected" sub="Add Agregarr and store its API key to see collection sync status." />
      ) : (
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14, height: "100%", boxSizing: "border-box" }}>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            <Metric label="Collections" value={agregarr.activeCollections === agregarr.collections ? agregarr.collections.toLocaleString("en-US") : `${agregarr.activeCollections}/${agregarr.collections}`} icon="collections_bookmark" color="var(--primary)" />
            <Metric label="Needs sync" value={agregarr.needingSync.toLocaleString("en-US")} icon="sync_problem" color={agregarr.needingSync > 0 ? "var(--amber)" : "var(--on-surface-variant)"} />
          </div>
          {agregarr.running ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--on-surface-variant)" }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{agregarr.currentStage || "Syncing…"}</span>
                <span style={{ fontFamily: "var(--font-mono)" }}>{agregarr.progress}%</span>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: "var(--surface-container-high)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${Math.min(100, Math.max(0, agregarr.progress))}%`, background: "var(--primary)", transition: "width 0.3s" }} />
              </div>
            </div>
          ) : (
            <div suppressHydrationWarning style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11, color: "var(--on-surface-variant)" }}>
              <StatusDot status={agregarr.error ? "down" : "up"} size={6} />
              {agregarr.error
                ? "Last sync failed"
                : `Last synced ${relTime(agregarr.lastSyncAt)}${relFuture(agregarr.nextSyncAt) ? ` · next ${relFuture(agregarr.nextSyncAt)}` : ""}`}
            </div>
          )}
        </div>
      )}
    </PanelShell>
  );
}

// ── BAZARR — wanted (missing) subtitle counts ──────────────
export function BazarrWidget({ fill }: { fill?: boolean } = {}) {
  const { bazarrWanted: w } = useData();
  return (
    <PanelShell fill={fill} title="Subtitles" icon="subtitles" accent="var(--primary)" live={!!w}>
      {!w ? (
        <Empty icon="subtitles" line="Bazarr not connected" sub="Add Bazarr and store its API key to see missing subtitles." />
      ) : (
        <StatRow>
          <Metric label="Wanted episodes" value={w.episodes.toLocaleString("en-US")} icon="live_tv" color={w.episodes > 0 ? "var(--amber)" : "var(--on-surface-variant)"} />
          <Metric label="Wanted movies" value={w.movies.toLocaleString("en-US")} icon="movie" color={w.movies > 0 ? "var(--amber)" : "var(--on-surface-variant)"} />
          <Metric label="Total missing" value={(w.episodes + w.movies).toLocaleString("en-US")} icon="subtitles_off" color="var(--primary)" />
        </StatRow>
      )}
    </PanelShell>
  );
}

export type { CSS };
