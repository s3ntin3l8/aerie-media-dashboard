// ============================================================
// AERIE — unified navigation config (single source of truth)
// ------------------------------------------------------------
// Three places used to each define their own nav items:
//   • components/portal/Rail.tsx      (desktop left rail)
//   • components/portal/PortalProvider.tsx  (g-key shortcuts)
//   • components/portal/CommandPalette.tsx  (⌘K nav section)
//   • components/mobile/MobileNav.tsx       (mobile bottom bar)
// They all derive from this array now.
// ============================================================

export interface NavItem {
  /** Stable id used to key renderers and identify active state. */
  id: string;
  /** Route href. */
  href: string;
  /** Material Symbol name. */
  icon: string;
  /** Display label. */
  label: string;
  /**
   * g-key chord shortcut (press `g`, then this key within 800ms).
   * Undefined = no keyboard shortcut.
   */
  gKey?: string;
  /**
   * When true, the item is only rendered for users with the "admin" role.
   * Non-admins must never see or navigate to these routes.
   */
  adminOnly?: boolean;
  /**
   * When true, the item only appears in the mobile bottom nav, not the
   * desktop rail or command palette. (Currently unused — kept as a hook for
   * mobile-specific destinations.)
   */
  mobileOnly?: boolean;
  /** Returns true when the current pathname should make this item active. */
  isActive: (pathname: string) => boolean;
}

export const NAV_ITEMS: NavItem[] = [
  {
    id: "home",
    href: "/",
    icon: "dashboard",
    label: "Dashboard",
    gKey: "h",
    isActive: (p) => p === "/",
  },
  {
    id: "streams",
    href: "/streams",
    icon: "play_circle",
    label: "Streams",
    isActive: (p) => p === "/streams" || p.startsWith("/streams/"),
  },
  {
    id: "services",
    href: "/services",
    icon: "apps",
    label: "Services",
    gKey: "s",
    isActive: (p) => p === "/services" || p.startsWith("/s/"),
  },
  {
    id: "requests",
    href: "/requests",
    icon: "bookmark_added",
    label: "My Requests",
    gKey: "r",
    isActive: (p) => p.startsWith("/requests"),
  },
  {
    id: "status",
    href: "/status",
    icon: "favorite",
    label: "Status",
    gKey: "u",
    isActive: (p) => p.startsWith("/status"),
  },
  {
    id: "admin",
    href: "/admin",
    icon: "tune",
    label: "Admin",
    gKey: "a",
    adminOnly: true,
    isActive: (p) => p.startsWith("/admin"),
  },
];

/** Items shown in the desktop rail (excludes mobileOnly). */
export const RAIL_NAV_ITEMS = NAV_ITEMS.filter((item) => !item.mobileOnly);

/** Items shown in the mobile bottom tab bar (excludes adminOnly). */
export const MOBILE_NAV_ITEMS = NAV_ITEMS.filter((item) => !item.adminOnly);

/** Items shown in the command palette (excludes mobileOnly). */
export const PALETTE_NAV_ITEMS = NAV_ITEMS.filter((item) => !item.mobileOnly);
