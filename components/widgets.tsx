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
import { fmtBytes, fmtPercent, fmtMbps } from "@/lib/format";
import { Icon, Eyebrow, StatusDot, listDivider } from "@/components/primitives";
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
          {/* suppressHydrationWarning doesn't propagate to children, so the (always-drifting)
              seconds in this nested span need their own to avoid a hydration mismatch. */}
          <span suppressHydrationWarning style={{ fontSize: "0.42em", color: "var(--primary)", marginLeft: 4 }}>{ss}</span>
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
      <Empty art icon="campaign" line="No announcements" sub="Broadcast notices will appear here once they can be posted from Admin." />
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

// ── INDEXERS — Prowlarr or NZBHydra2 (functional merge) ────
// One "Indexers" widget; the data source is picked per-tile (Auto = Prowlarr,
// then NZBHydra2). Each source keeps its own stat set.
export function IndexersWidget({ fill, source, title }: { fill?: boolean; source?: string; title?: string } = {}) {
  const { prowlarr, nzbhydra } = useData();
  const resolved = source || (prowlarr ? "prowlarr" : nzbhydra ? "nzbhydra" : "");
  const live = resolved === "prowlarr" ? !!prowlarr : resolved === "nzbhydra" ? !!nzbhydra : !!(prowlarr || nzbhydra);
  const num = (n: number) => n.toLocaleString("en-US");
  return (
    <PanelShell fill={fill} title={title && title.length > 0 ? title : "Indexers"} icon="search" accent="var(--originator-third-party)" live={live}>
      {resolved === "prowlarr" && prowlarr ? (
        <StatRow>
          <Metric label="Indexers" value={`${prowlarr.enabled}/${prowlarr.total}`} icon="dns" color="var(--primary)" />
          <Metric label="Queries" value={num(prowlarr.queries)} icon="travel_explore" color="var(--on-surface-variant)" />
          <Metric label="Grabs" value={num(prowlarr.grabs)} icon="download" color="var(--originator-own)" />
          <Metric label="Failed grabs" value={num(prowlarr.failedGrabs)} icon="error" color={prowlarr.failedGrabs > 0 ? "var(--error)" : "var(--on-surface-variant)"} />
        </StatRow>
      ) : resolved === "nzbhydra" && nzbhydra ? (
        <StatRow>
          <Metric label="Indexers" value={`${nzbhydra.enabled}/${nzbhydra.total}`} icon="dns" color="var(--primary)" />
          <Metric label="Disabled" value={num(nzbhydra.disabled)} icon="block" color="var(--on-surface-variant)" />
          <Metric label="Errored" value={num(nzbhydra.errored)} icon="error" color={nzbhydra.errored > 0 ? "var(--error)" : "var(--on-surface-variant)"} />
        </StatRow>
      ) : (
        <Empty icon="search" line="No indexer source connected" sub="Add Prowlarr or NZBHydra2 and store its API key to see indexer stats." />
      )}
    </PanelShell>
  );
}

// ── BOOKS — LazyLibrarian or Listenarr (functional merge) ──
// One "Books" widget; the source is picked per-tile (Auto = LazyLibrarian, then
// Listenarr). Toggles span both sources; each only applies to the matching one.
export function BooksWidget({
  fill,
  source,
  title,
  showBooks = true,
  showAuthors = true,
  showWanted = true,
  showMonitored = true,
  showSnatched = false,
}: { fill?: boolean; source?: string; title?: string; showBooks?: boolean; showAuthors?: boolean; showWanted?: boolean; showMonitored?: boolean; showSnatched?: boolean } = {}) {
  const { lazylibrarian: ll, listenarr: la } = useData();
  const resolved = source || (ll ? "lazylibrarian" : la ? "listenarr" : "");
  const live = resolved === "lazylibrarian" ? !!ll : resolved === "listenarr" ? !!la : !!(ll || la);
  const num = (n: number) => n.toLocaleString("en-US");
  return (
    <PanelShell fill={fill} title={title && title.length > 0 ? title : "Books"} icon="menu_book" accent="var(--originator-third-party)" live={live}>
      {resolved === "lazylibrarian" && ll ? (
        <StatRow>
          {showBooks && <Metric label="Books" value={num(ll.totalBooks)} icon="menu_book" color="var(--primary)" />}
          {showAuthors && <Metric label="Authors" value={num(ll.authors)} icon="person" color="var(--on-surface-variant)" />}
          {showWanted && <Metric label="Wanted" value={num(ll.wanted)} icon="bookmark" color={ll.wanted > 0 ? "var(--amber)" : "var(--on-surface-variant)"} />}
          {showSnatched && <Metric label="Snatched" value={num(ll.snatched)} icon="downloading" color={ll.snatched > 0 ? "var(--primary)" : "var(--on-surface-variant)"} />}
        </StatRow>
      ) : resolved === "listenarr" && la ? (
        <StatRow>
          {showBooks && <Metric label="Audiobooks" value={num(la.audiobooks)} icon="headphones" color="var(--primary)" />}
          {showAuthors && <Metric label="Authors" value={num(la.authors)} icon="person" color="var(--on-surface-variant)" />}
          {showMonitored && <Metric label="Monitored" value={num(la.monitored)} icon="bookmark" color="var(--on-surface-variant)" />}
          {showWanted && <Metric label="Wanted" value={num(la.wanted)} icon="bookmark_add" color={la.wanted > 0 ? "var(--amber)" : "var(--on-surface-variant)"} />}
        </StatRow>
      ) : (
        <Empty icon="menu_book" line="No books source connected" sub="Add LazyLibrarian or Listenarr and store its API key to see book stats." />
      )}
    </PanelShell>
  );
}

