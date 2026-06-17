// ============================================================
// AERIE — Auth.js v5 ↔ generic OIDC + local credentials fallback
// • When OIDC is configured, a single provider-agnostic OIDC provider
//   is registered; role is derived from the configurable groups claim
//   (or AERIE_ADMIN_EMAILS).
// • When OIDC is NOT configured, a Credentials provider authenticates
//   against locally-created accounts (password hashed at rest). The
//   first-run admin is created via the /login setup flow.
// ============================================================
import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { env, authConfigured } from "@/lib/env";
import { normalizeGroups, deriveRole } from "@/lib/auth/role";

// ── Brute-force rate limiter for local-credentials login ──
const loginAttempts = new Map<string, { count: number; until: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1_000; // 15 min

function isRateLimited(email: string): boolean {
  const entry = loginAttempts.get(email);
  if (!entry) return false;
  if (Date.now() > entry.until) { loginAttempts.delete(email); return false; }
  return entry.count >= MAX_ATTEMPTS;
}

function recordFailedAttempt(email: string): void {
  const entry = loginAttempts.get(email);
  if (!entry || Date.now() > entry.until) {
    loginAttempts.set(email, { count: 1, until: Date.now() + WINDOW_MS });
  } else {
    entry.count++;
  }
}

function clearAttempts(email: string): void {
  loginAttempts.delete(email);
}

type OidcProfile = Record<string, unknown> & {
  sub?: string;
  name?: string;
  preferred_username?: string;
  email?: string;
};

const providers: NextAuthConfig["providers"] = authConfigured
  ? [
      {
        id: env.oidcProviderId,
        name: env.oidcProviderName,
        type: "oidc",
        issuer: env.authIssuer,
        clientId: env.authClientId,
        clientSecret: env.authClientSecret,
        // `groups` is a non-default scope; the IdP must emit it (see docs/AUTH.md).
        authorization: { params: { scope: env.oidcScopes } },
        profile(profile: OidcProfile) {
          const groups = normalizeGroups(profile[env.oidcGroupsClaim]);
          return {
            id: String(profile.sub),
            name: profile.name || profile.preferred_username || profile.email,
            email: profile.email,
            groups,
            role: deriveRole(groups, profile.email, env.adminGroup, env.adminEmails),
          } as { id: string; name?: string | null; email?: string | null; groups: string[]; role: "admin" | "user" };
        },
      },
    ]
  : [
      Credentials({
        credentials: { email: {}, password: {} },
async authorize(credentials) {
          const email = typeof credentials?.email === "string" ? credentials.email.trim().toLowerCase() : "";
          const password = typeof credentials?.password === "string" ? credentials.password : "";
          if (!email || !password) return null;
          if (isRateLimited(email)) return null;
          // Lazy import so the Node-only DB/crypto code stays out of the edge
          // (middleware) bundle — authorize only runs in the Node API route.
          const { getUserByEmail } = await import("@/lib/integrations/registry");
          const { verifyPassword } = await import("@/lib/auth/password");
          const user = await getUserByEmail(email);
          if (!user?.passwordHash) { recordFailedAttempt(email); return null; }
          if (!verifyPassword(password, user.passwordHash)) { recordFailedAttempt(email); return null; }
          clearAttempts(email);
          return {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            groups: user.role === "admin" ? [env.adminGroup] : [],
          };
        },
      }),
    ];

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  secret: env.authSecret || undefined,
  providers,
  pages: { signIn: "/login" },
  // maxAge bounds Aerie's own session so it doesn't outlive the upstream SSO session that gates
  // embedded services (tunable via AUTH_SESSION_MAX_AGE; default 24h). See docs/AUTH.md.
  session: { strategy: "jwt", maxAge: env.sessionMaxAge },
  callbacks: {
    async jwt({ token, profile, user }) {
      // OIDC sign-in: derive from the profile claim.
      if (profile) {
        const groups = normalizeGroups((profile as OidcProfile)[env.oidcGroupsClaim]);
        token.groups = groups;
        token.role = deriveRole(groups, (profile as OidcProfile).email, env.adminGroup, env.adminEmails);
      }
      // Credentials sign-in: carry role/groups off the authorized user.
      if (user) {
        const u = user as { role?: "admin" | "user"; groups?: string[] };
        if (u.role) token.role = u.role;
        if (u.groups) token.groups = u.groups;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.role = (token.role as "admin" | "user") ?? "user";
        session.user.groups = (token.groups as string[]) ?? [];
      }
      return session;
    },
  },
});
