"use server";
import { signOut } from "@/auth";
import { getSessionUser } from "@/lib/session";
import { setFavorites } from "@/lib/integrations/registry";

export async function signOutAction() {
  await signOut({ redirectTo: "/login" });
}

/** Persist the signed-in user's pinned-favorite service ids. */
export async function setFavoritesAction(ids: string[]) {
  const user = await getSessionUser();
  // A defensive guest has no users row; skip to avoid an FK failure.
  if (!user || user.id === "anon") return;
  await setFavorites(user.id, ids);
}
