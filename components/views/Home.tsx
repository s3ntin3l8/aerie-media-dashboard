"use client";
// ============================================================
// AERIE — Home dashboard (command layout, spotlight central)
// ============================================================
import React from "react";
import { useRouter } from "next/navigation";
import type { Service } from "@/lib/types";
import { usePortal } from "@/components/portal/PortalProvider";
import { useData } from "@/components/portal/DataProvider";
import { Icon, Sparkline, StatusDot, Eyebrow, Kbd, SearchField } from "@/components/primitives";
import {
  CentralServices,
  LibraryStats,
  NowPlayingPanel,
  ServiceTiles,
  MyRequestsPanel,
  StatusPanel,
  RecentlyAdded,
  QueuePanel,
  Empty,
} from "@/components/panels";

// 40px aggregate health ticker
function HealthTicker({ onOpenStatus }: { onOpenStatus: () => void }) {
  const { services: list, nowPlaying, plays24h } = useData();
  const up = list.filter((s) => s.status === "up").length;
  const deg = list.filter((s) => s.status === "degraded").length;
  const down = list.filter((s) => s.status === "down").length;
  const unknown = list.filter((s) => s.status === "unknown").length;
  const allGood = list.length > 0 && deg === 0 && down === 0 && unknown === 0;
  const active = nowPlaying.length;
  const totalBitrate = nowPlaying.reduce((a, s) => a + parseFloat(s.bitrate), 0).toFixed(1);
  return (
    <div
      style={{
        height: 40,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        gap: 18,
        padding: "0 32px",
        borderBottom: "1px solid var(--outline-variant)",
        background: "color-mix(in srgb, var(--surface-container-lowest) 55%, transparent)",
        backdropFilter: "blur(8px)",
      }}
    >
      <div onClick={onOpenStatus} style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer" }}>
        <StatusDot status={down ? "down" : deg ? "degraded" : up > 0 ? "up" : "unknown"} size={8} />
        <span style={{ fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: allGood ? "var(--originator-own)" : down ? "var(--error)" : deg ? "var(--amber)" : "var(--on-surface-variant)" }}>
          {list.length === 0
            ? "No services configured"
            : allGood
              ? "All systems operational"
              : down
                ? `${down} service${down > 1 ? "s" : ""} down`
                : deg
                  ? `${deg} degraded`
                  : up > 0
                    ? `${up} up · ${unknown} no data`
                    : "Monitoring not configured"}
        </span>
      </div>
      <div style={{ width: 1, height: 16, background: "var(--outline-variant)" }} />
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--on-surface-variant)" }}>
        {up}/{list.length} up
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginLeft: "auto" }}>
        <Icon name="graphic_eq" size={14} color="var(--primary)" />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--on-surface-variant)" }}>
          {active} streams · {totalBitrate} Mbps
        </span>
        <div style={{ marginLeft: 6 }}>
          <Sparkline data={plays24h} w={92} h={20} color="var(--primary)" />
        </div>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--on-surface-variant)" }}>24h</span>
      </div>
    </div>
  );
}

function GreetingHeader({ role, userName, onOpenPalette, onRequest }: { role: string; userName: string; onOpenPalette: () => void; onRequest: () => void }) {
  const hour = new Date().getHours();
  const greet = hour < 5 ? "Good night" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const date = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  return (
    <div style={{ padding: "22px 32px 18px", borderBottom: "1px solid var(--outline-variant)", flexShrink: 0, background: "color-mix(in srgb, var(--surface-container-lowest) 40%, transparent)" }}>
      <div className="aerie-header-row">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 6 }}>
            <Eyebrow color="var(--primary)">{role === "admin" ? "Lead Operator" : "Member"} · AERIE</Eyebrow>
            <span suppressHydrationWarning style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--on-surface-variant)", whiteSpace: "nowrap" }}>
              {date}
            </span>
          </div>
          <h1 suppressHydrationWarning style={{ fontFamily: "var(--font-headline)", fontSize: 28, fontWeight: 700, lineHeight: 1.1, letterSpacing: "-0.02em", color: "var(--on-surface)", whiteSpace: "nowrap" }}>
            {greet}, {userName}.
          </h1>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <SearchField asButton onClick={onOpenPalette} placeholder="Search" kbd="⌘K" width={200} />
          <button onClick={onRequest} className="btn btn-primary btn-sm">
            <Icon name="add" size={15} /> Request
          </button>
        </div>
      </div>
    </div>
  );
}

export function Home() {
  const router = useRouter();
  const { role, setPaletteOpen, user } = usePortal();
  const { services } = useData();
  const openService = (s: Service) => router.push(`/s/${s.id}`);

  return (
    <section style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--surface)" }}>
      <GreetingHeader role={role} userName={user.name} onOpenPalette={() => setPaletteOpen(true)} onRequest={() => router.push("/requests")} />
      <HealthTicker onOpenStatus={() => router.push("/status")} />
      <div className="custom-scrollbar" style={{ flex: 1, overflowY: "auto" }}>
        <div className="aerie-page-pad" style={{ maxWidth: 1320, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>
          {services.length === 0 && (
            <section style={{ background: "var(--surface-container-lowest)", border: "1px solid var(--outline-variant)", borderRadius: "var(--radius-xl)", boxShadow: "var(--shadow-sm)", paddingBottom: 12 }}>
              <Empty icon="dashboard_customize" line="No services configured yet" sub="Add your services and their API keys to light up live data." />
              {role === "admin" && (
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <a href="/admin" className="btn btn-primary btn-sm">
                    <Icon name="settings" size={15} /> Go to Admin
                  </a>
                </div>
              )}
            </section>
          )}
          <CentralServices role={role} onOpen={openService} onAll={() => router.push("/status")} />

          <LibraryStats />
          <div className="aerie-home-grid">
            <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
              <NowPlayingPanel role={role} onAll={() => router.push("/status")} />
              <ServiceTiles role={role} onOpen={openService} onAll={() => router.push("/services")} />
              {role === "admin" && <QueuePanel />}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <MyRequestsPanel role={role} onAll={() => router.push("/requests")} />
              <StatusPanel role={role} onAll={() => router.push("/status")} />
              <RecentlyAdded />
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, paddingTop: 6, fontSize: 11, color: "var(--on-surface-variant)", flexWrap: "wrap" }}>
            <Kbd>g</Kbd>
            <Kbd>h</Kbd>
            <span>dashboard</span>
            <span>·</span>
            <Kbd>g</Kbd>
            <Kbd>s</Kbd>
            <span>services</span>
            <span>·</span>
            <Kbd>⌘K</Kbd>
            <span>command</span>
          </div>
        </div>
      </div>
    </section>
  );
}
