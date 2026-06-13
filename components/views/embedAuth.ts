// ============================================================
// AERIE — embed subheader auth/cert derivation (client-safe; pure)
// ------------------------------------------------------------
// Reflects a service's REAL proxy protection in the embedded service-view subheader
// (Traefik middleware / Authentik access) instead of a blanket "forward-auth" literal,
// and derives the lock-icon colour + cert tooltip. Pure so it's unit-testable in isolation.
// ============================================================
import type { Service } from "@/lib/types";

export interface EmbedAuthSummary {
  /** lock-icon colour: cert-threshold tinted (red <3d / amber <14d) else scheme-based */
  lockColor: string;
  /** lock-icon tooltip: cert summary when known, else HTTPS/HTTP note */
  lockTitle: string;
  /** whether this route is behind forward-auth / Authentik */
  behindSso: boolean;
  /** right-cluster label text */
  authText: string;
  authColor: string;
  authIcon: string;
  /** multi-line tooltip for the auth label */
  authTitle: string;
}

/** Short access label for an Authentik access summary (everyone / group / N groups / restricted). */
export function accessLabel(access: NonNullable<Service["authentik"]>): string {
  if (access.everyone) return "everyone";
  const n = access.groups.length;
  return n === 0 ? "restricted" : n === 1 ? access.groups[0] : `${n} groups`;
}

export function embedAuthSummary(s: Service, who: string, oidc: boolean): EmbedAuthSummary {
  const cert = s.route?.cert;
  const lockColor = cert
    ? cert.daysRemaining < 3 ? "var(--error)" : cert.daysRemaining < 14 ? "var(--amber)" : "var(--originator-own)"
    : s.scheme === "https" ? "var(--originator-own)" : "var(--amber)";
  const lockTitle = cert
    ? `TLS cert for ${cert.domains.join(", ")} — expires ${new Date(cert.notAfter * 1000).toLocaleDateString()} (${cert.daysRemaining < 0 ? "expired" : `${cert.daysRemaining}d left`})`
    : s.scheme === "https" ? "HTTPS" : "HTTP — not encrypted";

  const access = s.authentik;
  const accessLbl = access ? accessLabel(access) : null;
  const behindSso = Boolean(s.route?.forwardAuth) || Boolean(access);
  const authText = behindSso
    ? `forward-auth${accessLbl ? ` · ${accessLbl}` : ` · ${who}`}`
    : s.route
      ? `direct · ${who}` // route known but no forward-auth middleware → not behind SSO
      : oidc ? `forward-auth · ${who}` : who; // no route data → fall back to the global OIDC hint
  const authColor = behindSso ? "var(--primary)" : "var(--on-surface-variant)";
  const authIcon = behindSso ? "shield_person" : s.route ? "lock_open" : "shield_person";
  const authTitle = [
    s.route ? `middlewares: ${s.route.middlewares.join(", ") || "none"}` : null,
    access ? `Authentik: ${access.everyone ? "all users" : access.groups.join(", ") || "restricted"}` : null,
    `signed in as ${who}`,
  ].filter(Boolean).join("\n");

  return { lockColor, lockTitle, behindSso, authText, authColor, authIcon, authTitle };
}
