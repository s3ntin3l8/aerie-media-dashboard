"use client";
// ============================================================
// AERIE — Admin · Services & Secrets sub-view
// ============================================================
import React, { useMemo, useState, useTransition } from "react";
import type { Service, TraefikRoute } from "@/lib/types";
import { useData, usePatchData, useRefresh } from "@/components/portal/DataProvider";
import { usePortal } from "@/components/portal/PortalProvider";
import { setServiceActive, setServiceKeepAlive, dismissTraefikHost, restoreTraefikHost, restartServiceContainer } from "@/app/(portal)/admin/actions";
import { Icon, Eyebrow, Pill, CatBadge, ExpandableSection, Divider, TRUNCATE, listDivider } from "@/components/primitives";
import { Toggle, ModalShell } from "@/components/modals/ModalShell";
import { Toast } from "@/components/modals/Toast";
import { ServiceLogo } from "@/components/ServiceLogo";
import { statusColor, statusWord, uptimeText } from "@/lib/display";
import { RouteBadges, MetaBadges, KeepAliveCell, ProxyAccessCell } from "@/components/views/shared";
import { type ServiceForm } from "@/components/modals/ServiceModal";
import { LogsModal } from "@/components/modals/LogsModal";
import { serviceRequiresKey, matchPreset, isTraefikSource } from "@/lib/servicePresets";
import { CAT } from "@/lib/categories";

type AdminSortCol = "name" | "host" | "embed" | "cat" | "active" | "keep" | "key";
type AdminSortDir = "asc" | "desc";

