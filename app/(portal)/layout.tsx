import React from "react";
import { PortalProvider } from "@/components/portal/PortalProvider";
import { DataProvider } from "@/components/portal/DataProvider";
import { MobileShell } from "@/components/mobile/MobileShell";
import { getSessionUser } from "@/lib/session";
import { getSnapshotFast } from "@/lib/data/snapshot";
import { getFavorites, getDashboards } from "@/lib/integrations/registry";
import { authConfigured } from "@/lib/env";

// Session + live data are request-scoped; never prerender the shell.
export const dynamic = "force-dynamic";

// The authenticated portal shell: fixed left rail + scrolling main + ⌘K palette.
// The signed-in user (real OIDC session, or a dev-mode admin mock) drives RBAC;
// DataProvider seeds the live snapshot and keeps it fresh by polling.
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  // Don't block first paint on a cold upstream: getSnapshotFast serves the last good
  // snapshot if a fresh one would be slow, and refreshes in the background.
  const [user, { snapshot, stale }] = await Promise.all([getSessionUser(), getSnapshotFast()]);
  // Both prefs are per-user; the dashboards seed drives desktop Home *and* the mobile
  // dashboard from one source (the mobile shell never renders the page that fetched it).
  const [favorites, dashboards] = await Promise.all([
    getFavorites(user.id),
    user.id !== "anon" ? getDashboards(user.id) : Promise.resolve(null),
  ]);
  return (
    <PortalProvider user={user} oidc={authConfigured} favorites={favorites} initialDashboards={dashboards}>
      <DataProvider initial={snapshot} initialStale={stale}>
        <MobileShell>{children}</MobileShell>
      </DataProvider>
    </PortalProvider>
  );
}
