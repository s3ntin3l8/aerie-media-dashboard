import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import React from "react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/components/portal/PortalProvider", () => ({
  usePortal: () => ({ paletteOpen: false, modalOpen: false, favorites: [], toggleFavorite: vi.fn(), user: { name: "t" }, oidc: true }),
}));
vi.mock("@/app/(portal)/admin/actions", () => ({ setQueueSource: vi.fn() }));
vi.mock("@/components/portal/DataProvider", () => ({ useData: () => ({ nowPlaying: [] }) }));

const probe = {
  embedState: "unverified" as "checking" | "ok" | "unverified",
  badge: { label: "EMBED UNVERIFIED", color: "#f5a623" },
  onLoad: vi.fn(),
  onError: vi.fn(),
  reload: vi.fn(),
  reloadKey: 0,
};
vi.mock("@/components/hooks/useEmbedProbe", () => ({ useEmbedProbe: () => probe }));

import { MobileServiceView } from "@/components/mobile/screens/MobileServiceView";

const svc = {
  id: "radarr", name: "Radarr", cat: "automation", icon: "dns",
  host: "radarr.test", scheme: "https", embeddable: true, active: true,
  keepAlive: false, version: "1", status: "up", uptime: 100, ms: 1, beats: [], note: "",
} as never;

beforeEach(() => {
  probe.reload.mockClear();
  probe.embedState = "unverified";
  Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
});

describe("MobileServiceView — self-healing re-auth", () => {
  it("renders Re-authenticate + Retry when failed and Retry calls reload", () => {
    render(<MobileServiceView s={svc} onClose={vi.fn()} />);
    expect(screen.getByText(/session may have expired/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /re-authenticate/i })).toHaveAttribute("href", "https://radarr.test");
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(probe.reload).toHaveBeenCalledTimes(1);
  });

  it("reloads on tab return while failed and visible", () => {
    render(<MobileServiceView s={svc} onClose={vi.fn()} />);
    fireEvent(window, new Event("focus"));
    expect(probe.reload).toHaveBeenCalledTimes(1);
  });

  it("does NOT reload a healthy embed on focus", () => {
    probe.embedState = "ok";
    render(<MobileServiceView s={svc} onClose={vi.fn()} />);
    fireEvent(window, new Event("focus"));
    expect(probe.reload).not.toHaveBeenCalled();
  });

  it("delegates fullscreen + media permissions to the embedded frame", () => {
    probe.embedState = "ok";
    const { container } = render(<MobileServiceView s={svc} onClose={vi.fn()} />);
    const iframe = container.querySelector("iframe");
    expect(iframe?.getAttribute("allow")).toContain("fullscreen");
    expect(iframe?.getAttribute("allow")).toContain("picture-in-picture");
    expect(iframe?.hasAttribute("allowfullscreen")).toBe(true);
  });
});
