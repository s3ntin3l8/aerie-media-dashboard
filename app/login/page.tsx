import { Login } from "@/components/views/Login";
import { signIn } from "@/auth";
import { authConfigured } from "@/lib/env";

export default function LoginPage() {
  async function signInAction() {
    "use server";
    await signIn("authentik", { redirectTo: "/" });
  }

  return <Login configured={authConfigured} signInAction={authConfigured ? signInAction : undefined} />;
}
