"use client";
// ============================================================
// AERIE — Home dashboard (modular 12-col widget grid)
// Pick widgets, drag/resize on a snap grid, per-role saved layouts.
// ============================================================
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import type { Service, Role, DashboardStore } from "@/lib/types";
import { usePortal } from "@/components/portal/PortalProvider";
import { useData } from "@/components/portal/DataProvider";
import { Icon, Sparkline, StatusDot, Eyebrow, Kbd, SearchField } from "@/components/primitives";
import { getGreeting } from "@/lib/greeting";
import { useRequestReview } from "@/components/hooks/useRequestReview";
import { Empty } from "@/components/panels";
import { GridDashboard } from "@/components/portal/GridDashboard";
import { AddWidgetModal } from "@/components/modals/AddWidgetModal";
import { compactAll, type Tile } from "@/components/portal/gridLayout";
import { WIDGET_CATALOG, defaultLayout, addWidgetToLayout, type WidgetCtx } from "@/components/portal/widgetCatalog";
import { setDashboardsAction } from "@/app/(portal)/actions";

// 40px aggregate health ticker
function HealthTicker({ onOpenStatus }: { onOpenStatus: () => void }) {
  const { services: list, nowPlaying, plays24h, bandwidth } = useData();
  const up = list.filter((s) => s.status === "up").length;
  const deg = list.filter((s) => s.status === "degraded").length;
  const down = list.filter((s) => s.status === "down").length;
  const unknown = list.filter((s) => s.status === "unknown").length;
  const allGood = list.length > 0 && deg === 0 && down === 0 && unknown === 0;
  const active = nowPlaying.length;
  // Prefer Tautulli's real aggregate bandwidth (covers WAN/transcode); fall back to summing
  // per-session stream bitrate when Tautulli isn't reporting it.
  const totalMbps = bandwidth && bandwidth.totalMbps > 0 ? bandwidth.totalMbps : nowPlaying.reduce((a, s) => a + parseFloat(s.bitrate), 0);
  const totalBitrate = totalMbps.toFixed(1);
  const wanMbps = bandwidth && bandwidth.wanMbps > 0 ? bandwidth.wanMbps : 0;
  return (
    <div
      style={{
        height: 40,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        gap: 18,
        padding: "0 32px",
        borderBottom: "1px solid var(--outline-variant)",
        background: "color-mix(in srgb, var(--surface-container-lowest) 55%, transparent)",
        backdropFilter: "blur(8px)",
      }}
    >
      <div onClick={onOpenStatus} style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer" }}>
        <StatusDot status={down ? "down" : deg ? "degraded" : up > 0 ? "up" : "unknown"} size={8} />
        <span style={{ fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: allGood ? "var(--originator-own)" : down ? "var(--error)" : deg ? "var(--amber)" : "var(--on-surface-variant)" }}>
          {list.length === 0
            ? "No services configured"
            : allGood
              ? "All systems operational"
              : down
                ? `${down} service${down > 1 ? "s" : ""} down`
                : deg
                  ? `${deg} degraded`
                  : up > 0
                    ? `${up} up · ${unknown} no data`
                    : "Monitoring not configured"}
        </span>
      </div>
      <div style={{ width: 1, height: 16, background: "var(--outline-variant)" }} />
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--on-surface-variant)" }}>
        {up}/{list.length} up
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginLeft: "auto" }}>
        <Icon name="graphic_eq" size={14} color="var(--primary)" />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--on-surface-variant)" }}>
          {active} streams · {totalBitrate} Mbps{wanMbps > 0 ? ` · ${wanMbps.toFixed(1)} WAN` : ""}
        </span>
        <div style={{ marginLeft: 6 }}>
          <Sparkline data={plays24h} w={92} h={20} color="var(--primary)" />
        </div>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--on-surface-variant)" }}>24h</span>
      </div>
    </div>
  );
}

