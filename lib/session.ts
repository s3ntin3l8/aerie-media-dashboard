// ============================================================
// AERIE — server-side session access
// Returns the signed-in user, or a dev-mode mock when OIDC is off.
// ============================================================
import "server-only";
import { auth } from "@/auth";
import { authConfigured, env } from "@/lib/env";
import type { AppUser } from "@/lib/types";

const DEV_USER: AppUser = {
  id: "you",
  name: "Björn",
  email: "bjoern@aerie.tv",
  role: "admin",
  groups: [env.adminGroup],
};

/** The current user. In dev/mock mode (no OIDC) this is an admin. */
export async function getSessionUser(): Promise<AppUser> {
  if (!authConfigured) return DEV_USER;

  const session = await auth();
  if (!session?.user) {
    // middleware should have redirected; fall back defensively.
    return { id: "anon", name: "Guest", email: "", role: "user", groups: [] };
  }
  return {
    id: (session.user.email || session.user.name || "user") as string,
    name: session.user.name || session.user.email || "Member",
    email: session.user.email || "",
    role: session.user.role ?? "user",
    groups: session.user.groups ?? [],
  };
}
