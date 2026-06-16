import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import type { MediaRequest } from "@/lib/types";

// The opt-in onEdit/onCancel footer added for the mobile request sheet. Desktop omits the props
// (so its modal is unchanged); mobile passes them and the owner/admin gets Edit + Cancel.

vi.mock("@/components/portal/DataProvider", () => ({
  useData: () => ({ users: [{ id: "u1", name: "Me" }], services: [] }),
  useRefresh: () => vi.fn(),
}));
vi.mock("@/components/portal/PortalProvider", () => ({
  usePortal: () => ({ user: { id: "u1" }, role: "user", setModalOpen: vi.fn() }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/app/(portal)/requests/actions", () => ({
  getQualityProfiles: vi.fn().mockResolvedValue([]),
  getMediaDetail: vi.fn().mockResolvedValue({}),
}));

import { RequestModal } from "@/components/modals/RequestModal";

const request = (over: Partial<MediaRequest> = {}): MediaRequest => ({
  id: "os-1", title: "Dune", kind: "movie", year: 2021, user: "u1", portalUser: "u1",
  status: "pending", requested: "1 Jan", overview: "Spice.", ...over,
});

const noop = vi.fn();

describe("RequestModal — opt-in Edit/Cancel", () => {
  it("shows Edit + Cancel for the owner on a pending request and fires the callbacks", () => {
    const onEdit = vi.fn();
    const onCancel = vi.fn();
    render(<RequestModal open mode="detail" request={request()} onClose={noop} onSubmit={noop} onAct={noop} onEdit={onEdit} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: /Edit/ }));
    expect(onEdit).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Cancel request/ }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("hides Edit (not Cancel) once the request is approved", () => {
    render(<RequestModal open mode="detail" request={request({ status: "approved" })} onClose={noop} onSubmit={noop} onAct={noop} onEdit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Edit/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cancel request/ })).toBeInTheDocument();
  });

  it("shows neither for a non-owner member", () => {
    render(<RequestModal open mode="detail" request={request({ portalUser: "someone-else" })} onClose={noop} onSubmit={noop} onAct={noop} onEdit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Edit/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Cancel request/ })).not.toBeInTheDocument();
  });

  it("does not add the actions when the props are omitted (desktop)", () => {
    render(<RequestModal open mode="detail" request={request()} onClose={noop} onSubmit={noop} onAct={noop} />);
    expect(screen.queryByRole("button", { name: /Cancel request/ })).not.toBeInTheDocument();
  });
});
