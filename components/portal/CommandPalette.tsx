"use client";
// ============================================================
// AERIE — ⌘K command palette
// ============================================================
import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon, Kbd, Eyebrow, catColor } from "@/components/primitives";
import { ServiceLogo } from "@/components/ServiceLogo";
import { usePortal } from "@/components/portal/PortalProvider";
import type { Service } from "@/lib/types";
import { PALETTE_NAV_ITEMS } from "@/lib/nav";
import { useVisibleServices } from "@/components/hooks/useVisibleServices";

function PaletteRow({
  icon,
  iconColor,
  label,
  hint,
  onClick,
  service,
}: {
  icon: string;
  iconColor?: string;
  label: string;
  hint?: string;
  onClick: () => void;
  service?: Service;
}) {
  const [h, setH] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 12px",
        borderRadius: 9,
        cursor: "pointer",
        background: h ? "color-mix(in srgb, var(--primary) 9%, transparent)" : "transparent",
      }}
    >
      {service ? (
        <ServiceLogo service={service} size={20} radius={5} />
      ) : (
        <Icon name={icon} size={18} color={iconColor || "var(--on-surface-variant)"} />
      )}
      <span style={{ flex: 1, fontSize: 13.5, fontWeight: 500, color: "var(--on-surface)" }}>{label}</span>
      {hint && <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--on-surface-variant)" }}>{hint}</span>}
      {h && <Icon name="arrow_right_alt" size={16} color="var(--primary)" />}
    </div>
  );
}

export function CommandPalette() {
  const router = useRouter();
  const { paletteOpen, setPaletteOpen, role } = usePortal();
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  // Must be called before any early return (Rules of Hooks).
  const allVisibleServices = useVisibleServices("launcher");

  useEffect(() => {
    if (paletteOpen) {
      setQ("");
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [paletteOpen]);

  if (!paletteOpen) return null;

  const close = () => setPaletteOpen(false);
  const ql = q.toLowerCase();
  const visibleNavItems = PALETTE_NAV_ITEMS.filter((item) => !item.adminOnly || role === "admin");
  const navMatches = visibleNavItems.filter((item) => item.label.toLowerCase().includes(ql));
  const svcMatches = allVisibleServices.filter((s) => s.name.toLowerCase().includes(ql) || s.host.includes(ql));

  return (
    <div
      onClick={close}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 300,
        background: "color-mix(in srgb, var(--inverse-surface) 45%, transparent)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "12vh",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 560,
          margin: "0 16px",
          background: "var(--surface-container-lowest)",
          border: "1px solid var(--outline-variant)",
          borderRadius: 16,
          boxShadow: "var(--shadow-2xl)",
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "14px 18px", borderBottom: "1px solid var(--outline-variant)" }}>
          <Icon name="search" size={20} color="var(--on-surface-variant)" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search services, pages, requests…"
            style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 15, color: "var(--on-surface)", fontFamily: "var(--font-body)" }}
          />
          <Kbd>esc</Kbd>
        </div>
        <div className="custom-scrollbar" style={{ maxHeight: 380, overflowY: "auto", padding: 8 }}>
          {navMatches.length > 0 && (
            <div style={{ padding: "6px 10px" }}>
              <Eyebrow>Navigate</Eyebrow>
            </div>
          )}
          {navMatches.map((item) => (
            <PaletteRow
              key={item.id}
              icon={item.icon}
              label={item.label}
              onClick={() => {
                router.push(item.href);
                close();
              }}
            />
          ))}
          {svcMatches.length > 0 && (
            <div style={{ padding: "8px 10px 6px" }}>
              <Eyebrow>Services</Eyebrow>
            </div>
          )}
          {svcMatches.map((s) => (
            <PaletteRow
              key={s.id}
              icon={s.icon}
              iconColor={catColor(s.cat)}
              label={s.name}
              hint={s.embeddable ? "embed" : "launch"}
              service={s}
              onClick={() => {
                router.push(`/s/${s.id}`);
                close();
              }}
            />
          ))}
          {navMatches.length + svcMatches.length === 0 && (
            <div style={{ padding: 24, textAlign: "center", fontSize: 13, color: "var(--on-surface-variant)" }}>No matches.</div>
          )}
        </div>
      </div>
    </div>
  );
}