// ── DOWNLOAD CLIENT — qBittorrent or NZBGet (functional merge) ──
// One "Download Client" widget; the source is picked per-tile (Auto = qBittorrent,
// then NZBGet). Each client shows its own stat set; toggles only apply to the
// matching source (usenet has no upload/seeding, torrents have no post-queue).
export function DownloadClientWidget({
  fill,
  source,
  title,
  showDown = true,
  showUp = true,
  showActive = true,
  showSeeding = true,
  showTotal = true,
  showRemaining = true,
  showDownloaded = true,
  showPostJobs = true,
}: {
  fill?: boolean; source?: string; title?: string;
  showDown?: boolean; showUp?: boolean; showActive?: boolean; showSeeding?: boolean; showTotal?: boolean;
  showRemaining?: boolean; showDownloaded?: boolean; showPostJobs?: boolean;
} = {}) {
  const { qbittorrent: qb, nzbgetStatus: nz } = useData();
  const resolved = source || (qb ? "qbittorrent" : nz ? "nzbget" : "");
  const live = resolved === "qbittorrent" ? !!qb : resolved === "nzbget" ? !!nz : !!(qb || nz);
  const num = (n: number) => n.toLocaleString("en-US");
  return (
    <PanelShell fill={fill} title={title && title.length > 0 ? title : "Download Client"} icon="downloading" accent="var(--originator-third-party)" live={live}>
      {resolved === "qbittorrent" && qb ? (
        <StatRow>
          {showDown && <Metric label="Download" value={fmtBytes(qb.dlSpeed)} unit="/s" icon="arrow_downward" color="var(--primary)" />}
          {showUp && <Metric label="Upload" value={fmtBytes(qb.upSpeed)} unit="/s" icon="arrow_upward" color="var(--on-surface-variant)" />}
          {showActive && <Metric label="Active" value={num(qb.downloading)} icon="downloading" color="var(--primary)" />}
          {showSeeding && <Metric label="Seeding" value={num(qb.seeding)} icon="upload" color="var(--on-surface-variant)" />}
          {showTotal && <Metric label="Total" value={num(qb.torrents)} icon="folder" color="var(--on-surface-variant)" />}
        </StatRow>
      ) : resolved === "nzbget" && nz ? (
        <StatRow>
          {showDown && <Metric label="Download" value={fmtBytes(nz.downloadRate)} unit="/s" icon="arrow_downward" color="var(--primary)" />}
          {showRemaining && <Metric label="Remaining" value={fmtBytes(nz.remainingMB * 1e6)} icon="hourglass_top" color={nz.remainingMB > 0 ? "var(--primary)" : "var(--on-surface-variant)"} />}
          {showDownloaded && <Metric label="Downloaded" value={fmtBytes(nz.downloadedMB * 1e6)} icon="download_done" color="var(--on-surface-variant)" />}
          {showPostJobs && <Metric label="Post-processing" value={num(nz.postJobs)} icon="build" color={nz.postJobs > 0 ? "var(--amber)" : "var(--on-surface-variant)"} />}
          <Metric label="Status" value={nz.paused ? "Paused" : nz.standby ? "Idle" : "Downloading"} icon={nz.paused ? "pause_circle" : nz.standby ? "schedule" : "downloading"} color={nz.paused ? "var(--amber)" : nz.standby ? "var(--on-surface-variant)" : "var(--originator-own)"} />
        </StatRow>
      ) : (
        <Empty icon="downloading" line="No download client connected" sub="Add qBittorrent or NZBGet and store its credentials to see transfer stats." />
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

function fmtUptime(sec: number | null): string {
  if (sec == null) return "—";
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  if (d > 0) return `${d}d ${h}h`;
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ── HOST STATS — Prometheus or Beszel host metrics on the grid ──
// Brings the host metric cards (previously Status-only) onto the home grid with a
// per-tile source pick (Auto = the active metricsSource).
export function HostStatsWidget({
  fill,
  source,
  title,
  showCpu = true,
  showMemory = true,
  showDisk = true,
  showNet = true,
  showLoad = true,
  showUptime = true,
}: { fill?: boolean; source?: string; title?: string; showCpu?: boolean; showMemory?: boolean; showDisk?: boolean; showNet?: boolean; showLoad?: boolean; showUptime?: boolean } = {}) {
  const { metricsBySource, metrics, metricsSource } = useData();
  const src = source || metricsSource;
  const m = (src === "beszel" ? metricsBySource?.beszel : metricsBySource?.prometheus) ?? (source ? null : metrics);
  const anyOn = showCpu || showMemory || showDisk || showNet || showLoad || showUptime;
  return (
    <PanelShell fill={fill} title={title && title.length > 0 ? title : "Host Stats"} icon="memory" accent="var(--primary)" live={!!m}>
      {!m ? (
        <Empty icon="memory" line="No host metrics" sub="Add Prometheus or Beszel to show CPU, memory, disk and network." />
      ) : !anyOn ? (
        <Empty icon="tune" line="No stats enabled" sub="Turn stats on in this widget's settings." />
      ) : (
        <StatRow>
          {showCpu && <Metric label="CPU" value={m.cpuPct != null ? m.cpuPct.toFixed(0) : "—"} unit={m.cpuPct != null ? "%" : undefined} icon="memory" color="var(--primary)" />}
          {showMemory && <Metric label="Memory" value={fmtBytes(m.memUsedBytes)} unit={` / ${fmtBytes(m.memTotalBytes)}`} icon="memory_alt" color="var(--originator-court)" />}
          {showDisk && <Metric label="Disk" value={m.diskUsedBytes != null && m.diskTotalBytes ? String(fmtPercent(m.diskUsedBytes, m.diskTotalBytes)) : "—"} unit={m.diskTotalBytes ? "%" : undefined} icon="hard_drive" color="var(--amber)" />}
          {showNet && <Metric label="Net out" value={m.netOutBps != null ? fmtMbps(m.netOutBps) : "—"} unit=" Mbps" icon="arrow_upward" color="var(--originator-third-party)" />}
          {showNet && <Metric label="Net in" value={m.netInBps != null ? fmtMbps(m.netInBps) : "—"} unit=" Mbps" icon="arrow_downward" color="var(--originator-court)" />}
          {showLoad && <Metric label="Load" value={m.sysLoad != null ? m.sysLoad.toFixed(2) : "—"} icon="speed" color="var(--originator-own)" />}
          {showUptime && m.uptimeSec != null && <Metric label="Uptime" value={fmtUptime(m.uptimeSec)} icon="schedule" color="var(--primary)" />}
        </StatRow>
      )}
    </PanelShell>
  );
}

// ── SERVICE WARNINGS — *arr health issues on the grid ──────
export function HealthWidget({ fill, limit, title }: { fill?: boolean; limit?: number; title?: string } = {}) {
  const { arrHealth } = useData();
  const shown = limit != null ? arrHealth.slice(0, limit) : arrHealth;
  return (
    <PanelShell fill={fill} title={title && title.length > 0 ? title : "Service Warnings"} icon="warning" accent="var(--amber)" count={arrHealth.length ? `${arrHealth.length}` : undefined} live={arrHealth.length > 0}>
      {arrHealth.length === 0 ? (
        <Empty art icon="check_circle" line="No warnings" sub="Sonarr / Radarr / Listenarr health issues will appear here." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {shown.map((h, i) => {
            const isError = h.type.toLowerCase() === "error";
            const c = isError ? "var(--error)" : "var(--amber)";
            return (
              <div key={`${h.svc}-${i}`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderTop: listDivider(i) }}>
                <Icon name={isError ? "error" : "warning"} size={15} color={c} />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase", color: c, flex: "0 0 56px" }}>{h.svc}</span>
                <span style={{ fontSize: 12, color: "var(--on-surface)", flex: 1 }}>{h.message}</span>
              </div>
            );
          })}
        </div>
      )}
    </PanelShell>
  );
}

// ── 24h ACTIVITY — Tautulli rolling play histogram ─────────
export function ActivityWidget({ fill, title }: { fill?: boolean; title?: string } = {}) {
  const { plays24h } = useData();
  const total = plays24h.reduce((a, b) => a + b, 0);
  return (
    <PanelShell fill={fill} title={title && title.length > 0 ? title : "24h Activity"} icon="show_chart" accent="var(--primary)" live={total > 0}>
      {plays24h.length === 0 ? (
        <Empty icon="show_chart" line="No activity data" sub="Connect Tautulli to chart plays over the last 24 hours." />
      ) : (
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10, height: "100%", boxSizing: "border-box" }}>
          <Metric label="Plays · last 24h" value={total.toLocaleString("en-US")} icon="play_arrow" color="var(--primary)" />
          <div style={{ flex: 1, minHeight: 56, position: "relative" }}>
            <FluidArea data={plays24h} color="var(--primary)" />
          </div>
        </div>
      )}
    </PanelShell>
  );
}

export type { CSS };
