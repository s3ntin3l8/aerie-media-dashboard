"use client";
// ============================================================
// AERIE — ⌘K command palette
// ============================================================
import React, { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon, Kbd, Eyebrow, catColor } from "@/components/primitives";
import { ServiceLogo } from "@/components/ServiceLogo";
import { usePortal } from "@/components/portal/PortalProvider";
import type { Service } from "@/lib/types";
import { PALETTE_NAV_ITEMS } from "@/lib/nav";
import { useVisibleServices } from "@/components/hooks/useVisibleServices";

function PaletteRow({
  id,
  icon,
  iconColor,
  label,
  hint,
  active,
  onClick,
  onHover,
  service,
}: {
  id: string;
  icon: string;
  iconColor?: string;
  label: string;
  hint?: string;
  active: boolean;
  onClick: () => void;
  onHover: () => void;
  service?: Service;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Keep the keyboard-active option visible in the scrolling list (jsdom has no scrollIntoView).
  useEffect(() => {
    if (active) ref.current?.scrollIntoView?.({ block: "nearest" });
  }, [active]);
  return (
    <div
      ref={ref}
      id={id}
      role="option"
      aria-selected={active}
      onClick={onClick}
      onMouseMove={onHover}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 12px",
        borderRadius: 9,
        cursor: "pointer",
        background: active ? "color-mix(in srgb, var(--primary) 9%, transparent)" : "transparent",
      }}
    >
      {service ? (
        <ServiceLogo service={service} size={20} radius={5} />
      ) : (
        <Icon name={icon} size={18} color={iconColor || "var(--on-surface-variant)"} />
      )}
      <span style={{ flex: 1, fontSize: 13.5, fontWeight: 500, color: "var(--on-surface)" }}>{label}</span>
      {hint && <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--on-surface-variant)" }}>{hint}</span>}
      {active && <Icon name="arrow_right_alt" size={16} color="var(--primary)" />}
    </div>
  );
}

export function CommandPalette() {
  const router = useRouter();
  const { paletteOpen, setPaletteOpen, role } = usePortal();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const uid = useId();
  const listId = `${uid}-list`;
  // Must be called before any early return (Rules of Hooks).
  const allVisibleServices = useVisibleServices("launcher");

  useEffect(() => {
    if (!paletteOpen) return;
    setQ("");
    setActive(0);
    returnFocus.current = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    return () => {
      clearTimeout(t);
      // Hand focus back to whatever opened the palette.
      returnFocus.current?.focus?.();
    };
  }, [paletteOpen]);

  if (!paletteOpen) return null;

  const close = () => setPaletteOpen(false);
  const ql = q.toLowerCase();
  const visibleNavItems = PALETTE_NAV_ITEMS.filter((item) => !item.adminOnly || role === "admin");
  const navMatches = visibleNavItems.filter((item) => item.label.toLowerCase().includes(ql));
  const svcMatches = allVisibleServices.filter((s) => s.name.toLowerCase().includes(ql) || s.host.includes(ql));

  // One flat, ordered list (pages then services) so arrow keys walk both groups.
  const items = [
    ...navMatches.map((item) => ({ key: `nav-${item.id}`, href: item.href })),
    ...svcMatches.map((s) => ({ key: `svc-${s.id}`, href: `/s/${s.id}` })),
  ];
  const cur = items.length ? Math.min(active, items.length - 1) : -1;
  const optId = (key: string) => `${uid}-${key}`;
  const go = (href: string) => {
    router.push(href);
    close();
  };

  const onInputKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!items.length) return;
      const d = e.key === "ArrowDown" ? 1 : -1;
      setActive((cur + d + items.length) % items.length);
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      setActive(e.key === "Home" ? 0 : Math.max(0, items.length - 1));
    } else if (e.key === "Enter" && cur >= 0) {
      e.preventDefault();
      go(items[cur].href);
    }
  };

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
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
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
        <div className="aerie-palette-search" style={{ display: "flex", alignItems: "center", gap: 11, padding: "14px 18px", borderBottom: "1px solid var(--outline-variant)" }}>
          <Icon name="search" size={20} color="var(--on-surface-variant)" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={onInputKey}
            role="combobox"
            aria-label="Search services and pages"
            aria-expanded={items.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={cur >= 0 ? optId(items[cur].key) : undefined}
            placeholder="Search services, pages, requests…"
            style={{ flex: 1, border: "none", background: "transparent", fontSize: 15, color: "var(--on-surface)", fontFamily: "var(--font-body)" }}
          />
          <Kbd>esc</Kbd>
        </div>
        <div id={listId} role="listbox" aria-label="Results" className="custom-scrollbar" style={{ maxHeight: 380, overflowY: "auto", padding: 8 }}>
          {navMatches.length > 0 && (
            <div role="group" aria-label="Navigate">
              <div style={{ padding: "6px 10px" }} aria-hidden="true">
                <Eyebrow>Navigate</Eyebrow>
              </div>
              {navMatches.map((item, i) => (
                <PaletteRow
                  key={item.id}
                  id={optId(`nav-${item.id}`)}
                  icon={item.icon}
                  label={item.label}
                  active={cur === i}
                  onHover={() => setActive(i)}
                  onClick={() => go(item.href)}
                />
              ))}
            </div>
          )}
          {svcMatches.length > 0 && (
            <div role="group" aria-label="Services">
              <div style={{ padding: "8px 10px 6px" }} aria-hidden="true">
                <Eyebrow>Services</Eyebrow>
              </div>
              {svcMatches.map((s, i) => (
                <PaletteRow
                  key={s.id}
                  id={optId(`svc-${s.id}`)}
                  icon={s.icon}
                  iconColor={catColor(s.cat)}
                  label={s.name}
                  hint={s.embeddable ? "embed" : "launch"}
                  service={s}
                  active={cur === navMatches.length + i}
                  onHover={() => setActive(navMatches.length + i)}
                  onClick={() => go(`/s/${s.id}`)}
                />
              ))}
            </div>
          )}
          {items.length === 0 && (
            <div style={{ padding: 24, textAlign: "center", fontSize: 13, color: "var(--on-surface-variant)" }}>No matches.</div>
          )}
        </div>
      </div>
    </div>
  );
}
