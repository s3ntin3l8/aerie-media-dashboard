"use client";
// Switches between desktop shell and mobile shell based on viewport width.
// SSR defaults to desktop so the server render matches first paint exactly on
// desktop (no flash). On a narrow viewport the hook corrects after mount.
import React from "react";
import { Rail } from "@/components/portal/Rail";
import { CommandPalette } from "@/components/portal/CommandPalette";
import { EmbedHost } from "@/components/portal/EmbedHost";
import { MobilePortal } from "@/components/mobile/MobilePortal";
import { useIsMobile } from "@/components/mobile/useIsMobile";

export function MobileShell({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return <MobilePortal />;
  }

  // Desktop shell (SSR default — no null guard needed)
  return (
    <div style={{ height: "100vh", display: "flex", overflow: "hidden" }}>
      <Rail />
      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, position: "relative" }}>
        {children}
        {/* Persists keep-alive service iframes across navigation (overlays the page when on a
            kept embed; hidden otherwise). Lives here so it never remounts on route change. */}
        <EmbedHost />
      </main>
      <CommandPalette />
    </div>
  );
}
