"use client";
// ============================================================
// AERIE — Add Widget modal (opened by the + FAB in edit mode)
// Catalog of available widgets, grouped, with size + live count.
// ============================================================
import React, { useEffect, useState } from "react";
import type { Role } from "@/lib/types";
import { ModalShell, SectionLabel } from "@/components/modals/ModalShell";
import { Icon, SearchField } from "@/components/primitives";
import { catalogGroups, type CatalogEntry } from "@/components/portal/widgetCatalog";
import type { Tile } from "@/components/portal/gridLayout";

function WidgetCard({ m, count, onAdd }: { m: CatalogEntry; count: number; onAdd: (type: string) => void }) {
  const [hover, setHover] = useState(false);
  const pw = Math.min(m.defaultW, 12);
  const ph = Math.min(m.defaultH, 6);
  return (
    <button
      onClick={() => onAdd(m.type)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        textAlign: "left",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: 14,
        borderRadius: 13,
        cursor: "pointer",
        background: "var(--surface-container-lowest)",
        border: `1px solid ${hover ? `color-mix(in srgb, ${m.accent} 55%, transparent)` : "var(--outline-variant)"}`,
        boxShadow: hover ? `0 0 0 3px color-mix(in srgb, ${m.accent} 8%, transparent)` : "none",
        transition: "border-color .15s, box-shadow .15s",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 11 }}>
        <div style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: `color-mix(in srgb, ${m.accent} 14%, transparent)` }}>
          <Icon name={m.icon} size={21} color={m.accent} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ fontFamily: "var(--font-headline)", fontWeight: 800, fontSize: 14, color: "var(--on-surface)" }}>{m.name}</span>
            {count > 0 && (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, fontWeight: 700, padding: "1px 6px", borderRadius: 9999, background: "color-mix(in srgb, var(--primary) 15%, transparent)", color: "var(--primary)" }}>
                {count} on board
              </span>
            )}
          </div>
          <div style={{ fontSize: 11.5, lineHeight: 1.45, color: "var(--on-surface-variant)", marginTop: 3, textWrap: "pretty" }}>{m.desc}</div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: "auto" }}>
        {/* mini size preview on a 12-col mock */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gridAutoRows: "4px", gap: 1, width: 72, flexShrink: 0 }}>
          {Array.from({ length: 6 }).map((_, r) =>
            Array.from({ length: 12 }).map((__, col) => {
              const on = col < pw && r < ph;
              return <span key={r + "-" + col} style={{ height: 4, borderRadius: 1, background: on ? m.accent : "color-mix(in srgb, var(--on-surface-variant) 16%, transparent)" }} />;
            }),
          )}
        </div>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--on-surface-variant)" }}>
          {m.defaultW}×{m.defaultH}
        </span>
        <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 3, fontSize: 12, fontWeight: 600, color: m.accent }}>
          <Icon name="add" size={15} color={m.accent} />
          Add
        </span>
      </div>
    </button>
  );
}

export function AddWidgetModal({ open, onClose, role, layout, onAdd }: { open: boolean; onClose: () => void; role: Role; layout: Tile[]; onAdd: (type: string) => void }) {
  const [q, setQ] = useState("");
  useEffect(() => {
    if (open) setQ("");
  }, [open]);

  const counts: Record<string, number> = {};
  (layout || []).forEach((l) => {
    counts[l.type] = (counts[l.type] || 0) + 1;
  });

  const groups = catalogGroups(role)
    .map((g) => ({ ...g, items: g.items.filter((m) => !q || (m.name + " " + m.desc).toLowerCase().includes(q.toLowerCase())) }))
    .filter((g) => g.items.length);

  return (
    <ModalShell open={open} onClose={onClose} icon="widgets" accent="var(--primary)" width={680} title="Add a widget" sub="Drop any block onto your dashboard — duplicates are welcome. Drag and resize after placing.">
      <div style={{ padding: "14px 20px 20px" }}>
        <div style={{ marginBottom: 16 }}>
          <SearchField value={q} onChange={setQ} placeholder="Search widgets…" width="100%" />
        </div>
        {groups.length === 0 && <div style={{ padding: "32px 0", textAlign: "center", color: "var(--on-surface-variant)", fontSize: 13 }}>No widgets match “{q}”.</div>}
        {groups.map((g) => (
          <div key={g.group} style={{ marginBottom: 18 }}>
            <SectionLabel hint={`${g.items.length}`}>{g.group}</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 11 }}>
              {g.items.map((m) => (
                <WidgetCard key={m.type} m={m} count={counts[m.type] || 0} onAdd={onAdd} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </ModalShell>
  );
}
