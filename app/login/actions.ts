"use server";
// ============================================================
// AERIE — login server actions (local-credentials fallback)
// Used only when OIDC is not configured.
// ============================================================
import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { authConfigured } from "@/lib/env";
import { createLocalAdmin, localAdminExists } from "@/lib/integrations/registry";
import { validateName, validateEmail, validatePassword, validatePasswordConfirm } from "@/lib/auth/validation";

export interface LoginState {
  error?: string;
}

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

  const nameResult = validateName(name);
  if (!nameResult.ok) return { error: nameResult.error };
  const emailResult = validateEmail(email);
  if (!emailResult.ok) return { error: emailResult.error };
  const passwordResult = validatePassword(password);
  if (!passwordResult.ok) return { error: passwordResult.error };
  const confirmResult = validatePasswordConfirm(password, confirm);
  if (!confirmResult.ok) return { error: confirmResult.error };

  await createLocalAdmin({ name, email, password });

  try {
    await signIn("credentials", { email, password, redirectTo: "/" });
  } catch (error) {
    if (error instanceof AuthError) return { error: "Account created, but sign-in failed. Try logging in." };
    throw error;
  }
  return {};
}
