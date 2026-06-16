"use client";
// ============================================================
// AERIE — Streams view (desktop)
// Full-width now-playing panel; the mobile shell renders
// MobileStreams at this pathname instead.
// ============================================================
import React, { useState } from "react";
import { usePortal } from "@/components/portal/PortalProvider";
import { StreamsView } from "@/components/panels/streams";
import { PageHeader } from "@/components/views/shared";
import { HistoryList } from "@/components/streams/HistoryList";

type Tab = "live" | "history";

function TabBar({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const btn = (t: Tab, label: string) => (
    <button
      key={t}
      onClick={() => setTab(t)}
      style={{
        background: tab === t ? "color-mix(in srgb, var(--primary) 14%, transparent)" : "none",
        border: "none",
        borderRadius: 8,
        padding: "5px 14px",
        fontFamily: "var(--font-headline)",
        fontWeight: 700,
        fontSize: 12,
        color: tab === t ? "var(--primary)" : "var(--on-surface-variant)",
        cursor: "pointer",
        transition: "background 0.15s, color 0.15s",
      }}
    >
      {label}
    </button>
  );
  return (
    <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
      {btn("live", "Live")}
      {btn("history", "History")}
    </div>
  );
}

export function Streams() {
  const { role } = usePortal();
  const [tab, setTab] = useState<Tab>("live");
  const isAdmin = role === "admin";

  return (
    <section style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--surface)" }}>
      <PageHeader
        eyebrow={isAdmin ? "Tautulli / Plex · streams" : "Your streams"}
        title={isAdmin ? "Streams" : "Your Streams"}
        icon="play_circle"
        accent="var(--primary)"
        back={{ href: "/", label: "Dashboard" }}
      />
      <div
        className="custom-scrollbar aerie-page-pad aerie-page-pad--wide"
        style={{ flex: 1, overflowY: "auto", width: "100%" }}
      >
        <TabBar tab={tab} setTab={setTab} />
        {tab === "live" ? <StreamsView role={role} /> : <HistoryList isAdmin={isAdmin} />}
      </div>
    </section>
  );
}
