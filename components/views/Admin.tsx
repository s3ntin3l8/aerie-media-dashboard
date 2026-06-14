"use client";
// ============================================================
// AERIE — Admin area (services · members · visibility)
// ============================================================
import React, { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Service, OverseerrQuota } from "@/lib/types";
import { useData, useRefresh, usePatchData } from "@/components/portal/DataProvider";
import { usePortal } from "@/components/portal/PortalProvider";
import { setVisibility, upsertService, setServiceSecret, setServiceForwardAuth, clearServiceForwardAuth, setServiceActive, setServiceKeepAlive, deleteService, serviceExists, detectServiceVersion, probeServiceVersion, testStoredConnection, setUserOverseerrQuota, dismissTraefikHost, restoreTraefikHost } from "@/app/(portal)/admin/actions";
import { Icon, Eyebrow, Pill, Chip, Avatar, Divider, ProgressBar } from "@/components/primitives";
import { Toggle } from "@/components/modals/ModalShell";
import { ServiceLogo } from "@/components/ServiceLogo";
import { statusColor, statusWord, uptimeText } from "@/lib/display";
import { PageHeader, RouteBadges, MetaBadges } from "@/components/views/shared";
import { ServiceModal, type ServiceForm } from "@/components/modals/ServiceModal";
import { LogsModal } from "@/components/modals/LogsModal";
import { serviceRequiresKey, matchPreset, isTraefikSource } from "@/lib/servicePresets";
import type { TraefikRoute } from "@/lib/types";
import { Toast } from "@/components/modals/Toast";
import { useIsMobile } from "@/components/mobile/useIsMobile";

type AdminSortCol = "name" | "host" | "embed";
type AdminSortDir = "asc" | "desc";

// Small Gatus-health "light" overlaid on a service icon's top-right corner: green = up,
// amber = degraded, red = down, dim grey = no monitoring data. Sits on a position:relative
// wrapper (NOT inside ServiceLogo, whose overflow:hidden would clip it). Colours reuse the
// canonical statusColor() so they match StatusDot / Heartbeat everywhere else.
function StatusLight({ service, dot = 10, ring = "var(--surface-container-lowest)" }: {
  service: Pick<Service, "status" | "uptime">;
  dot?: number;
  ring?: string;
}) {
  const title = service.status === "unknown" ? "No monitoring data" : `${statusWord(service.status)} · ${uptimeText(service)}`;
  return (
    <span
      title={title}
      style={{
        position: "absolute",
        top: -2,
        right: -2,
        width: dot,
        height: dot,
        borderRadius: 9999,
        background: statusColor(service.status),
        border: `2px solid ${ring}`,
        boxSizing: "border-box",
      }}
    />
  );
}

// Stored-secret indicator. Distinguishes a configured service (masked AES-GCM badge) from an
// unconfigured one — warning-tinted "Not set" when the service type expects a key, neutral
// "No key" for legitimately key-optional services (Gatus / Prometheus / NZBGet-without-auth).
function KeyIndicator({ service, dim }: { service: Service; dim?: number }) {
  const base = { display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "var(--font-mono)", fontSize: 11, opacity: dim } as const;
  if (service.hasSecret) {
    return (
      <span style={{ ...base, gap: 6, color: "var(--on-surface-variant)" }}>
        <Icon name="lock" size={12} color="var(--originator-own)" />
        ••••••••<span style={{ fontSize: 9, opacity: 0.7 }}>AES-GCM</span>
      </span>
    );
  }
  if (serviceRequiresKey(service.id, service.logoSlug)) {
    return (
      <span style={{ ...base, color: "var(--warning)" }}>
        <Icon name="warning" size={12} />Not set
      </span>
    );
  }
  return (
    <span style={{ ...base, color: "var(--on-surface-variant)" }}>
      <Icon name="lock_open" size={12} />No key
    </span>
  );
}

// Seed the add-service form from a discovered Traefik router: guess the name from the host's
// first label, take the scheme from TLS, and pull category/icon/logo from the matching preset.
function discoveredPrefill(r: TraefikRoute): Partial<ServiceForm> {
  const label = r.hosts[0].split(":")[0].split(".")[0];
  const p = matchPreset(label);
  return {
    name: label,
    host: r.hosts[0],
    scheme: r.tls ? "https" : "http",
    cat: (p?.cat as Service["cat"]) ?? "infra",
    icon: p?.icon ?? "dns",
    logoSlug: p?.logoSlug ?? "",
  };
}

