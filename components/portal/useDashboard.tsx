"use client";
// ============================================================
// AERIE — shared dashboard state
// Owns the per-role layouts + per-role mobile overlay (one persisted
// store), the layout/overlay mutators, the widget render context, and
// the dashboard modal open-state. Consumed by both the desktop Home
// (components/views/Home.tsx) and the mobile dashboard
// (components/mobile/screens/MobileDashboard.tsx) so a phone and a
// desktop render the exact same widgets from the exact same store.
// ============================================================
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import type { Service, Role, DashboardStore, MobileOverlay, DiscoverItem, UpcomingItem, MediaKind } from "@/lib/types";
import { usePortal } from "@/components/portal/PortalProvider";
import { useRequestReview } from "@/components/hooks/useRequestReview";
import { Empty } from "@/components/panels";
import { compactAll, migrateLayout, mobileStack, reorderUids, type Tile } from "@/components/portal/gridLayout";
import { WIDGET_CATALOG, defaultLayout, addWidgetToLayout, resolveSettings, type WidgetCtx } from "@/components/portal/widgetCatalog";
import { setDashboardsAction } from "@/app/(portal)/actions";
import { resolveDiscoverItem } from "@/app/(portal)/requests/actions";

// Both role layouts + the per-role mobile overlay live in one store; every edit
// persists the whole store atomically, so a member's arrangement (and the mobile
// order/hidden set) survives while an admin edits theirs, and vice-versa.
type DashState = { admin: Tile[]; user: Tile[]; mobile: Partial<Record<Role, MobileOverlay>> };

export interface DashboardApi {
  role: Role;
  layout: Tile[];
  overlay: MobileOverlay | undefined;
  setLayout: (next: Tile[] | ((prev: Tile[]) => Tile[])) => void;
  removeWidget: (uid: string) => void;
  addWidget: (type: string) => void;
  resetLayout: () => void;
  updateSettings: (uid: string, settings: Record<string, string | number | boolean>) => void;
  mobileReorder: (uid: string, dir: -1 | 1) => void;
  mobileHide: (uid: string) => void;
  mobileShow: (uid: string) => void;
  renderWidget: (item: Tile) => React.ReactNode;
  openService: (s: Service) => void;
  editing: boolean;
  toggleEdit: () => void;
  addOpen: boolean;
  setAddOpen: (open: boolean) => void;
  configUid: string | null;
  setConfigUid: (uid: string | null) => void;
  reqPick: DiscoverItem | null;
  setReqPick: (item: DiscoverItem | null) => void;
  upcomingPick: UpcomingItem | null;
  setUpcomingPick: (item: UpcomingItem | null) => void;
}

export function useDashboard(initialDashboards?: DashboardStore | null): DashboardApi {
  const router = useRouter();
  const { role } = usePortal();
  const { onAct } = useRequestReview();
  const openService = (s: Service) => router.push(`/s/${s.id}`);

  const [editing, setEditing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [configUid, setConfigUid] = useState<string | null>(null);
  const [reqPick, setReqPick] = useState<DiscoverItem | null>(null);
  const [upcomingPick, setUpcomingPick] = useState<UpcomingItem | null>(null);

  const [dash, setDash] = useState<DashState>(() => ({
    admin: migrateLayout(initialDashboards?.admin?.length ? initialDashboards.admin : defaultLayout("admin")),
    user: migrateLayout(initialDashboards?.user?.length ? initialDashboards.user : defaultLayout("user")),
    mobile: initialDashboards?.mobile ?? {},
  }));
  const layout = dash[role] || [];
  const overlay = dash.mobile[role];

  // Single state mutator: apply the updater, then persist the resulting store.
  const commit = (updater: (d: DashState) => DashState) =>
    setDash((d) => {
      const next = updater(d);
      void setDashboardsAction({ admin: next.admin, user: next.user, mobile: next.mobile });
      return next;
    });

  const setLayout = (next: Tile[] | ((prev: Tile[]) => Tile[])) =>
    commit((d) => ({ ...d, [role]: typeof next === "function" ? next(d[role] || []) : next }));

  // Removing a widget (a desktop action) also prunes its uid from this role's
  // mobile overlay so no stale references linger in the persisted JSON.
  const removeWidget = (uid: string) =>
    commit((d) => {
      const cur = d.mobile[role];
      const mobile = cur ? { ...d.mobile, [role]: { order: cur.order.filter((u) => u !== uid), hidden: cur.hidden.filter((u) => u !== uid) } } : d.mobile;
      return { ...d, [role]: compactAll((d[role] || []).filter((x) => x.uid !== uid)), mobile };
    });
  const addWidget = (type: string) => setLayout((l) => addWidgetToLayout(l, type));
  // Reset clears the role's mobile overlay too, so the stack falls back to grid order.
  const resetLayout = () => commit((d) => ({ ...d, [role]: defaultLayout(role), mobile: { ...d.mobile, [role]: { order: [], hidden: [] } } }));
  const updateSettings = (uid: string, settings: Record<string, string | number | boolean>) =>
    setLayout((l) => l.map((t) => (t.uid === uid ? { ...t, settings } : t)));

  // Mobile overlay handlers — operate on the current role's overlay (default empty).
  const setOverlay = (fn: (cur: MobileOverlay) => MobileOverlay) =>
    commit((d) => ({ ...d, mobile: { ...d.mobile, [role]: fn(d.mobile[role] ?? { order: [], hidden: [] }) } }));
  const mobileReorder = (uid: string, dir: -1 | 1) =>
    commit((d) => {
      const cur = d.mobile[role] ?? { order: [], hidden: [] };
      const order = reorderUids(mobileStack(d[role] || [], cur).visible.map((t) => t.uid), uid, dir);
      return { ...d, mobile: { ...d.mobile, [role]: { ...cur, order } } };
    });
  const mobileHide = (uid: string) => setOverlay((cur) => ({ order: cur.order.filter((u) => u !== uid), hidden: [...cur.hidden.filter((u) => u !== uid), uid] }));
  const mobileShow = (uid: string) => setOverlay((cur) => ({ ...cur, hidden: cur.hidden.filter((u) => u !== uid) }));

  // Library widgets (Now Playing / Recently Added) only know a TMDB id or a Plex
  // rating key — resolve to a full DiscoverItem, then open the detail modal.
  const onSelectMedia = (hint: { kind: MediaKind; tmdbId?: number; grandparentRatingKey?: string }) => {
    void resolveDiscoverItem(hint).then((d) => { if (d) setReqPick(d); });
  };
  const ctx: WidgetCtx = { role, onNavigate: (path) => router.push(path), onOpenService: openService, onAct, onRequest: setReqPick, onSelectUpcoming: setUpcomingPick, onSelectMedia };
  const renderWidget = (item: Tile) => {
    const m = WIDGET_CATALOG[item.type];
    if (!m) return <Empty icon="error" line="Unknown widget" sub={item.type} />;
    return m.render(ctx, resolveSettings(item.type, item.settings));
  };

  return {
    role,
    layout,
    overlay,
    setLayout,
    removeWidget,
    addWidget,
    resetLayout,
    updateSettings,
    mobileReorder,
    mobileHide,
    mobileShow,
    renderWidget,
    openService,
    editing,
    toggleEdit: () => setEditing((e) => !e),
    addOpen,
    setAddOpen,
    configUid,
    setConfigUid,
    reqPick,
    setReqPick,
    upcomingPick,
    setUpcomingPick,
  };
}
