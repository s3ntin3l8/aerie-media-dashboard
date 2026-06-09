// ============================================================
// AERIE — pure signup/login validation predicates
// Imported by app/login/actions.ts and unit tests.
// ============================================================

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ValidationResult = { ok: true } | { ok: false; error: string };

export function validateName(name: string): ValidationResult {
  if (!name.trim()) return { ok: false, error: "Enter a display name." };
  return { ok: true };
}

export function validateEmail(email: string): ValidationResult {
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Enter a valid email address." };
  return { ok: true };
}

export function validatePassword(password: string): ValidationResult {
  if (password.length < 8) return { ok: false, error: "Password must be at least 8 characters." };
  return { ok: true };
}

export function validatePasswordConfirm(password: string, confirm: string): ValidationResult {
  if (password !== confirm) return { ok: false, error: "Passwords do not match." };
  return { ok: true };
}
