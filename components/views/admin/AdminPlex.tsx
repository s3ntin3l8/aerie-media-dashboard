"use client";
// ============================================================
// AERIE — Admin · Plex Maintenance sub-view
// Lists the Plex server's libraries + butler tasks and lets an admin trigger
// scans / metadata refresh / analyze / housekeeping. Loads on demand (its own
// server action) rather than via the snapshot poll. Actions are fire-and-forget:
// buttons say "started", then the panel re-reads to reflect `refreshing` / task state.
// ============================================================
import React, { useCallback, useEffect, useState, useTransition } from "react";
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

function fmtInterval(seconds: number): string {
  if (!seconds) return "manual";
  const h = Math.round(seconds / 3600);
  if (h < 24) return `every ${h}h`;
  return `every ${Math.round(h / 24)}d`;
}

export function AdminPlex({ flash, isMobile }: { flash: (msg: string) => void; isMobile: boolean }) {
  const [data, setData] = useState<PlexPanelData | null>(null);
  const [pending, start] = useTransition();

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
        <div style={{ borderRadius: 16, border: "1px solid var(--outline-variant)", overflow: "hidden", background: "var(--surface-container-lowest)" }}>
          {data.sections.length === 0 ? (
            <div style={{ padding: 18, fontSize: 12.5, color: "var(--on-surface-variant)" }}>No libraries found.</div>
          ) : (
            data.sections.map((s, i) => (
              <div
                key={s.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: "wrap",
                  padding: rowPad,
                  borderTop: i === 0 ? "none" : `1px solid ${listDivider(i)}`,
                }}
              >
                <Icon name={SECTION_ICON[s.type] ?? "folder"} size={18} color="var(--on-surface-variant)" />
                <div style={{ minWidth: 120, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{ fontWeight: 700, fontSize: 13.5, color: "var(--on-surface)" }}>{s.title}</span>
                    {s.refreshing && <Pill tone="primary">refreshing</Pill>}
                  </div>
                  <span style={{ fontSize: 11, color: "var(--on-surface-variant)", textTransform: "capitalize" }}>{s.type || "library"}</span>
                </div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  <Btn variant="tonal" size="xs" icon="sync" onClick={() => act(() => scanSectionAction(s.id))} disabled={pending}>Scan</Btn>
                  <Btn variant="ghost" size="xs" icon="refresh" onClick={() => act(() => scanSectionAction(s.id, true))} disabled={pending}>Refresh metadata</Btn>
                  <Btn variant="ghost" size="xs" icon="graphic_eq" onClick={() => act(() => analyzeSectionAction(s.id))} disabled={pending}>Analyze</Btn>
                  <Btn variant="ghost" size="xs" icon="delete_sweep" onClick={() => act(() => emptyTrashAction(s.id))} disabled={pending}>Empty trash</Btn>
                </div>
              </div>
            ))
          )}
        </div>
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
        <Eyebrow style={{ marginBottom: 8 }}>Scheduled tasks</Eyebrow>
        <div style={{ borderRadius: 16, border: "1px solid var(--outline-variant)", overflow: "hidden", background: "var(--surface-container-lowest)" }}>
          {data.tasks.length === 0 ? (
            <div style={{ padding: 18, fontSize: 12.5, color: "var(--on-surface-variant)" }}>
              No scheduled tasks reported. Intro/credit detection and deep analysis require Plex Pass.
            </div>
          ) : (
            data.tasks.map((t, i) => (
              <div
                key={t.name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: "wrap",
                  padding: rowPad,
                  borderTop: i === 0 ? "none" : `1px solid ${listDivider(i)}`,
                }}
              >
                <div style={{ minWidth: 160, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{ fontWeight: 700, fontSize: 13.5, color: "var(--on-surface)" }}>{t.title}</span>
                    <Pill tone={t.enabled ? "originator-own" : "on-surface-variant"}>{t.enabled ? fmtInterval(t.interval) : "disabled"}</Pill>
                  </div>
                  {t.description && <span style={{ fontSize: 11, color: "var(--on-surface-variant)" }}>{t.description}</span>}
                </div>
                <Btn variant="ghost" size="xs" icon="play_arrow" onClick={() => act(() => runButlerTaskAction(t.name))} disabled={pending}>Run now</Btn>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
