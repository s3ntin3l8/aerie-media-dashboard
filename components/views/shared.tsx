"use client";
// ============================================================
// AERIE — shared page chrome: PageHeader + StatTile
// ============================================================
import React from "react";
import { useRouter } from "next/navigation";
import { Icon, Eyebrow } from "@/components/primitives";

export function PageHeader({
  eyebrow,
  title,
  sub,
  icon,
  accent = "var(--primary)",
  back,
  children,
}: {
  eyebrow?: string;
  title: string;
  sub?: string;
  icon?: string;
  accent?: string;
  /** Optional left-aligned back button (e.g. for full-page deep views). */
  back?: { href: string; label: string };
  children?: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <div
      style={{
        padding: "20px 32px 16px",
        borderBottom: "1px solid var(--outline-variant)",
        flexShrink: 0,
        background: "color-mix(in srgb, var(--surface-container-lowest) 40%, transparent)",
      }}
    >
      <div className="aerie-header-row">
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          {back && (
            <button
              onClick={() => router.push(back.href)}
              className="btn btn-ghost btn-sm"
              style={{ paddingLeft: 8, paddingRight: 12 }}
            >
              <Icon name="arrow_back" size={16} /> {back.label}
            </button>
          )}
          {icon && (
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 11,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: `color-mix(in srgb, ${accent} 13%, transparent)`,
              }}
            >
              <Icon name={icon} size={22} color={accent} />
            </div>
          )}
          <div>
            {eyebrow && (
              <Eyebrow color={accent} style={{ marginBottom: 5 }}>
                {eyebrow}
              </Eyebrow>
            )}
            <h1 style={{ fontFamily: "var(--font-headline)", fontSize: 22, fontWeight: 800, letterSpacing: "-0.01em", color: "var(--on-surface)", lineHeight: 1.1 }}>
              {title}
            </h1>
            {sub && <div style={{ fontSize: 12.5, color: "var(--on-surface-variant)", marginTop: 3 }}>{sub}</div>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>{children}</div>
      </div>
    </div>
  );
}

export function StatTile({ label, value, color = "var(--on-surface)", icon }: { label: string; value: React.ReactNode; color?: string; icon?: string }) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        padding: "12px 16px",
        borderRadius: 12,
        background: "var(--surface-container-lowest)",
        border: "1px solid var(--outline-variant)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Eyebrow>{label}</Eyebrow>
        {icon && <Icon name={icon} size={14} color={color} />}
      </div>
      <div style={{ fontFamily: "var(--font-headline)", fontWeight: 800, fontSize: 24, color, lineHeight: 1, letterSpacing: "-0.02em" }}>{value}</div>
    </div>
  );
}
