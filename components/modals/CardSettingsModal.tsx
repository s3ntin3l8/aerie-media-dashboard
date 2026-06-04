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
  const { services } = useData();

  useEffect(() => {
    if (!tile || !open) return;
    const seed: Record<string, string> = {};
    for (const spec of widgetSettings(tile.type)) {
      const v = tile.settings?.[spec.key];
      const fallback = "default" in spec && spec.default !== undefined ? String(spec.default) : "";
      seed[spec.key] = v !== undefined ? String(v) : fallback;
    }
    setDraft(seed);
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
            const selected = new Set((draft[spec.key] || "").split(",").filter(Boolean));
            const toggle = (id: string) => {
              const next = new Set(selected);
              next.has(id) ? next.delete(id) : next.add(id);
              setDraft((d) => ({ ...d, [spec.key]: [...next].join(",") }));
            };
            return (
              <Field key={spec.key} label={spec.label} hint={spec.hint}>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 240, overflowY: "auto" }}>
                  {services.map((s) => (
                    <label key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
                      <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
                      <span style={{ color: "var(--on-surface)" }}>{s.name}</span>
                    </label>
                  ))}
                  {services.length === 0 && (
                    <span style={{ fontSize: 12, color: "var(--on-surface-variant)" }}>No services configured yet.</span>
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
