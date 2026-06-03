import React from "react";
import { PortalProvider } from "@/components/portal/PortalProvider";
import { DataProvider } from "@/components/portal/DataProvider";
import { Rail } from "@/components/portal/Rail";
import { CommandPalette } from "@/components/portal/CommandPalette";
import { getSessionUser } from "@/lib/session";
import { getSnapshot } from "@/lib/data/snapshot";
import { getFavorites } from "@/lib/integrations/registry";
import { authConfigured } from "@/lib/env";

// Session + live data are request-scoped; never prerender the shell.
export const dynamic = "force-dynamic";

// The authenticated portal shell: fixed left rail + scrolling main + ⌘K palette.
// The signed-in user (real OIDC session, or a dev-mode admin mock) drives RBAC;
// DataProvider seeds the live snapshot and keeps it fresh by polling.
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const [user, snapshot] = await Promise.all([getSessionUser(), getSnapshot()]);
  const favorites = await getFavorites(user.id);
  return (
    <PortalProvider user={user} oidc={authConfigured} favorites={favorites}>
      <DataProvider initial={snapshot}>
        <div style={{ height: "100vh", display: "flex", overflow: "hidden" }}>
          <Rail />
          <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>{children}</main>
          <CommandPalette />
        </div>
      </DataProvider>
    </PortalProvider>
  );
}
