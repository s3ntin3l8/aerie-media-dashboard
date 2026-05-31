import { Login } from "@/components/views/Login";
import { signIn } from "@/auth";
import { authConfigured } from "@/lib/env";

// Auth config is runtime-only; never prerender this page with build-time env baked in.
export const dynamic = "force-dynamic";

export default function LoginPage() {
  async function signInAction() {
    "use server";
    await signIn("authentik", { redirectTo: "/" });
  }

  return <Login configured={authConfigured} signInAction={authConfigured ? signInAction : undefined} />;
}
