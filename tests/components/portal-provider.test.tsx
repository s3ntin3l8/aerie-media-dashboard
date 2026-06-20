import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), usePathname: () => "/" }));
const signOutAction = vi.fn();
const setFavoritesAction = vi.fn();
vi.mock("@/app/(portal)/actions", () => ({ signOutAction: () => signOutAction(), setFavoritesAction: (a: unknown) => setFavoritesAction(a) }));

import { PortalProvider, usePortal } from "@/components/portal/PortalProvider";

function Probe() {
  const p = usePortal();
  return (
    <div>
      <span data-testid="theme">{p.theme}</span>
      <span data-testid="role">{p.role}</span>
      <span data-testid="palette">{String(p.paletteOpen)}</span>
      <span data-testid="favs">{p.favorites.join(",")}</span>
      <button onClick={p.toggleTheme}>tt</button>
      <button onClick={p.toggleRole}>tr</button>
      <button onClick={() => p.toggleFavorite("radarr")}>fav</button>
      <button onClick={p.signOut}>so</button>
    </div>
  );
}

const renderAs = (role: "admin" | "user") =>
  render(<PortalProvider user={{ id: "u1", name: "Ada", email: "a@x", role } as never}><Probe /></PortalProvider>);

beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); });

describe("PortalProvider", () => {
  it("toggles theme (and persists it)", () => {
    renderAs("admin");
    const before = screen.getByTestId("theme").textContent;
    fireEvent.click(screen.getByText("tt"));
    expect(screen.getByTestId("theme").textContent).not.toBe(before);
  });

  it("lets a real admin preview the member role", () => {
    renderAs("admin");
    expect(screen.getByTestId("role").textContent).toBe("admin");
    fireEvent.click(screen.getByText("tr"));
    expect(screen.getByTestId("role").textContent).toBe("user");
  });

  it("does not let a member elevate", () => {
    renderAs("user");
    fireEvent.click(screen.getByText("tr"));
    expect(screen.getByTestId("role").textContent).toBe("user");
  });

  it("⌘K toggles the palette and Escape closes it", () => {
    renderAs("admin");
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(screen.getByTestId("palette").textContent).toBe("true");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByTestId("palette").textContent).toBe("false");
  });

  it("g-then-key navigates", () => {
    renderAs("admin");
    fireEvent.keyDown(window, { key: "g" });
    fireEvent.keyDown(window, { key: "s" });
    expect(push).toHaveBeenCalledWith("/status");
  });

  it("⌘D toggles the theme", () => {
    renderAs("admin");
    const before = screen.getByTestId("theme").textContent;
    fireEvent.keyDown(window, { key: "d", metaKey: true });
    expect(screen.getByTestId("theme").textContent).not.toBe(before);
  });

  it("pins a favorite and persists it; signOut calls the action", () => {
    renderAs("admin");
    fireEvent.click(screen.getByText("fav"));
    expect(screen.getByTestId("favs").textContent).toBe("radarr");
    expect(setFavoritesAction).toHaveBeenCalledWith(["radarr"]);
    fireEvent.click(screen.getByText("so"));
    expect(signOutAction).toHaveBeenCalled();
  });
});
