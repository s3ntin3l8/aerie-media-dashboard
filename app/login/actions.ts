"use server";
// ============================================================
// AERIE — login server actions (local-credentials fallback)
// Used only when OIDC is not configured.
// ============================================================
import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { authConfigured } from "@/lib/env";
import { createLocalAdmin, localAdminExists } from "@/lib/integrations/registry";

export interface LoginState {
  error?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function signInWithPassword(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };
  try {
    await signIn("credentials", { email, password, redirectTo: "/" });
  } catch (error) {
    // signIn throws a redirect on success — let that propagate.
    if (error instanceof AuthError) return { error: "Invalid email or password." };
    throw error;
  }
  return {};
}

export async function createInitialAdmin(_prev: LoginState, formData: FormData): Promise<LoginState> {
  // Setup is only valid when OIDC is off AND no local admin exists yet.
  if (authConfigured) return { error: "OIDC is configured; local setup is disabled." };
  if (await localAdminExists()) return { error: "An admin account already exists." };

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!name) return { error: "Enter a display name." };
  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email address." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };
  if (password !== confirm) return { error: "Passwords do not match." };

  await createLocalAdmin({ name, email, password });

  try {
    await signIn("credentials", { email, password, redirectTo: "/" });
  } catch (error) {
    if (error instanceof AuthError) return { error: "Account created, but sign-in failed. Try logging in." };
    throw error;
  }
  return {};
}
