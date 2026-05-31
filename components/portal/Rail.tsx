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
  const { role, realRole, toggleRole, theme, toggleTheme, setPaletteOpen, user, signOut } = usePortal();
  const { services, requests } = useData();

  const me = user;
  const downCount = services.filter((s) => s.status === "down").length;
  const pendingCount = requests.filter((r) => r.status === "pending").length;
  const go = (href: string) => router.push(href);

  const isActive = (id: string) => {
    if (id === "home") return pathname === "/";
    if (id === "launch") return pathname === "/services" || pathname.startsWith("/s/");
    if (id === "requests") return pathname.startsWith("/requests");
    if (id === "status") return pathname.startsWith("/status");
    if (id === "admin") return pathname.startsWith("/admin");
    return false;
  };

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
        <RailNav icon="dashboard" label="Dashboard" href="/" active={isActive("home")} onNavigate={go} />
        <RailNav icon="apps" label="Services" href="/services" active={isActive("launch")} onNavigate={go} />
        <RailNav
          icon="bookmark_added"
          label="My Requests"
          href="/requests"
          active={isActive("requests")}
          badge={role === "admin" ? pendingCount : 0}
          badgeTone="originator-court"
          onNavigate={go}
        />
        <RailNav icon="favorite" label="Status" href="/status" active={isActive("status")} onNavigate={go} />
        <div style={{ width: 20, height: 1, background: "var(--outline-variant)", margin: "2px 0" }} />
        {role === "admin" && <RailNav icon="tune" label="Admin" href="/admin" active={isActive("admin")} badge={downCount} onNavigate={go} />}
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
            <Avatar name={me.name} size={32} you />
          </div>
        </RailTip>
      </div>
    </aside>
  );
}
