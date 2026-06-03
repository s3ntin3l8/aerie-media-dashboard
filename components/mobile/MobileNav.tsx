"use client";
import React from "react";
import { usePathname, useRouter } from "next/navigation";
import { Icon } from "@/components/primitives";
import { usePortal } from "@/components/portal/PortalProvider";
import { useData } from "@/components/portal/DataProvider";
import { MOBILE_NAV_ITEMS } from "@/lib/nav";

export function MobileNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { role } = usePortal();
  const { requests } = useData();
  const pendingCount = requests.filter((r) => r.status === "pending").length;

  return (
    <div
      className="aerie-bottom-nav"
      style={{
        flexShrink: 0,
        display: "flex",
        background: "var(--surface-container-low)",
        borderTop: "1px solid var(--outline-variant)",
        paddingLeft: 6,
        paddingRight: 6,
        paddingTop: 8,
        zIndex: 40,
      }}
    >
      {MOBILE_NAV_ITEMS.map((item) => {
        const active = item.isActive(pathname);
        const badge = item.id === "requests" && role === "admin" ? pendingCount : 0;
        return (
          <button
            key={item.id}
            onClick={() => router.push(item.href)}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
              padding: "6px 0",
              background: "none",
              border: "none",
              cursor: "pointer",
              position: "relative",
            }}
          >
            <span style={{ position: "relative", display: "flex" }}>
              <Icon name={item.icon} size={23} fill={active} color={active ? "var(--primary)" : "var(--on-surface-variant)"} />
              {badge > 0 && (
                <span style={{
                  position: "absolute", top: -3, right: -6,
                  minWidth: 15, height: 15, padding: "0 3px",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: "var(--originator-court)", color: "#fff",
                  fontFamily: "var(--font-body)", fontSize: 9, fontWeight: 800,
                  borderRadius: 9999, border: "2px solid var(--surface-container-low)",
                }}>
                  {badge}
                </span>
              )}
            </span>
            <span style={{
              fontFamily: "var(--font-body)",
              fontSize: 10,
              fontWeight: active ? 700 : 600,
              color: active ? "var(--primary)" : "var(--on-surface-variant)",
            }}>
              {item.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
