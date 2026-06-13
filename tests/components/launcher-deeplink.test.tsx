import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import React from "react";

// next/navigation pulls server bits under jsdom — stub the hooks ServiceView uses.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));
// PortalProvider's real module imports next-auth (unresolvable under jsdom).
vi.mock("@/components/portal/PortalProvider", () => ({
  usePortal: () => ({
    paletteOpen: false,
    modalOpen: false,
    favorites: [],
    toggleFavorite: vi.fn(),
    user: { name: "tester", email: "t@e" },
    oidc: false,
  }),
}));
// Launcher → panels imports a server action (server-only); stub it.
vi.mock("@/app/(portal)/admin/actions", () => ({ setQueueSource: vi.fn() }));
// The probe runs timers/fetch; pin it to a stable "checking" state.
vi.mock("@/components/hooks/useEmbedProbe", () => ({
  useEmbedProbe: () => ({ embedState: "checking", badge: { label: "checking", color: "#888" }, onLoad: vi.fn(), onError: vi.fn(), reload: vi.fn(), reloadKey: 0 }),
}));

// ServiceView reads now-playing for the header chip; stub the snapshot context.
vi.mock("@/components/portal/DataProvider", () => ({ useData: () => ({ nowPlaying: [] }) }));

import { ServiceView } from "@/components/views/Launcher";

const svc = {
  id: "radarr",
  name: "Radarr",
  cat: "automation",
  icon: "dns",
  host: "radarr.test",
  scheme: "https",
  embeddable: true,
  active: true,
  keepAlive: true,
  version: "1",
  status: "up",
  uptime: 100,
  ms: 1,
  beats: [],
  note: "",
} as never;

const iframeSrc = (c: HTMLElement) => c.querySelector("iframe")?.getAttribute("src");

describe("ServiceView — deep-link iframe src", () => {
  it("loads the base origin when no deep path", () => {
    const { container } = render(<ServiceView s={svc} />);
    expect(iframeSrc(container)).toBe("https://radarr.test");
  });

  it("loads the deep path when supplied", () => {
    const { container } = render(<ServiceView s={svc} deepPath="/movie/dune-2024" />);
    expect(iframeSrc(container)).toBe("https://radarr.test/movie/dune-2024");
  });

  it("ignores an unsafe deep path (falls back to base)", () => {
    const { container } = render(<ServiceView s={svc} deepPath="//evil.com" />);
    expect(iframeSrc(container)).toBe("https://radarr.test");
  });

  it("keeps the frame on the title when deepPath clears, and re-navigates on a new one", () => {
    // Open at a title (deep-link click).
    const { container, rerender } = render(<ServiceView s={svc} deepPath="/movie/dune-2024" />);
    expect(iframeSrc(container)).toBe("https://radarr.test/movie/dune-2024");

    // A plain re-render with no path must NOT reset the frame — this is the keep-alive guarantee.
    rerender(<ServiceView s={svc} />);
    expect(iframeSrc(container)).toBe("https://radarr.test/movie/dune-2024");

    // A new explicit deep-link navigates the existing frame.
    rerender(<ServiceView s={svc} deepPath="/movie/arrival-2016" />);
    expect(iframeSrc(container)).toBe("https://radarr.test/movie/arrival-2016");
  });
});
