// ============================================================
// AERIE — environment configuration (server-only)
// Central, typed access to env vars. Nothing here is exposed to
// the client. Missing auth/service config degrades gracefully to
// dev/mock behaviour rather than crashing.
// ============================================================
import "server-only";

const trim = (v: string | undefined) => (v && v.trim() ? v.trim() : undefined);

/**
 * Whether Auth.js should force `Secure`-prefixed session cookies (`__Secure-`/`__Host-`, Secure flag).
 * Pinned to production rather than left to Auth.js's forwarded-header auto-detection: prod always sits
 * behind Traefik TLS, so this is byte-identical to today's behaviour but fails safe if the proxy ever
 * stops forwarding `X-Forwarded-Proto`. Non-production (dev / `npm run start` over HTTP) keeps plain
 * cookies so local sign-in still works.
 */
export function computeSecureCookies(nodeEnv: string | undefined): boolean {
  return nodeEnv === "production";
}

export const env = {
  // ── Generic OIDC (any provider: Authentik, Keycloak, Google, Pocket-ID, Zitadel, …) ──
  authIssuer: trim(process.env.OIDC_ISSUER),
  authClientId: trim(process.env.OIDC_CLIENT_ID),
  authClientSecret: trim(process.env.OIDC_CLIENT_SECRET),
  authSecret: trim(process.env.AUTH_SECRET),
  /** Auth.js provider id → callback path /api/auth/callback/<id>. Must match the IdP redirect URI. */
  oidcProviderId: trim(process.env.OIDC_PROVIDER_ID) || "oidc",
  /** Display name on the login button ("Continue with <name>") and Auth.js provider name. */
  oidcProviderName: trim(process.env.OIDC_PROVIDER_NAME) || "SSO",
  /** Material-symbol name for the login button icon. */
  oidcProviderIcon: trim(process.env.OIDC_PROVIDER_ICON) || "shield_person",
  /** Requested scopes. `groups` is non-default; the IdP must emit it for role mapping. */
  oidcScopes: trim(process.env.OIDC_SCOPES) || "openid email profile groups",
  /** Claim that carries the user's group memberships. */
  oidcGroupsClaim: trim(process.env.OIDC_GROUPS_CLAIM) || "groups",
  /** Group whose members get the admin role. */
  adminGroup: trim(process.env.AERIE_ADMIN_GROUP) || "admins",
  /** Emails that get the admin role regardless of groups (for IdPs that don't emit groups). */
  adminEmails: (trim(process.env.AERIE_ADMIN_EMAILS) || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
  /**
   * Auth.js session lifetime, in seconds. Defaults to 24h to roughly track a typical upstream
   * SSO (Authentik) session, so Aerie's own JWT doesn't stay valid long after the forward-auth
   * session behind embedded services has expired. Note: the JWT is sliding, so this bounds idle
   * lifetime, not active use.
   */
  sessionMaxAge: Number(trim(process.env.AUTH_SESSION_MAX_AGE)) || 60 * 60 * 24,

  // ── Persistence ──
  databaseUrl: trim(process.env.DATABASE_URL) || "file:./data/aerie.db",
  /** 32-byte hex/base64 key for AES-256-GCM service-secret encryption. */
  encryptionKey: trim(process.env.ENCRYPTION_KEY),

  // ── Declarative config ──
  /** Path to the optional YAML file that defines services/visibility/secrets. */
  configFile: trim(process.env.AERIE_CONFIG_FILE) || "./config/aerie.yaml",

  // ── Prometheus ──
  /** Instance label to filter node_exporter metrics (e.g. "pve" or "192.168.1.10:9100"). */
  prometheusInstance: trim(process.env.PROMETHEUS_INSTANCE),

  // ── Branding / deployment ──
  brand: trim(process.env.AERIE_BRAND) || "AERIE",
  portalUrl: trim(process.env.AERIE_PORTAL_URL) || "https://media.example.com",

  // ── Security ──
  /** Force Auth.js `Secure`-prefixed session cookies in production (see computeSecureCookies). */
  secureCookies: computeSecureCookies(process.env.NODE_ENV),
} as const;

/** True when real Authentik OIDC is configured; otherwise the app runs in dev/mock mode. */
export const authConfigured = Boolean(env.authIssuer && env.authClientId && env.authClientSecret);
