"use client";
import React from "react";
import { BrandBadge } from "@/components/brand/Brand";
import { Icon, Avatar } from "@/components/primitives";
import { usePortal } from "@/components/portal/PortalProvider";
import { useData } from "@/components/portal/DataProvider";

export function MobileAppBar({ onAdmin }: { onAdmin: () => void }) {
  const { user, theme, toggleTheme, setPaletteOpen, role } = usePortal();
  const { users } = useData();
  const myAvatar = users.find((u) => u.id === user.id)?.avatar;

  return (
    <div
      className="aerie-app-bar"
      style={{
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        gap: 10,
        paddingLeft: 16,
        paddingRight: 14,
        paddingBottom: 10,
        paddingTop: 10, // env(safe-area-inset-top) handled by .aerie-app-bar class
        background: "color-mix(in srgb, var(--background) 86%, transparent)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        borderBottom: "1px solid color-mix(in srgb, var(--outline-variant) 60%, transparent)",
        position: "sticky",
        top: 0,
        zIndex: 30,
      }}
    >
      <BrandBadge size={26} />
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, letterSpacing: "0.16em", color: "var(--on-surface)" }}>AERIE</span>
        <span style={{ fontFamily: "var(--font-body)", fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--on-surface-variant)" }}>Media Command Center</span>
      </div>
      <span style={{ flex: 1 }} />
      {/* Search */}
      <button
        onClick={() => setPaletteOpen(true)}
        aria-label="Search"
        style={{ width: 38, height: 38, borderRadius: 11, border: "1px solid var(--outline-variant)", background: "var(--surface-container)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--on-surface-variant)" }}
      >
        <Icon name="search" size={19} />
      </button>
      {/* Theme toggle */}
      <button
        onClick={toggleTheme}
        aria-label="Toggle theme"
        style={{ width: 38, height: 38, borderRadius: 11, border: "1px solid var(--outline-variant)", background: "var(--surface-container)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--on-surface-variant)" }}
      >
        <Icon name={theme === "dark" ? "light_mode" : "dark_mode"} size={18} />
      </button>
      {/* Avatar → Admin (admin only) */}
      <button
        onClick={onAdmin}
        aria-label={role === "admin" ? "Open admin panel" : "Profile"}
        style={{ marginLeft: 2, border: "none", background: "none", padding: 0, cursor: "pointer", borderRadius: 9999 }}
      >
        <Avatar name={user.name} src={myAvatar} size={32} you />
      </button>
    </div>
  );
}