function GreetingHeader({
  role,
  userName,
  editing,
  widgetCount,
  onOpenPalette,
  onRequest,
  onToggleEdit,
  onReset,
}: {
  role: string;
  userName: string;
  editing: boolean;
  widgetCount: number;
  onOpenPalette: () => void;
  onRequest: () => void;
  onToggleEdit: () => void;
  onReset: () => void;
}) {
  const { greet, date } = getGreeting();
  return (
    <div style={{ padding: "22px 32px 18px", borderBottom: "1px solid var(--outline-variant)", flexShrink: 0, background: "color-mix(in srgb, var(--surface-container-lowest) 40%, transparent)" }}>
      <div className="aerie-header-row">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 6 }}>
            {editing ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <StatusDot status="degraded" size={7} />
                <Eyebrow color="var(--amber)">Editing dashboard · {widgetCount} widgets</Eyebrow>
              </span>
            ) : (
              <Eyebrow color="var(--primary)">{role === "admin" ? "Lead Operator" : "Member"} · AERIE</Eyebrow>
            )}
            <span suppressHydrationWarning style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--on-surface-variant)", whiteSpace: "nowrap" }}>
              {date}
            </span>
          </div>
          <h1 suppressHydrationWarning style={{ fontFamily: "var(--font-headline)", fontSize: 28, fontWeight: 700, lineHeight: 1.1, letterSpacing: "-0.02em", color: "var(--on-surface)", whiteSpace: "nowrap" }}>
            {editing ? "Arrange your dashboard" : `${greet}, ${userName}.`}
          </h1>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {editing ? (
            <>
              <button onClick={onReset} className="btn btn-ghost btn-sm" title="Restore the default arrangement">
                <Icon name="restart_alt" size={15} /> Reset
              </button>
              <button onClick={onToggleEdit} className="btn btn-primary btn-sm">
                <Icon name="check" size={15} /> Done
              </button>
            </>
          ) : (
            <>
              <SearchField asButton onClick={onOpenPalette} placeholder="Search" kbd="⌘K" width={200} />
              <button onClick={onToggleEdit} className="btn btn-tonal btn-sm" title="Customize dashboard layout">
                <Icon name="edit" size={15} /> Edit
              </button>
              <button onClick={onRequest} className="btn btn-primary btn-sm">
                <Icon name="add" size={15} /> Request
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function Home({ initialDashboards }: { initialDashboards?: DashboardStore | null }) {
  const router = useRouter();
  const { role, setPaletteOpen, user } = usePortal();
  const { services } = useData();
  const { onAct } = useRequestReview();
  const openService = (s: Service) => router.push(`/s/${s.id}`);

  const [editing, setEditing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  // Both role layouts live in one store; setLayout persists the whole store so a
  // member's arrangement survives while an admin edits theirs (and vice-versa).
  const [store, setStore] = useState<Record<Role, Tile[]>>(() => ({
    admin: initialDashboards?.admin?.length ? initialDashboards.admin : defaultLayout("admin"),
    user: initialDashboards?.user?.length ? initialDashboards.user : defaultLayout("user"),
  }));
  const layout = store[role] || [];

  const setLayout = (next: Tile[] | ((prev: Tile[]) => Tile[])) =>
    setStore((s) => {
      const nl = typeof next === "function" ? next(s[role] || []) : next;
      const nextStore = { ...s, [role]: nl };
      void setDashboardsAction(nextStore);
      return nextStore;
    });

  const removeWidget = (uid: string) => setLayout((l) => compactAll(l.filter((x) => x.uid !== uid)));
  const addWidget = (type: string) => setLayout((l) => addWidgetToLayout(l, type));
  const resetLayout = () => setLayout(defaultLayout(role));

  const ctx: WidgetCtx = { role, onNavigate: (path) => router.push(path), onOpenService: openService, onAct };
  const renderWidget = (item: Tile) => {
    const m = WIDGET_CATALOG[item.type];
    if (!m) return <Empty icon="error" line="Unknown widget" sub={item.type} />;
    return m.render(ctx);
  };

  return (
    <section style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--surface)", position: "relative" }}>
      <GreetingHeader
        role={role}
        userName={user.name}
        editing={editing}
        widgetCount={layout.length}
        onOpenPalette={() => setPaletteOpen(true)}
        onRequest={() => router.push("/requests")}
        onToggleEdit={() => setEditing((e) => !e)}
        onReset={resetLayout}
      />
      <HealthTicker onOpenStatus={() => router.push("/status")} />

      <div className="custom-scrollbar" style={{ flex: 1, overflowY: "auto" }}>
        <div className="aerie-page-pad" style={{ maxWidth: 1320, margin: "0 auto", paddingBottom: editing ? 110 : undefined }}>
          {services.length === 0 && !editing && (
            <section style={{ background: "var(--surface-container-lowest)", border: "1px solid var(--outline-variant)", borderRadius: "var(--radius-xl)", boxShadow: "var(--shadow-sm)", paddingBottom: 12, marginBottom: 18 }}>
              <Empty icon="dashboard_customize" line="No services configured yet" sub="Add your services and their API keys to light up live data." />
              {role === "admin" && (
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <a href="/admin" className="btn btn-primary btn-sm">
                    <Icon name="settings" size={15} /> Go to Admin
                  </a>
                </div>
              )}
            </section>
          )}

          {editing && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, padding: "10px 14px", borderRadius: 12, border: "1px dashed color-mix(in srgb, var(--primary) 40%, transparent)", background: "color-mix(in srgb, var(--primary) 6%, transparent)" }}>
              <Icon name="drag_indicator" size={17} color="var(--primary)" />
              <span style={{ fontSize: 12, color: "var(--on-surface)" }}>
                Drag a card to move it · drag the bottom-right corner to resize · tap <strong>＋</strong> to add widgets.
              </span>
              <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--on-surface-variant)" }}>
                {layout.length} widgets · {role}
              </span>
            </div>
          )}

          <GridDashboard layout={layout} onChange={setLayout} editing={editing} renderWidget={renderWidget} onRemove={removeWidget} />

          {!editing && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, paddingTop: 18, fontSize: 11, color: "var(--on-surface-variant)", flexWrap: "wrap" }}>
              <Kbd>g</Kbd>
              <Kbd>h</Kbd>
              <span>dashboard</span>
              <span>·</span>
              <Kbd>g</Kbd>
              <Kbd>s</Kbd>
              <span>services</span>
              <span>·</span>
              <Kbd>⌘K</Kbd>
              <span>command</span>
            </div>
          )}
        </div>
      </div>

      {/* + FAB — opens the widget catalog while editing */}
      {editing && (
        <button
          onClick={() => setAddOpen(true)}
          title="Add a widget"
          style={{
            position: "absolute",
            right: 28,
            bottom: 28,
            zIndex: 120,
            height: 52,
            paddingLeft: 18,
            paddingRight: 22,
            borderRadius: 9999,
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 9,
            background: "var(--primary)",
            color: "var(--on-primary)",
            fontFamily: "var(--font-headline)",
            fontWeight: 800,
            fontSize: 14,
            letterSpacing: "0.01em",
            boxShadow: "0 10px 30px color-mix(in srgb, var(--primary) 35%, transparent), var(--shadow-lg)",
          }}
        >
          <Icon name="add" size={22} color="var(--on-primary)" /> Add widget
        </button>
      )}

      <AddWidgetModal open={addOpen} onClose={() => setAddOpen(false)} role={role} layout={layout} onAdd={addWidget} />
    </section>
  );
}
