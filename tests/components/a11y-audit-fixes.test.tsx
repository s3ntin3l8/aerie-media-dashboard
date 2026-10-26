import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

// Regression tests for the 2026-10 portal UI/UX audit (docs/audit/2026-10-portal-ui-ux.md).
// Each case pins the contract of one fix so it can't silently regress.

vi.mock("@/app/(portal)/admin/actions", () => ({ setQueueSource: vi.fn() }));
const notFound = vi.hoisted(() => vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), notFound }));
vi.mock("@/components/portal/PortalProvider", () => ({ usePortal: () => ({ role: "admin", user: { id: "u1" }, setModalOpen: vi.fn() }) }));
vi.mock("@/components/portal/DataProvider", () => ({
  useData: () => ({ services: [{ id: "abs", name: "Audiobookshelf", cat: "stream", icon: "headphones", host: "abs.test", scheme: "https", status: "up", uptime: 99.9, ms: 5, beats: [], version: "1", note: "", central: true, centralLabel: "Audiobooks", active: true, embeddable: false }] }),
  useRefresh: () => vi.fn(),
}));

import { Toggle, ToggleRow } from "@/components/modals/ModalShell";
import { PanelShell, CentralServices } from "@/components/panels";
import UnknownRoute from "@/app/(portal)/[...missing]/page";

describe("Toggle — accessible name", () => {
  it("exposes its label as the button name and reflects the pressed state", () => {
    const onChange = vi.fn();
    render(<Toggle label="Plex active" on={true} onChange={onChange} />);
    const btn = screen.getByRole("button", { name: "Plex active", pressed: true });
    fireEvent.click(btn);
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("ToggleRow names its toggle after the row title", () => {
    render(<ToggleRow title="Embeddable" on={false} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Embeddable", pressed: false })).toBeTruthy();
  });
});

describe("PanelShell — scrollable body", () => {
  it("is a labelled, keyboard-focusable region when it fills (scrolls) its tile", () => {
    render(<PanelShell title="Queue" fill>body</PanelShell>);
    const region = screen.getByRole("region", { name: "Queue" });
    expect(region.tabIndex).toBe(0);
  });

  it("adds no tab stop when it renders at natural height", () => {
    render(<PanelShell title="Queue">body</PanelShell>);
    expect(screen.queryByRole("region", { name: "Queue" })).toBeNull();
  });
});

describe("CentralServices — card header", () => {
  it("lets the category chip wrap below a long name instead of overlapping the status badge", () => {
    render(<CentralServices />);
    const chip = screen.getByText("Audiobooks");
    expect(chip.style.whiteSpace).toBe("nowrap");
    expect(chip.parentElement!.style.flexWrap).toBe("wrap");
  });
});

describe("unknown routes", () => {
  it("fall through to notFound(), so the themed in-shell 404 renders instead of Next's stock page", () => {
    expect(() => UnknownRoute()).toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalledOnce();
  });
});

import { ModalShell } from "@/components/modals/ModalShell";

describe("ModalShell — dialog semantics", () => {
  it("is a modal dialog named by its title, and takes focus on open", () => {
    render(<ModalShell open onClose={() => {}} title="Edit service">content</ModalShell>);
    const dialog = screen.getByRole("dialog", { name: "Edit service" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement).toBe(dialog);
  });

  it("returns focus to the element that opened it when it closes", () => {
    const Host = () => {
      const [open, setOpen] = React.useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>Open</button>
          <ModalShell open={open} onClose={() => setOpen(false)} title="T">x</ModalShell>
        </>
      );
    };
    render(<Host />);
    const trigger = screen.getByRole("button", { name: "Open" });
    trigger.focus();
    fireEvent.click(trigger);
    expect(document.activeElement).toBe(screen.getByRole("dialog"));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});

describe("ModalShell — focus and autoFocus", () => {
  it("leaves focus on a child that claimed it (autoFocus) instead of stealing it", () => {
    render(
      <ModalShell open onClose={() => {}} title="Add service">
        <input aria-label="Name" autoFocus />
      </ModalShell>,
    );
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Name" }));
  });
});
