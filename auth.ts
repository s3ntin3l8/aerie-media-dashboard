// ============================================================
// AERIE — Auth.js v5 ↔ Authentik OIDC
// Role is derived from the Authentik `groups` claim. When OIDC is
// not configured, providers is empty and the app falls back to a
// dev-mode mock session (see lib/session.ts).
// ============================================================
import NextAuth, { type NextAuthConfig } from "next-auth";
import { env, authConfigured } from "@/lib/env";

interface AuthentikProfile {
  sub: string;
  name?: string;
  preferred_username?: string;
  email?: string;
  groups?: string[];
}

const providers: NextAuthConfig["providers"] = authConfigured
  ? [
      {
        id: "authentik",
        name: "Authentik",
        type: "oidc",
        issuer: env.authIssuer,
        clientId: env.authClientId,
        clientSecret: env.authClientSecret,
        // `groups` is a non-default scope; Authentik must have a scope
        // mapping that emits it (see plan §Auth groups-claim gotcha).
        authorization: { params: { scope: "openid email profile groups" } },
        profile(profile: AuthentikProfile) {
          return {
            id: profile.sub,
            name: profile.name || profile.preferred_username || profile.email,
            email: profile.email,
            groups: profile.groups ?? [],
          } as { id: string; name?: string | null; email?: string | null; groups: string[] };
        },
      },
    ]
  : [];

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  // Real deployments must set AUTH_SECRET; this constant only keeps the
  // dev/mock server (no OIDC) from throwing MissingSecret.
  secret: env.authSecret ?? "aerie-dev-only-insecure-secret-change-me",
  providers,
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, profile }) {
      if (profile) {
        const groups = ((profile as AuthentikProfile).groups ?? []) as string[];
        token.groups = groups;
        token.role = groups.includes(env.adminGroup) ? "admin" : "user";
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
