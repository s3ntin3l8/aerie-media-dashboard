"use client";
// ============================================================
// AERIE — CardSettingsModal
// Generic per-card settings modal for the modular homescreen.
// Reads the widget's spec from the catalog and renders one
// control per setting.
// ============================================================
import React, { useState, useEffect } from "react";
import { ModalShell, Field, ToggleRow, fieldInput } from "@/components/modals/ModalShell";
import { WIDGET_CATALOG, widgetSettings } from "@/components/portal/widgetCatalog";
import type { ShortcutLink } from "@/components/portal/widgetCatalog";
import type { Tile } from "@/components/portal/gridLayout";
import { Icon } from "@/components/primitives";
import { useData } from "@/components/portal/DataProvider";

interface CardSettingsModalProps {
  open: boolean;
  onClose: () => void;
  tile: Tile | undefined;
  onSave: (uid: string, settings: Record<string, string | number | boolean>) => void;
}

export function CardSettingsModal({ open, onClose, tile, onSave }: CardSettingsModalProps) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  // Drag-reorder state for the serviceIds control: index being dragged + index hovered over.
  const [dnd, setDnd] = useState<{ from: number; over: number } | null>(null);
  const { services, library } = useData();

  useEffect(() => {
    if (!tile || !open) return;
    const seed: Record<string, string> = {};
    for (const spec of widgetSettings(tile.type)) {
      const v = tile.settings?.[spec.key];
      const fallback = "default" in spec && spec.default !== undefined ? String(spec.default) : "";
      seed[spec.key] = v !== undefined ? String(v) : fallback;
    }
    setDraft(seed);
    setDnd(null);
  }, [tile?.uid, tile?.type, open]);

  if (!tile || !open) return null;
  const entry = WIDGET_CATALOG[tile.type];
  const specs = widgetSettings(tile.type);
  if (!entry || specs.length === 0) return null;

  function handleSave() {
    if (!tile) return;
    const out: Record<string, string | number | boolean> = {};
    for (const spec of widgetSettings(tile.type)) {
      const v = draft[spec.key];
      if (v === undefined || v === "") continue; // omit — use default
      if (spec.type === "toggle") { out[spec.key] = v === "true"; continue; }
      if (spec.type === "count") { out[spec.key] = Number(v); continue; }
      out[spec.key] = v; // text / select — store as string
    }
    onSave(tile.uid, out);
  }

  const footer = (
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
      <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
      <button className="btn btn-primary btn-sm" onClick={handleSave}>Save</button>
    </div>
  );

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      width={480}
      icon={entry.icon}
      accent={entry.accent}
      title="Widget settings"
      sub={entry.name}
      footer={footer}
    >
      <div style={{ padding: "18px 20px 22px", display: "flex", flexDirection: "column", gap: 16 }}>
        {specs.map((spec) => {
          if (spec.type === "count") {
            return (
              <Field key={spec.key} label={spec.label} hint={spec.hint}>
                <select
                  className="input"
                  style={fieldInput}
                  value={draft[spec.key] ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, [spec.key]: e.target.value }))}
                >
                  <option value="">Auto (fit)</option>
                  {Array.from(
                    { length: (spec.max ?? 20) - (spec.min ?? 3) + 1 },
                    (_, i) => (spec.min ?? 3) + i
                  ).map((n) => (
                    <option key={n} value={String(n)}>{n} items</option>
                  ))}
                </select>
              </Field>
            );
          }

          if (spec.type === "select") {
            return (
              <Field key={spec.key} label={spec.label} hint={spec.hint}>
                <select
                  className="input"
                  style={fieldInput}
                  value={draft[spec.key] ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, [spec.key]: e.target.value }))}
                >
                  {spec.options.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </Field>
            );
          }

          if (spec.type === "text") {
            return (
              <Field key={spec.key} label={spec.label} hint={spec.hint}>
                <input
                  className="input"
                  style={fieldInput}
                  type="text"
                  placeholder={typeof spec.default === "string" ? spec.default : ""}
                  value={draft[spec.key] ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, [spec.key]: e.target.value }))}
                />
              </Field>
            );
          }

          if (spec.type === "toggle") {
            return (
              <ToggleRow
                key={spec.key}
                icon="tune"
                title={spec.label}
                desc={spec.hint ?? ""}
                on={draft[spec.key] === "true"}
                onChange={(v) => setDraft((d) => ({ ...d, [spec.key]: String(v) }))}
                color="var(--primary)"
              />
            );
          }

          if (spec.type === "links") {
            let links: ShortcutLink[] = [];
            try { links = JSON.parse(draft[spec.key] || "[]"); } catch { /* keep empty */ }
            const update = (next: ShortcutLink[]) =>
              setDraft((d) => ({ ...d, [spec.key]: JSON.stringify(next) }));
            return (
              <Field key={spec.key} label={spec.label} hint={spec.hint}>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {links.map((link, i) => (
                    <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <input
                        className="input"
                        style={{ ...fieldInput, width: 90, flexShrink: 0 }}
                        type="text"
                        placeholder="icon"
                        title="Material Symbols icon name (e.g. play_circle)"
                        value={link.icon ?? ""}
                        onChange={(e) => {
                          const next = links.map((l, j) => j === i ? { ...l, icon: e.target.value } : l);
                          update(next);
                        }}
                      />
                      <input
                        className="input"
                        style={{ ...fieldInput, flex: 1 }}
                        type="text"
                        placeholder="Label"
                        value={link.label}
                        onChange={(e) => {
                          const next = links.map((l, j) => j === i ? { ...l, label: e.target.value } : l);
                          update(next);
                        }}
                      />
                      <input
                        className="input"
                        style={{ ...fieldInput, flex: 2 }}
                        type="url"
                        placeholder="https://…"
                        value={link.url}
                        onChange={(e) => {
                          const next = links.map((l, j) => j === i ? { ...l, url: e.target.value } : l);
                          update(next);
                        }}
                      />
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ padding: "4px 6px", flexShrink: 0 }}
                        onClick={() => update(links.filter((_, j) => j !== i))}
                        title="Remove"
                      >
                        <Icon name="close" size={14} />
                      </button>
                    </div>
                  ))}
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ alignSelf: "flex-start", marginTop: 2 }}
                    onClick={() => update([...links, { label: "", url: "", icon: "" }])}
                  >
                    <Icon name="add" size={14} /> Add link
                  </button>
                </div>
              </Field>
            );
          }

          if (spec.type === "serviceIds") {
            const allIds = services.map((s) => s.id);
            const raw = draft[spec.key] || "";
            // serviceIds is an ORDERED list of visible ids; "" = all visible, default order.
            const order = raw === "" ? allIds : raw.split(",").filter(Boolean);
            const visible = raw === "" ? new Set(allIds) : new Set(order);
            // Display: stored (still-existing) order first, then any hidden/new services in natural order.
            const byId = new Map(services.map((s) => [s.id, s]));
            const displayIds = [
              ...order.filter((id) => byId.has(id)),
              ...allIds.filter((id) => !order.includes(id)),
            ];
            // Collapse to "" only when every service is visible AND in natural order (keeps untouched widgets clean).
            const serialize = (ids: string[], vis: Set<string>) => {
              const vid = ids.filter((id) => vis.has(id));
              const isDefault = vid.length === allIds.length && vid.every((id, i) => id === allIds[i]);
              return isDefault ? "" : vid.join(",");
            };
            const toggle = (id: string) => {
              const vis = new Set(visible);
              vis.has(id) ? vis.delete(id) : vis.add(id);
              setDraft((d) => ({ ...d, [spec.key]: serialize(displayIds, vis) }));
            };
            const reorder = (from: number, to: number) => {
              if (from === to) return;
              const next = [...displayIds];
              const [moved] = next.splice(from, 1);
              next.splice(to, 0, moved);
              setDraft((d) => ({ ...d, [spec.key]: serialize(next, visible) }));
            };
            return (
              <Field key={spec.key} label={spec.label} hint={spec.hint}>
                <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 280, overflowY: "auto" }}>
                  {displayIds.map((id, i) => {
                    const s = byId.get(id);
                    if (!s) return null;
                    const dragging = dnd?.from === i;
                    const dropTarget = dnd != null && dnd.over === i && dnd.from !== i;
                    return (
                      <div
                        key={s.id}
                        draggable
                        onDragStart={(e) => { setDnd({ from: i, over: i }); e.dataTransfer.effectAllowed = "move"; }}
                        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (dnd && dnd.over !== i) setDnd({ ...dnd, over: i }); }}
                        onDrop={(e) => { e.preventDefault(); if (dnd) reorder(dnd.from, i); setDnd(null); }}
                        onDragEnd={() => setDnd(null)}
                        style={{
                          cursor: "grab",
                          opacity: dragging ? 0.4 : 1,
                          borderRadius: 11,
                          boxShadow: dropTarget ? "inset 0 2px 0 0 var(--primary)" : "none",
                          transition: "opacity .12s, box-shadow .12s",
                        }}
                      >
                        <ToggleRow icon="drag_indicator" title={s.name} desc="" on={visible.has(s.id)} onChange={() => toggle(s.id)} color="var(--on-surface-variant)" />
                      </div>
                    );
                  })}
                  {services.length === 0 && (
                    <span style={{ fontSize: 12, color: "var(--on-surface-variant)" }}>No services configured yet.</span>
                  )}
                </div>
              </Field>
            );
          }

          if (spec.type === "libraryIds") {
            const allIds = library.map((l) => l.id);
            const raw = draft[spec.key] || "";
            const selected = raw === "" ? new Set(allIds) : new Set(raw.split(",").filter(Boolean));
            const toggle = (id: string) => {
              const next = new Set(selected);
              next.has(id) ? next.delete(id) : next.add(id);
              const val = next.size >= allIds.length ? "" : [...next].join(",");
              setDraft((d) => ({ ...d, [spec.key]: val }));
            };
            return (
              <Field key={spec.key} label={spec.label} hint={spec.hint}>
                <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 280, overflowY: "auto" }}>
                  {library.map((l) => (
                    <ToggleRow key={l.id} icon="video_library" title={l.label} desc="" on={selected.has(l.id)} onChange={() => toggle(l.id)} color="var(--primary)" />
                  ))}
                  {library.length === 0 && (
                    <span style={{ fontSize: 12, color: "var(--on-surface-variant)" }}>No library stats available yet.</span>
                  )}
                </div>
              </Field>
            );
          }

          return null;
        })}
      </div>
    </ModalShell>
  );
}
