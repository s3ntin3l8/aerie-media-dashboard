import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

// Exercises the Admin SHELL's real mutation handlers (persistService / onSave / onSaveAndTest /
// onDelete) by driving them through the ServiceModal the shell renders. Mirrors the mocking
// harness from admin-keepalive.test.tsx (actions module + DataProvider + PortalProvider +
// useIsMobile), but covers the save/delete/duplicate-guard/save-and-test paths it doesn't.
const mobile = vi.hoisted(() => ({ value: false }));
const actions = vi.hoisted(() => ({
  setVisibility: vi.fn(),
  upsertService: vi.fn(),
  setServiceSecret: vi.fn(),
  setServiceActive: vi.fn(),
  setServiceKeepAlive: vi.fn(),
  mergeServiceForwardAuth: vi.fn(),
  clearServiceForwardAuth: vi.fn(),
  deleteService: vi.fn(),
  serviceExists: vi.fn(),
  detectServiceVersion: vi.fn(),
  probeServiceVersion: vi.fn(),
  testStoredConnection: vi.fn(),
  setUserOverseerrQuota: vi.fn(),
}));
const refresh = vi.hoisted(() => vi.fn());
const patchData = vi.hoisted(() => vi.fn());

vi.mock("@/components/mobile/useIsMobile", () => ({ useIsMobile: () => mobile.value }));
vi.mock("@/app/(portal)/admin/actions", () => actions);
vi.mock("@/components/portal/DataProvider", () => ({
  useData: vi.fn(),
  useRefresh: () => refresh,
  usePatchData: () => patchData,
}));
vi.mock("@/components/portal/PortalProvider", () => ({
  usePortal: () => ({
    favorites: [],
    toggleFavorite: vi.fn(),
    user: { id: "u1", name: "Admin", email: "a@b.c", role: "admin" },
    role: "admin",
    oidc: false,
    setModalOpen: vi.fn(),
    modalOpen: false,
    paletteOpen: false,
    setPaletteOpen: vi.fn(),
    keptAliveIds: [],
  }),
}));

import { useData } from "@/components/portal/DataProvider";
import { Admin } from "@/components/views/Admin";

const mkSvc = (over: Record<string, unknown> = {}) => ({
  id: "sonarr",
  name: "Sonarr",
  cat: "automation",
  icon: "dns",
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
});

const seedData = (services: unknown[]) =>
  vi.mocked(useData).mockReturnValue({
    services,
    allServices: services,
    groups: [{ name: "admins" }, { name: "friends" }],
    visibility: [],
    adminGroup: "admins",
    users: [],
  } as never);

const fillAddForm = (name: string, host: string) => {
  fireEvent.change(screen.getByPlaceholderText("e.g. Jellyfin"), { target: { value: name } });
  fireEvent.change(screen.getByPlaceholderText("host.example.com"), { target: { value: host } });
};

beforeEach(() => {
  mobile.value = false;
  vi.clearAllMocks();
  actions.serviceExists.mockResolvedValue(false);
  actions.detectServiceVersion.mockResolvedValue(null);
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) }) as never;
});
afterEach(() => vi.unstubAllGlobals());

