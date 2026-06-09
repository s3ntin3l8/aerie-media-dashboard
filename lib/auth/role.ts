// ============================================================
// AERIE — pure role/groups helpers (no next-auth, no DB)
// Imported by auth.ts (which reads env) and by unit tests.
// ============================================================
/** Normalize a groups claim that may be an array or a delimited string. */
export function normalizeGroups(claim: unknown): string[] {
  if (Array.isArray(claim)) return claim.map(String);
  if (typeof claim === "string") return claim.split(/[\s,]+/).filter(Boolean);
  return [];
}

/** admin when in the admin group OR when the email is allow-listed. */
export function deriveRole(
  groups: string[],
  email: string | null | undefined,
  adminGroup: string,
  adminEmails: string[],
): "admin" | "user" {
  if (groups.includes(adminGroup)) return "admin";
  if (email && adminEmails.includes(email.toLowerCase())) return "admin";
  return "user";
}
