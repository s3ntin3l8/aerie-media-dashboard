"use client";
// ============================================================
// AERIE — shared page chrome: PageHeader + StatTile
// ============================================================
import React from "react";
import { useRouter } from "next/navigation";
import { Icon, Eyebrow, CatBadge } from "@/components/primitives";
import type { TraefikRoute, AuthentikAccess, Category, Service } from "@/lib/types";
import { keepAliveDisplay } from "@/lib/embed/keepAliveDisplay";

export function PageHeader({
  eyebrow,
  title,
  sub,
  icon,
  accent = "var(--primary)",
  back,
  children,
}: {
  eyebrow?: string;
  title: string;
  sub?: string;
  icon?: string;
  accent?: string;
  /** Optional left-aligned back button (e.g. for full-page deep views). */
  back?: { href: string; label: string };
  children?: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <div
      style={{
        padding: "20px 32px 16px",
        borderBottom: "1px solid var(--outline-variant)",
        flexShrink: 0,
        background: "color-mix(in srgb, var(--surface-container-lowest) 40%, transparent)",
      }}
    >
      <div className="aerie-header-row">
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          {back && (
            <button
              onClick={() => router.push(back.href)}
              className="btn btn-ghost btn-sm"
              style={{ paddingLeft: 8, paddingRight: 12 }}
            >
              <Icon name="arrow_back" size={16} /> {back.label}
            </button>
          )}
          {icon && (
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 11,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: `color-mix(in srgb, ${accent} 13%, transparent)`,
              }}
            >
              <Icon name={icon} size={22} color={accent} />
            </div>
          )}
          <div>
            {eyebrow && (
              <Eyebrow color={accent} style={{ marginBottom: 5 }}>
                {eyebrow}
              </Eyebrow>
            )}
            <h1 style={{ fontFamily: "var(--font-headline)", fontSize: 22, fontWeight: 800, letterSpacing: "-0.01em", color: "var(--on-surface)", lineHeight: 1.1 }}>
              {title}
            </h1>
            {sub && <div style={{ fontSize: 12.5, color: "var(--on-surface-variant)", marginTop: 3 }}>{sub}</div>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>{children}</div>
      </div>
    </div>
  );
}

function RouteChip({ children, color, title }: { children: React.ReactNode; color: string; title?: string }) {
  return (
    <span
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        lineHeight: 1.4,
        padding: "1px 6px",
        borderRadius: 9999,
        color,
        border: `1px solid color-mix(in srgb, ${color} 35%, transparent)`,
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

/** Muted "—" placeholder so a reserved table column stays aligned when a service
 *  carries no Traefik/Authentik data for that cell. */
function DashCell() {
  return <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--on-surface-variant)", opacity: 0.55 }}>—</span>;
}

// The serving Traefik node (aggregator-only) is folded into each tooltip rather than shown as its
// own chip — keeps the row uncluttered while still exposing which node routes the service.
const nodeSuffixOf = (route: TraefikRoute) => (route.instance ? ` · node ${route.instance}` : "");

/** Forward-auth / SSO indicator for a service's correlated Traefik route.
 *  - default: the "SSO" chip when forward-auth is on, else null.
 *  - reserve: render a muted "—" instead of null (keeps aligned table columns flush).
 *  - iconOnly: just the shield icon + tooltip (the mobile icon rail). */
export function SsoCell({ route, reserve = false, iconOnly = false }: { route?: TraefikRoute; reserve?: boolean; iconOnly?: boolean }) {
  if (!route?.forwardAuth) return reserve ? <DashCell /> : null;
  // Prefer the resolved middleware types ("authentik (forwardauth)") over bare names.
  const mwLabel = route.middlewareDetail?.length
    ? route.middlewareDetail.map((m) => `${m.name} (${m.type})`).join(", ")
    : route.middlewares.join(", ") || "middleware";
  const title = `forward-auth via ${mwLabel}${nodeSuffixOf(route)}`;
  if (iconOnly) return <span title={title} style={{ display: "inline-flex" }}><Icon name="shield" size={12} color="var(--primary)" /></span>;
  return (
    <RouteChip color="var(--primary)" title={title}>
      <Icon name="shield" size={11} /> SSO
    </RouteChip>
  );
}

/** TLS cert-expiry indicator for a service's correlated Traefik route (color-coded by days
 *  remaining: <3 error, <14 amber). Falls back to a bare lock when TLS is on but no cert detail
 *  was parsed. `reserve` / `iconOnly` behave as in SsoCell. */
export function CertCell({ route, reserve = false, iconOnly = false }: { route?: TraefikRoute; reserve?: boolean; iconOnly?: boolean }) {
  if (route?.cert) {
    const d = route.cert.daysRemaining;
    const color = d < 3 ? "var(--error)" : d < 14 ? "var(--amber)" : "var(--on-surface-variant)";
    const expires = new Date(route.cert.notAfter * 1000).toLocaleDateString();
    const certExtra = [
      route.cert.issuer && `issuer ${route.cert.issuer}`,
      route.cert.resolver && `resolver ${route.cert.resolver}`,
      route.cert.keyType,
    ].filter(Boolean).join(" · ");
    const title = `TLS cert for ${route.cert.domains.join(", ")} — expires ${expires} (${d}d left)${certExtra ? ` · ${certExtra}` : ""}${nodeSuffixOf(route)}`;
    if (iconOnly) return <span title={title} style={{ display: "inline-flex" }}><Icon name="lock" size={12} color={color} /></span>;
    return (
      <RouteChip color={color} title={title}>
        <Icon name="lock" size={11} /> {d < 0 ? "cert expired" : `cert ${d}d`}
      </RouteChip>
    );
  }
  if (route?.tls) {
    if (iconOnly) return <span title="TLS enabled" style={{ display: "inline-flex" }}><Icon name="lock" size={12} color="var(--on-surface-variant)" /></span>;
    return <Icon name="lock" size={11} color="var(--on-surface-variant)" />;
  }
  return reserve ? <DashCell /> : null;
}

/** Keep-alive indicator for an embeddable service. Two-state (see keepAliveDisplay): a dim outline
 *  `autorenew` glyph when merely flagged, a filled + glowing accent glyph when its embed is live
 *  right now. `reserve` renders a muted "—" placeholder so aligned columns stay flush (used in the
 *  /status health table); `iconOnly` drops the chip frame for tight spots (rail / launcher card). */
export function KeepAliveCell({ service, live, reserve = false, iconOnly = false }: { service: Service; live: boolean; reserve?: boolean; iconOnly?: boolean }) {
  const d = keepAliveDisplay(service, live);
  if (!d.show) return reserve ? <DashCell /> : null;
  const glow = d.live ? { filter: "drop-shadow(0 0 4px color-mix(in srgb, var(--primary) 60%, transparent))" } : undefined;
  if (iconOnly) {
    return (
      <span title={d.title} style={{ display: "inline-flex", opacity: d.live ? 1 : 0.7, ...glow }}>
        <Icon name="autorenew" size={12} fill={d.live} color={d.color} />
      </span>
    );
  }
  return (
    <RouteChip color={d.color} title={d.title}>
      <Icon name="autorenew" size={11} fill={d.live} /> {d.live ? "live" : "keep-alive"}
    </RouteChip>
  );
}

/** Route-problem chip shown only when the router/backend is unhealthy. Stays inline in the
 *  service-name cell as a per-row health signal (cert/SSO live in their own columns now). */
export function RouteHealthBadge({ route }: { route?: TraefikRoute }) {
  if (!route) return null;
  const routeBad = route.serverStatus === "down" || (route.status !== "enabled" && route.status !== "unknown");
  if (!routeBad) return null;
  const color = route.serverStatus === "down" ? "var(--error)" : "var(--amber)";
  return (
    <RouteChip color={color} title={`router ${route.status}, backend ${route.serverStatus} — ${route.router}${nodeSuffixOf(route)}`}>
      <Icon name="error" size={11} /> route
    </RouteChip>
  );
}

/** Compact read-only badges for a service's correlated Traefik route: forward-auth ("SSO"),
 *  a route-problem chip when the router/backend is unhealthy, and TLS cert expiry. Composes the
 *  individual cells above; used where all three should sit inline (Admin, MetaBadges). */
export function RouteBadges({ route }: { route: TraefikRoute }) {
  const routeBad = route.serverStatus === "down" || (route.status !== "enabled" && route.status !== "unknown");
  // Nothing to show for a fully-healthy route with no TLS/cert — render nothing (no empty span).
  if (!route.forwardAuth && !routeBad && !route.cert && !route.tls) return null;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <SsoCell route={route} />
      <RouteHealthBadge route={route} />
      <CertCell route={route} />
    </span>
  );
}

