"use client";
import React, { useState } from "react";
import { usePathname } from "next/navigation";
import { CommandPalette } from "@/components/portal/CommandPalette";
import { usePortal } from "@/components/portal/PortalProvider";
import { MobileAppBar } from "@/components/mobile/MobileAppBar";
import { MobileNav } from "@/components/mobile/MobileNav";
import { MobileAdmin } from "@/components/mobile/screens/MobileAdmin";
import { MobileHome } from "@/components/mobile/screens/MobileHome";
import { MobileStreams } from "@/components/mobile/screens/MobileStreams";
import { MobileRequests } from "@/components/mobile/screens/MobileRequests";
import { MobileStatus } from "@/components/mobile/screens/MobileStatus";
import { MobileServices } from "@/components/mobile/screens/MobileServices";
import { MobileServiceView } from "@/components/mobile/screens/MobileServiceView";
import type { Service } from "@/lib/types";

export function MobilePortal() {
  const pathname = usePathname();
  const { role } = usePortal();
  const [adminOpen, setAdminOpen] = useState(false);
  const [activeService, setActiveService] = useState<Service | null>(null);

  // Map pathname to screen component
  function renderScreen() {
    // Service detail view takes priority
    if (activeService) return <MobileServiceView s={activeService} onClose={() => setActiveService(null)} />;
    // /s/:id opens service view too
    if (pathname.startsWith("/s/")) {
      // Let MobileServices handle the service selection via onOpen
    }
    if (pathname === "/streams") return <MobileStreams />;
    if (pathname.startsWith("/requests")) return <MobileRequests />;
    if (pathname.startsWith("/status")) return <MobileStatus />;
    if (pathname === "/services" || pathname.startsWith("/s/")) return <MobileServices onOpen={setActiveService} />;
    // Default: home
    return <MobileHome />;
  }

  return (
    <div className="aerie-mobile-shell" style={{ position: "relative" }}>
      {/* Top app bar */}
      {!activeService && (
        <MobileAppBar onAdmin={() => setAdminOpen(true)} />
      )}

      {/* Main scrollable content */}
      <main className="aerie-mobile-scroll" style={{ flex: 1, minHeight: 0 }}>
        {renderScreen()}
      </main>

      {/* Bottom nav (hidden when service view is open) */}
      {!activeService && (
        <MobileNav />
      )}

      {/* Command palette (reuses desktop one, renders as fixed overlay) */}
      <CommandPalette />

      {/* Admin slide-in */}
      {adminOpen && role === "admin" && (
        <MobileAdmin onClose={() => setAdminOpen(false)} />
      )}
    </div>
  );
}
