import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";

// app/layout.tsx is the async root layout: it reads the per-request CSP nonce
// (set by middleware) via next/headers and applies it to the inline theme
// <script> so the script satisfies script-src. Mock the header source, the
// font loader, the server-only env module (jsdom can't resolve "server-only"),
// and the SW register client component so importing the layout stays isolated.
const hdrs = vi.hoisted(() => ({ nonce: null as string | null }));
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({ get: (k: string) => (k === "x-nonce" ? hdrs.nonce : null) })),
}));
vi.mock("next/font/google", () => ({
  JetBrains_Mono: () => ({ variable: "--font-jetbrains" }),
}));
vi.mock("@/lib/env", () => ({ env: { portalUrl: "https://media.example.com" } }));
vi.mock("@/components/pwa/ServiceWorkerRegister", () => ({ default: () => null }));

import RootLayout from "@/app/layout";

// Depth-first search for the first raw <script> element in the returned tree.
function findScript(node: unknown): React.ReactElement | null {
  if (!React.isValidElement(node)) return null;
  if (node.type === "script") return node;
  const kids = (node.props as { children?: unknown }).children;
  const arr = Array.isArray(kids) ? kids : [kids];
  for (const k of arr) {
    const hit = findScript(k);
    if (hit) return hit;
  }
  return null;
}

async function themeScript(nonce: string | null): Promise<React.ReactElement> {
  hdrs.nonce = nonce;
  const tree = await RootLayout({ children: React.createElement("div") });
  const script = findScript(tree);
  expect(script).not.toBeNull();
  // Sanity: it really is the theme script, not some other <script>.
  expect((script!.props as { dangerouslySetInnerHTML?: { __html: string } }).dangerouslySetInnerHTML?.__html).toContain(
    "aerie.theme",
  );
  return script!;
}

describe("RootLayout — CSP nonce on the inline theme script", () => {
  beforeEach(() => {
    hdrs.nonce = null;
  });

  it("applies the request nonce to the theme script", async () => {
    const script = await themeScript("nonce-under-test");
    expect((script.props as { nonce?: string }).nonce).toBe("nonce-under-test");
  });

  it("falls back to an undefined nonce when no x-nonce header is present", async () => {
    const script = await themeScript(null);
    expect((script.props as { nonce?: string }).nonce).toBeUndefined();
  });
});
