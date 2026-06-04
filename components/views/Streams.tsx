"use client";
// ============================================================
// AERIE — Streams view (desktop)
// Full-width now-playing panel; the mobile shell renders
// MobileStreams at this pathname instead.
// ============================================================
import React from "react";
import { usePortal } from "@/components/portal/PortalProvider";
import { StreamsView } from "@/components/panels";
import { PageHeader } from "@/components/views/shared";

export function Streams() {
  const { role } = usePortal();
  return (
    <section style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--surface)" }}>
      <PageHeader
        eyebrow={role === "admin" ? "Tautulli / Plex · live streams" : "Your active session"}
        title={role === "admin" ? "Now Playing" : "Your Session"}
        icon="play_circle"
        accent="var(--primary)"
        back={{ href: "/", label: "Dashboard" }}
      />
      <div
        className="custom-scrollbar aerie-page-pad"
        style={{ flex: 1, overflowY: "auto", maxWidth: 960, margin: "0 auto", width: "100%" }}
      >
        <StreamsView role={role} />
      </div>
    </section>
  );
}
