import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";

// Hoisted, mutable UA the next/headers mock returns per test.
const req = vi.hoisted(() => ({ ua: "" as string | null }));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({ get: (k: string) => (k === "user-agent" ? req.ua : null) })),
}));
vi.mock("@/lib/session", () => ({ getSessionUser: vi.fn(async () => ({ id: "u1" })) }));
vi.mock("@/lib/data/snapshot", () => ({
  getSnapshotFast: vi.fn(async () => ({ snapshot: {}, stale: false })),
}));
vi.mock("@/lib/integrations/registry", () => ({
  getFavorites: vi.fn(async () => []),
  getDashboards: vi.fn(async () => null),
}));
vi.mock("@/lib/env", () => ({ authConfigured: false }));
vi.mock("@/lib/data/scrub", () => ({ scrubForMember: (s: unknown) => s }));
// Stub the providers/shell so importing the layout doesn't pull their client/server deps.
// Each stub keeps its own identity so we can locate it in the returned element tree.
vi.mock("@/components/portal/PortalProvider", () => ({ PortalProvider: () => null }));
vi.mock("@/components/portal/DataProvider", () => ({ DataProvider: () => null }));
vi.mock("@/components/mobile/MobileShell", () => ({ MobileShell: () => null }));
vi.mock("@/components/mobile/MobileProvider", () => ({ MobileProvider: () => null }));

import PortalLayout from "@/app/(portal)/layout";
import { MobileProvider } from "@/components/mobile/MobileProvider";

// Depth-first search for the first element whose type matches `type`.
function findElement(node: unknown, type: unknown): React.ReactElement | null {
  if (!React.isValidElement(node)) return null;
  if (node.type === type) return node;
  const kids = (node.props as { children?: unknown }).children;
  const arr = Array.isArray(kids) ? kids : [kids];
  for (const k of arr) {
    const hit = findElement(k, type);
    if (hit) return hit;
  }
  return null;
}

async function seedFor(ua: string | null): Promise<boolean> {
  req.ua = ua;
  const tree = await PortalLayout({ children: React.createElement("div") });
  const provider = findElement(tree, MobileProvider);
  expect(provider).not.toBeNull();
  return (provider!.props as { initialIsMobile: boolean }).initialIsMobile;
}

describe("PortalLayout — mobile seed from User-Agent", () => {
  beforeEach(() => {
    req.ua = "";
  });

  it("seeds MobileProvider true for a phone User-Agent", async () => {
    const ua =
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
    expect(await seedFor(ua)).toBe(true);
  });

  it("seeds MobileProvider false for a desktop User-Agent", async () => {
    const ua =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
    expect(await seedFor(ua)).toBe(false);
  });

  it("seeds MobileProvider false when no User-Agent header is present", async () => {
    expect(await seedFor(null)).toBe(false);
  });
});
