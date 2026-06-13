"use client";
// ============================================================
// AERIE — shared page chrome: PageHeader + StatTile
// ============================================================
import React from "react";
import { useRouter } from "next/navigation";
import { Icon, Eyebrow } from "@/components/primitives";
import type { TraefikRoute, AuthentikAccess } from "@/lib/types";

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

/** Compact read-only badges for a service's correlated Traefik route: forward-auth ("SSO"),
 *  a route-problem chip when the router/backend is unhealthy, and TLS cert expiry (color-coded by
 *  days remaining). Renders nothing when the route is fully healthy and carries no cert info. */
export function RouteBadges({ route }: { route: TraefikRoute }) {
  const badges: React.ReactNode[] = [];
  if (route.forwardAuth) {
    badges.push(
      <RouteChip key="sso" color="var(--primary)" title={`forward-auth via ${route.middlewares.join(", ") || "middleware"}`}>
        <Icon name="shield" size={11} /> SSO
      </RouteChip>,
    );
  }
  const routeBad = route.serverStatus === "down" || (route.status !== "enabled" && route.status !== "unknown");
  if (routeBad) {
    const color = route.serverStatus === "down" ? "var(--error)" : "var(--amber)";
    badges.push(
      <RouteChip key="route" color={color} title={`router ${route.status}, backend ${route.serverStatus} — ${route.router}`}>
        <Icon name="error" size={11} /> route
      </RouteChip>,
    );
  }
  if (route.cert) {
    const d = route.cert.daysRemaining;
    const color = d < 3 ? "var(--error)" : d < 14 ? "var(--amber)" : "var(--on-surface-variant)";
    const expires = new Date(route.cert.notAfter * 1000).toLocaleDateString();
    badges.push(
      <RouteChip key="cert" color={color} title={`TLS cert for ${route.cert.domains.join(", ")} — expires ${expires}`}>
        <Icon name="lock" size={11} /> {d < 0 ? "cert expired" : `cert ${d}d`}
      </RouteChip>,
    );
  } else if (route.tls) {
    badges.push(<Icon key="tls" name="lock" size={11} color="var(--on-surface-variant)" />);
  }
  if (!badges.length) return null;
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>{badges}</span>;
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
