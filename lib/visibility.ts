import type { Role } from "@/lib/types";
import type { VisibilityRow } from "@/lib/integrations/registry";

/**
 * Returns true when the service should be shown to a user with this role.
 * Admins bypass all visibility rules. Non-admins are in the "friends" group —
 * if a visibility row exists with visible:false, the service is hidden.
 * Missing row → visible by default (opt-out model).
 */
export function isVisible(
  serviceId: string,
  role: Role,
  visibility: VisibilityRow[]
): boolean {
  if (role === "admin") return true;
  const rule = visibility.find(
    (v) => v.serviceId === serviceId && v.groupName === "friends"
  );
  return rule ? rule.visible : true;
}