function AdminServices({ isMobile, onOpenService, onEdit, onAddDiscovered }: { isMobile: boolean; onOpenService: (s: Service) => void; onEdit: (s: Service) => void; onAddDiscovered: (prefill: Partial<ServiceForm>) => void }) {
  // Admin sees the FULL list (incl. inactive); every other surface gets active-only via useData().services.
  const { allServices: services, traefikDiscovered = [], traefikDismissed = [], traefikInstances = [], lokiConfigured = false } = useData();
  const { favorites, toggleFavorite } = usePortal();
  const patchData = usePatchData();
  const [, startActiveTransition] = useTransition();
  // The service whose log tail is open in the Loki viewer (admin-only; gated on lokiConfigured).
  const [logsFor, setLogsFor] = useState<Service | null>(null);
  const logsModalEl = lokiConfigured && logsFor ? (
    <LogsModal open serviceId={logsFor.id} serviceName={logsFor.name} logoSlug={logsFor.logoSlug} onClose={() => setLogsFor(null)} />
  ) : null;
  const cols = "1.6fr 1fr 0.6fr 0.6fr 0.7fr 1.1fr 0.5fr";
  const [sort, setSort] = useState<{ col: AdminSortCol; dir: AdminSortDir }>({ col: "name", dir: "asc" });
  // Discovery card starts collapsed — the host list is on-demand, the services table is primary.
  const [discoveredOpen, setDiscoveredOpen] = useState(false);
  const [nodesOpen, setNodesOpen] = useState(false);

  // Optimistically flip active in the snapshot (so the row dims + the service drops from
  // every user surface instantly), then persist; revert on failure.
  const toggleActive = (s: Service) => {
    const next = !s.active;
    const flip = (a: boolean) =>
      patchData((snap) => ({ ...snap, services: snap.services.map((sv) => (sv.id === s.id ? { ...sv, active: a } : sv)) }));
    flip(next);
    startActiveTransition(async () => {
      try { await setServiceActive(s.id, next); }
      catch { flip(!next); }
    });
  };
  // Keep-alive is only meaningful for embeddable services (EmbedHost keeps their iframe mounted).
  const toggleKeepAlive = (s: Service) => {
    if (!s.embeddable) return;
    const next = !s.keepAlive;
    const flip = (a: boolean) =>
      patchData((snap) => ({ ...snap, services: snap.services.map((sv) => (sv.id === s.id ? { ...sv, keepAlive: a } : sv)) }));
    flip(next);
    startActiveTransition(async () => {
      try { await setServiceKeepAlive(s.id, next); }
      catch { flip(!next); }
    });
  };
  const sorted = useMemo(() => [...services].sort((a, b) => {
    const d = sort.dir === "asc" ? 1 : -1;
    switch (sort.col) {
      case "name":  return a.name.localeCompare(b.name) * d;
      case "host":  return (a.host ?? "").localeCompare(b.host ?? "") * d;
      case "embed": return (Number(b.embeddable) - Number(a.embeddable)) * d;
      default:      return 0;
    }
  }), [services, sort]);

  function handleSortClick(col: AdminSortCol) {
    setSort((prev) => prev.col === col
      ? { col, dir: prev.dir === "asc" ? "desc" : "asc" }
      : { col, dir: "asc" });
  }

  // More than one Traefik instance configured → attribute each discovered host to its source.
  const multiTraefik = services.filter(isTraefikSource).length > 1;
  const traefikName = (id?: string) => services.find((s) => s.id === id)?.name ?? id ?? "traefik";

  // Optimistically drop a discovered host from the panel (and remember it) while the action persists.
  const dismissHost = (host: string) => {
    const h = host.toLowerCase();
    patchData((snap) => ({
      ...snap,
      traefikDiscovered: snap.traefikDiscovered.filter((r) => !r.hosts.some((x) => x.toLowerCase() === h)),
      traefikDismissed: [...new Set([...(snap.traefikDismissed ?? []), h])],
    }));
    startActiveTransition(async () => {
      try { await dismissTraefikHost(host); }
      catch { /* next snapshot poll reconciles */ }
    });
  };
  const restoreHost = (host: string) => {
    const h = host.toLowerCase();
    patchData((snap) => ({ ...snap, traefikDismissed: (snap.traefikDismissed ?? []).filter((x) => x !== h) }));
    startActiveTransition(async () => {
      try { await restoreTraefikHost(host); }
      catch { /* next snapshot poll reconciles */ }
    });
  };

  // Suggestions from Traefik: routed hosts with no matching AERIE service yet. Admin-only,
  // additive — clicking Add opens the service modal pre-filled; the row self-clears once added.
  // Dismiss hides a host you never want to add (persisted; restorable below).
  const discoveredEl = (traefikDiscovered.length > 0 || traefikDismissed.length > 0) ? (
    <div style={{ borderRadius: 16, border: "1px solid var(--outline-variant)", background: "var(--surface-container-lowest)", padding: 14, marginBottom: 12 }}>
      <button
        type="button"
        onClick={() => setDiscoveredOpen((v) => !v)}
        aria-expanded={discoveredOpen}
        style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: 0, border: "none", background: "transparent", color: "inherit", cursor: "pointer", marginBottom: discoveredOpen ? 10 : 0 }}
      >
        <Icon name="travel_explore" size={16} color="var(--primary)" />
        <Eyebrow>Discovered via Traefik</Eyebrow>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--on-surface-variant)" }}>{traefikDiscovered.length}</span>
        <Icon name="expand_more" size={18} color="var(--on-surface-variant)" style={{ marginLeft: "auto", transform: discoveredOpen ? "none" : "rotate(-90deg)", transition: "transform .15s" }} />
      </button>
      {discoveredOpen && (<>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {traefikDiscovered.map((r, i) => (
          <div key={r.router} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: i ? "1px solid color-mix(in srgb, var(--outline-variant) 45%, transparent)" : "none" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--on-surface)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 1, minWidth: 0 }}>{r.hosts[0]}</span>
            <RouteBadges route={r} />
            {multiTraefik && (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--on-surface-variant)", opacity: 0.8 }} title={`Discovered via ${traefikName(r.via)}`}>
                via {traefikName(r.via)}
              </span>
            )}
            <span style={{ marginLeft: "auto", display: "inline-flex", gap: 2, flexShrink: 0 }}>
              <button onClick={() => onAddDiscovered(discoveredPrefill(r))} className="btn btn-ghost btn-sm" style={{ gap: 5 }} title={`Add ${r.hosts[0]} as a service`}>
                <Icon name="add" size={14} /> Add
              </button>
              <button onClick={() => dismissHost(r.hosts[0])} className="btn btn-ghost btn-sm" style={{ padding: 6, color: "var(--on-surface-variant)" }} title={`Dismiss ${r.hosts[0]} — stop suggesting it`}>
                <Icon name="close" size={14} />
              </button>
            </span>
          </div>
        ))}
        {traefikDiscovered.length === 0 && (
          <div style={{ fontSize: 11, color: "var(--on-surface-variant)", padding: "4px 0" }}>No new hosts — all routed hosts are added or dismissed.</div>
        )}
      </div>
      {traefikDismissed.length > 0 && (
        <details style={{ marginTop: 10 }}>
          <summary style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--on-surface-variant)", cursor: "pointer" }}>
            {traefikDismissed.length} dismissed
          </summary>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            {traefikDismissed.map((h) => (
              <button key={h} onClick={() => restoreHost(h)} className="btn btn-ghost btn-sm" style={{ gap: 5, fontFamily: "var(--font-mono)", fontSize: 10.5 }} title={`Restore ${h} to suggestions`}>
                <Icon name="undo" size={13} /> {h}
              </button>
            ))}
          </div>
        </details>
      )}
      </>)}
    </div>
  ) : null;

  // Traefik node health from the aggregator, already scoped server-side to only the nodes that route
  // a configured service. Collapsed by default; renders nothing without an aggregator source.
  const nodeStatusColor = (st: string) =>
    st === "ok" ? "var(--originator-own)" : st === "degraded" ? "var(--amber)" : st === "unreachable" ? "var(--error)" : "var(--on-surface-variant)";
  const nodesEl = traefikInstances.length > 0 ? (
    <div style={{ borderRadius: 16, border: "1px solid var(--outline-variant)", background: "var(--surface-container-lowest)", padding: 14, marginBottom: 12 }}>
      <button
        type="button"
        onClick={() => setNodesOpen((v) => !v)}
        aria-expanded={nodesOpen}
        style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: 0, border: "none", background: "transparent", color: "inherit", cursor: "pointer", marginBottom: nodesOpen ? 10 : 0 }}
      >
        <Icon name="lan" size={16} color="var(--primary)" />
        <Eyebrow>Traefik nodes</Eyebrow>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--on-surface-variant)" }}>{traefikInstances.length}</span>
        <Icon name="expand_more" size={18} color="var(--on-surface-variant)" style={{ marginLeft: "auto", transform: nodesOpen ? "none" : "rotate(-90deg)", transition: "transform .15s" }} />
      </button>
      {nodesOpen && (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {traefikInstances.map((n, i) => {
            const color = nodeStatusColor(n.status);
            const served = (n.serves ?? []).map(traefikName);
            return (
              <div key={n.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: i ? "1px solid color-mix(in srgb, var(--outline-variant) 45%, transparent)" : "none" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--on-surface)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 1, minWidth: 0 }}>{n.name}</span>
                {n.role && <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--on-surface-variant)", opacity: 0.8 }}>{n.role}</span>}
                <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontFamily: "var(--font-mono)", fontSize: 10, lineHeight: 1.4, padding: "1px 6px", borderRadius: 9999, color, border: `1px solid color-mix(in srgb, ${color} 35%, transparent)`, background: `color-mix(in srgb, ${color} 12%, transparent)`, whiteSpace: "nowrap" }}>
                  {n.status}
                </span>
                {n.version && <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--on-surface-variant)" }}>v{n.version}</span>}
                {n.counts && (
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--on-surface-variant)", opacity: 0.8 }} title={`${n.counts.routers} routers · ${n.counts.services} services · ${n.counts.middlewares} middlewares · ${n.counts.warnings} warnings`}>
                    {n.counts.routers}r/{n.counts.services}s{n.counts.warnings ? ` · ${n.counts.warnings}⚠` : ""}
                  </span>
                )}
                <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--on-surface-variant)", flexShrink: 0 }} title={`serves: ${served.join(", ")}`}>
                  {served.length} {served.length === 1 ? "service" : "services"}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  ) : null;

  if (isMobile) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {logsModalEl}
        {discoveredEl}
        {nodesEl}
        <select
          value={`${sort.col}:${sort.dir}`}
          onChange={(e) => {
            const [col, dir] = e.target.value.split(":") as [AdminSortCol, AdminSortDir];
            setSort({ col, dir });
          }}
          style={{ fontFamily: "var(--font-mono)", fontSize: 11, padding: "5px 8px", borderRadius: 8, border: "1px solid var(--outline-variant)", background: "var(--surface-container)", color: "var(--on-surface)", cursor: "pointer", alignSelf: "flex-start" }}
        >
          <option value="name:asc">Name A→Z</option>
          <option value="name:desc">Name Z→A</option>
          <option value="host:asc">Host A→Z</option>
          <option value="host:desc">Host Z→A</option>
          <option value="embed:desc">Embeddable first</option>
          <option value="embed:asc">Non-embeddable first</option>
        </select>
        {sorted.map((s) => {
          const pinned = favorites.includes(s.id);
          const dim = s.active ? undefined : 0.5;
          return (
            <div key={s.id} className="card" style={{ padding: 15, borderRadius: 18, background: "var(--surface-container-lowest)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, opacity: dim }}>
                <span style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
                  <ServiceLogo service={s} size={36} radius={9} />
                  <StatusLight service={s} dot={12} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontWeight: 700, fontSize: 14, color: "var(--on-surface)" }}>{s.name}</span>
                    {!s.active && <Pill rawColor="var(--on-surface-variant)">inactive</Pill>}
                  </div>
                  <div style={{ marginTop: 3 }}><MetaBadges cat={s.cat} route={s.route} access={s.authentik} /></div>
                </div>
              </div>
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Eyebrow style={{ width: 52, flexShrink: 0 }}>Active</Eyebrow>
                  <Toggle on={s.active} onChange={() => toggleActive(s)} size="sm" color="var(--originator-own)" />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Eyebrow style={{ width: 52, flexShrink: 0 }}>Keep</Eyebrow>
                  <span
                    title={s.embeddable ? "Keep the iframe mounted after first open so its state survives switching" : "Only embeddable services can be kept alive"}
                    style={{ opacity: s.embeddable ? undefined : 0.3, pointerEvents: s.embeddable ? undefined : "none" }}
                  >
                    <Toggle on={s.embeddable && s.keepAlive} onChange={() => toggleKeepAlive(s)} size="sm" color="var(--primary)" />
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <Eyebrow style={{ width: 52, flexShrink: 0 }}>Host</Eyebrow>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--on-surface-variant)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.host}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Eyebrow style={{ width: 52, flexShrink: 0 }}>Embed</Eyebrow>
                  {s.embeddable
                    ? <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--originator-own)" }}><Icon name="check" size={14} />Yes</span>
                    : <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--on-surface-variant)" }}><Icon name="open_in_new" size={13} />Opens new tab</span>
                  }
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Eyebrow style={{ width: 52, flexShrink: 0 }}>API key</Eyebrow>
                  <KeyIndicator service={s} />
                </div>
              </div>
              <Divider style={{ margin: "12px 0 8px" }} />
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={() => toggleFavorite(s.id)}
                  className="btn btn-ghost btn-sm"
                  style={{ flex: 1, justifyContent: "center", minHeight: 44, gap: 6, color: pinned ? "var(--amber)" : undefined }}
                  title={pinned ? "Unpin from rail" : "Pin to rail"}
                >
                  <Icon name={pinned ? "star" : "star_border"} size={18} />
                  {pinned ? "Pinned" : "Pin"}
                </button>
                <button
                  onClick={() => onOpenService(s)}
                  className="btn btn-ghost btn-sm"
                  style={{ flex: 1, justifyContent: "center", minHeight: 44, gap: 6 }}
                  title="Open"
                >
                  <Icon name="open_in_full" size={18} />Open
                </button>
                <button
                  onClick={() => onEdit(s)}
                  className="btn btn-ghost btn-sm"
                  style={{ flex: 1, justifyContent: "center", minHeight: 44, gap: 6 }}
                  title="Edit"
                >
                  <Icon name="edit" size={18} />Edit
                </button>
                {lokiConfigured && (
                  <button
                    onClick={() => setLogsFor(s)}
                    className="btn btn-ghost btn-sm"
                    style={{ flex: 1, justifyContent: "center", minHeight: 44, gap: 6 }}
                    title="View logs"
                  >
                    <Icon name="receipt_long" size={18} />Logs
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <>
    {logsModalEl}
    {discoveredEl}
    {nodesEl}
    <div className="aerie-x-scroll">
      <div style={{ borderRadius: 16, border: "1px solid var(--outline-variant)", overflow: "hidden", background: "var(--surface-container-lowest)" }}>
        <div style={{ display: "grid", gridTemplateColumns: cols, gap: 12, padding: "11px 18px", borderBottom: "1px solid var(--outline-variant)", background: "color-mix(in srgb, var(--surface-container) 50%, transparent)" }}>
          {(["name", "host", "embed"] as AdminSortCol[]).map((col, i) => {
            const labels: Record<AdminSortCol, string> = { name: "Service", host: "Host", embed: "Embed" };
            const active = sort.col === col;
            return (
              <button
                key={col}
                onClick={() => handleSortClick(col)}
                style={{ display: "inline-flex", alignItems: "center", gap: 3, background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}
              >
                <Eyebrow style={{ color: active ? "var(--on-surface)" : undefined }}>{labels[col]}</Eyebrow>
                <Icon
                  name={active ? (sort.dir === "asc" ? "expand_less" : "expand_more") : "unfold_more"}
                  size={13}
                  color={active ? "var(--on-surface)" : "var(--on-surface-variant)"}
                  style={{ opacity: active ? 1 : 0.4 }}
                />
              </button>
            );
          })}
          <Eyebrow>Active</Eyebrow>
          <Eyebrow>Keep alive</Eyebrow>
          <Eyebrow>API key</Eyebrow>
          <span />
        </div>
        {sorted.map((s, i) => {
          const pinned = favorites.includes(s.id);
          const dim = s.active ? undefined : 0.5;
          return (
            <div key={s.id} style={{ display: "grid", gridTemplateColumns: cols, gap: 12, alignItems: "center", padding: "12px 18px", borderTop: i ? "1px solid color-mix(in srgb, var(--outline-variant) 45%, transparent)" : "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, opacity: dim }}>
                <span style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
                  <ServiceLogo service={s} size={28} radius={7} />
                  <StatusLight service={s} dot={10} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontWeight: 700, fontSize: 12.5, color: "var(--on-surface)" }}>{s.name}</span>
                    {!s.active && <Pill rawColor="var(--on-surface-variant)">inactive</Pill>}
                  </div>
                  <div style={{ marginTop: 3 }}>
                    <MetaBadges cat={s.cat} route={s.route} access={s.authentik} />
                  </div>
                </div>
              </div>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--on-surface-variant)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", opacity: dim }}>{s.host}</span>
              <span style={{ opacity: dim }}>{s.embeddable ? <Icon name="check" size={16} color="var(--originator-own)" /> : <Icon name="open_in_new" size={15} color="var(--on-surface-variant)" />}</span>
              <Toggle on={s.active} onChange={() => toggleActive(s)} size="sm" color="var(--originator-own)" />
              <span
                title={s.embeddable ? "Keep this service's iframe mounted (hidden) after first open so its state survives switching" : "Only embeddable services can be kept alive"}
                style={{ opacity: s.embeddable ? undefined : 0.3, pointerEvents: s.embeddable ? undefined : "none" }}
              >
                <Toggle on={s.embeddable && s.keepAlive} onChange={() => toggleKeepAlive(s)} size="sm" color="var(--primary)" />
              </span>
              <KeyIndicator service={s} dim={dim} />
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 2 }}>
                <button onClick={() => toggleFavorite(s.id)} className="btn btn-ghost btn-sm" style={{ padding: 6, color: pinned ? "var(--amber)" : undefined }} title={pinned ? "Unpin from rail" : "Pin to rail"}>
                  <Icon name={pinned ? "star" : "star_border"} size={15} />
                </button>
                <button onClick={() => onOpenService(s)} className="btn btn-ghost btn-sm" style={{ padding: 6 }} title="Open">
                  <Icon name="open_in_full" size={15} />
                </button>
                {lokiConfigured && (
                  <button onClick={() => setLogsFor(s)} className="btn btn-ghost btn-sm" style={{ padding: 6 }} title="View logs">
                    <Icon name="receipt_long" size={15} />
                  </button>
                )}
                <button onClick={() => onEdit(s)} className="btn btn-ghost btn-sm" style={{ padding: 6 }} title="Edit">
                  <Icon name="edit" size={15} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
    </>
  );
}

function QuotaEditor({ userId, linked, movieQuota, tvQuota, isMobile }: { userId: string; linked: boolean; movieQuota: OverseerrQuota | null; tvQuota: OverseerrQuota | null; isMobile: boolean }) {
  const refresh = useRefresh();
  const [pending, start] = useTransition();

  const [movieUnlim, setMovieUnlim] = useState(movieQuota?.limit == null);
  const [movieLimit, setMovieLimit] = useState(String(movieQuota?.limit ?? 10));
  const [movieDays, setMovieDays] = useState(String(movieQuota?.days ?? 7));
  const [tvUnlim, setTvUnlim] = useState(tvQuota?.limit == null);
  const [tvLimit, setTvLimit] = useState(String(tvQuota?.limit ?? 10));
  const [tvDays, setTvDays] = useState(String(tvQuota?.days ?? 7));

  useEffect(() => {
    setMovieUnlim(movieQuota?.limit == null);
    setMovieLimit(String(movieQuota?.limit ?? 10));
    setMovieDays(String(movieQuota?.days ?? 7));
    setTvUnlim(tvQuota?.limit == null);
    setTvLimit(String(tvQuota?.limit ?? 10));
    setTvDays(String(tvQuota?.days ?? 7));
  }, [movieQuota?.limit, movieQuota?.days, tvQuota?.limit, tvQuota?.days]);

  const save = (overrides: { mu?: boolean; tu?: boolean } = {}) => {
    const mu = overrides.mu !== undefined ? overrides.mu : movieUnlim;
    const tu = overrides.tu !== undefined ? overrides.tu : tvUnlim;
    start(async () => {
      await setUserOverseerrQuota(userId, {
        movieQuotaLimit: mu ? null : Math.max(1, Math.floor(Number(movieLimit) || 1)),
        movieQuotaDays: Math.max(1, Math.floor(Number(movieDays) || 7)),
        tvQuotaLimit: tu ? null : Math.max(1, Math.floor(Number(tvLimit) || 1)),
        tvQuotaDays: Math.max(1, Math.floor(Number(tvDays) || 7)),
      });
      refresh();
    });
  };

  const inpStyle: React.CSSProperties = {
    width: isMobile ? 48 : 36,
    padding: isMobile ? "6px 4px" : "2px 4px",
    height: isMobile ? 38 : "auto",
    borderRadius: 6,
    border: "1px solid var(--outline-variant)",
    background: "var(--surface-container)",
    color: "var(--on-surface)",
    fontFamily: "var(--font-mono)",
    fontSize: isMobile ? 13 : 11,
    textAlign: "center",
  };
  const disabled = !linked || pending;

  const row = (
    label: string, icon: string,
    quota: OverseerrQuota | null,
    unlim: boolean, onUnlim: (v: boolean) => void,
    limit: string, onLimit: (v: string) => void,
    days: string, onDays: (v: string) => void,
    onToggleSave: (v: boolean) => void,
  ) => {
    const used = quota?.used ?? 0;
    const lim = quota?.limit ?? null;
    const pct = lim ? Math.min(100, (used / lim) * 100) : 0;
    const atLimit = quota?.restricted ?? false;

    if (isMobile) {
      return (
        <div style={{ marginTop: 10, opacity: linked ? 1 : 0.45 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
            <Icon name={icon} size={13} color="var(--on-surface-variant)" />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--on-surface-variant)", width: 42, flexShrink: 0 }}>{label}</span>
            {linked && !unlim && (
              <div style={{ flex: 1, minWidth: 48 }}>
                <ProgressBar pct={pct} color={atLimit ? "var(--amber)" : "var(--originator-court)"} h={5} />
              </div>
            )}
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: atLimit ? "var(--amber)" : "var(--on-surface-variant)" }}>
              {used}/{lim ?? "∞"}
            </span>
          </div>
          {linked && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 20 }}>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 4, cursor: "pointer", userSelect: "none", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--on-surface-variant)" }}>
                <input type="checkbox" checked={unlim} disabled={pending} onChange={(e) => { onUnlim(e.target.checked); onToggleSave(e.target.checked); }} style={{ width: 16, height: 16, accentColor: "var(--primary)" }} />
                Unlimited
              </label>
              {!unlim && (
                <>
                  <input type="number" min={1} value={limit} disabled={disabled} onChange={(e) => onLimit(e.target.value)} onBlur={() => save()} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} aria-label={`${label} quota limit`} style={inpStyle} />
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--on-surface-variant)" }}>/</span>
                  <input type="number" min={1} value={days} disabled={disabled} onChange={(e) => onDays(e.target.value)} onBlur={() => save()} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} aria-label={`${label} quota days`} style={inpStyle} />
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--on-surface-variant)" }}>days</span>
                </>
              )}
            </div>
          )}
        </div>
      );
    }

    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 7, opacity: linked ? 1 : 0.45 }}>
        <Icon name={icon} size={12} color="var(--on-surface-variant)" />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--on-surface-variant)", width: 32, flexShrink: 0 }}>{label}</span>
        {linked && !unlim && <div style={{ width: 48, flexShrink: 0 }}><ProgressBar pct={pct} color={atLimit ? "var(--amber)" : "var(--originator-court)"} h={4} /></div>}
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: atLimit ? "var(--amber)" : "var(--on-surface-variant)", flexShrink: 0 }}>{used}/{lim ?? "∞"}</span>
        <span style={{ flex: 1 }} />
        {linked && (
          <>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 3, cursor: "pointer", userSelect: "none", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--on-surface-variant)" }}>
              <input type="checkbox" checked={unlim} disabled={pending} onChange={(e) => { onUnlim(e.target.checked); onToggleSave(e.target.checked); }} style={{ width: 12, height: 12, accentColor: "var(--primary)" }} />
              ∞
            </label>
            {!unlim && (
              <>
                <input type="number" min={1} value={limit} disabled={disabled} onChange={(e) => onLimit(e.target.value)} onBlur={() => save()} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} aria-label={`${label} quota limit`} style={inpStyle} />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--on-surface-variant)" }}>/</span>
                <input type="number" min={1} value={days} disabled={disabled} onChange={(e) => onDays(e.target.value)} onBlur={() => save()} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} aria-label={`${label} quota days`} style={{ ...inpStyle, width: 30 }} />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--on-surface-variant)" }}>d</span>
              </>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <div style={{ marginTop: 11 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <Eyebrow>Requests</Eyebrow>
        {!linked && <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--amber)" }}>no Overseerr account</span>}
      </div>
      {row("Movies", "movie", movieQuota, movieUnlim, setMovieUnlim, movieLimit, setMovieLimit, movieDays, setMovieDays, (v) => save({ mu: v }))}
      {row("TV", "live_tv", tvQuota, tvUnlim, setTvUnlim, tvLimit, setTvLimit, tvDays, setTvDays, (v) => save({ tu: v }))}
    </div>
  );
}

