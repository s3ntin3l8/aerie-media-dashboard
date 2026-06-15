import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import React from "react";

vi.mock("@/app/(portal)/admin/actions", () => ({ setQueueSource: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/portal/PortalProvider", () => ({
  usePortal: () => ({ role: "admin", user: { id: "u1" }, modalOpen: false, setModalOpen: vi.fn() }),
}));
vi.mock("@/components/portal/DataProvider", () => ({ useData: vi.fn(), useRefresh: () => vi.fn() }));

import { useData } from "@/components/portal/DataProvider";
import { CardSettingsModal } from "@/components/modals/CardSettingsModal";
import type { Tile } from "@/components/portal/gridLayout";

const tile = (type: string, settings?: Record<string, string | number | boolean>): Tile => ({
  uid: `${type}-1`, type, x: 0, y: 0, w: 4, h: 4, ...(settings ? { settings } : {}),
});

beforeEach(() => {
  vi.mocked(useData).mockReturnValue({
    services: [
      { id: "tautulli", name: "Tautulli" },
      { id: "jellyfin", name: "Jellyfin" },
      { id: "sonarr", name: "Sonarr" },
    ],
    libraryAll: [
      { id: "movies", label: "Movies", count: "100", icon: "movie", delta: "", source: "tautulli" },
      { id: "shows", label: "Shows", count: "9", icon: "tv", delta: "", source: "jellyfin" },
    ],
  } as never);
});

describe("CardSettingsModal — render guards", () => {
  it("renders nothing when closed", () => {
    const { container } = render(<CardSettingsModal open={false} tile={tile("myRequests")} onClose={vi.fn()} onSave={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when the tile is undefined", () => {
    const { container } = render(<CardSettingsModal open tile={undefined} onClose={vi.fn()} onSave={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing for a widget type that has no settings", () => {
    // centralServices has no `settings` array → modal short-circuits to null.
    const { container } = render(<CardSettingsModal open tile={tile("centralServices")} onClose={vi.fn()} onSave={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it("shows the widget name as the subtitle header", () => {
    render(<CardSettingsModal open tile={tile("myRequests")} onClose={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByText("Widget settings")).toBeInTheDocument();
    expect(screen.getByText("Requests")).toBeInTheDocument();
  });
});

describe("CardSettingsModal — text / count / select controls", () => {
  it("edits a text field and saves it through onSave", () => {
    const onSave = vi.fn();
    render(<CardSettingsModal open tile={tile("myRequests")} onClose={vi.fn()} onSave={onSave} />);

    const titleInput = screen.getByRole("textbox", { name: /Card title/i }) as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: "Pending" } });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith("myRequests-1", expect.objectContaining({ title: "Pending" }));
  });

  it("omits empty string settings from the saved payload (uses default)", () => {
    const onSave = vi.fn();
    render(<CardSettingsModal open tile={tile("myRequests")} onClose={vi.fn()} onSave={onSave} />);
    // Nothing edited → empty fields are stripped, so the payload is bare.
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith("myRequests-1", {});
  });

  it("coerces a count select to a number on save", () => {
    const onSave = vi.fn();
    render(<CardSettingsModal open tile={tile("myRequests")} onClose={vi.fn()} onSave={onSave} />);

    const countSel = screen.getByRole("combobox", { name: /Items to show/i });
    fireEvent.change(countSel, { target: { value: "8" } });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith("myRequests-1", expect.objectContaining({ limit: 8 }));
  });

  it("stores a select value as a string", () => {
    const onSave = vi.fn();
    render(<CardSettingsModal open tile={tile("myRequests")} onClose={vi.fn()} onSave={onSave} />);

    const viewSel = screen.getByRole("combobox", { name: /View mode/i });
    fireEvent.change(viewSel, { target: { value: "queue" } });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith("myRequests-1", expect.objectContaining({ view: "queue" }));
  });

  it("seeds the count control from the tile's stored settings", () => {
    render(<CardSettingsModal open tile={tile("myRequests", { limit: 12 })} onClose={vi.fn()} onSave={vi.fn()} />);
    const countSel = screen.getByRole("combobox", { name: /Items to show/i }) as HTMLSelectElement;
    expect(countSel.value).toBe("12");
  });
});

describe("CardSettingsModal — toggle controls", () => {
  it("renders a toggle and flips it on into the save payload", () => {
    const onSave = vi.fn();
    // The Download Queue widget exposes a "Compact rows" toggle (off by default).
    render(<CardSettingsModal open tile={tile("queue")} onClose={vi.fn()} onSave={onSave} />);

    const denseRow = screen.getByText("Compact rows").closest("div")!.parentElement!.parentElement!;
    fireEvent.click(within(denseRow).getByRole("button"));

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith("queue-1", expect.objectContaining({ dense: true }));
  });
});

describe("CardSettingsModal — links control", () => {
  it("adds a link row and persists it as serialized JSON", () => {
    const onSave = vi.fn();
    render(<CardSettingsModal open tile={tile("shortcuts")} onClose={vi.fn()} onSave={onSave} />);

    fireEvent.click(screen.getByText("Add link"));
    fireEvent.change(screen.getByPlaceholderText("Label"), { target: { value: "Docs" } });
    fireEvent.change(screen.getByPlaceholderText("https://…"), { target: { value: "https://example.com" } });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const [, payload] = onSave.mock.calls[0];
    expect(JSON.parse(payload.links as string)).toEqual([{ label: "Docs", url: "https://example.com", icon: "" }]);
  });

  it("removes a link row", () => {
    const onSave = vi.fn();
    render(<CardSettingsModal open tile={tile("shortcuts", { links: JSON.stringify([{ label: "Old", url: "https://x", icon: "" }]) })} onClose={vi.fn()} onSave={onSave} />);

    expect((screen.getByPlaceholderText("Label") as HTMLInputElement).value).toBe("Old");
    fireEvent.click(screen.getByTitle("Remove"));
    expect(screen.queryByPlaceholderText("Label")).toBeNull();
  });
});

describe("CardSettingsModal — serviceIds control", () => {
  it("lists every service and toggling one off serializes the remaining order", () => {
    const onSave = vi.fn();
    render(<CardSettingsModal open tile={tile("serviceTiles")} onClose={vi.fn()} onSave={onSave} />);

    // All three services render as draggable toggle rows.
    expect(screen.getByText("Tautulli")).toBeInTheDocument();
    expect(screen.getByText("Jellyfin")).toBeInTheDocument();
    expect(screen.getByText("Sonarr")).toBeInTheDocument();

    // Hide Jellyfin — its toggle is on by default.
    const row = screen.getByText("Jellyfin").closest("div")!.parentElement!.parentElement!;
    fireEvent.click(within(row).getByRole("button"));

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const [, payload] = onSave.mock.calls[0];
    // Order preserved, Jellyfin dropped.
    expect(payload.serviceIds).toBe("tautulli,sonarr");
  });

  it("shows an empty hint when no services are configured", () => {
    vi.mocked(useData).mockReturnValue({ services: [], libraryAll: [] } as never);
    render(<CardSettingsModal open tile={tile("serviceTiles")} onClose={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByText("No services configured yet.")).toBeInTheDocument();
  });
});

describe("CardSettingsModal — cancel", () => {
  it("calls onClose from the Cancel button", () => {
    const onClose = vi.fn();
    render(<CardSettingsModal open tile={tile("myRequests")} onClose={onClose} onSave={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
  });
});
