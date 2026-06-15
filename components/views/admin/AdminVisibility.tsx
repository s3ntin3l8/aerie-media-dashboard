"use client";
// ============================================================
// AERIE — Admin · Visibility sub-view
// ============================================================
import React, { useState, useTransition } from "react";
import { useData } from "@/components/portal/DataProvider";
import { setVisibility } from "@/app/(portal)/admin/actions";
import { Icon, Eyebrow, Chip, listDivider } from "@/components/primitives";
import { ServiceLogo } from "@/components/ServiceLogo";

export function AdminVisibility({ isMobile }: { isMobile: boolean }) {
  // Admin config surface: show the FULL list so visibility can be set on inactive rows too.
  const { allServices: services, groups, visibility } = useData();
  const [, startTransition] = useTransition();
  // Optimistic local state keyed by `${serviceId}:${groupName}`.
  const [state, setState] = useState<Record<string, boolean>>(() => {
    const m: Record<string, boolean> = {};
    for (const v of visibility) m[`${v.serviceId}:${v.groupName}`] = v.visible;
    return m;
  });
  const cols = `1.4fr repeat(${groups.length}, 1fr)`;

  const toggle = (serviceId: string, groupName: string) => {
    const key = `${serviceId}:${groupName}`;
    const next = !state[key];
    setState((s) => ({ ...s, [key]: next }));
    startTransition(async () => {
      try {
        await setVisibility(serviceId, groupName, next);
      } catch {
        setState((s) => ({ ...s, [key]: !next })); // revert on failure
      }
    });
  };

  if (isMobile) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {services.map((s) => (
          <div key={s.id} className="card" style={{ padding: 15, borderRadius: 18, background: "var(--surface-container-lowest)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10 }}>
              <ServiceLogo service={s} size={28} radius={7} />
              <span style={{ fontWeight: 700, fontSize: 13.5, color: "var(--on-surface)" }}>{s.name}</span>
            </div>
            {groups.map((g, i) => {
              const on = state[`${s.id}:${g.name}`] ?? false;
              return (
                <div key={g.name} style={{ borderTop: listDivider(i) }}>
                  <button
                    onClick={() => toggle(s.id, g.name)}
                    aria-label={`${s.name} visible to ${g.name}: ${on ? "on" : "off"}`}
                    style={{ display: "flex", alignItems: "center", width: "100%", padding: "12px 0", background: "none", border: "none", cursor: "pointer", gap: 8 }}
                  >
                    <Icon name="group" size={14} color="var(--on-surface-variant)" />
                    <span style={{ flex: 1, textAlign: "left", fontFamily: "var(--font-body)", fontSize: 13, color: "var(--on-surface)" }}>{g.name}</span>
                    <span
                      aria-hidden
                      style={{
                        width: 44,
                        height: 26,
                        borderRadius: 9999,
                        position: "relative",
                        display: "inline-flex",
                        flexShrink: 0,
                        background: on ? "color-mix(in srgb, var(--originator-own) 30%, transparent)" : "color-mix(in srgb, var(--on-surface-variant) 18%, transparent)",
                        transition: "background .15s",
                      }}
                    >
                      <span style={{ position: "absolute", top: 4, left: on ? 22 : 4, width: 18, height: 18, borderRadius: 9999, background: on ? "var(--originator-own)" : "var(--on-surface-variant)", transition: "left .15s" }} />
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="aerie-x-scroll">
      <div style={{ borderRadius: 16, border: "1px solid var(--outline-variant)", overflow: "hidden", background: "var(--surface-container-lowest)" }}>
        <div style={{ display: "grid", gridTemplateColumns: cols, gap: 8, padding: "12px 18px", borderBottom: "1px solid var(--outline-variant)", background: "color-mix(in srgb, var(--surface-container) 50%, transparent)" }}>
          <Eyebrow>Service → Group</Eyebrow>
          {groups.map((g) => (
            <div key={g.name} style={{ textAlign: "center" }}>
              <Chip icon="group">{g.name}</Chip>
            </div>
          ))}
        </div>
        {services.map((s, i) => (
          <div key={s.id} style={{ display: "grid", gridTemplateColumns: cols, gap: 8, alignItems: "center", padding: "10px 18px", borderTop: listDivider(i) }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <ServiceLogo service={s} size={20} radius={5} />
              <span style={{ fontWeight: 600, fontSize: 12.5, color: "var(--on-surface)" }}>{s.name}</span>
            </div>
            {groups.map((g) => {
              const on = state[`${s.id}:${g.name}`] ?? false;
              return (
                <div key={g.name} style={{ display: "flex", justifyContent: "center" }}>
                  <button
                    onClick={() => toggle(s.id, g.name)}
                    aria-label={`${s.name} visible to ${g.name}`}
                    style={{
                      width: 30,
                      height: 18,
                      borderRadius: 9999,
                      position: "relative",
                      border: "none",
                      padding: 0,
                      background: on ? "color-mix(in srgb, var(--originator-own) 30%, transparent)" : "color-mix(in srgb, var(--on-surface-variant) 18%, transparent)",
                      cursor: "pointer",
                      transition: "background .15s",
                    }}
                  >
                    <span style={{ position: "absolute", top: 2, left: on ? 14 : 2, width: 14, height: 14, borderRadius: 9999, background: on ? "var(--originator-own)" : "var(--on-surface-variant)", transition: "left .15s" }} />
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
