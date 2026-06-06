import type { Category, Role } from "@/lib/types";
import type { VisibilityRow } from "@/lib/integrations/registry";

/**
 * Categories whose services are visible to non-admins (the "friends" group) by
 * default — i.e. when no explicit visibility rule exists. Streaming and requests
 * are member-facing; infra / monitoring / automation are admin tooling and stay
 * admin-only unless an admin explicitly shares them.
 */
const MEMBER_VISIBLE_CATS: ReadonlySet<Category> = new Set<Category>(["stream", "request"]);

/** Whether a service in this category defaults to visible for non-admins. */
export function defaultVisibleToMembers(cat: Category): boolean {
  return MEMBER_VISIBLE_CATS.has(cat);
}

/**
 * Returns true when the service should be shown to a user with this role.
 * Admins bypass all visibility rules. Non-admins are in the "friends" group —
 * an explicit visibility row wins; otherwise the category default applies
 * (stream/request visible, infra/monitor/automation admin-only).
 */
export function isVisible(
  service: { id: string; cat: Category },
  role: Role,
  visibility: VisibilityRow[]
): boolean {
  if (role === "admin") return true;
  const rule = visibility.find(
    (v) => v.serviceId === service.id && v.groupName === "friends"
  );
  return rule ? rule.visible : defaultVisibleToMembers(service.cat);
}
