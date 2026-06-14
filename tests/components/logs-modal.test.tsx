import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

// ModalShell (which LogsModal wraps) reads usePortal().setModalOpen to own the keyboard while open.
vi.mock("@/components/portal/PortalProvider", () => ({
  usePortal: () => ({ setModalOpen: vi.fn() }),
}));

import { LogsModal } from "@/components/modals/LogsModal";
import type { LokiLine } from "@/lib/types";

const line = (over: Partial<LokiLine> = {}): LokiLine => ({
  ts: new Date(1700000000000).toISOString(),
  tsNs: "1700000000000000000",
  line: "hello world",
  ...over,
});

const origFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = origFetch; vi.restoreAllMocks(); });
beforeEach(() => vi.clearAllMocks());

describe("LogsModal", () => {
  it("fetches the service tail on open and renders the lines", async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, json: async () => [line({ line: "boot ok" }), line({ line: "ERROR boom", level: "error" })] });
    globalThis.fetch = f as never;

    render(<LogsModal open serviceId="sonarr" serviceName="Sonarr" onClose={vi.fn()} />);

    expect(screen.getByText("Logs · Sonarr")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("boot ok")).toBeInTheDocument());
    expect(screen.getByText("ERROR boom")).toBeInTheDocument();
    // The request hits the admin logs route, scoped to this service.
    expect(f).toHaveBeenCalledWith(expect.stringContaining("/api/loki/logs?serviceId=sonarr"), expect.anything());
  });

  it("shows an empty state when the tail is empty", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] }) as never;
    render(<LogsModal open serviceId="radarr" serviceName="Radarr" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/No log lines/i)).toBeInTheDocument());
  });

  it("shows an error state when the request fails", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 }) as never;
    render(<LogsModal open serviceId="sonarr" serviceName="Sonarr" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/Could not load logs/i)).toBeInTheDocument());
  });

  it("re-queries when the Refresh button is clicked", async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, json: async () => [line()] });
    globalThis.fetch = f as never;
    render(<LogsModal open serviceId="sonarr" serviceName="Sonarr" onClose={vi.fn()} />);
    await waitFor(() => expect(f).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByTitle("Refresh logs"));
    await waitFor(() => expect(f).toHaveBeenCalledTimes(2));
  });
});