function AdminMembers({ isMobile }: { isMobile: boolean }) {
  const { users } = useData();
  const { user } = usePortal();
  return (
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(330px, 1fr))", gap: 12 }}>
      {users.map((u) => (
        <div key={u.id} style={{ padding: 15, borderRadius: isMobile ? 18 : 14, background: "var(--surface-container-lowest)", border: "1px solid var(--outline-variant)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <Avatar name={u.name} src={u.avatar} size={38} color={u.role === "admin" ? "var(--primary)" : "var(--originator-court)"} you={u.id === user.id} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ fontFamily: "var(--font-headline)", fontWeight: 800, fontSize: 14, color: "var(--on-surface)" }}>{u.name}</span>
                {u.role === "admin" && <Pill tone="primary">Admin</Pill>}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--on-surface-variant)" }}>{u.email}</div>
            </div>
          </div>
          <Divider style={{ margin: "13px 0 11px" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {u.groups.map((g) => (
              <Chip key={g} icon="group">
                {g}
              </Chip>
            ))}
            <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "var(--font-mono)", fontSize: 11, color: u.linked ? "var(--originator-own)" : "var(--amber)" }}>
              <Icon name={u.linked ? "link" : "link_off"} size={13} />
              {u.linked ? "linked" : "unlinked"}
            </span>
          </div>
          <QuotaEditor userId={u.id} linked={u.linked} movieQuota={u.movieQuota} tvQuota={u.tvQuota} isMobile={isMobile} />
        </div>
      ))}
    </div>
  );
}

