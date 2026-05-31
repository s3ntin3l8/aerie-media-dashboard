// ============================================================
// AERIE — environment configuration (server-only)
// Central, typed access to env vars. Nothing here is exposed to
// the client. Missing auth/service config degrades gracefully to
// dev/mock behaviour rather than crashing.
// ============================================================
import "server-only";

const trim = (v: string | undefined) => (v && v.trim() ? v.trim() : undefined);

export const env = {
  // ── Authentik OIDC ──
  authIssuer: trim(process.env.AUTH_AUTHENTIK_ISSUER), // e.g. https://authentik.s3ntin3l8.de/application/o/aerie/
  authClientId: trim(process.env.AUTH_AUTHENTIK_ID),
  authClientSecret: trim(process.env.AUTH_AUTHENTIK_SECRET),
  authSecret: trim(process.env.AUTH_SECRET),
  /** Authentik group whose members get the admin role. */
  adminGroup: trim(process.env.AERIE_ADMIN_GROUP) || "admins",

  // ── Persistence ──
  databaseUrl: trim(process.env.DATABASE_URL) || "file:./data/aerie.db",
  /** 32-byte hex/base64 key for AES-256-GCM service-secret encryption. */
  encryptionKey: trim(process.env.ENCRYPTION_KEY),

  // ── Branding / deployment ──
  brand: trim(process.env.AERIE_BRAND) || "AERIE",
  portalUrl: trim(process.env.AERIE_PORTAL_URL) || "https://media.s3ntin3l8.de",
} as const;

/** True when real Authentik OIDC is configured; otherwise the app runs in dev/mock mode. */
export const authConfigured = Boolean(env.authIssuer && env.authClientId && env.authClientSecret);
