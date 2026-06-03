"use client";
import React, { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CommandPalette } from "@/components/portal/CommandPalette";
import { usePortal } from "@/components/portal/PortalProvider";
import { useData } from "@/components/portal/DataProvider";
import { MobileAppBar } from "@/components/mobile/MobileAppBar";
import { MobileNav } from "@/components/mobile/MobileNav";
import { MobileAdmin } from "@/components/mobile/screens/MobileAdmin";
import { MobileHome } from "@/components/mobile/screens/MobileHome";
import { MobileStreams } from "@/components/mobile/screens/MobileStreams";
import { MobileRequests } from "@/components/mobile/screens/MobileRequests";
import { MobileStatus } from "@/components/mobile/screens/MobileStatus";
import { MobileServices } from "@/components/mobile/screens/MobileServices";
import { MobileServiceView } from "@/components/mobile/screens/MobileServiceView";
import { Admin } from "@/components/views/Admin";

export function MobilePortal() {
  const pathname = usePathname();
  const router = useRouter();
  const { role } = usePortal();
  const { services } = useData();
  const [adminOpen, setAdminOpen] = useState(false);

  // Route-driven service view — /s/:id resolves from live services so the
  // command palette (which pushes to /s/:id) and deep links both work.
  const serviceId = pathname.startsWith("/s/") ? pathname.slice(3) : null;
  const activeService = serviceId ? (services.find((s) => s.id === serviceId) ?? null) : null;

  const isServiceView = activeService !== null;

  function renderScreen() {
    if (isServiceView && activeService) {
      return <MobileServiceView s={activeService} onClose={() => router.push("/services")} />;
    }
    if (pathname === "/streams") return <MobileStreams />;
    if (pathname.startsWith("/requests")) return <MobileRequests />;
    if (pathname.startsWith("/status")) return <MobileStatus />;
    if (pathname === "/services" || pathname.startsWith("/s/")) {
      // /s/:id falls here only when the id isn't in the services list yet (loading)
      return <MobileServices onOpen={(s) => router.push(`/s/${s.id}`)} />;
    }
    // Admin management — render the real desktop Admin view (service modals,
    // secrets, visibility). It's not mobile-optimised but is fully functional
    // and far better than landing on Home with nothing working.
    if (pathname.startsWith("/admin")) return <Admin />;
    return <MobileHome />;
  }

  return (
    <div className="aerie-mobile-shell" style={{ position: "relative" }}>
      {/* Top app bar — hidden while a service view is fullscreen */}
      {!isServiceView && (
        <MobileAppBar onAdmin={() => setAdminOpen(true)} />
      )}

      {/* Main scrollable content */}
      <main className="aerie-mobile-scroll" style={{ flex: 1, minHeight: 0 }}>
        {renderScreen()}
      </main>

      {/* Bottom nav — hidden while a service view is fullscreen */}
      {!isServiceView && (
        <MobileNav />
      )}

      {/* Command palette (position:fixed overlay — works anywhere in the tree) */}
      <CommandPalette />

      {/* Admin slide-in */}
      {adminOpen && role === "admin" && (
        <MobileAdmin onClose={() => setAdminOpen(false)} />
      )}
    </div>
  );
}
