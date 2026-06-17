// ============================================================
// AERIE — server-side session access
// Returns the signed-in user. Auth is always required (generic OIDC
// or local credentials), so middleware normally guarantees a session
// here; the guest fallback is purely defensive.
// ============================================================
import "server-only";
import { auth } from "@/auth";
import { mirrorUser } from "@/lib/integrations/registry";
import type { AppUser } from "@/lib/types";

/** The current signed-in user, or a guest if (defensively) no session exists. */
export async function getSessionUser(): Promise<AppUser> {
  const session = await auth();
  if (!session?.user) {
    // middleware should have redirected; fall back defensively.
    return { id: "anon", name: "Guest", email: "", role: "user", groups: [] };
  }
  const appUser: AppUser = {
    id: (session.user.id || session.user.email || session.user.name || "user") as string,
    name: session.user.name || session.user.email || "Member",
    email: session.user.email || "",
    role: session.user.role ?? "user",
    groups: session.user.groups ?? [],
  };
  // Mirror into the members table (best-effort) so Admin → Members + the
  // "who's watching" lookups reflect everyone who has signed in.
  await mirrorUser({ id: appUser.id, name: appUser.name, email: appUser.email, role: appUser.role });
  return appUser;
}
