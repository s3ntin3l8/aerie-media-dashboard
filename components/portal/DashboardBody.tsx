"use client";
// ============================================================
// AERIE — shared dashboard body
// The GridDashboard + the four dashboard modals, wired to a DashboardApi
// (from useDashboard). Desktop Home and the mobile dashboard both render
// this so the widget grid + modal behaviour are identical; only the
// surrounding chrome (header/ticker/FAB on desktop, app-bar/greeting on
// mobile) differs per caller.
// ============================================================
import React from "react";
import { useRouter } from "next/navigation";
import { useRefresh } from "@/components/portal/DataProvider";
import { useRequestReview } from "@/components/hooks/useRequestReview";
import { GridDashboard } from "@/components/portal/GridDashboard";
import { AddWidgetModal } from "@/components/modals/AddWidgetModal";
import { CardSettingsModal } from "@/components/modals/CardSettingsModal";
import { RequestModal } from "@/components/modals/RequestModal";
import { UpcomingDetailModal } from "@/components/modals/UpcomingDetailModal";
import { submitRequest } from "@/app/(portal)/requests/actions";
import type { DashboardApi } from "@/components/portal/useDashboard";

export function DashboardBody({ api, forceStacked }: { api: DashboardApi; forceStacked?: boolean }) {
  const router = useRouter();
  const refresh = useRefresh();
  const { onAct } = useRequestReview();

  return (
    <>
      <GridDashboard
        layout={api.layout}
        onChange={api.setLayout}
        editing={api.editing}
        renderWidget={api.renderWidget}
        onRemove={api.removeWidget}
        onConfigure={api.setConfigUid}
        forceStacked={forceStacked}
        mobileOverlay={api.overlay}
        onMobileReorder={api.mobileReorder}
        onMobileHide={api.mobileHide}
        onMobileShow={api.mobileShow}
      />

      <AddWidgetModal open={api.addOpen} onClose={() => api.setAddOpen(false)} role={api.role} layout={api.layout} onAdd={api.addWidget} />
      <CardSettingsModal
        open={!!api.configUid}
        tile={api.configUid ? api.layout.find((t) => t.uid === api.configUid) : undefined}
        onClose={() => api.setConfigUid(null)}
        onSave={(uid, settings) => {
          api.updateSettings(uid, settings);
          api.setConfigUid(null);
        }}
      />
      {api.reqPick && (
        <RequestModal
          open
          mode="request"
          initialPick={api.reqPick}
          onClose={() => api.setReqPick(null)}
          onSubmit={async (pick, quality, seasons) => {
            const picked = Object.keys(seasons).filter((k) => seasons[Number(k)]).map(Number);
            const r = await submitRequest(pick, picked, quality);
            refresh();
            return r;
          }}
          onAct={onAct}
        />
      )}
      {api.upcomingPick && (
        <UpcomingDetailModal
          item={api.upcomingPick}
          onClose={() => api.setUpcomingPick(null)}
          onOpenService={(svc, at) => {
            api.setUpcomingPick(null);
            router.push(at ? `/s/${svc}?at=${encodeURIComponent(at)}` : `/s/${svc}`);
          }}
        />
      )}
    </>
  );
}
