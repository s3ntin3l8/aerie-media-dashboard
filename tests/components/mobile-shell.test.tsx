import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

// Stub the shell's heavy children so the test focuses on MobileShell's branch
// (desktop chrome vs. MobilePortal), not their internals / server-action transitive deps.
vi.mock("@/components/portal/Rail", () => ({ Rail: () => <div data-testid="rail" /> }));
vi.mock("@/components/portal/CommandPalette", () => ({ CommandPalette: () => <div data-testid="palette" /> }));
vi.mock("@/components/portal/EmbedHost", () => ({ EmbedHost: () => <div data-testid="embed-host" /> }));
vi.mock("@/components/mobile/MobilePortal", () => ({ MobilePortal: () => <div data-testid="mobile-portal" /> }));

import { MobileShell } from "@/components/mobile/MobileShell";
import { MobileProvider } from "@/components/mobile/MobileProvider";

type ChangeListener = (e: MediaQueryListEvent) => void;

function installMatchMedia(matches: boolean) {
  const listeners = new Set<ChangeListener>();
  const mql = {
    matches,
    media: "(max-width: 768px)",
    addEventListener: (_t: string, cb: ChangeListener) => listeners.add(cb),
    removeEventListener: (_t: string, cb: ChangeListener) => listeners.delete(cb),
  };
  window.matchMedia = vi.fn(() => mql) as unknown as typeof window.matchMedia;
}

describe("MobileShell", () => {
  let original: typeof window.matchMedia;
  beforeEach(() => {
    original = window.matchMedia;
  });
  afterEach(() => {
    window.matchMedia = original;
    vi.restoreAllMocks();
  });

  it("renders the mobile portal when seeded mobile (phone: UA + matchMedia agree)", () => {
    installMatchMedia(true);
    render(
      <MobileProvider initialIsMobile={true}>
        <MobileShell>
          <div data-testid="page" />
        </MobileShell>
      </MobileProvider>,
    );
    expect(screen.getByTestId("mobile-portal")).toBeInTheDocument();
    expect(screen.queryByTestId("rail")).not.toBeInTheDocument();
  });

  it("renders the desktop shell with children when seeded desktop", () => {
    installMatchMedia(false);
    render(
      <MobileProvider initialIsMobile={false}>
        <MobileShell>
          <div data-testid="page" />
        </MobileShell>
      </MobileProvider>,
    );
    expect(screen.getByTestId("rail")).toBeInTheDocument();
    expect(screen.getByTestId("palette")).toBeInTheDocument();
    expect(screen.getByTestId("page")).toBeInTheDocument();
    expect(screen.queryByTestId("mobile-portal")).not.toBeInTheDocument();
  });
});
