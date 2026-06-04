"use client";
// ============================================================
// AERIE — left nav rail (56px) + brand badge
// ============================================================
import React from "react";
import { useRouter, usePathname } from "next/navigation";
import { Icon, Avatar, RailTip } from "@/components/primitives";
import { ServiceLogo } from "@/components/ServiceLogo";
import { BrandBadge } from "@/components/brand/Brand";
import { usePortal } from "@/components/portal/PortalProvider";
import { useData } from "@/components/portal/DataProvider";
import type { Service } from "@/lib/types";
import { isVisible } from "@/lib/visibility";
import { RAIL_NAV_ITEMS } from "@/lib/nav";

// Re-exported for existing importers (e.g. the Login view).
export { BrandBadge };

function RailNav({
  icon,
  label,
  href,
  active,
  badge = 0,
  badgeTone = "error",
  onNavigate,
}: {
  icon: string;
  label: string;
  href: string;
  active: boolean;
  badge?: number;
  badgeTone?: string;
  onNavigate: (href: string) => void;
}) {
  return (
    <RailTip label={label}>
      <a
        onClick={() => onNavigate(href)}
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 40,
          height: 40,
          borderRadius: 12,
          cursor: "pointer",
          color: active ? "var(--primary)" : "var(--on-surface-variant)",
          background: active ? "color-mix(in srgb, var(--primary) 12%, transparent)" : "transparent",
          transition: "color .2s, background .2s",
        }}
        onMouseEnter={(e) => {
          if (!active) {
            e.currentTarget.style.background = "color-mix(in srgb, var(--surface-container-high) 70%, transparent)";
            e.currentTarget.style.color = "var(--primary)";
          }
        }}
        onMouseLeave={(e) => {
          if (!active) {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "var(--on-surface-variant)";
          }
        }}
      >
        {active && <span style={{ position: "absolute", left: -8, top: 9, bottom: 9, width: 2.5, borderRadius: 9999, background: "var(--primary)" }} />}
        <Icon name={icon} size={20} fill={active} />
        {badge > 0 && (
          <span
            style={{
              position: "absolute",
              top: -2,
              right: -2,
              minWidth: 16,
              height: 16,
              padding: "0 4px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: `var(--${badgeTone})`,
              color: "#fff",
              fontSize: 9,
              fontWeight: 800,
              borderRadius: 9999,
              border: "2px solid var(--surface-lowest)",
            }}
          >
            {badge}
          </span>
        )}
      </a>
    </RailTip>
  );
}

// A pinned-favorite (or last-opened "recent") service: same 40×40 active-aware
// button as RailNav, but renders the service's brand logo so it reads as distinct
// from the nav icons. `recent` adds a small history corner badge so a transient
// jump-back slot is visually distinguishable from a deliberate pin.
function RailServiceNav({ s, active, recent = false, onNavigate }: { s: Service; active: boolean; recent?: boolean; onNavigate: (href: string) => void }) {
  return (
    <RailTip label={recent ? `${s.name} — recently opened` : s.name}>
      <a
        onClick={() => onNavigate(`/s/${s.id}`)}
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 40,
          height: 40,
          borderRadius: 12,
          cursor: "pointer",
          background: active ? "color-mix(in srgb, var(--primary) 12%, transparent)" : "transparent",
          transition: "background .2s",
        }}
        onMouseEnter={(e) => {
          if (!active) e.currentTarget.style.background = "color-mix(in srgb, var(--surface-container-high) 70%, transparent)";
        }}
        onMouseLeave={(e) => {
          if (!active) e.currentTarget.style.background = "transparent";
        }}
      >
        {active && <span style={{ position: "absolute", left: -8, top: 9, bottom: 9, width: 2.5, borderRadius: 9999, background: "var(--primary)" }} />}
        <ServiceLogo service={s} size={30} radius={8} />
        {recent && (
          <span
            style={{
              position: "absolute",
              bottom: -2,
              right: -2,
              width: 15,
              height: 15,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "var(--surface-container-high)",
              color: "var(--on-surface-variant)",
              borderRadius: 9999,
              border: "2px solid var(--surface-lowest)",
            }}
          >
            <Icon name="history" size={9} />
          </span>
        )}
      </a>
    </RailTip>
  );
}

