import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import React from "react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => "/",
}));

const signOut = vi.fn();
const setModalOpen = vi.fn();
vi.mock("@/components/portal/PortalProvider", () => ({
  usePortal: () => ({
    role: "user",
    realRole: "user",
    toggleRole: vi.fn(),
    theme: "dark",
    toggleTheme: vi.fn(),
    setPaletteOpen: vi.fn(),
    user: { id: "u1", name: "Ada Lovelace", email: "ada@example.com", role: "user", groups: [] },
    favorites: [],
    lastOpened: null,
    signOut,
    setModalOpen,
  }),
}));
vi.mock("@/components/portal/DataProvider", () => ({
  useData: () => ({ services: [], requests: [], visibility: [], users: [{ id: "u1", avatar: undefined }] }),
}));

import { Rail } from "@/components/portal/Rail";

beforeEach(() => {
  signOut.mockClear();
  setModalOpen.mockClear();
});

describe("Rail — account menu behind the avatar", () => {
  it("renders the account trigger and keeps the menu closed initially", () => {
    render(<Rail />);
    expect(screen.getByRole("button", { name: /account: ada lovelace/i })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /sign out/i })).toBeNull();
  });

  it("opens the menu on click, showing identity and a Sign out item", () => {
    render(<Rail />);
    fireEvent.click(screen.getByRole("button", { name: /account: ada lovelace/i }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByText("ada@example.com")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /sign out/i })).toBeInTheDocument();
    expect(setModalOpen).toHaveBeenCalledWith(true);
  });

  it("calls signOut when the Sign out item is clicked", () => {
    render(<Rail />);
    fireEvent.click(screen.getByRole("button", { name: /account: ada lovelace/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /sign out/i }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape", () => {
    render(<Rail />);
    fireEvent.click(screen.getByRole("button", { name: /account: ada lovelace/i }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("closes on an outside mousedown", () => {
    render(<Rail />);
    fireEvent.click(screen.getByRole("button", { name: /account: ada lovelace/i }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
