"use client";
// ============================================================
// AERIE — useVisibleServices
// ------------------------------------------------------------
// Encapsulates the three distinct service-visibility filter
// shapes that were copy-pasted across six call sites:
//
//   "launcher" — exclude infra category + prometheus id +
//                isVisible check (ServiceTiles, Launcher,
//                CommandPalette). Admins bypass the filter.
//
//   "status"   — exclude infra category + isVisible check,
//                but prometheus is visible in the status list
//                since it's a monitored service. Admins bypass.
//
//   "bare"     — only the isVisible visibility-matrix check
//                (Rail favorites, Rail recent slot).
//                Admins bypass automatically via isVisible.
// ============================================================
import { useData } from "@/components/portal/DataProvider";
import { usePortal } from "@/components/portal/PortalProvider";
import { isVisible } from "@/lib/visibility";
import type { Service } from "@/lib/types";

export type VisibilityMode = "launcher" | "status" | "bare";

/**
 * Returns the services from the live snapshot filtered to what
 * the current user (role) is allowed to see, according to the
 * requested filter mode.
 */
export function useVisibleServices(mode: VisibilityMode): Service[] {
  const { services, visibility } = useData();
  const { role } = usePortal();

  if (mode === "bare") {
    return services.filter((s) => isVisible(s.id, role, visibility));
  }

  if (role === "admin") return services;

  if (mode === "launcher") {
    // Exclude infra category, exclude prometheus by id, then apply
    // the visibility matrix (opt-out per group).
    return services.filter(
      (s) => s.cat !== "infra" && s.id !== "prometheus" && isVisible(s.id, role, visibility)
    );
  }

  // mode === "status": exclude infra category; prometheus stays visible
  // (it's a monitored service in the health list even if not launchable).
  return services.filter(
    (s) => s.cat !== "infra" && isVisible(s.id, role, visibility)
  );
}
