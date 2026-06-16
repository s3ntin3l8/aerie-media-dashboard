"use client";
import React, { useEffect, useState } from "react";
import type { StreamHistoryItem } from "@/lib/types";
import { Icon, Avatar, PosterTile, TRUNCATE, listDivider } from "@/components/primitives";
import { Empty, PanelShell, timeAgo } from "@/components/panels";

function fmtDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function usePagination<T>(items: T[], pageSize: number) {
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [items.length]);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  return { page: safePage, totalPages, slice: items.slice(safePage * pageSize, (safePage + 1) * pageSize), setPage };
}

function PageControls({ page, totalPages, setPage }: { page: number; totalPages: number; setPage: (p: number) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <button onClick={() => setPage(page - 1)} disabled={page === 0} style={{ background: "none", border: "none", padding: "2px 3px", cursor: page === 0 ? "default" : "pointer", color: page === 0 ? "var(--on-surface-variant)" : "var(--primary)", opacity: page === 0 ? 0.35 : 1, display: "flex", alignItems: "center" }}>
        <Icon name="chevron_left" size={14} />
      </button>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--on-surface-variant)", minWidth: 28, textAlign: "center" }}>{page + 1} / {totalPages}</span>
      <button onClick={() => setPage(page + 1)} disabled={page >= totalPages - 1} style={{ background: "none", border: "none", padding: "2px 3px", cursor: page >= totalPages - 1 ? "default" : "pointer", color: page >= totalPages - 1 ? "var(--on-surface-variant)" : "var(--primary)", opacity: page >= totalPages - 1 ? 0.35 : 1, display: "flex", alignItems: "center" }}>
        <Icon name="chevron_right" size={14} />
      </button>
    </div>
  );
}

function transcodeColor(decision?: string): string {
  if (decision === "transcode") return "var(--originator-third-party)";
  if (decision === "copy") return "var(--amber)";
  return "var(--originator-own)";
}

function HistoryRow({ item, i, isAdmin }: { item: StreamHistoryItem; i: number; isAdmin: boolean }) {
  const isEpisode = item.kind === "episode";
  const isTrack = item.kind === "track";

  const mainTitle = isEpisode || isTrack ? (item.grandparentTitle || item.title) : item.title;

  let subTitle: string | undefined;
  if (isEpisode) {
    const seNum =
      item.parentMediaIndex != null && item.mediaIndex != null
        ? `S${String(item.parentMediaIndex).padStart(2, "0")}E${String(item.mediaIndex).padStart(2, "0")}`
        : null;
    subTitle = [seNum, item.title].filter(Boolean).join(" · ") || undefined;
  } else if (isTrack) {
    subTitle = item.parentTitle;
  } else {
    subTitle = item.year ? String(item.year) : undefined;
  }

  const posterKind = isEpisode ? "series" : item.kind === "track" ? "track" : "movie";
  const art = item.thumb ? `/api/artwork?svc=tautulli&ref=${encodeURIComponent(item.thumb)}` : undefined;
  const tc = item.transcodeDecision;
  const startedIso = new Date(item.started * 1000).toISOString();

  return (
    <div style={{ display: "flex", gap: 12, padding: "10px 16px", borderTop: listDivider(i), alignItems: "flex-start" }}>
      <PosterTile title={mainTitle} kind={posterKind} cat="stream" w={38} art={art} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "var(--font-headline)", fontWeight: 700, fontSize: 13, color: "var(--on-surface)", ...TRUNCATE, marginBottom: 2 }}>
          {mainTitle}
        </div>
        {subTitle && (
          <div style={{ fontSize: 11.5, color: "var(--on-surface-variant)", marginBottom: 5, ...TRUNCATE }}>
            {subTitle}
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {isAdmin && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <Avatar name={item.user} size={14} color="var(--primary)" />
              <span style={{ fontSize: 11, fontWeight: 600, color: "var(--on-surface)" }}>{item.user}</span>
            </span>
          )}
          {tc && (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, padding: "1px 5px", borderRadius: 4, fontWeight: 700, background: `color-mix(in srgb, ${transcodeColor(tc)} 14%, transparent)`, color: transcodeColor(tc) }}>
              {tc === "direct play" ? "DIRECT" : tc.toUpperCase()}
            </span>
          )}
          {item.platform && (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--on-surface-variant)" }}>
              {item.platform}
            </span>
          )}
          <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, color: "var(--on-surface-variant)", flexShrink: 0 }}>
            <Icon name="schedule" size={11} />
            {fmtDuration(item.duration)}
            <span style={{ opacity: 0.5 }}>·</span>
            {timeAgo(startedIso)}
          </span>
        </div>
      </div>
    </div>
  );
}

export function HistoryList({ isAdmin }: { isAdmin: boolean }) {
  const [items, setItems] = useState<StreamHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const { page, totalPages, slice, setPage } = usePagination(items, 25);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetch("/api/history")
      .then((r) => r.json())
      .then(({ history }: { history: StreamHistoryItem[] }) => {
        if (!cancelled) { setItems(history ?? []); setLoading(false); }
      })
      .catch(() => { if (!cancelled) { setError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  return (
    <PanelShell
      title="Stream History"
      icon="history"
      accent="var(--primary)"
      count={!loading && !error && items.length > 0 ? `${items.length}` : undefined}
      action={totalPages > 1 ? <PageControls page={page} totalPages={totalPages} setPage={setPage} /> : undefined}
    >
      {loading ? (
        <div style={{ padding: "40px 16px", display: "flex", justifyContent: "center" }}>
          <Icon name="progress_activity" size={24} color="var(--on-surface-variant)" />
        </div>
      ) : error ? (
        <Empty icon="error_outline" line="Couldn't load history" sub="Check that Tautulli is configured and connected." />
      ) : items.length === 0 ? (
        <Empty art icon="history" line="No streams in the last 7 days" sub="Completed streams from Tautulli will appear here." />
      ) : (
        slice.map((item, i) => <HistoryRow key={item.id} item={item} i={i} isAdmin={isAdmin} />)
      )}
    </PanelShell>
  );
}