/** Read-only Authentik access summary for a service: provider type + who can access (everyone, or the
 *  bound groups, with user-count / policy-gated noted in the tooltip). Admin-facing insight. */
export function AccessBadges({ access }: { access: AuthentikAccess }) {
  const extras = [
    access.users > 0 ? `${access.users} user${access.users === 1 ? "" : "s"}` : null,
    access.policyGated ? "policy-gated" : null,
  ].filter(Boolean);
  const provider = [access.providerType, access.providerName].filter(Boolean).join(" · ");
  const inherited = access.inheritedFrom ? `via ${access.inheritedFrom} outpost` : null;
  if (access.everyone) {
    return (
      <RouteChip color="var(--on-surface-variant)" title={[`Authentik: all users can access`, inherited, provider].filter(Boolean).join(" — ")}>
        <Icon name="group" size={11} /> everyone
      </RouteChip>
    );
  }
  const detail = [`Authentik access — ${access.groups.join(", ") || "groups: none"}`, ...extras, inherited, provider].filter(Boolean).join(" · ");
  const n = access.groups.length;
  const label = n === 0 ? "restricted" : n === 1 ? access.groups[0] : `${n} groups`;
  return (
    <RouteChip color="var(--primary)" title={detail}>
      <Icon name="group" size={11} /> {label}
    </RouteChip>
  );
}

/** One compact, wrapping meta row for a service: an optional category pill followed by the
 *  Traefik route badges and the Authentik access badge. Replaces stacking each in its own
 *  margined line so service rows stay short (two lines instead of four). */
export function MetaBadges({ cat, route, access }: { cat?: Category; route?: TraefikRoute; access?: AuthentikAccess }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", flexWrap: "wrap", gap: 5, rowGap: 4 }}>
      {cat && <CatBadge cat={cat} size="xs" />}
      {route && <RouteBadges route={route} />}
      {access && <AccessBadges access={access} />}
    </span>
  );
}

export function StatTile({ label, value, color = "var(--on-surface)", icon }: { label: string; value: React.ReactNode; color?: string; icon?: string }) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        padding: "12px 16px",
        borderRadius: 12,
        background: "var(--surface-container-lowest)",
        border: "1px solid var(--outline-variant)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Eyebrow>{label}</Eyebrow>
        {icon && <Icon name={icon} size={14} color={color} />}
      </div>
      <div style={{ fontFamily: "var(--font-headline)", fontWeight: 800, fontSize: 24, color, lineHeight: 1, letterSpacing: "-0.02em" }}>{value}</div>
    </div>
  );
}