function AdminVisibility({ isMobile }: { isMobile: boolean }) {
  // Admin config surface: show the FULL list so visibility can be set on inactive rows too.
  const { allServices: services, groups, visibility } = useData();
  const [, startTransition] = useTransition();
  // Optimistic local state keyed by `${serviceId}:${groupName}`.
  const [state, setState] = useState<Record<string, boolean>>(() => {
    const m: Record<string, boolean> = {};
    for (const v of visibility) m[`${v.serviceId}:${v.groupName}`] = v.visible;
    return m;
  });
  const cols = `1.4fr repeat(${groups.length}, 1fr)`;

  const toggle = (serviceId: string, groupName: string) => {
    const key = `${serviceId}:${groupName}`;
    const next = !state[key];
    setState((s) => ({ ...s, [key]: next }));
    startTransition(async () => {
      try {
        await setVisibility(serviceId, groupName, next);
      } catch {
        setState((s) => ({ ...s, [key]: !next })); // revert on failure
      }
    });
  };

  if (isMobile) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {services.map((s) => (
          <div key={s.id} className="card" style={{ padding: 15, borderRadius: 18, background: "var(--surface-container-lowest)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10 }}>
              <ServiceLogo service={s} size={28} radius={7} />
              <span style={{ fontWeight: 700, fontSize: 13.5, color: "var(--on-surface)" }}>{s.name}</span>
            </div>
            {groups.map((g, i) => {
              const on = state[`${s.id}:${g.name}`] ?? false;
              return (
                <div key={g.name} style={{ borderTop: i ? "1px solid color-mix(in srgb, var(--outline-variant) 45%, transparent)" : "none" }}>
                  <button
                    onClick={() => toggle(s.id, g.name)}
                    aria-label={`${s.name} visible to ${g.name}: ${on ? "on" : "off"}`}
                    style={{ display: "flex", alignItems: "center", width: "100%", padding: "12px 0", background: "none", border: "none", cursor: "pointer", gap: 8 }}
                  >
                    <Icon name="group" size={14} color="var(--on-surface-variant)" />
                    <span style={{ flex: 1, textAlign: "left", fontFamily: "var(--font-body)", fontSize: 13, color: "var(--on-surface)" }}>{g.name}</span>
                    <span
                      aria-hidden
                      style={{
                        width: 44,
                        height: 26,
                        borderRadius: 9999,
                        position: "relative",
                        display: "inline-flex",
                        flexShrink: 0,
                        background: on ? "color-mix(in srgb, var(--originator-own) 30%, transparent)" : "color-mix(in srgb, var(--on-surface-variant) 18%, transparent)",
                        transition: "background .15s",
                      }}
                    >
                      <span style={{ position: "absolute", top: 4, left: on ? 22 : 4, width: 18, height: 18, borderRadius: 9999, background: on ? "var(--originator-own)" : "var(--on-surface-variant)", transition: "left .15s" }} />
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="aerie-x-scroll">
      <div style={{ borderRadius: 16, border: "1px solid var(--outline-variant)", overflow: "hidden", background: "var(--surface-container-lowest)" }}>
        <div style={{ display: "grid", gridTemplateColumns: cols, gap: 8, padding: "12px 18px", borderBottom: "1px solid var(--outline-variant)", background: "color-mix(in srgb, var(--surface-container) 50%, transparent)" }}>
          <Eyebrow>Service → Group</Eyebrow>
          {groups.map((g) => (
            <div key={g.name} style={{ textAlign: "center" }}>
              <Chip icon="group">{g.name}</Chip>
            </div>
          ))}
        </div>
        {services.map((s, i) => (
          <div key={s.id} style={{ display: "grid", gridTemplateColumns: cols, gap: 8, alignItems: "center", padding: "10px 18px", borderTop: i ? "1px solid color-mix(in srgb, var(--outline-variant) 45%, transparent)" : "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <ServiceLogo service={s} size={20} radius={5} />
              <span style={{ fontWeight: 600, fontSize: 12.5, color: "var(--on-surface)" }}>{s.name}</span>
            </div>
            {groups.map((g) => {
              const on = state[`${s.id}:${g.name}`] ?? false;
              return (
                <div key={g.name} style={{ display: "flex", justifyContent: "center" }}>
                  <button
                    onClick={() => toggle(s.id, g.name)}
                    aria-label={`${s.name} visible to ${g.name}`}
                    style={{
                      width: 30,
                      height: 18,
                      borderRadius: 9999,
                      position: "relative",
                      border: "none",
                      padding: 0,
                      background: on ? "color-mix(in srgb, var(--originator-own) 30%, transparent)" : "color-mix(in srgb, var(--on-surface-variant) 18%, transparent)",
                      cursor: "pointer",
                      transition: "background .15s",
                    }}
                  >
                    <span style={{ position: "absolute", top: 2, left: on ? 14 : 2, width: 14, height: 14, borderRadius: 9999, background: on ? "var(--originator-own)" : "var(--on-surface-variant)", transition: "left .15s" }} />
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
const isIconName = (s: string) => /^[a-z_]+$/.test(s);

export function Admin() {
  const router = useRouter();
  const { groups, visibility, adminGroup, lokiConfigured = false } = useData();
  const refresh = useRefresh();
  const patchData = usePatchData();
  const isMobile = useIsMobile();
  const [tab, setTab] = useState("services");
  const [svcModal, setSvcModal] = useState<{ mode: "add" | "edit"; service?: Service; prefill?: Partial<ServiceForm> } | null>(null);
  // The id auto-saved by "Test connection" in add mode — lets a subsequent save/test of the
  // same id reconcile idempotently instead of tripping the duplicate-id guard.
  const lastAutoSavedId = useRef<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const tabs: [string, string, string, string][] = [
    ["services", "Services & Secrets", "Services", "dns"],
    ["members", "Members", "Members", "group"],
    ["visibility", "Visibility", "Visibility", "visibility"],
  ];
  const openService = (s: Service) => router.push(`/s/${s.id}`);
  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  };

  // Build the per-group visibility map the modal seeds from.
  const visForService = (id: string) => {
    const m: Record<string, boolean> = {};
    for (const g of groups) m[g.name] = false;
    for (const v of visibility) if (v.serviceId === id) m[v.groupName] = v.visible;
    m[adminGroup] = true;
    return m;
  };
  const addDefaults = () => {
    const m: Record<string, boolean> = {};
    for (const g of groups) m[g.name] = g.name !== "guests";
    m[adminGroup] = true;
    return m;
  };

  // Persist a service (config + secret + visibility) and patch the local snapshot,
  // WITHOUT closing the modal. Shared by the Save button and the auto-save-on-Test flow.
  // Returns the saved id + optimistic Service, or an error message to flash.
  const persistService = async (
    form: ServiceForm,
    vis: Record<string, boolean>,
  ): Promise<{ id: string; service: Service } | { error: string }> => {
    const editing = svcModal?.mode === "edit";
    const id = editing ? svcModal!.service!.id : slug(form.name);
    if (!id) return { error: "Enter a service name first" };
    // In add mode, reject a duplicate id — UNLESS it's the one we just auto-saved for a test
    // (re-saving / re-testing the same nascent service is an idempotent update, not a clash).
    if (!editing && id !== lastAutoSavedId.current && (await serviceExists(id))) {
      return { error: `A service id "${id}" already exists` };
    }
    // Rejoin the two-input API base URL into the stored full-URL form (null when blank).
    const internalRest = form.internalUrl.trim();
    const internalUrl = internalRest ? `${form.internalScheme}://${internalRest}` : null;
    await upsertService({
      id,
      name: form.name.trim(),
      cat: form.cat,
      icon: isIconName(form.icon) ? form.icon : "dns",
      logoSlug: form.logoSlug || null,
      host: form.host.trim(),
      baseUrl: `${form.scheme}://${form.host.trim()}`,
      internalUrl,
      embeddable: form.embeddable,
      keepAlive: form.keepAlive,
      active: form.active,
      central: form.central,
      centralLabel: form.central ? form.centralLabel || null : null,
      version: form.version || null,
      note: form.note || null,
      monitoringKey: form.monitoringKey || null,
      lokiQuery: form.lokiQuery || null,
      insecureTls: form.insecureTls,
    });
    // Only write the secret when the admin actually entered one (blank = keep).
    if (form.apiKey && form.apiKey.trim()) await setServiceSecret(id, form.apiKey.trim());
    // Forward-auth (authentik) — a separate `forwardAuth`-kind secret, so it coexists with
    // the API key. "remove" clears it; a method + app password writes it; an unset method or
    // blank password keeps the current config (like the API key, blank = keep).
    try {
      if (form.forwardAuthMethod === "remove") {
        await clearServiceForwardAuth(id);
      } else if (form.forwardAuthMethod && form.forwardAuthPassword.trim()) {
        const cfg =
          form.forwardAuthMethod === "bearer"
            ? { method: "bearer" as const, tokenUrl: form.forwardAuthTokenUrl.trim(), clientId: form.forwardAuthClientId.trim(), username: form.forwardAuthUsername.trim(), password: form.forwardAuthPassword, scope: form.forwardAuthScope.trim() || undefined }
            : { method: "basic" as const, username: form.forwardAuthUsername.trim(), password: form.forwardAuthPassword };
        await setServiceForwardAuth(id, cfg);
      }
    } catch {
      return { error: "Invalid forward-auth config — check the token URL, client id and account fields" };
    }
    // Visibility after the service row exists (FK); admin group is always on.
    for (const g of groups) await setVisibility(id, g.name, g.name === adminGroup ? true : Boolean(vis[g.name]));

    // Optimistically update the local snapshot so the service appears immediately.
    const optimisticService: Service = editing
      ? { ...svcModal!.service!, name: form.name.trim(), cat: form.cat as Service["cat"], icon: isIconName(form.icon) ? form.icon : "dns", logoSlug: form.logoSlug || undefined, host: form.host.trim(), scheme: form.scheme, internalUrl: internalUrl ?? undefined, insecureTls: form.insecureTls, embeddable: form.embeddable, keepAlive: form.keepAlive, active: form.active, central: form.central, centralLabel: form.central ? form.centralLabel || undefined : undefined, version: form.version || svcModal!.service!.version, note: form.note || "", monitoringKey: form.monitoringKey || undefined, lokiQuery: form.lokiQuery || undefined }
      : { id, name: form.name.trim(), cat: form.cat as Service["cat"], icon: isIconName(form.icon) ? form.icon : "dns", logoSlug: form.logoSlug || undefined, host: form.host.trim(), scheme: form.scheme, internalUrl: internalUrl ?? undefined, insecureTls: form.insecureTls, embeddable: form.embeddable, keepAlive: form.keepAlive, active: form.active, central: form.central, centralLabel: form.central ? form.centralLabel || undefined : undefined, version: form.version || "", note: form.note || "", monitoringKey: form.monitoringKey || undefined, lokiQuery: form.lokiQuery || undefined, status: "unknown", uptime: 0, ms: 0, beats: [] };
    // Dedupe by id: in add mode the service may already be in the snapshot from a prior
    // auto-save-on-Test, so replace rather than append (avoids a duplicate React key).
    patchData((s) => ({
      ...s,
      services: s.services.some((svc) => svc.id === id)
        ? s.services.map((svc) => (svc.id === id ? optimisticService : svc))
        : [...s.services, optimisticService],
    }));
    return { id, service: optimisticService };
  };

  // Auto-save on "Test connection" (add mode): persist config + secret without closing the
  // modal (it stays in add mode, so no remount/state reset), then the modal tests the *stored*
  // connection by id. Remember the id so the duplicate-id guard treats re-saves as updates.
  const onSaveAndTest = async (form: ServiceForm, vis: Record<string, boolean>): Promise<string | null> => {
    const wasEditing = svcModal?.mode === "edit";
    const res = await persistService(form, vis);
    if ("error" in res) { flash(res.error); return null; }
    if (!wasEditing) {
      lastAutoSavedId.current = res.id;
      flash(`${form.name.trim()} saved — testing connection…`);
    }
    refresh();
    return res.id;
  };

  const onSave = async (form: ServiceForm, vis: Record<string, boolean>) => {
    const editing = svcModal?.mode === "edit";
    const res = await persistService(form, vis);
    if ("error" in res) { flash(res.error); return; }
    const { id } = res;

    setSvcModal(null);
    refresh();
    // Auto-detect version when none was manually entered and a key is available.
    if (!form.version && (form.apiKey.trim() || editing)) {
      const detected = await detectServiceVersion(id);
      if (detected) {
        refresh();
        flash(editing ? `Saved — v${detected} detected` : `${form.name} added — v${detected} detected`);
        return;
      }
    }
    flash(editing ? `Saved changes to ${form.name}` : `${form.name} added to the portal`);
  };

  const onDelete = async (s: Service) => {
    await deleteService(s.id);
    setSvcModal(null);
    refresh();
    flash(`${s.name} removed`);
  };

  return (
    <section style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--surface)" }}>
      <PageHeader eyebrow="Lead operator" title="Admin" icon="tune" accent="var(--primary)" sub="Manage services, members and what each group can see.">
        <button onClick={() => { lastAutoSavedId.current = null; setSvcModal({ mode: "add" }); }} className="btn btn-primary btn-sm">
          <Icon name="add" size={15} /> Add service
        </button>
      </PageHeader>
      <div style={{ display: "flex", gap: 4, padding: `12px ${isMobile ? 16 : 32}px 0`, borderBottom: "1px solid var(--outline-variant)", flexShrink: 0 }}>
        {tabs.map(([id, desktopLabel, mobileLabel, icon]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              padding: "9px 14px",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontFamily: "var(--font-body)",
              fontSize: 12.5,
              fontWeight: 600,
              color: tab === id ? "var(--primary)" : "var(--on-surface-variant)",
              borderBottom: "2px solid " + (tab === id ? "var(--primary)" : "transparent"),
              marginBottom: -1,
              whiteSpace: "nowrap",
            }}
          >
            <Icon name={icon} size={16} />
            {isMobile ? mobileLabel : desktopLabel}
          </button>
        ))}
      </div>
      <div className="custom-scrollbar" style={{ flex: 1, overflowY: "auto" }}>
        <div className="aerie-page-pad" style={{ maxWidth: 1080, margin: "0 auto" }}>
          {tab === "services" && <AdminServices isMobile={isMobile} onOpenService={openService} onEdit={(s) => setSvcModal({ mode: "edit", service: s })} onAddDiscovered={(prefill) => { lastAutoSavedId.current = null; setSvcModal({ mode: "add", prefill }); }} />}
          {tab === "members" && <AdminMembers isMobile={isMobile} />}
          {tab === "visibility" && <AdminVisibility isMobile={isMobile} />}
        </div>
      </div>

      {svcModal && (
        <ServiceModal
          open
          mode={svcModal.mode}
          service={svcModal.service}
          prefill={svcModal.prefill}
          lokiConfigured={lokiConfigured}
          groups={groups}
          adminGroup={adminGroup}
          initialVisibility={svcModal.mode === "edit" && svcModal.service ? visForService(svcModal.service.id) : addDefaults()}
          onClose={() => { lastAutoSavedId.current = null; setSvcModal(null); }}
          onSave={onSave}
          onDelete={onDelete}
          onDetectVersion={async (baseUrl, apiKey, name, insecureTls) => {
            if (svcModal.mode === "edit" && svcModal.service && !apiKey) {
              const v = await detectServiceVersion(svcModal.service.id);
              if (v) refresh();
              return v;
            }
            return probeServiceVersion(baseUrl, apiKey, slug(name), insecureTls);
          }}
          onTestConnection={async (baseUrl, apiKey, name, insecureTls) => {
            if (svcModal.mode === "edit" && svcModal.service && !apiKey) {
              return testStoredConnection(svcModal.service.id);
            }
            return probeServiceVersion(baseUrl, apiKey, slug(name), insecureTls);
          }}
          onSaveAndTest={onSaveAndTest}
          onTestSaved={(id) => testStoredConnection(id)}
        />
      )}
      <Toast message={toast} />
    </section>
  );
}
