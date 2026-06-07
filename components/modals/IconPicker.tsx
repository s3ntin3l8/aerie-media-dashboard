"use client";

import React, { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/primitives";
import { fieldInput } from "@/components/modals/ModalShell";
import { DashboardIconImg } from "@/components/DashboardIconImg";
import type { IconResult } from "@/app/api/icons/route";

interface IconPickerProps {
  value: string;
  onChange: (slug: string) => void;
  catColor: string;
}

export function IconPicker({ value, onChange, catColor }: IconPickerProps) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<IconResult[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/icons?q=${encodeURIComponent(q)}`, {
          signal: ctrl.signal,
          cache: "no-store",
        });
        if (res.ok) setResults((await res.json()) as IconResult[]);
      } catch {
        // aborted or network error — keep last results
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
  }, [q]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {value && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "9px 12px",
            borderRadius: 10,
            border: "1px solid var(--outline-variant)",
            background: "var(--surface-container-lowest)",
          }}
        >
          <DashboardIconImg
            slug={value}
            style={{ width: 28, height: 28, objectFit: "contain" }}
          />
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--on-surface-variant)",
              flex: 1,
            }}
          >
            {value}
          </span>
          <button
            type="button"
            onClick={() => onChange("")}
            className="btn btn-ghost btn-sm"
            style={{ padding: "3px 8px", fontSize: 11, display: "inline-flex", alignItems: "center", gap: 4 }}
          >
            <Icon name="close" size={13} /> Clear
          </button>
        </div>
      )}

      <div style={{ position: "relative" }}>
        <Icon
          name="search"
          size={15}
          color="var(--on-surface-variant)"
          style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
        />
        {loading && (
          <Icon
            name="sync"
            size={14}
            color="var(--on-surface-variant)"
            style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
          />
        )}
        <input
          ref={inputRef}
          className="input"
          style={{ ...fieldInput, paddingLeft: 32 }}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search icons… (e.g. plex, sonarr, nginx)"
        />
      </div>

      {results.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(52px, 1fr))",
            gap: 7,
            maxHeight: 220,
            overflowY: "auto",
            padding: 2,
          }}
          className="custom-scrollbar"
        >
          {results.map((r) => {
            const selected = r.slug === value;
            return (
              <button
                key={r.slug}
                type="button"
                title={r.name}
                onClick={() => {
                  onChange(r.slug);
                  setQ("");
                  setResults([]);
                }}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 4,
                  padding: "7px 4px 5px",
                  borderRadius: 9,
                  border:
                    "1px solid " +
                    (selected
                      ? `color-mix(in srgb, ${catColor} 60%, transparent)`
                      : "var(--outline-variant)"),
                  background: selected
                    ? `color-mix(in srgb, ${catColor} 11%, transparent)`
                    : "var(--surface-container-lowest)",
                  cursor: "pointer",
                  transition: "border-color .12s, background .12s",
                }}
              >
                <DashboardIconImg
                  slug={r.slug}
                  alt={r.name}
                  loading="lazy"
                  style={{ width: 28, height: 28, objectFit: "contain" }}
                />
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 8.5,
                    color: "var(--on-surface-variant)",
                    maxWidth: 46,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {r.slug}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <p style={{ fontSize: 10, color: "var(--on-surface-variant)", margin: 0 }}>
        Icons by{" "}
        <a
          href="https://github.com/homarr-labs/dashboard-icons"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "var(--primary)" }}
        >
          dashboard-icons
        </a>{" "}
        · Apache 2.0
      </p>
    </div>
  );
}
