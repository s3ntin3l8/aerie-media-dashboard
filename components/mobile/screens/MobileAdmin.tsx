"use client";
import React from "react";
import { useRouter } from "next/navigation";
import { Icon, Avatar, Pill, StatusDot, ProgressBar } from "@/components/primitives";
import { useData } from "@/components/portal/DataProvider";
import { usePortal } from "@/components/portal/PortalProvider";
import { MiniStat, SectionHead } from "@/components/mobile/mcommon";
import type { User, NowPlaying } from "@/lib/types";

function QuotaBar({ used, quota }: { used: number; quota: number }) {
  const pct = Math.min(100, quota > 0 ? (used / quota) * 100 : 0);
  const full = used >= quota;
  const col = full ? "var(--error)" : pct > 70 ? "var(--amber)" : "var(--originator-own)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 92 }}>
      <div style={{ flex: 1, height: 4, borderRadius: 9999, background: "var(--surface-container-highest)", overflow: "hidden" }}>
        <div style={{ width: pct + "%", height: "100%", background: col, borderRadius: 9999 }} />
      </div>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: full ? "var(--error)" : "var(--on-surface-variant)", flexShrink: 0 }}>{used}/{quota}</span>
    </div>
  );
}

function MemberRow({ u, nowPlaying }: { u: User; nowPlaying: NowPlaying[] }) {
  // u.watching holds the NowPlaying session id (or null)
  const session = u.watching ? nowPlaying.find((np) => np.id === u.watching) : undefined;
  return (
    <div style={{ display: "flex", gap: 12, padding: "13px 0", alignItems: "flex-start" }}>
      <Avatar name={u.name} size={38} />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 5 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--on-surface)" }}>{u.name}</span>
          {u.role === "admin" ? (
            <Pill tone="primary" style={{ fontSize: 8.5, padding: "1px 6px" }}>ADMIN</Pill>
          ) : (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--on-surface-variant)" }}>@{u.handle}</span>
          )}
          <span style={{ flex: 1 }} />
          {u.linked ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--originator-own)" }}>
              <Icon name="link" size={12} />LINKED
            </span>
          ) : (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--amber)" }}>
              <Icon name="link_off" size={12} />PENDING
            </span>
          )}
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--on-surface-variant)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{u.email}</div>
        {u.reqQuota > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontFamily: "var(--font-body)", fontSize: 9.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--on-surface-variant)" }}>Requests</span>
            <QuotaBar used={u.reqUsed} quota={u.reqQuota} />
          </div>
        )}
        {session && (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 1 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--primary)" }}>▶</span>
            <span style={{ fontSize: 11, color: "var(--on-surface-variant)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {session.paused ? "Paused · " : "Watching · "}
              <span style={{ color: "var(--on-surface)" }}>{session.title}</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export function MobileAdmin({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { user, theme, toggleTheme, signOut, role } = usePortal();
  const { users, nowPlaying, queue, storage } = useData();

  // Only admins should reach this component (guarded by MobilePortal)
  if (role !== "admin") return null;

  const watching = users.filter((u) => u.watching !== null).length;

  // Compute aggregate storage usage from the first mount (if any)
  let storageUsed = "—";
  if (storage.length > 0) {
    const totalBytes = storage.reduce((acc, m) => acc + m.totalBytes, 0);
    const usedBytes = storage.reduce((acc, m) => acc + (m.totalBytes - m.freeBytes), 0);
    const pct = totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 100) : 0;
    storageUsed = `${pct}%`;
  }

  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 90, background: "var(--background)", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div
        className="aerie-app-bar"
        style={{
          flexShrink: 0,
          paddingLeft: 8, paddingRight: 14, paddingBottom: 8, paddingTop: 8,
          display: "flex", alignItems: "center", gap: 6,
          background: "color-mix(in srgb, var(--background) 86%, transparent)",
          backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
          borderBottom: "1px solid color-mix(in srgb, var(--outline-variant) 60%, transparent)",
          position: "sticky", top: 0, zIndex: 10,
        }}
      >
        <button onClick={onClose} aria-label="Close admin" style={{ width: 40, height: 40, borderRadius: 11, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--on-surface)" }}>
          <Icon name="arrow_back" size={22} />
        </button>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, letterSpacing: "0.16em", color: "var(--on-surface)" }}>ADMIN</span>
        <span style={{ flex: 1 }} />
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 9999, background: "color-mix(in srgb, var(--originator-own) 14%, transparent)", border: "1px solid color-mix(in srgb, var(--originator-own) 30%, transparent)" }}>
          <StatusDot status="up" size={6} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600, color: "var(--originator-own)" }}>ONLINE</span>
        </span>
      </div>

      {/* Scrollable content */}
      <div className="aerie-mobile-scroll" style={{ flex: 1, minHeight: 0, padding: 18, paddingTop: 14, display: "flex", flexDirection: "column", gap: 26 }}>
        {/* Profile card */}
        <div className="card" style={{ padding: 15, borderRadius: 18, background: "var(--surface-container)", display: "flex", alignItems: "center", gap: 13 }}>
          <Avatar name={user.name} size={52} you />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{ fontFamily: "var(--font-headline)", fontSize: 19, fontWeight: 800, letterSpacing: "-0.01em", color: "var(--on-surface)" }}>{user.name}</span>
              <Pill tone="primary" style={{ fontSize: 8.5, padding: "1px 6px" }}>ADMIN</Pill>
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--on-surface-variant)", marginTop: 2 }}>{user.email}</div>
          </div>
          <button
            onClick={toggleTheme}
            aria-label="Toggle theme"
            style={{ width: 38, height: 38, borderRadius: 11, border: "1px solid var(--outline-variant)", background: "var(--surface-container-high)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--on-surface-variant)" }}
          >
            <Icon name={theme === "dark" ? "light_mode" : "dark_mode"} size={18} />
          </button>
        </div>

        {/* Server stats */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          <MiniStat label="Members" value={users.length} icon="group" color="var(--primary)" />
          <MiniStat label="Watching" value={watching} icon="play_circle" color="var(--originator-own)" />
          <MiniStat label="Storage" value={storageUsed} icon="storage" color="var(--amber)" />
        </div>

        {/* Members */}
        <div>
          <SectionHead icon="manage_accounts" title="Members" count={`${users.filter((u) => u.linked).length}/${users.length} linked`} />
          <div className="card" style={{ padding: "2px 15px", borderRadius: 18, background: "var(--surface-container)" }}>
            {users.length === 0 ? (
              <div style={{ padding: "16px 0", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--on-surface-variant)", textAlign: "center" }}>No members yet</div>
            ) : (
              users.map((u, i) => (
                <div key={u.id} style={{ borderTop: i ? "1px solid var(--outline-variant)" : "none" }}>
                  <MemberRow u={u} nowPlaying={nowPlaying} />
                </div>
              ))
            )}
          </div>
        </div>

        {/* Download Queue */}
        {queue.length > 0 && (
          <div>
            <SectionHead icon="downloading" title="Download Queue" count={`${queue.length} active`} />
            <div className="card" style={{ padding: "2px 15px", borderRadius: 18, background: "var(--surface-container)" }}>
              {queue.map((q, i) => (
                <div key={q.id} style={{ display: "flex", flexDirection: "column", gap: 7, padding: "12px 0", borderTop: i ? "1px solid var(--outline-variant)" : "none" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, color: "var(--on-surface)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{q.title}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--primary)" }}>{q.pct}%</span>
                  </div>
                  <ProgressBar pct={q.pct} color="var(--primary)" h={4} />
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--on-surface-variant)" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                      <Icon name="downloading" size={12} />{q.speed}
                    </span>
                    <span style={{ width: 3, height: 3, borderRadius: 9999, background: "var(--outline-variant)" }} />
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                      <Icon name="schedule" size={12} />{q.eta} left
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Manage Services / Full Admin — navigates to the real Admin view */}
        <div className="card" style={{ padding: "2px 15px", borderRadius: 18, background: "var(--surface-container)" }}>
          <button
            onClick={() => { onClose(); router.push("/admin"); }}
            style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "13px 0", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
          >
            <span style={{ width: 32, height: 32, borderRadius: 9, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--surface-container-highest)" }}>
              <Icon name="tune" size={18} color="var(--on-surface-variant)" />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--on-surface)" }}>Manage Services &amp; Settings</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--on-surface-variant)", marginTop: 2 }}>Services, secrets, visibility, members</div>
            </div>
            <Icon name="chevron_right" size={18} color="var(--on-surface-variant)" />
          </button>
        </div>

        {/* Sign out */}
        <div className="card" style={{ padding: "2px 15px", borderRadius: 18, background: "var(--surface-container)" }}>
          <button
            onClick={() => { onClose(); signOut(); }}
            style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "13px 0", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
          >
            <span style={{ width: 32, height: 32, borderRadius: 9, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "color-mix(in srgb, var(--error) 12%, transparent)" }}>
              <Icon name="logout" size={18} color="var(--error)" />
            </span>
            <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: "var(--error)" }}>Sign out</span>
          </button>
        </div>

        <div style={{ textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--on-surface-variant)", padding: "2px 0 4px" }}>
          AERIE · self-hosted
        </div>
      </div>
    </div>
  );
}
