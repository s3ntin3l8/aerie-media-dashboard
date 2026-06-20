import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

// Tests the ServiceView back-button navigation to /status.
// The back button arrow function body is only covered when clicked;
// this test exists specifically to drive that coverage.

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/components/portal/PortalProvider", () => ({
  usePortal: () => ({
    paletteOpen: false, modalOpen: false, favorites: [],
    toggleFavorite: vi.fn(), user: { name: "tester", email: "t@e" }, oidc: true,
  }),
}));
vi.mock("@/app/(portal)/admin/actions", () => ({ setQueueSource: vi.fn() }));
vi.mock("@/components/hooks/useEmbedProbe", () => ({
  useEmbedProbe: () => ({
    embedState: "ok", badge: { label: "EMBED", color: "green" },
    onLoad: vi.fn(), onError: vi.fn(), reload: vi.fn(), reloadKey: 0,
  }),
}));
vi.mock("@/components/portal/DataProvider", () => ({ useData: () => ({ nowPlaying: [] }) }));

import { ServiceView } from "@/components/views/Launcher";

const svc = {
  id: "sonarr", name: "Sonarr", cat: "automation", icon: "dns",
  host: "sonarr.test", scheme: "https", embeddable: true, active: true,
  keepAlive: false, version: "1", status: "up", uptime: 100, ms: 1, beats: [], note: "",
} as never;

beforeEach(() => { push.mockClear(); });

describe("ServiceView — back navigation", () => {
  it("back button navigates to /status", () => {
    render(<ServiceView s={svc} />);
    // The back button renders "<arrow_back> Services" — click it.
    fireEvent.click(screen.getByText("Services"));
    expect(push).toHaveBeenCalledWith("/status");
  });
});
