import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

vi.mock("@/components/portal/PortalProvider", () => ({
  usePortal: () => ({
    favorites: [] as string[],
    toggleFavorite: vi.fn(),
    user: { id: "u1", name: "Admin", email: "a@b.c", role: "admin" },
    role: "admin",
    setModalOpen: vi.fn(),
    modalOpen: false,
  }),
}));

import { ServiceModal } from "@/components/modals/ServiceModal";
import type { Service } from "@/lib/types";

const mkSvc = (over: Record<string, unknown> = {}): Service => ({
  id: "sonarr",
  name: "Sonarr",
  cat: "automation",
  icon: "live_tv",
  host: "sonarr.test",
  scheme: "https",
  embeddable: true,
  active: true,
  keepAlive: false,
  version: "3.0",
  status: "up",
  uptime: 99.9,
  ms: 5,
  beats: [],
  note: "",
  ...over,
} as never);

const baseProps = {
  open: true as const,
  groups: [{ name: "admins" }, { name: "members" }],
  adminGroup: "admins",
  initialVisibility: {} as Record<string, boolean>,
  onClose: vi.fn(),
  onSave: vi.fn(),
  onDelete: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) }) as never;
});
afterEach(() => vi.unstubAllGlobals());

describe("ServiceModal — add mode", () => {
  it("renders the add-mode title and disables Add until name + host are set", () => {
    render(<ServiceModal {...baseProps} mode="add" />);
    expect(screen.getByText("Add a service")).toBeInTheDocument();
    const addBtn = screen.getByRole("button", { name: /Add service/ });
    expect(addBtn).toBeDisabled();
  });

  it("enables Add once name + host are filled and saves the form payload", () => {
    const onSave = vi.fn();
    render(<ServiceModal {...baseProps} mode="add" onSave={onSave} />);

    fireEvent.change(screen.getByPlaceholderText("e.g. Jellyfin"), { target: { value: "MyApp" } });
    fireEvent.change(screen.getByPlaceholderText("host.example.com"), { target: { value: "myapp.lan" } });

    const addBtn = screen.getByRole("button", { name: /Add service/ });
    expect(addBtn).not.toBeDisabled();
    fireEvent.click(addBtn);

    expect(onSave).toHaveBeenCalledTimes(1);
    const [form] = onSave.mock.calls[0];
    expect(form).toMatchObject({ name: "MyApp", host: "myapp.lan" });
  });

  it("applies a service preset when the typed name matches (category/logo)", () => {
    const onSave = vi.fn();
    render(<ServiceModal {...baseProps} mode="add" onSave={onSave} />);
    // Typing "sonarr" matches a preset → category flips to automation, logoSlug to sonarr.
    fireEvent.change(screen.getByPlaceholderText("e.g. Jellyfin"), { target: { value: "sonarr" } });
    fireEvent.change(screen.getByPlaceholderText("host.example.com"), { target: { value: "s.lan" } });
    fireEvent.click(screen.getByRole("button", { name: /Add service/ }));

    const [form] = onSave.mock.calls[0];
    expect(form).toMatchObject({ name: "sonarr", cat: "automation", logoSlug: "sonarr" });
  });

  it("seeds the form from a prefill (discovered Traefik router)", () => {
    render(<ServiceModal {...baseProps} mode="add" prefill={{ name: "grafana", host: "grafana.lan", scheme: "https", cat: "infra", icon: "monitoring" }} />);
    expect(screen.getByDisplayValue("grafana")).toBeInTheDocument();
    expect(screen.getByDisplayValue("grafana.lan")).toBeInTheDocument();
  });

  it("shows the AES-GCM footer note in add mode (no Remove button)", () => {
    render(<ServiceModal {...baseProps} mode="add" />);
    expect(screen.getByText(/Secrets sealed with AES-GCM/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Remove/ })).not.toBeInTheDocument();
  });

  it("toggles the embeddable / keep-alive section", () => {
    render(<ServiceModal {...baseProps} mode="add" />);
    // Embeddable defaults on → keep-alive row visible.
    expect(screen.getByText("Keep session alive")).toBeInTheDocument();

    const embedRow = screen.getByText("Embed inside the portal").closest("div")!.parentElement!.parentElement!;
    fireEvent.click(within(embedRow).getByRole("button"));
    // Turning embed off hides the keep-alive row.
    expect(screen.queryByText("Keep session alive")).not.toBeInTheDocument();
  });
});

