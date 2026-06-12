import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import React from "react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/components/portal/PortalProvider", () => ({
  usePortal: () => ({
    paletteOpen: false,
    modalOpen: false,
    favorites: [],
    toggleFavorite: vi.fn(),
    user: { name: "tester", email: "t@e" },
    oidc: true,
  }),
}));
vi.mock("@/app/(portal)/admin/actions", () => ({ setQueueSource: vi.fn() }));

// Controllable probe: tests set `probe.embedState` and assert on `probe.reload`.
const probe = {
  embedState: "unverified" as "checking" | "ok" | "unverified",
  badge: { label: "EMBED UNVERIFIED", color: "#f5a623" },
  onLoad: vi.fn(),
  onError: vi.fn(),
  reload: vi.fn(),
  reloadKey: 0,
};
vi.mock("@/components/hooks/useEmbedProbe", () => ({ useEmbedProbe: () => probe }));

import { ServiceView } from "@/components/views/Launcher";

const svc = {
  id: "radarr", name: "Radarr", cat: "automation", icon: "dns",
  host: "radarr.test", scheme: "https", embeddable: true, active: true,
  keepAlive: true, version: "1", status: "up", uptime: 100, ms: 1, beats: [], note: "",
} as never;

beforeEach(() => {
  probe.reload.mockClear();
  probe.embedState = "unverified";
  Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
});

describe("ServiceView — self-healing re-auth", () => {
  it("renders Re-authenticate + Retry when the embed failed", () => {
    render(<ServiceView s={svc} />);
    const reauth = screen.getByRole("link", { name: /re-authenticate/i });
    expect(reauth).toHaveAttribute("href", "https://radarr.test");
    expect(reauth).toHaveAttribute("target", "_blank");
    expect(screen.getByText(/session may have expired/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(probe.reload).toHaveBeenCalledTimes(1);
  });

  it("reloads on tab return (focus) while failed and visible", () => {
    render(<ServiceView s={svc} />);
    fireEvent(window, new Event("focus"));
    expect(probe.reload).toHaveBeenCalledTimes(1);
    fireEvent(document, new Event("visibilitychange"));
    expect(probe.reload).toHaveBeenCalledTimes(2);
  });

  it("does NOT reload on focus when the tab is hidden", () => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    render(<ServiceView s={svc} />);
    fireEvent(window, new Event("focus"));
    expect(probe.reload).not.toHaveBeenCalled();
  });

  it("does NOT reload a healthy embed on focus (keep-alive preserved)", () => {
    probe.embedState = "ok";
    render(<ServiceView s={svc} />);
    fireEvent(window, new Event("focus"));
    fireEvent(document, new Event("visibilitychange"));
    expect(probe.reload).not.toHaveBeenCalled();
  });
});
