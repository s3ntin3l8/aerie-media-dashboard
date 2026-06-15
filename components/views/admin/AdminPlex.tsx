"use client";
// ============================================================
// AERIE — Admin · Plex Maintenance sub-view
// Lists the Plex server's libraries + butler tasks and lets an admin trigger
// scans / metadata refresh / analyze / housekeeping. Loads on demand (its own
// server action) rather than via the snapshot poll. Actions are fire-and-forget:
// buttons say "started", then the panel re-reads to reflect `refreshing` / task state.
//
// Both tables mirror the Services table: a sortable header row + hairline row
// dividers on desktop (horizontal-scroll grid), stacked cards on mobile.
// ============================================================
import React, { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { Icon, Eyebrow, Pill, Btn, listDivider } from "@/components/primitives";
import {
  getPlexPanelData,
  scanSectionAction,
  analyzeSectionAction,
  emptyTrashAction,
  cleanBundlesAction,
  optimizeDbAction,
  runButlerTaskAction,
  type PlexPanelData,
  type PlexActionResult,
} from "@/app/(portal)/admin/plex-actions";

const SECTION_ICON: Record<string, string> = { movie: "movie", show: "live_tv", artist: "library_music", photo: "photo_library" };

// Plex's /butler `interval` is a count of DAYS (e.g. BackupDatabase=3, CleanOldBundles=7),
// NOT seconds — render it as a human cadence rather than dividing by 3600 (which rounded
// every real task to "every 0h").
function fmtInterval(days: number): string {
  if (!days) return "manual";
  if (days === 1) return "daily";
  if (days % 7 === 0) return days === 7 ? "weekly" : `every ${days / 7}w`;
  return `every ${days}d`;
}

// Last library scan: Plex `scannedAt` is epoch seconds. Compact "time ago" label, or "—" when absent.
function fmtScanned(epochSeconds?: number): string {
  if (!epochSeconds) return "—";
  const sec = Math.max(0, Math.floor(Date.now() / 1000 - epochSeconds));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

type SortDir = "asc" | "desc";
type SortState = { col: string; dir: SortDir };
const nextSort = (prev: SortState, col: string): SortState =>
  prev.col === col ? { col, dir: prev.dir === "asc" ? "desc" : "asc" } : { col, dir: "asc" };

const LIB_COLS = "minmax(160px, 2fr) 120px 130px 110px minmax(280px, auto)";
const TASK_COLS = "minmax(200px, 2.5fr) 130px 110px 120px";

export function AdminPlex({ flash, isMobile }: { flash: (msg: string) => void; isMobile: boolean }) {
  const [data, setData] = useState<PlexPanelData | null>(null);
  const [pending, start] = useTransition();
  const [libSort, setLibSort] = useState<SortState>({ col: "title", dir: "asc" });
  const [taskSort, setTaskSort] = useState<SortState>({ col: "title", dir: "asc" });

  const reload = useCallback(() => {
    start(async () => {
      try {
        setData(await getPlexPanelData());
      } catch {
        // requireAdmin throws only for non-admins; the route already guards this.
      }
    });
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // Run an action, flash its message, then re-read so `refreshing` / task state reflects the result.
  const act = (run: () => Promise<PlexActionResult>) =>
    start(async () => {
      const res = await run();
      flash(res.message);
      setData(await getPlexPanelData());
    });

  const sortedSections = useMemo(() => {
    const d = libSort.dir === "asc" ? 1 : -1;
    return [...(data?.sections ?? [])].sort((a, b) => {
      switch (libSort.col) {
        case "type":    return (a.type || "").localeCompare(b.type || "") * d;
        case "scanned": return ((a.scannedAt ?? 0) - (b.scannedAt ?? 0)) * d;
        case "status":  return (Number(b.refreshing) - Number(a.refreshing)) * d;
        case "title":
        default:        return a.title.localeCompare(b.title) * d;
      }
    });
  }, [data?.sections, libSort]);

  const sortedTasks = useMemo(() => {
    const d = taskSort.dir === "asc" ? 1 : -1;
    return [...(data?.tasks ?? [])].sort((a, b) => {
      switch (taskSort.col) {
        case "interval": return (a.interval - b.interval) * d;
        case "status":   return (Number(b.enabled) - Number(a.enabled)) * d;
        case "title":
        default:         return a.title.localeCompare(b.title) * d;
      }
    });
  }, [data?.tasks, taskSort]);

  if (data === null) {
    return <div style={{ padding: 40, textAlign: "center", color: "var(--on-surface-variant)", fontSize: 13 }}>Loading Plex…</div>;
  }

  // ── Setup states ──────────────────────────────────────────
  if (!data.configured || !data.hasToken) {
    return (
      <div className="card" style={{ padding: 24, borderRadius: 18, background: "var(--surface-container-lowest)", textAlign: "center" }}>
        <Icon name="smart_display" size={28} color="var(--on-surface-variant)" />
        <h3 style={{ margin: "10px 0 6px", fontSize: 15, fontWeight: 700, color: "var(--on-surface)" }}>
          {data.configured ? "Add a Plex token" : "Plex isn’t configured"}
        </h3>
        <p style={{ margin: "0 auto", maxWidth: 460, fontSize: 12.5, lineHeight: 1.5, color: "var(--on-surface-variant)" }}>
          {data.configured
            ? "Maintenance actions need the server owner’s X-Plex-Token. Add it under Services → Plex → API key. See docs/services/plex.md for how to obtain it."
            : "Add Plex under Services first, then store the server owner’s X-Plex-Token to enable maintenance actions."}
        </p>
      </div>
    );
  }

  const rowPad = isMobile ? "12px 14px" : "11px 18px";

  // A sortable column header — mirrors the Services table (expand_less / expand_more / unfold_more).
  const sortHead = (sort: SortState, onSort: (col: string) => void, col: string, label: string) => {
    const active = sort.col === col;
    return (
      <button
        onClick={() => onSort(col)}
        style={{ display: "inline-flex", alignItems: "center", gap: 3, background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}
      >
        <Eyebrow style={{ color: active ? "var(--on-surface)" : undefined, whiteSpace: "nowrap" }}>{label}</Eyebrow>
        <Icon
          name={active ? (sort.dir === "asc" ? "expand_less" : "expand_more") : "unfold_more"}
          size={13}
          color={active ? "var(--on-surface)" : "var(--on-surface-variant)"}
          style={{ opacity: active ? 1 : 0.4 }}
        />
      </button>
    );
  };
  const setLibCol = (col: string) => setLibSort((p) => nextSort(p, col));
  const setTaskCol = (col: string) => setTaskSort((p) => nextSort(p, col));
  const libHead = (col: string, label: string) => sortHead(libSort, setLibCol, col, label);
  const taskHead = (col: string, label: string) => sortHead(taskSort, setTaskCol, col, label);

  const libActions = (s: PlexPanelData["sections"][number]) => (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }}>
      <Btn variant="tonal" size="xs" icon="sync" onClick={() => act(() => scanSectionAction(s.id))} disabled={pending}>Scan</Btn>
      <Btn variant="ghost" size="xs" icon="refresh" onClick={() => act(() => scanSectionAction(s.id, true))} disabled={pending}>Refresh metadata</Btn>
      <Btn variant="ghost" size="xs" icon="graphic_eq" onClick={() => act(() => analyzeSectionAction(s.id))} disabled={pending}>Analyze</Btn>
      <Btn variant="ghost" size="xs" icon="delete_sweep" onClick={() => act(() => emptyTrashAction(s.id))} disabled={pending}>Empty trash</Btn>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {data.error && (
        <div style={{ padding: "10px 14px", borderRadius: 12, background: "color-mix(in srgb, var(--error) 12%, transparent)", color: "var(--error)", fontSize: 12.5 }}>
          {data.error}
        </div>
      )}

      {/* Header + manual refresh */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Icon name="smart_display" size={18} color="var(--primary)" />
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--on-surface)" }}>Plex Maintenance</h2>
        <Pill tone="primary">Admin</Pill>
        <div style={{ flex: 1 }} />
        <Btn variant="ghost" size="sm" icon="refresh" onClick={reload} disabled={pending} title="Reload libraries and tasks">
          {isMobile ? "" : "Refresh"}
        </Btn>
      </div>

      {/* ── Libraries ─────────────────────────────────────── */}
      <div>
        <Eyebrow style={{ marginBottom: 8 }}>Libraries</Eyebrow>
        {sortedSections.length === 0 ? (
          <div style={{ borderRadius: 16, border: "1px solid var(--outline-variant)", overflow: "hidden", background: "var(--surface-container-lowest)" }}>
            <div style={{ padding: 18, fontSize: 12.5, color: "var(--on-surface-variant)" }}>No libraries found.</div>
          </div>
        ) : isMobile ? (
          <div style={{ borderRadius: 16, border: "1px solid var(--outline-variant)", overflow: "hidden", background: "var(--surface-container-lowest)" }}>
            {sortedSections.map((s, i) => (
              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: rowPad, borderTop: listDivider(i) }}>
                <Icon name={SECTION_ICON[s.type] ?? "folder"} size={18} color="var(--on-surface-variant)" />
                <div style={{ minWidth: 120, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{ fontWeight: 700, fontSize: 13.5, color: "var(--on-surface)" }}>{s.title}</span>
                    {s.refreshing && <Pill tone="primary">refreshing</Pill>}
                  </div>
                  <span style={{ fontSize: 11, color: "var(--on-surface-variant)", textTransform: "capitalize" }}>
                    {s.type || "library"} · scanned {fmtScanned(s.scannedAt)}
                  </span>
                </div>
                {libActions(s)}
              </div>
            ))}
          </div>
        ) : (
          <div className="aerie-x-scroll">
            <div style={{ minWidth: 880, borderRadius: 16, border: "1px solid var(--outline-variant)", overflow: "hidden", background: "var(--surface-container-lowest)" }}>
              <div style={{ display: "grid", gridTemplateColumns: LIB_COLS, gap: 12, alignItems: "center", padding: "11px 18px", borderBottom: "1px solid var(--outline-variant)", background: "color-mix(in srgb, var(--surface-container) 50%, transparent)" }}>
                {libHead("title", "Library")}
                {libHead("type", "Type")}
                {libHead("scanned", "Last scanned")}
                {libHead("status", "Status")}
                <div style={{ textAlign: "right" }}><Eyebrow style={{ whiteSpace: "nowrap" }}>Actions</Eyebrow></div>
              </div>
              {sortedSections.map((s, i) => (
                <div key={s.id} style={{ display: "grid", gridTemplateColumns: LIB_COLS, gap: 12, alignItems: "center", padding: "12px 18px", borderTop: listDivider(i) }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <Icon name={SECTION_ICON[s.type] ?? "folder"} size={18} color="var(--on-surface-variant)" />
                    <span style={{ fontWeight: 700, fontSize: 13.5, color: "var(--on-surface)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</span>
                  </div>
                  <span style={{ fontSize: 12, color: "var(--on-surface-variant)", textTransform: "capitalize" }}>{s.type || "library"}</span>
                  <span style={{ fontSize: 12, color: "var(--on-surface-variant)", fontFamily: "var(--font-mono)" }}>{fmtScanned(s.scannedAt)}</span>
                  <span>{s.refreshing ? <Pill tone="primary">refreshing</Pill> : <span style={{ fontSize: 12, color: "var(--on-surface-variant)" }}>idle</span>}</span>
                  {libActions(s)}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Server housekeeping ───────────────────────────── */}
      <div>
        <Eyebrow style={{ marginBottom: 8 }}>Server housekeeping</Eyebrow>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Btn variant="tonal" size="sm" icon="cleaning_services" onClick={() => act(cleanBundlesAction)} disabled={pending}>Clean bundles</Btn>
          <Btn variant="tonal" size="sm" icon="database" onClick={() => act(optimizeDbAction)} disabled={pending}>Optimize database</Btn>
          <Btn variant="tonal" size="sm" icon="delete_sweep" onClick={() => act(() => emptyTrashAction())} disabled={pending}>Empty all trash</Btn>
        </div>
      </div>

      {/* ── Scheduled (butler) tasks ──────────────────────── */}
      <div>
        <Eyebrow style={{ marginBottom: 4 }}>Scheduled tasks</Eyebrow>
        <p style={{ margin: "0 0 8px", fontSize: 11, color: "var(--on-surface-variant)" }}>
          Plex doesn’t report when each task last ran — only its cadence and whether it’s enabled. Tasks run during the nightly maintenance window.
        </p>
        {sortedTasks.length === 0 ? (
          <div style={{ borderRadius: 16, border: "1px solid var(--outline-variant)", overflow: "hidden", background: "var(--surface-container-lowest)" }}>
            <div style={{ padding: 18, fontSize: 12.5, color: "var(--on-surface-variant)" }}>
              No scheduled tasks reported. Intro/credit detection and deep analysis require Plex Pass.
            </div>
          </div>
        ) : isMobile ? (
          <div style={{ borderRadius: 16, border: "1px solid var(--outline-variant)", overflow: "hidden", background: "var(--surface-container-lowest)" }}>
            {sortedTasks.map((t, i) => (
              <div key={t.name} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: rowPad, borderTop: listDivider(i) }}>
                <div style={{ minWidth: 160, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{ fontWeight: 700, fontSize: 13.5, color: "var(--on-surface)" }}>{t.title}</span>
                    <Pill tone={t.enabled ? "originator-own" : "on-surface-variant"}>{t.enabled ? fmtInterval(t.interval) : "disabled"}</Pill>
                  </div>
                  {t.description && <span style={{ fontSize: 11, color: "var(--on-surface-variant)" }}>{t.description}</span>}
                </div>
                <Btn variant="ghost" size="xs" icon="play_arrow" onClick={() => act(() => runButlerTaskAction(t.name))} disabled={pending}>Run now</Btn>
              </div>
            ))}
          </div>
        ) : (
          <div className="aerie-x-scroll">
            <div style={{ minWidth: 720, borderRadius: 16, border: "1px solid var(--outline-variant)", overflow: "hidden", background: "var(--surface-container-lowest)" }}>
              <div style={{ display: "grid", gridTemplateColumns: TASK_COLS, gap: 12, alignItems: "center", padding: "11px 18px", borderBottom: "1px solid var(--outline-variant)", background: "color-mix(in srgb, var(--surface-container) 50%, transparent)" }}>
                {taskHead("title", "Task")}
                {taskHead("interval", "Interval")}
                {taskHead("status", "Status")}
                <div style={{ textAlign: "right" }}><Eyebrow style={{ whiteSpace: "nowrap" }}>Actions</Eyebrow></div>
              </div>
              {sortedTasks.map((t, i) => (
                <div key={t.name} style={{ display: "grid", gridTemplateColumns: TASK_COLS, gap: 12, alignItems: "center", padding: "12px 18px", borderTop: listDivider(i) }}>
                  <div style={{ minWidth: 0 }}>
                    <span style={{ fontWeight: 700, fontSize: 13.5, color: "var(--on-surface)" }}>{t.title}</span>
                    {t.description && <div style={{ fontSize: 11, color: "var(--on-surface-variant)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.description}</div>}
                  </div>
                  <span><Pill tone="on-surface-variant">{fmtInterval(t.interval)}</Pill></span>
                  <span>
                    {t.enabled
                      ? <Pill tone="originator-own">enabled</Pill>
                      : <Pill tone="on-surface-variant">disabled</Pill>}
                  </span>
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <Btn variant="ghost" size="xs" icon="play_arrow" onClick={() => act(() => runButlerTaskAction(t.name))} disabled={pending}>Run now</Btn>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