describe("Admin — add-service save flow", () => {
  it("persists config + visibility for every group and patches the snapshot", async () => {
    seedData([]);
    render(<Admin />);

    fireEvent.click(screen.getByRole("button", { name: /Add service/ }));
    fillAddForm("Grafana", "grafana.lan");
    // The footer "Add service" button (the modal's primary action) — disambiguate from the header.
    const addButtons = screen.getAllByRole("button", { name: /Add service/ });
    fireEvent.click(addButtons[addButtons.length - 1]);

    await waitFor(() => expect(actions.upsertService).toHaveBeenCalledTimes(1));
    const payload = actions.upsertService.mock.calls[0][0];
    // slug(name) → id; baseUrl rejoined from scheme + host.
    expect(payload).toMatchObject({ id: "grafana", name: "Grafana", host: "grafana.lan", baseUrl: "https://grafana.lan" });

    // Visibility written for every group; admin group is forced true.
    expect(actions.setVisibility).toHaveBeenCalledWith("grafana", "admins", true);
    expect(actions.setVisibility).toHaveBeenCalledWith("grafana", "friends", expect.any(Boolean));

    // Optimistic snapshot patch + a refresh after the save.
    expect(patchData).toHaveBeenCalled();
    expect(refresh).toHaveBeenCalled();
  });

  it("writes the secret only when an API key was typed", async () => {
    seedData([]);
    render(<Admin />);
    fireEvent.click(screen.getByRole("button", { name: /Add service/ }));
    fillAddForm("Grafana", "grafana.lan");

    fireEvent.change(screen.getByPlaceholderText("paste service API key"), { target: { value: "secret-key" } });
    const addButtons = screen.getAllByRole("button", { name: /Add service/ });
    fireEvent.click(addButtons[addButtons.length - 1]);

    await waitFor(() => expect(actions.setServiceSecret).toHaveBeenCalledWith("grafana", "secret-key"));
  });

  it("does not write a secret when the key field is left blank", async () => {
    seedData([]);
    render(<Admin />);
    fireEvent.click(screen.getByRole("button", { name: /Add service/ }));
    fillAddForm("Grafana", "grafana.lan");
    const addButtons = screen.getAllByRole("button", { name: /Add service/ });
    fireEvent.click(addButtons[addButtons.length - 1]);

    await waitFor(() => expect(actions.upsertService).toHaveBeenCalled());
    expect(actions.setServiceSecret).not.toHaveBeenCalled();
  });

  it("rejects a duplicate id and does NOT upsert (flashes the clash)", async () => {
    actions.serviceExists.mockResolvedValue(true);
    seedData([]);
    render(<Admin />);
    fireEvent.click(screen.getByRole("button", { name: /Add service/ }));
    fillAddForm("Grafana", "grafana.lan");
    const addButtons = screen.getAllByRole("button", { name: /Add service/ });
    fireEvent.click(addButtons[addButtons.length - 1]);

    await waitFor(() => expect(actions.serviceExists).toHaveBeenCalledWith("grafana"));
    expect(actions.upsertService).not.toHaveBeenCalled();
    expect(await screen.findByText(/already exists/)).toBeInTheDocument();
  });
});

describe("Admin — edit-service save flow", () => {
  it("opens the edit modal from the services list and saves edited fields under the existing id", async () => {
    seedData([mkSvc()]);
    render(<Admin />);

    // The services table renders an edit affordance per row (icon button). Open the modal for sonarr.
    fireEvent.click(screen.getByRole("button", { name: /Edit Sonarr|Edit/i }));
    expect(await screen.findByText("Edit Sonarr")).toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue("3.0"), { target: { value: "4.0" } });
    fireEvent.click(screen.getByRole("button", { name: /Save changes/ }));

    await waitFor(() => expect(actions.upsertService).toHaveBeenCalledTimes(1));
    const payload = actions.upsertService.mock.calls[0][0];
    // Edit mode keeps the existing id (no duplicate-guard check) and carries the edited version.
    expect(payload).toMatchObject({ id: "sonarr", name: "Sonarr", version: "4.0" });
    expect(actions.serviceExists).not.toHaveBeenCalled();
  });
});

describe("Admin — delete flow", () => {
  it("removes the service via deleteService and refreshes", async () => {
    seedData([mkSvc()]);
    render(<Admin />);
    fireEvent.click(screen.getByRole("button", { name: /Edit Sonarr|Edit/i }));
    await screen.findByText("Edit Sonarr");

    fireEvent.click(screen.getByRole("button", { name: /Remove/ }));
    await waitFor(() => expect(actions.deleteService).toHaveBeenCalledWith("sonarr"));
    expect(refresh).toHaveBeenCalled();
  });
});

describe("Admin — save-and-test flow (add mode)", () => {
  it("auto-saves on Test, then tests the stored connection by id", async () => {
    actions.testStoredConnection.mockResolvedValue("9.9.9");
    seedData([]);
    render(<Admin />);
    fireEvent.click(screen.getByRole("button", { name: /Add service/ }));
    fillAddForm("Grafana", "grafana.lan");
    // A typed key is required to enable the Test button in add mode.
    fireEvent.change(screen.getByPlaceholderText("paste service API key"), { target: { value: "k" } });

    fireEvent.click(screen.getByTitle("Save and test connection"));

    // onSaveAndTest → persistService (upsert) → testStoredConnection(id).
    await waitFor(() => expect(actions.upsertService).toHaveBeenCalled());
    await waitFor(() => expect(actions.testStoredConnection).toHaveBeenCalledWith("grafana"));
    expect(await screen.findByText(/Connected · v9.9.9/)).toBeInTheDocument();

    // A subsequent save of the same nascent id is treated as an idempotent update, not a clash:
    // serviceExists may be consulted but the duplicate guard must not block (lastAutoSavedId).
    actions.serviceExists.mockResolvedValue(true);
    const addButtons = screen.getAllByRole("button", { name: /Add service/ });
    fireEvent.click(addButtons[addButtons.length - 1]);
    await waitFor(() => expect(actions.upsertService).toHaveBeenCalledTimes(2));
  });
});
