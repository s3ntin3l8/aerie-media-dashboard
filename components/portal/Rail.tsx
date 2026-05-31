"use client";
// ============================================================
// AERIE — left nav rail (56px) + brand badge
// ============================================================
import React from "react";
import { useRouter, usePathname } from "next/navigation";
import { Icon, Avatar, RailTip } from "@/components/primitives";
import { usePortal } from "@/components/portal/PortalProvider";
import { useData } from "@/components/portal/DataProvider";

export function BrandBadge({ size = 28 }: { size?: number }) {
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        background: "color-mix(in srgb, var(--primary) 16%, var(--surface-container))",
        border: "1px solid color-mix(in srgb, var(--primary) 30%, transparent)",
        boxShadow: "var(--shadow-sm)",
        clipPath: "polygon(0% 0%, 100% 0%, 100% 70%, 50% 100%, 0% 70%)",
      }}
    >
      <Icon name="play_arrow" size={Math.round(size * 0.56)} fill color="var(--primary)" />
    </div>
  );
}

export function Rail() {
  const router = useRouter();
  const pathname = usePathname();
  const { role, realRole, toggleRole, theme, toggleTheme, setPaletteOpen, user, signOut } = usePortal();
  const { services, requests } = useData();

  const me = user;
  const downCount = services.filter((s) => s.status === "down").length;
  const pendingCount = requests.filter((r) => r.status === "pending").length;

  const isActive = (id: string) => {
    if (id === "home") return pathname === "/";
    if (id === "launch") return pathname === "/services" || pathname.startsWith("/s/");
    if (id === "requests") return pathname.startsWith("/requests");
    if (id === "status") return pathname.startsWith("/status");
    if (id === "admin") return pathname.startsWith("/admin");
    return false;
  };

  const NavItem = ({
    icon,
    label,
    id,
    href,
    badge = 0,
    badgeTone = "error",
    adminOnly,
  }: {
    icon: string;
    label: string;
    id: string;
    href: string;
    badge?: number;
    badgeTone?: string;
    adminOnly?: boolean;
  }) => {
    if (adminOnly && role !== "admin") return null;
    const active = isActive(id);
    return (
      <RailTip label={label}>
        <a
          onClick={() => router.push(href)}
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
          {active && (
            <span style={{ position: "absolute", left: -8, top: 9, bottom: 9, width: 2.5, borderRadius: 9999, background: "var(--primary)" }} />
          )}
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
  };

  const Ctrl = ({ icon, label, onClick, kbd, active }: { icon: string; label: string; onClick: () => void; kbd?: string; active?: boolean }) => (
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
        <NavItem icon="dashboard" label="Dashboard" id="home" href="/" />
        <NavItem icon="apps" label="Services" id="launch" href="/services" />
        <NavItem
          icon="bookmark_added"
          label="My Requests"
          id="requests"
          href="/requests"
          badge={role === "admin" ? pendingCount : 0}
          badgeTone="originator-court"
        />
        <NavItem icon="favorite" label="Status" id="status" href="/status" />
        <div style={{ width: 20, height: 1, background: "var(--outline-variant)", margin: "2px 0" }} />
        <NavItem icon="tune" label="Admin" id="admin" href="/admin" adminOnly badge={downCount} />
      </nav>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, paddingBottom: 14 }}>
        <Ctrl icon="search" label="Search & Commands" onClick={() => setPaletteOpen(true)} kbd="⌘K" />
        {realRole === "admin" && (
          <Ctrl
            icon={role === "admin" ? "admin_panel_settings" : "person"}
            label={`View as: ${role === "admin" ? "Admin" : "Friend"} — click to switch`}
            onClick={toggleRole}
            active={role === "admin"}
          />
        )}
        <Ctrl icon={theme === "dark" ? "light_mode" : "dark_mode"} label="Toggle theme" onClick={toggleTheme} kbd="⌘D" />
        <Ctrl icon="logout" label="Sign out" onClick={signOut} />
        <RailTip label={`${me.name}${me.email ? ` · ${me.email}` : ""}`}>
          <div style={{ marginTop: 2, cursor: "pointer" }}>
            <Avatar name={me.name} size={32} you />
          </div>
        </RailTip>
      </div>
    </aside>
  );
}