// Small Gatus-health "light" overlaid on a service icon's top-right corner: green = up,
// amber = degraded, red = down, dim grey = no monitoring data. Sits on a position:relative
// wrapper (NOT inside ServiceLogo, whose overflow:hidden would clip it). Colours reuse the
// canonical statusColor() so they match StatusDot / Heartbeat everywhere else.
function StatusLight({ service, dot = 10, ring = "var(--surface-container-lowest)", corner = "tr" }: {
  service: Pick<Service, "status" | "uptime">;
  dot?: number;
  ring?: string;
  /** which corner to pin to: top-right (default) or bottom-right */
  corner?: "tr" | "br";
}) {
  const title = service.status === "unknown" ? "No monitoring data" : `${statusWord(service.status)} · ${uptimeText(service)}`;
  return (
    <span
      title={title}
      style={{
        position: "absolute",
        ...(corner === "br" ? { bottom: -2 } : { top: -2 }),
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
function KeyIndicator({ service, dim, compact = false }: { service: Service; dim?: number; compact?: boolean }) {
  const base = { display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "var(--font-mono)", fontSize: 11, opacity: dim } as const;
  if (service.hasSecret) {
    if (compact) return <span title="API key stored (AES-GCM encrypted)" style={{ ...base }}><Icon name="lock" size={14} color="var(--originator-own)" /></span>;
    return (
      <span style={{ ...base, gap: 6, color: "var(--on-surface-variant)" }}>
        <Icon name="lock" size={12} color="var(--originator-own)" />
        ••••••••<span style={{ fontSize: 9, opacity: 0.7 }}>AES-GCM</span>
      </span>
    );
  }
  // A Traefik source is key-optional (its API runs open / behind basic-auth at the operator's
  // choice). Recognize it the same lenient way the data layer does (isTraefikSource: id/name/logo)
  // so a renamed or custom-logo instance gets the neutral "No key" badge, not a spurious warning.
  if (!isTraefikSource(service) && serviceRequiresKey(service.id, service.logoSlug)) {
    if (compact) return <span title="No API key set — this service expects one" style={{ ...base, color: "var(--warning)" }}><Icon name="warning" size={14} /></span>;
    return (
      <span style={{ ...base, color: "var(--warning)" }}>
        <Icon name="warning" size={12} />Not set
      </span>
    );
  }
  if (compact) return <span title="No API key needed for this service" style={{ ...base, color: "var(--on-surface-variant)" }}><Icon name="lock_open" size={14} /></span>;
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

export function AdminServices({ isMobile, onOpenService, onEdit, onAddDiscovered }: { isMobile: boolean; onOpenService: (s: Service) => void; onEdit: (s: Service) => void; onAddDiscovered: (prefill: Partial<ServiceForm>) => void }) {
  // Admin sees the FULL list (incl. inactive); every other surface gets active-only via useData().services.
  const { allServices: services, traefikDiscovered = [], traefikDismissed = [], traefikInstances = [], lokiConfigured = false } = useData();
  const { favorites, toggleFavorite, keptAliveIds } = usePortal();
  const patchData = usePatchData();
  const refresh = useRefresh();
  const [, startActiveTransition] = useTransition();
  // The service whose log tail is open in the Loki viewer (admin-only; gated on lokiConfigured).
  const [logsFor, setLogsFor] = useState<Service | null>(null);
  const logsModalEl = lokiConfigured && logsFor ? (
    <LogsModal open serviceId={logsFor.id} serviceName={logsFor.name} logoSlug={logsFor.logoSlug} onClose={() => setLogsFor(null)} />
  ) : null;

  // Container restart (Portainer): a confirm modal + transient toast. Gated per-row on
  // `s.canRestart` (container name set AND a Portainer instance configured); the action
  // re-checks admin server-side.
  const [restartFor, setRestartFor] = useState<Service | null>(null);
  const [restarting, startRestart] = useTransition();
  const [restartToast, setRestartToast] = useState<string | null>(null);
  const flashRestart = (msg: string) => { setRestartToast(msg); setTimeout(() => setRestartToast(null), 2600); };
  const doRestart = (s: Service) => {
    startRestart(async () => {
      try {
        await restartServiceContainer(s.id);
        setRestartFor(null);
        refresh();
        flashRestart(`Restarting ${s.name}…`);
      } catch (e) {
        setRestartFor(null);
        flashRestart(e instanceof Error ? e.message : `Failed to restart ${s.name}`);
      }
    });
  };
  const restartModalEl = restartFor ? (
    <ModalShell
      open
      onClose={() => setRestartFor(null)}
      accent="var(--error)"
      logoSlug={restartFor.logoSlug || undefined}
      icon={restartFor.logoSlug ? undefined : "restart_alt"}
      title={`Restart ${restartFor.name}?`}
      sub="Bounces the service's container via Portainer."
      width={440}
      footer={(
        <>
          <button onClick={() => setRestartFor(null)} className="btn btn-secondary btn-sm" style={{ marginLeft: "auto" }}>Cancel</button>
          <button onClick={() => doRestart(restartFor)} disabled={restarting} className="btn btn-danger btn-sm">
            <Icon name="restart_alt" size={15} /> {restarting ? "Restarting…" : "Restart"}
          </button>
        </>
      )}
    >
      <div style={{ padding: "18px 20px", fontSize: 13, color: "var(--on-surface-variant)", lineHeight: 1.5 }}>
        The container <code style={{ fontFamily: "var(--font-mono)", color: "var(--on-surface)" }}>{restartFor.containerName}</code> will be restarted
        {restartFor.portainerEndpointId ? <> on Portainer endpoint <code style={{ fontFamily: "var(--font-mono)", color: "var(--on-surface)" }}>{restartFor.portainerEndpointId}</code></> : null}.
        Any in-flight activity on this service may be interrupted.
      </div>
    </ModalShell>
  ) : null;
  const restartToastEl = <Toast message={restartToast} />;
  // Service · Category · Host · Proxy & access · Embed · Active · Keep · API key · actions
  const cols = "1.4fr 96px 1.3fr 1.8fr 0.5fr 0.55fr 0.55fr 0.6fr 1fr";
  const [sort, setSort] = useState<{ col: AdminSortCol; dir: AdminSortDir }>({ col: "name", dir: "asc" });
  // Discovery card starts collapsed — the host list is on-demand, the services table is primary.

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
      case "name":   return a.name.localeCompare(b.name) * d;
      case "host":   return (a.host ?? "").localeCompare(b.host ?? "") * d;
      case "embed":  return (Number(b.embeddable) - Number(a.embeddable)) * d;
      case "cat":    return CAT[a.cat].label.localeCompare(CAT[b.cat].label) * d;
      case "active": return (Number(b.active) - Number(a.active)) * d;
      case "keep":   return (Number(b.keepAlive) - Number(a.keepAlive)) * d;
      case "key":    return (Number(b.hasSecret) - Number(a.hasSecret)) * d;
      default:       return 0;
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
    <ExpandableSection icon="travel_explore" title="Discovered via Traefik" count={traefikDiscovered.length}>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {traefikDiscovered.map((r, i) => (
          <div key={r.router} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: listDivider(i) }}>
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
    </ExpandableSection>
  ) : null;

  // Traefik node health from the aggregator, already scoped server-side to only the nodes that route
  // a configured service. Collapsed by default; renders nothing without an aggregator source.
  const nodeStatusColor = (st: string) =>
    st === "ok" ? "var(--originator-own)" : st === "degraded" ? "var(--amber)" : st === "unreachable" ? "var(--error)" : "var(--on-surface-variant)";
  const nodesEl = traefikInstances.length > 0 ? (
    <ExpandableSection icon="lan" title="Traefik nodes" count={traefikInstances.length}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {traefikInstances.map((n, i) => {
            const color = nodeStatusColor(n.status);
            const served = (n.serves ?? []).map(traefikName);
            return (
              <div key={n.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: listDivider(i) }}>
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
    </ExpandableSection>
  ) : null;

  if (isMobile) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {logsModalEl}
        {restartModalEl}
        {restartToastEl}
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
          <option value="cat:asc">Category A→Z</option>
          <option value="cat:desc">Category Z→A</option>
          <option value="host:asc">Host A→Z</option>
          <option value="host:desc">Host Z→A</option>
          <option value="embed:desc">Embeddable first</option>
          <option value="embed:asc">Non-embeddable first</option>
          <option value="active:desc">Active first</option>
          <option value="keep:desc">Kept alive first</option>
          <option value="key:desc">API key set first</option>
        </select>
        {sorted.map((s) => {
          const pinned = favorites.includes(s.id);
          const dim = s.active ? undefined : 0.5;
          return (
            <div key={s.id} className="card" style={{ padding: 15, borderRadius: 18, background: "var(--surface-container-lowest)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, opacity: dim }}>
                <span style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
                  <ServiceLogo service={s} size={36} radius={9} />
                  {/* Reachability light moves to the bottom-right so the top-right corner can carry
                      the keep-alive glyph (rail-style). */}
                  <StatusLight service={s} dot={12} corner="br" />
                  {s.embeddable && s.keepAlive && (
                    <span style={{ position: "absolute", top: -4, right: -4, width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--surface-container-lowest)", borderRadius: 9999 }}>
                      <KeepAliveCell service={s} live={keptAliveIds.includes(s.id)} iconOnly />
                    </span>
                  )}
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
                {s.canRestart && (
                  <button
                    onClick={() => setRestartFor(s)}
                    className="btn btn-ghost btn-sm"
                    style={{ flex: 1, justifyContent: "center", minHeight: 44, gap: 6, color: "var(--error)" }}
                    title="Restart container"
                  >
                    <Icon name="restart_alt" size={18} />Restart
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // A sortable column header (Service / Host / Embed) — interleaved among the plain Eyebrow headers
  // so each lands in its own grid column position.
  const sortHead = (col: AdminSortCol, label: string) => {
    const active = sort.col === col;
    return (
      <button
        onClick={() => handleSortClick(col)}
        style={{ display: "inline-flex", alignItems: "center", gap: 3, background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}
      >
        <Eyebrow style={{ color: active ? "var(--on-surface)" : undefined, whiteSpace: "nowrap" }}>{label}</Eyebrow>
        <Icon
          name={active ? (sort.dir === "asc" ? "expand_less" : "expand_more") : "unfold_more"}
          size={13}
          color={active ? "var(--on-surface)" : "var(--on-surface-variant)"}
          style={{ opacity: active ? 1 : 0.4 }}
        />
      </button>
    );
  };

  return (
    <>
    {logsModalEl}
    {restartModalEl}
    {restartToastEl}
    {discoveredEl}
    {nodesEl}
    <div className="aerie-x-scroll">
      <div style={{ minWidth: 960, borderRadius: 16, border: "1px solid var(--outline-variant)", overflow: "hidden", background: "var(--surface-container-lowest)" }}>
        <div style={{ display: "grid", gridTemplateColumns: cols, gap: 12, padding: "11px 18px", borderBottom: "1px solid var(--outline-variant)", background: "color-mix(in srgb, var(--surface-container) 50%, transparent)" }}>
          {sortHead("name", "Service")}
          {sortHead("cat", "Category")}
          {sortHead("host", "Host")}
          <Eyebrow style={{ whiteSpace: "nowrap" }}>Proxy &amp; access</Eyebrow>
          {sortHead("embed", "Embed")}
          {sortHead("active", "Active")}
          {sortHead("keep", "Keep")}
          {sortHead("key", "API key")}
          <Eyebrow style={{ textAlign: "right", whiteSpace: "nowrap" }}>Actions</Eyebrow>
        </div>
        {sorted.map((s, i) => {
          const pinned = favorites.includes(s.id);
          const dim = s.active ? undefined : 0.5;
          return (
            <div key={s.id} style={{ display: "grid", gridTemplateColumns: cols, gap: 12, alignItems: "center", padding: "12px 18px", borderTop: listDivider(i) }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, opacity: dim }}>
                <span style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
                  <ServiceLogo service={s} size={28} radius={7} />
                  <StatusLight service={s} dot={10} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                    <span style={{ fontWeight: 700, fontSize: 12.5, color: "var(--on-surface)", ...TRUNCATE, minWidth: 0 }}>{s.name}</span>
                    {!s.active && <span style={{ flexShrink: 0 }}><Pill rawColor="var(--on-surface-variant)">inactive</Pill></span>}
                  </div>
                </div>
              </div>
              <span style={{ opacity: dim, minWidth: 0, whiteSpace: "nowrap" }}><CatBadge cat={s.cat} size="xs" /></span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--on-surface-variant)", ...TRUNCATE, minWidth: 0, opacity: dim }}>{s.host}</span>
              {/* Cert + SSO + route-health + Authentik access, consolidated into one column. */}
              <span style={{ opacity: dim, minWidth: 0 }}><ProxyAccessCell route={s.route} access={s.authentik} reserve /></span>
              <span style={{ opacity: dim }}>{s.embeddable ? <Icon name="check" size={16} color="var(--originator-own)" /> : <Icon name="open_in_new" size={15} color="var(--on-surface-variant)" />}</span>
              <Toggle on={s.active} onChange={() => toggleActive(s)} size="sm" color="var(--originator-own)" />
              <span
                title={s.embeddable ? "Keep this service's iframe mounted (hidden) after first open so its state survives switching" : "Only embeddable services can be kept alive"}
                style={{ display: "inline-flex", alignItems: "center", opacity: s.embeddable ? undefined : 0.3, pointerEvents: s.embeddable ? undefined : "none" }}
              >
                <Toggle on={s.embeddable && s.keepAlive} onChange={() => toggleKeepAlive(s)} size="sm" color="var(--primary)" />
              </span>
              <KeyIndicator service={s} dim={dim} compact />
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
                {s.canRestart && (
                  <button onClick={() => setRestartFor(s)} className="btn btn-ghost btn-sm" style={{ padding: 6, color: "var(--error)" }} title="Restart container">
                    <Icon name="restart_alt" size={15} />
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
