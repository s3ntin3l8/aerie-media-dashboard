import { Login } from "@/components/views/Login";
import { signIn } from "@/auth";
import { authConfigured, env } from "@/lib/env";
import { localAdminExists } from "@/lib/integrations/registry";
import { signInWithPassword, createInitialAdmin } from "./actions";

// Auth config is runtime-only; never prerender this page with build-time env baked in.
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const mode: "oidc" | "credentials" | "setup" = authConfigured ? "oidc" : (await localAdminExists()) ? "credentials" : "setup";

  async function oidcSignIn() {
    "use server";
    await signIn(env.oidcProviderId, { redirectTo: "/" });
  }

  return (
    <Login
      mode={mode}
      providerName={env.oidcProviderName}
      providerIcon={env.oidcProviderIcon}
      oidcSignIn={mode === "oidc" ? oidcSignIn : undefined}
      signInWithPassword={signInWithPassword}
      createInitialAdmin={createInitialAdmin}
    />
  );
}