function RailCtrl({ icon, label, onClick, kbd, active }: { icon: string; label: string; onClick: () => void; kbd?: string; active?: boolean }) {
  return (
    <RailTip label={label} kbd={kbd}>
      <button
        onClick={onClick}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 40,
          height: 40,
          borderRadius: 12,
          border: "none",
          background: active ? "color-mix(in srgb, var(--primary) 12%, transparent)" : "transparent",
          cursor: "pointer",
          color: active ? "var(--primary)" : "var(--on-surface-variant)",
          transition: "color .2s, background .2s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "color-mix(in srgb, var(--surface-container-high) 70%, transparent)";
          e.currentTarget.style.color = "var(--primary)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = active ? "color-mix(in srgb, var(--primary) 12%, transparent)" : "transparent";
          e.currentTarget.style.color = active ? "var(--primary)" : "var(--on-surface-variant)";
        }}
      >
        <Icon name={icon} size={20} />
      </button>
    </RailTip>
  );
}

export function Rail() {
  const router = useRouter();
  const pathname = usePathname();
  const { role, realRole, toggleRole, theme, toggleTheme, setPaletteOpen, user, signOut, favorites, lastOpened } = usePortal();
  const { services, requests, visibility, users } = useData();

  const me = user;
  const myAvatar = users.find((u) => u.id === me.id)?.avatar;
  const downCount = services.filter((s) => s.status === "down").length;
  const pendingCount = requests.filter((r) => r.status === "pending").length;
  const go = (href: string) => router.push(href);

  // Resolve pinned ids to live services, dropping any deleted / not-visible ones.
  const favoriteServices = favorites
    .map((id) => services.find((s) => s.id === id))
    .filter((s): s is Service => s != null && isVisible(s.id, role, visibility));

  // The last-opened service gets a transient jump-back slot — unless it's already
  // pinned (no duplicate) or no longer a visible service.
  const recentService =
    lastOpened && !favorites.includes(lastOpened)
      ? (services.find((s) => s.id === lastOpened && isVisible(s.id, role, visibility)) ?? null)
      : null;

  return (
    <aside
      style={{
        width: 56,
        minWidth: 56,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        background: "var(--surface-lowest)",
        borderRight: "1px solid var(--outline-variant)",
        zIndex: 50,
      }}
    >
      <div style={{ paddingTop: 14, paddingBottom: 18 }}>
        <RailTip label="AERIE — media command center">
          <div>
            <BrandBadge />
          </div>
        </RailTip>
      </div>
      <nav style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 14, marginTop: 4 }}>
        {RAIL_NAV_ITEMS.filter((item) => !item.adminOnly).map((item) => (
          <RailNav
            key={item.id}
            icon={item.icon}
            label={item.label}
            href={item.href}
            active={item.isActive(pathname)}
            badge={item.id === "requests" && role === "admin" ? pendingCount : 0}
            badgeTone="originator-court"
            onNavigate={go}
          />
        ))}
        {(favoriteServices.length > 0 || recentService) && (
          <>
            <div style={{ width: 20, height: 1, background: "var(--outline-variant)", margin: "2px 0" }} />
            {favoriteServices.map((s) => (
              <RailServiceNav key={s.id} s={s} active={pathname === `/s/${s.id}`} onNavigate={go} />
            ))}
            {recentService && (
              <RailServiceNav key={recentService.id} s={recentService} recent active={pathname === `/s/${recentService.id}`} onNavigate={go} />
            )}
          </>
        )}
        {role === "admin" && (
          <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
            <div style={{ width: 20, height: 1, background: "var(--outline-variant)", margin: "2px 0" }} />
            <RailNav icon="tune" label="Admin" href="/admin" active={pathname.startsWith("/admin")} badge={downCount} onNavigate={go} />
          </div>
        )}
      </nav>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, paddingBottom: 14 }}>
        <RailCtrl icon="search" label="Search & Commands" onClick={() => setPaletteOpen(true)} kbd="⌘K" />
        {realRole === "admin" && (
          <RailCtrl
            icon={role === "admin" ? "admin_panel_settings" : "person"}
            label={`View as: ${role === "admin" ? "Admin" : "Friend"} — click to switch`}
            onClick={toggleRole}
            active={role === "admin"}
          />
        )}
        <RailCtrl icon={theme === "dark" ? "light_mode" : "dark_mode"} label="Toggle theme" onClick={toggleTheme} kbd="⌘D" />
        <RailCtrl icon="logout" label="Sign out" onClick={signOut} />
        <RailTip label={`${me.name}${me.email ? ` · ${me.email}` : ""}`}>
          <div style={{ marginTop: 2, cursor: "pointer" }}>
            <Avatar name={me.name} src={myAvatar} size={32} you />
          </div>
        </RailTip>
      </div>
    </aside>
  );
}
