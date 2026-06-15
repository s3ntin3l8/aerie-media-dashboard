"use client";
// ============================================================
// AERIE — Admin · Members sub-view
// ============================================================
import React, { useEffect, useState, useTransition } from "react";
import type { OverseerrQuota } from "@/lib/types";
import { useData, useRefresh } from "@/components/portal/DataProvider";
import { usePortal } from "@/components/portal/PortalProvider";
import { setUserOverseerrQuota } from "@/app/(portal)/admin/actions";
import { Icon, Eyebrow, Pill, Chip, Avatar, Divider, ProgressBar } from "@/components/primitives";

function QuotaEditor({ userId, linked, movieQuota, tvQuota, isMobile }: { userId: string; linked: boolean; movieQuota: OverseerrQuota | null; tvQuota: OverseerrQuota | null; isMobile: boolean }) {
  const refresh = useRefresh();
  const [pending, start] = useTransition();

  const [movieUnlim, setMovieUnlim] = useState(movieQuota?.limit == null);
  const [movieLimit, setMovieLimit] = useState(String(movieQuota?.limit ?? 10));
  const [movieDays, setMovieDays] = useState(String(movieQuota?.days ?? 7));
  const [tvUnlim, setTvUnlim] = useState(tvQuota?.limit == null);
  const [tvLimit, setTvLimit] = useState(String(tvQuota?.limit ?? 10));
  const [tvDays, setTvDays] = useState(String(tvQuota?.days ?? 7));

  useEffect(() => {
    setMovieUnlim(movieQuota?.limit == null);
    setMovieLimit(String(movieQuota?.limit ?? 10));
    setMovieDays(String(movieQuota?.days ?? 7));
    setTvUnlim(tvQuota?.limit == null);
    setTvLimit(String(tvQuota?.limit ?? 10));
    setTvDays(String(tvQuota?.days ?? 7));
  }, [movieQuota?.limit, movieQuota?.days, tvQuota?.limit, tvQuota?.days]);

  const save = (overrides: { mu?: boolean; tu?: boolean } = {}) => {
    const mu = overrides.mu !== undefined ? overrides.mu : movieUnlim;
    const tu = overrides.tu !== undefined ? overrides.tu : tvUnlim;
    start(async () => {
      await setUserOverseerrQuota(userId, {
        movieQuotaLimit: mu ? null : Math.max(1, Math.floor(Number(movieLimit) || 1)),
        movieQuotaDays: Math.max(1, Math.floor(Number(movieDays) || 7)),
        tvQuotaLimit: tu ? null : Math.max(1, Math.floor(Number(tvLimit) || 1)),
        tvQuotaDays: Math.max(1, Math.floor(Number(tvDays) || 7)),
      });
      refresh();
    });
  };

  const inpStyle: React.CSSProperties = {
    width: isMobile ? 48 : 36,
    padding: isMobile ? "6px 4px" : "2px 4px",
    height: isMobile ? 38 : "auto",
    borderRadius: 6,
    border: "1px solid var(--outline-variant)",
    background: "var(--surface-container)",
    color: "var(--on-surface)",
    fontFamily: "var(--font-mono)",
    fontSize: isMobile ? 13 : 11,
    textAlign: "center",
  };
  const disabled = !linked || pending;

  const row = (
    label: string, icon: string,
    quota: OverseerrQuota | null,
    unlim: boolean, onUnlim: (v: boolean) => void,
    limit: string, onLimit: (v: string) => void,
    days: string, onDays: (v: string) => void,
    onToggleSave: (v: boolean) => void,
  ) => {
    const used = quota?.used ?? 0;
    const lim = quota?.limit ?? null;
    const pct = lim ? Math.min(100, (used / lim) * 100) : 0;
    const atLimit = quota?.restricted ?? false;

    if (isMobile) {
      return (
        <div style={{ marginTop: 10, opacity: linked ? 1 : 0.45 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
            <Icon name={icon} size={13} color="var(--on-surface-variant)" />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--on-surface-variant)", width: 42, flexShrink: 0 }}>{label}</span>
            {linked && !unlim && (
              <div style={{ flex: 1, minWidth: 48 }}>
                <ProgressBar pct={pct} color={atLimit ? "var(--amber)" : "var(--originator-court)"} h={5} />
              </div>
            )}
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: atLimit ? "var(--amber)" : "var(--on-surface-variant)" }}>
              {used}/{lim ?? "∞"}
            </span>
          </div>
          {linked && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 20 }}>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 4, cursor: "pointer", userSelect: "none", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--on-surface-variant)" }}>
                <input type="checkbox" checked={unlim} disabled={pending} onChange={(e) => { onUnlim(e.target.checked); onToggleSave(e.target.checked); }} style={{ width: 16, height: 16, accentColor: "var(--primary)" }} />
                Unlimited
              </label>
              {!unlim && (
                <>
                  <input type="number" min={1} value={limit} disabled={disabled} onChange={(e) => onLimit(e.target.value)} onBlur={() => save()} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} aria-label={`${label} quota limit`} style={inpStyle} />
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--on-surface-variant)" }}>/</span>
                  <input type="number" min={1} value={days} disabled={disabled} onChange={(e) => onDays(e.target.value)} onBlur={() => save()} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} aria-label={`${label} quota days`} style={inpStyle} />
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--on-surface-variant)" }}>days</span>
                </>
              )}
            </div>
          )}
        </div>
      );
    }

    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 7, opacity: linked ? 1 : 0.45 }}>
        <Icon name={icon} size={12} color="var(--on-surface-variant)" />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--on-surface-variant)", width: 32, flexShrink: 0 }}>{label}</span>
        {linked && !unlim && <div style={{ width: 48, flexShrink: 0 }}><ProgressBar pct={pct} color={atLimit ? "var(--amber)" : "var(--originator-court)"} h={4} /></div>}
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: atLimit ? "var(--amber)" : "var(--on-surface-variant)", flexShrink: 0 }}>{used}/{lim ?? "∞"}</span>
        <span style={{ flex: 1 }} />
        {linked && (
          <>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 3, cursor: "pointer", userSelect: "none", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--on-surface-variant)" }}>
              <input type="checkbox" checked={unlim} disabled={pending} onChange={(e) => { onUnlim(e.target.checked); onToggleSave(e.target.checked); }} style={{ width: 12, height: 12, accentColor: "var(--primary)" }} />
              ∞
            </label>
            {!unlim && (
              <>
                <input type="number" min={1} value={limit} disabled={disabled} onChange={(e) => onLimit(e.target.value)} onBlur={() => save()} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} aria-label={`${label} quota limit`} style={inpStyle} />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--on-surface-variant)" }}>/</span>
                <input type="number" min={1} value={days} disabled={disabled} onChange={(e) => onDays(e.target.value)} onBlur={() => save()} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} aria-label={`${label} quota days`} style={{ ...inpStyle, width: 30 }} />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--on-surface-variant)" }}>d</span>
              </>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <div style={{ marginTop: 11 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <Eyebrow>Requests</Eyebrow>
        {!linked && <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--amber)" }}>no Overseerr account</span>}
      </div>
      {row("Movies", "movie", movieQuota, movieUnlim, setMovieUnlim, movieLimit, setMovieLimit, movieDays, setMovieDays, (v) => save({ mu: v }))}
      {row("TV", "live_tv", tvQuota, tvUnlim, setTvUnlim, tvLimit, setTvLimit, tvDays, setTvDays, (v) => save({ tu: v }))}
    </div>
  );
}

