import React from "react";
import { PortalProvider } from "@/components/portal/PortalProvider";
import { Rail } from "@/components/portal/Rail";
import { CommandPalette } from "@/components/portal/CommandPalette";

// The authenticated portal shell: fixed left rail + scrolling main + ⌘K palette.
// `realRole` will come from the auth session later; defaults to admin for the
// mock-data checkpoint (the prototype opens on the admin dashboard).
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalProvider realRole="admin">
      <div style={{ height: "100vh", display: "flex", overflow: "hidden" }}>
        <Rail />
        <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>{children}</main>
        <CommandPalette />
      </div>
    </PortalProvider>
  );
}
