import React from "react";
import { PortalProvider } from "@/components/portal/PortalProvider";
import { Rail } from "@/components/portal/Rail";
import { CommandPalette } from "@/components/portal/CommandPalette";
import { getSessionUser } from "@/lib/session";

// The authenticated portal shell: fixed left rail + scrolling main + ⌘K palette.
// The signed-in user (real OIDC session, or a dev-mode admin mock) drives RBAC.
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  return (
    <PortalProvider user={user}>
      <div style={{ height: "100vh", display: "flex", overflow: "hidden" }}>
        <Rail />
        <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>{children}</main>
        <CommandPalette />
      </div>
    </PortalProvider>
  );
}
