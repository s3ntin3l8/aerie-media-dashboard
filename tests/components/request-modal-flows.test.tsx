import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import type { DiscoverItem, MediaRequest } from "@/lib/types";

vi.mock("@/components/portal/DataProvider", () => ({
  useData: () => ({ users: [{ id: "u1", name: "Me" }], services: [] }),
  useRefresh: () => vi.fn(),
}));
vi.mock("@/components/portal/PortalProvider", () => ({
  usePortal: () => ({ user: { id: "u1" }, setModalOpen: vi.fn() }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/app/(portal)/requests/actions", () => ({
  getQualityProfiles: vi.fn().mockResolvedValue([]),
  getMediaDetail: vi.fn().mockResolvedValue({}),
}));

import { RequestModal } from "@/components/modals/RequestModal";

const movie = (state: DiscoverItem["state"] = null): DiscoverItem => ({
  id: "603", title: "Dune", kind: "movie", year: 2021, rating: 8, state, overview: "Spice.",
});
const series = (state: DiscoverItem["state"] = null): DiscoverItem => ({
  id: "1399", title: "Thrones", kind: "series", year: 2011, rating: 9, state, overview: "Dragons.", seasons: 3,
});

const request = (over: Partial<MediaRequest> = {}): MediaRequest => ({
  id: "os-1", title: "Dune", kind: "movie", year: 2021, user: "u1",
  status: "pending", requested: "1 Jan", overview: "Spice.", ...over,
});

const noop = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) }) as never;
});
afterEach(() => vi.unstubAllGlobals());

describe("RequestModal — submit flow", () => {
  it("submits a movie request and shows the success panel", async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: true, message: "ok" });
    render(<RequestModal open mode="request" initialPick={movie(null)} onClose={noop} onSubmit={onSubmit} onAct={noop} />);

    await screen.findByRole("heading", { name: "Request media" });
    fireEvent.click(screen.getByRole("button", { name: /Submit request/ }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const [pick, quality] = onSubmit.mock.calls[0];
    expect(pick.title).toBe("Dune");
    expect(quality).toBe("default");
    // Success panel offers "Request another".
    expect(await screen.findByRole("button", { name: /Request another/ })).toBeInTheDocument();
  });

  it("renders the failure panel with a Try again button when the submit returns not-ok", async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: false, message: "Overseerr down" });
    render(<RequestModal open mode="request" initialPick={movie(null)} onClose={noop} onSubmit={onSubmit} onAct={noop} />);

    await screen.findByRole("heading", { name: "Request media" });
    fireEvent.click(screen.getByRole("button", { name: /Submit request/ }));

    expect(await screen.findByRole("heading", { name: "Request failed" })).toBeInTheDocument();
    expect(screen.getByText(/Overseerr down/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Try again/ })).toBeInTheDocument();
  });

  it("treats a thrown submit error as a failure result", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error("boom"));
    render(<RequestModal open mode="request" initialPick={movie(null)} onClose={noop} onSubmit={onSubmit} onAct={noop} />);

    await screen.findByRole("heading", { name: "Request media" });
    fireEvent.click(screen.getByRole("button", { name: /Submit request/ }));

    expect(await screen.findByRole("heading", { name: "Request failed" })).toBeInTheDocument();
    expect(screen.getByText(/boom/)).toBeInTheDocument();
  });

  it("renders the quality-profile picker (Default + named profiles) in the confirm step", async () => {
    render(<RequestModal open mode="request" initialPick={movie(null)} onClose={noop} onSubmit={noop} onAct={noop} />);

    await screen.findByRole("heading", { name: "Request media" });
    // The confirm step always prepends "Default" plus the QUALITY_PROFILES fallback.
    expect(screen.getByText("Quality profile")).toBeInTheDocument();
    expect(screen.getAllByText("Default").length).toBeGreaterThan(0);
    expect(screen.getByText("1080p")).toBeInTheDocument();
    // Selecting a profile keeps the Submit button available.
    fireEvent.click(screen.getByText("1080p"));
    expect(screen.getByRole("button", { name: /Submit request/ })).toBeInTheDocument();
  });
});

describe("RequestModal — series seasons", () => {
  it("renders season toggles and blocks submit when none are selected", async () => {
    render(<RequestModal open mode="request" initialPick={series(null)} onClose={noop} onSubmit={noop} onAct={noop} />);

    await screen.findByRole("heading", { name: "Request media" });
    expect(screen.getByText("Season 1")).toBeInTheDocument();
    expect(screen.getByText("Season 2")).toBeInTheDocument();
    expect(screen.getByText("Season 3")).toBeInTheDocument();

    // All seasons pre-selected → submit enabled. Toggle them all off → disabled.
    const submit = screen.getByRole("button", { name: /Submit request/ });
    expect(submit).not.toBeDisabled();
    fireEvent.click(screen.getByText("Season 1"));
    fireEvent.click(screen.getByText("Season 2"));
    fireEvent.click(screen.getByText("Season 3"));
    expect(screen.getByRole("button", { name: /Submit request/ })).toBeDisabled();
  });

  it("preselects only the seasons passed via initialSelectedSeasons", async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: true });
    render(<RequestModal open mode="request" initialPick={series(null)} initialSelectedSeasons={[2]} onClose={noop} onSubmit={onSubmit} onAct={noop} />);

    await screen.findByRole("heading", { name: "Request media" });
    fireEvent.click(screen.getByRole("button", { name: /Submit request/ }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const [, , seasons] = onSubmit.mock.calls[0];
    expect(seasons).toMatchObject({ 2: true });
    expect(seasons[1]).toBeFalsy();
  });
});

describe("RequestModal — review actions", () => {
  it("approve calls onAct with the approve verdict and shows the approved panel", async () => {
    const onAct = vi.fn();
    render(<RequestModal open mode="review" request={request({ status: "pending", mediaOverseerrId: 42 })} onClose={noop} onSubmit={noop} onAct={onAct} />);

    await screen.findByRole("heading", { name: "Review request" });
    fireEvent.click(screen.getByRole("button", { name: /Approve/ }));

    expect(onAct).toHaveBeenCalledWith("os-1", "approve", undefined, 42);
    expect(await screen.findByRole("heading", { name: "Request approved" })).toBeInTheDocument();
  });

  it("decline passes the typed note to onAct", async () => {
    const onAct = vi.fn();
    render(<RequestModal open mode="review" request={request({ status: "pending" })} onClose={noop} onSubmit={noop} onAct={onAct} />);

    await screen.findByRole("heading", { name: "Review request" });
    const note = screen.getByPlaceholderText(/Add a comment visible in Overseerr/);
    fireEvent.change(note, { target: { value: "Not now" } });
    fireEvent.click(screen.getByRole("button", { name: /Decline/ }));

    expect(onAct).toHaveBeenCalledWith("os-1", "decline", "Not now", undefined);
    expect(await screen.findByRole("heading", { name: "Request declined" })).toBeInTheDocument();
  });
});

describe("RequestModal — closed", () => {
  it("renders no modal content when closed", () => {
    render(<RequestModal open={false} mode="request" initialPick={movie(null)} onClose={noop} onSubmit={noop} onAct={noop} />);
    expect(screen.queryByRole("heading", { name: "Request media" })).not.toBeInTheDocument();
  });
});
