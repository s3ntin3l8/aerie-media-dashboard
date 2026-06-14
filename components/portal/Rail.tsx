"use client";
// ============================================================
// AERIE — left nav rail (56px) + brand badge
// ============================================================
import React, { useCallback, useEffect, useRef, useState } from "react";
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

// The account icon (name + photo) doubles as the trigger for a small popover menu
// holding the Sign-out action — instead of a standalone rail button. Closes on
// outside-click / Escape, and suppresses portal keyboard shortcuts while open.
function RailAccountMenu({ name, email, avatar }: { name: string; email?: string; avatar?: string }) {
  const { signOut, setModalOpen } = usePortal();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    setModalOpen(open);
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close, setModalOpen]);

  return (
    <div ref={wrapRef} style={{ position: "relative", display: "flex", marginTop: 2 }}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account: ${name}${email ? ` (${email})` : ""}`}
        onClick={() => setOpen((v) => !v)}
        style={{ border: "none", background: "transparent", padding: 0, cursor: "pointer", display: "flex" }}
      >
        <Avatar name={name} src={avatar} size={32} you />
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            left: 50,
            bottom: 0,
            minWidth: 200,
            padding: 6,
            background: "var(--surface-container-highest)",
            color: "var(--on-surface)",
            border: "1px solid var(--outline-variant)",
            borderRadius: "var(--radius-md)",
            boxShadow: "var(--shadow-lg)",
            zIndex: 250,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px" }}>
            <Avatar name={name} src={avatar} size={32} you />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
              {email && (
                <div style={{ fontSize: 11, color: "var(--on-surface-variant)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {email}
                </div>
              )}
            </div>
          </div>
          <div style={{ height: 1, background: "var(--outline-variant)", margin: "4px 0" }} />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              close();
              signOut();
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              width: "100%",
              padding: "8px 10px",
              border: "none",
              borderRadius: "var(--radius-sm)",
              background: "transparent",
              color: "var(--on-surface)",
              fontSize: 13,
              cursor: "pointer",
              transition: "background .15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "color-mix(in srgb, var(--surface-container-high) 70%, transparent)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <Icon name="logout" size={18} />
            <span>Sign out</span>
          </button>
        </div>
      )}
    </div>
  );
}

export function Rail() {
  const router = useRouter();
  const pathname = usePathname();
  const { role, realRole, toggleRole, theme, toggleTheme, setPaletteOpen, user, favorites, lastOpened } = usePortal();
  const { services, requests, visibility, users } = useData();

  const me = user;
  const myAvatar = users.find((u) => u.id === me.id)?.avatar;
  const downCount = services.filter((s) => s.status === "down").length;
  const pendingCount = requests.filter((r) => r.status === "pending").length;
  const go = (href: string) => router.push(href);

  // Resolve pinned ids to live services, dropping any deleted / not-visible ones.
  const favoriteServices = favorites
    .map((id) => services.find((s) => s.id === id))
    .filter((s): s is Service => s != null && isVisible(s, role, visibility));

  // The last-opened service gets a transient jump-back slot — unless it's already
  // pinned (no duplicate) or no longer a visible service.
  const recentService =
    lastOpened && !favorites.includes(lastOpened)
      ? (services.find((s) => s.id === lastOpened && isVisible(s, role, visibility)) ?? null)
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
      <nav style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, marginTop: 4 }}>
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
      </nav>
      <div
        className="rail-scroll"
        style={{ flex: 1, minHeight: 0, width: "100%", overflowY: "auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 14, marginTop: 14 }}
      >
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
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, paddingTop: 12, paddingBottom: 14 }}>
        {role === "admin" && (
          <>
            <div style={{ width: 20, height: 1, background: "var(--outline-variant)", margin: "2px 0" }} />
            <RailNav icon="tune" label="Admin" href="/admin" active={pathname.startsWith("/admin")} badge={downCount} onNavigate={go} />
          </>
        )}
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
        <RailAccountMenu name={me.name} email={me.email} avatar={myAvatar} />
      </div>
    </aside>
  );
}
