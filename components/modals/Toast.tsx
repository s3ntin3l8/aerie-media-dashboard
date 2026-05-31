"use client";
// ============================================================
// AERIE — transient confirmation toast (bottom-center)
// ============================================================
import React from "react";
import { Icon } from "@/components/primitives";

export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      className="slide-in-right"
      style={{
        position: "fixed",
        bottom: 24,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 400,
        display: "inline-flex",
        alignItems: "center",
        gap: 9,
        padding: "11px 18px",
        borderRadius: 12,
        background: "var(--surface-container-highest)",
        border: "1px solid var(--outline-variant)",
        boxShadow: "var(--shadow-lg)",
        color: "var(--on-surface)",
        fontSize: 13,
        fontWeight: 600,
        maxWidth: "90vw",
      }}
    >
      <Icon name="check_circle" size={16} color="var(--originator-own)" />
      {message}
    </div>
  );
}
