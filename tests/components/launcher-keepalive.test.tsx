import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import React from "react";

// Only mock the data layer — NOT @/components/views/Launcher (we test its real ServiceViewById).
vi.mock("@/components/portal/DataProvider", () => ({ useData: vi.fn() }));
// The real PortalProvider imports @/app/(portal)/actions → next-auth → next/server, which doesn't
// resolve under jsdom. ServiceViewById's tested paths don't use usePortal, so stub it out.
vi.mock("@/components/portal/PortalProvider", () => ({
  usePortal: () => ({ favorites: [], toggleFavorite: vi.fn(), setModalOpen: vi.fn(), modalOpen: false, paletteOpen: false }),
}));
// Launcher → panels imports a server action; the real actions module pulls in lib/db/client
// (`import "server-only"`), unresolvable under jsdom. Stub it.
vi.mock("@/app/(portal)/admin/actions", () => ({ setQueueSource: vi.fn() }));

import { useData } from "@/components/portal/DataProvider";
import { ServiceViewById } from "@/components/views/Launcher";

describe("ServiceViewById — keep-alive deferral", () => {
  beforeEach(() => vi.mocked(useData).mockReset());

  it("renders nothing for a keep-alive embeddable service (EmbedHost owns it)", () => {
    vi.mocked(useData).mockReturnValue({
      services: [{ id: "sonarr", embeddable: true, keepAlive: true }],
    } as never);
    const { container } = render(<ServiceViewById serviceId="sonarr" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the not-found state for an unknown service id", () => {
    vi.mocked(useData).mockReturnValue({ services: [] } as never);
    const { container } = render(<ServiceViewById serviceId="nope" />);
    expect(container.textContent).toContain("Service not found");
  });
});