describe("ServiceModal — edit mode", () => {
  it("renders the edit title and seeds fields from the service", () => {
    render(<ServiceModal {...baseProps} mode="edit" service={mkSvc()} />);
    expect(screen.getByText("Edit Sonarr")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Sonarr")).toBeInTheDocument();
    expect(screen.getByDisplayValue("sonarr.test")).toBeInTheDocument();
    expect(screen.getByDisplayValue("3.0")).toBeInTheDocument();
  });

  it("never pre-fills the API key (blank = keep current)", () => {
    render(<ServiceModal {...baseProps} mode="edit" service={mkSvc()} />);
    expect(screen.getByPlaceholderText("•••••••• (unchanged)")).toHaveValue("");
  });

  it("shows the Remove button and calls onDelete with the service", () => {
    const onDelete = vi.fn();
    const svc = mkSvc();
    render(<ServiceModal {...baseProps} mode="edit" service={svc} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole("button", { name: /Remove/ }));
    expect(onDelete).toHaveBeenCalledWith(svc);
  });

  it("calls onSave with edited fields and current visibility", () => {
    const onSave = vi.fn();
    render(<ServiceModal {...baseProps} mode="edit" service={mkSvc()} initialVisibility={{ members: true }} onSave={onSave} />);

    fireEvent.change(screen.getByDisplayValue("3.0"), { target: { value: "4.0" } });
    fireEvent.click(screen.getByRole("button", { name: /Save changes/ }));

    const [form, vis] = onSave.mock.calls[0];
    expect(form).toMatchObject({ name: "Sonarr", version: "4.0" });
    expect(vis).toMatchObject({ members: true });
  });

  it("shows the live heartbeat block when editing a monitored service", () => {
    render(<ServiceModal {...baseProps} mode="edit" service={mkSvc({ beats: [{ t: 1, up: true }] })} />);
    // Uptime/status summary renders next to the heartbeat.
    expect(screen.getByText(/99\.90% · up/)).toBeInTheDocument();
  });
});

describe("ServiceModal — secret reveal + visibility", () => {
  it("toggles the API key reveal button (password ↔ text)", () => {
    render(<ServiceModal {...baseProps} mode="add" />);
    const keyInput = screen.getByPlaceholderText(/paste service API key|app password/i) as HTMLInputElement;
    expect(keyInput.type).toBe("password");
    fireEvent.click(screen.getByTitle("Reveal"));
    expect(keyInput.type).toBe("text");
    fireEvent.click(screen.getByTitle("Hide"));
    expect(keyInput.type).toBe("password");
  });

  it("renders one visibility row per group, with the admin group locked", () => {
    render(<ServiceModal {...baseProps} mode="add" />);
    expect(screen.getByText("admins")).toBeInTheDocument();
    expect(screen.getByText("members")).toBeInTheDocument();
    // Admin group is always-visible (locked, no toggle).
    expect(screen.getByText("always")).toBeInTheDocument();
  });

  it("toggling a non-admin group flips visibility in the save payload", () => {
    const onSave = vi.fn();
    render(<ServiceModal {...baseProps} mode="add" onSave={onSave} />);

    fireEvent.change(screen.getByPlaceholderText("e.g. Jellyfin"), { target: { value: "MyApp" } });
    fireEvent.change(screen.getByPlaceholderText("host.example.com"), { target: { value: "myapp.lan" } });

    const memberRow = screen.getByText("members").closest("div")!;
    fireEvent.click(within(memberRow).getByRole("button"));

    fireEvent.click(screen.getByRole("button", { name: /Add service/ }));
    const [, vis] = onSave.mock.calls[0];
    expect(vis.members).toBe(true);
  });
});

describe("ServiceModal — forward-auth", () => {
  it("reveals bearer credential fields when the bearer method is chosen", () => {
    render(<ServiceModal {...baseProps} mode="add" />);
    const faSelect = screen.getByRole("combobox", { name: /Forward-auth/i });
    fireEvent.change(faSelect, { target: { value: "bearer" } });

    expect(screen.getByPlaceholderText(/token endpoint|application\/o\/token/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText("proxy provider client_id")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("service-account username")).toBeInTheDocument();
  });

  it("shows basic-auth fields (no token URL) for the basic method", () => {
    render(<ServiceModal {...baseProps} mode="add" />);
    fireEvent.change(screen.getByRole("combobox", { name: /Forward-auth/i }), { target: { value: "basic" } });
    expect(screen.getByPlaceholderText("service-account username")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("proxy provider client_id")).not.toBeInTheDocument();
  });

  it("offers a Remove forward-auth option only in edit mode", () => {
    const { rerender } = render(<ServiceModal {...baseProps} mode="add" />);
    expect(screen.queryByRole("option", { name: /Remove forward-auth/ })).not.toBeInTheDocument();
    rerender(<ServiceModal {...baseProps} mode="edit" service={mkSvc()} />);
    expect(screen.getByRole("option", { name: /Remove forward-auth/ })).toBeInTheDocument();
  });
});

describe("ServiceModal — version detect + connection test", () => {
  it("detects the version through onDetectVersion and writes it into the field", async () => {
    const onDetectVersion = vi.fn().mockResolvedValue("9.9.9");
    render(<ServiceModal {...baseProps} mode="edit" service={mkSvc()} onDetectVersion={onDetectVersion} />);

    fireEvent.click(screen.getByTitle("Auto-detect version from service API"));
    await waitFor(() => expect(onDetectVersion).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByDisplayValue("9.9.9")).toBeInTheDocument());
  });

  it("save-and-test persists then tests the stored connection, showing Connected", async () => {
    const onSaveAndTest = vi.fn().mockResolvedValue("sonarr");
    const onTestSaved = vi.fn().mockResolvedValue("3.1");
    render(
      <ServiceModal
        {...baseProps}
        mode="edit"
        service={mkSvc()}
        onSaveAndTest={onSaveAndTest}
        onTestSaved={onTestSaved}
      />,
    );

    fireEvent.click(screen.getByTitle("Save and test connection"));
    await waitFor(() => expect(onSaveAndTest).toHaveBeenCalled());
    await waitFor(() => expect(onTestSaved).toHaveBeenCalledWith("sonarr"));
    expect(await screen.findByText(/Connected · v3.1/)).toBeInTheDocument();
  });

  it("shows a failure state when save-and-test cannot persist", async () => {
    const onSaveAndTest = vi.fn().mockResolvedValue(null);
    const onTestSaved = vi.fn();
    render(
      <ServiceModal
        {...baseProps}
        mode="edit"
        service={mkSvc()}
        onSaveAndTest={onSaveAndTest}
        onTestSaved={onTestSaved}
      />,
    );
    fireEvent.click(screen.getByTitle("Save and test connection"));
    await waitFor(() => expect(onSaveAndTest).toHaveBeenCalled());
    expect(onTestSaved).not.toHaveBeenCalled();
    expect(await screen.findByText(/Could not connect/)).toBeInTheDocument();
  });
});

describe("ServiceModal — userpass secret validation", () => {
  it("warns when a userpass service's key omits the ':' separator", () => {
    // qBittorrent expects user:password — typing a bare value flags it.
    render(<ServiceModal {...baseProps} mode="add" />);
    fireEvent.change(screen.getByPlaceholderText("e.g. Jellyfin"), { target: { value: "qbittorrent" } });

    const keyInput = screen.getByPlaceholderText(/username:password|paste service API key/i);
    fireEvent.change(keyInput, { target: { value: "justuser" } });

    expect(screen.getByText(/include the .:. separator/)).toBeInTheDocument();
  });
});

describe("ServiceModal — loki + spotlight", () => {
  it("shows the Loki query field only when lokiConfigured", () => {
    const { rerender } = render(<ServiceModal {...baseProps} mode="add" />);
    expect(screen.queryByText("Loki query")).not.toBeInTheDocument();
    rerender(<ServiceModal {...baseProps} mode="add" lokiConfigured />);
    expect(screen.getByText("Loki query")).toBeInTheDocument();
  });

  it("reveals the spotlight label field when the central toggle is on", () => {
    render(<ServiceModal {...baseProps} mode="add" />);
    expect(screen.queryByText("Spotlight label")).not.toBeInTheDocument();
    const centralRow = screen.getByText("Feature on the dashboard spotlight").closest("div")!.parentElement!.parentElement!;
    fireEvent.click(within(centralRow).getByRole("button"));
    expect(screen.getByText("Spotlight label")).toBeInTheDocument();
  });
});

describe("ServiceModal — Portainer container fields", () => {
  it("hides the container fields when no Portainer instance is configured", () => {
    render(<ServiceModal {...baseProps} mode="add" />);
    expect(screen.queryByText("Container name")).not.toBeInTheDocument();
    expect(screen.queryByText("Endpoint id")).not.toBeInTheDocument();
  });

  it("shows and edits the container name + endpoint id when Portainer is configured", () => {
    render(<ServiceModal {...baseProps} mode="add" portainerConfigured />);
    const container = screen.getByPlaceholderText("e.g. jellyfin") as HTMLInputElement;
    const endpoint = screen.getByPlaceholderText("auto") as HTMLInputElement;
    fireEvent.change(container, { target: { value: "jellyfin" } });
    fireEvent.change(endpoint, { target: { value: "3" } });
    expect(container.value).toBe("jellyfin");
    expect(endpoint.value).toBe("3");
  });

  it("seeds the container fields from the edited service", () => {
    render(<ServiceModal {...baseProps} mode="edit" service={mkSvc({ containerName: "sonarr", portainerEndpointId: "2" })} portainerConfigured />);
    expect((screen.getByPlaceholderText("e.g. jellyfin") as HTMLInputElement).value).toBe("sonarr");
    expect((screen.getByPlaceholderText("auto") as HTMLInputElement).value).toBe("2");
  });
});