export function AdminMembers({ isMobile }: { isMobile: boolean }) {
  const { users } = useData();
  const { user } = usePortal();
  return (
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(330px, 1fr))", gap: 12 }}>
      {users.map((u) => (
        <div key={u.id} style={{ padding: 15, borderRadius: isMobile ? 18 : 14, background: "var(--surface-container-lowest)", border: "1px solid var(--outline-variant)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <Avatar name={u.name} src={u.avatar} size={38} color={u.role === "admin" ? "var(--primary)" : "var(--originator-court)"} you={u.id === user.id} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ fontFamily: "var(--font-headline)", fontWeight: 800, fontSize: 14, color: "var(--on-surface)" }}>{u.name}</span>
                {u.role === "admin" && <Pill tone="primary">Admin</Pill>}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--on-surface-variant)" }}>{u.email}</div>
            </div>
          </div>
          <Divider style={{ margin: "13px 0 11px" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {u.groups.map((g) => (
              <Chip key={g} icon="group">
                {g}
              </Chip>
            ))}
            <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "var(--font-mono)", fontSize: 11, color: u.linked ? "var(--originator-own)" : "var(--amber)" }}>
              <Icon name={u.linked ? "link" : "link_off"} size={13} />
              {u.linked ? "linked" : "unlinked"}
            </span>
          </div>
          <QuotaEditor userId={u.id} linked={u.linked} movieQuota={u.movieQuota} tvQuota={u.tvQuota} isMobile={isMobile} />
        </div>
      ))}
    </div>
  );
}
