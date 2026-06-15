"use client";
// ============================================================
// AERIE — mobile dashboard
// The phone home screen. Renders the SAME modular widget grid as the
// desktop Home (shared useDashboard + DashboardBody), forced into the
// single-column stacked layout, inside the native mobile chrome. The
// per-role layout + mobile overlay come from the same persisted store
// the desktop reads, so the two stay in sync.
// ============================================================
import React from "react";
import { Icon } from "@/components/primitives";
import { usePortal } from "@/components/portal/PortalProvider";
import { useDashboard } from "@/components/portal/useDashboard";
import { DashboardBody } from "@/components/portal/DashboardBody";
import { getGreeting } from "@/lib/greeting";

export function MobileDashboard() {
  const { user, initialDashboards } = usePortal();
  const api = useDashboard(initialDashboards);
  const { greet } = getGreeting();

  return (
    <div style={{ padding: 18, paddingTop: 8, display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Greeting + edit controls */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div
          suppressHydrationWarning
          style={{
            fontFamily: "var(--font-headline)",
            fontSize: 24,
            fontWeight: 800,
            letterSpacing: "-0.02em",
            color: "var(--on-surface)",
            lineHeight: 1.1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {api.editing ? "Arrange dashboard" : `${greet}, ${user.name}.`}
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          {api.editing && (
            <button onClick={api.resetLayout} className="btn btn-ghost btn-sm" title="Restore the default arrangement">
              <Icon name="restart_alt" size={15} /> Reset
            </button>
          )}
          <button onClick={api.toggleEdit} className={api.editing ? "btn btn-primary btn-sm" : "btn btn-tonal btn-sm"} title="Customize dashboard">
            <Icon name={api.editing ? "check" : "edit"} size={15} /> {api.editing ? "Done" : "Edit"}
          </button>
        </div>
      </div>

      {api.editing && (
        <button onClick={() => api.setAddOpen(true)} className="btn btn-tonal btn-sm" style={{ alignSelf: "flex-start" }}>
          <Icon name="add" size={16} /> Add widget
        </button>
      )}

      <DashboardBody api={api} forceStacked />
    </div>
  );
}
