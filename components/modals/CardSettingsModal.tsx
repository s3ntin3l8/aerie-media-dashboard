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
import type { Tile } from "@/components/portal/gridLayout";

interface CardSettingsModalProps {
  open: boolean;
  onClose: () => void;
  tile: Tile | undefined;
  onSave: (uid: string, settings: Record<string, string | number | boolean>) => void;
}

export function CardSettingsModal({ open, onClose, tile, onSave }: CardSettingsModalProps) {
  const [draft, setDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!tile || !open) return;
    const seed: Record<string, string> = {};
    for (const spec of widgetSettings(tile.type)) {
      const v = tile.settings?.[spec.key];
      const fallback = spec.default !== undefined ? String(spec.default) : "";
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

          return null;
        })}
      </div>
    </ModalShell>
  );
}
