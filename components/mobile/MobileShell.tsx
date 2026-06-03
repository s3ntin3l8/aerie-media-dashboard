"use client";
// Switches between desktop shell and mobile shell based on viewport width.
// Returns a neutral 100dvh background while the measurement is pending
// (prevents hydration mismatch).
import React from "react";
import { Rail } from "@/components/portal/Rail";
import { CommandPalette } from "@/components/portal/CommandPalette";
import { MobilePortal } from "@/components/mobile/MobilePortal";
import { useIsMobile } from "@/components/mobile/useIsMobile";

export function MobileShell({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobile();

  // Neutral loading frame — same background as the app, no flash
  if (isMobile === null) {
    return (
      <div style={{ height: "100dvh", background: "var(--background)" }} />
    );
  }

  if (isMobile) {
    return <MobilePortal />;
  }

  // Desktop shell (current layout)
  return (
    <div style={{ height: "100vh", display: "flex", overflow: "hidden" }}>
      <Rail />
      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {children}
      </main>
      <CommandPalette />
    </div>
  );
}
