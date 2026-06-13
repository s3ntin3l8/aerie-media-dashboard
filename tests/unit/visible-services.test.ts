/* eslint-disable react-hooks/rules-of-hooks --
   useVisibleServices has no useState/useEffect; it only reads useData()/usePortal() (both stubbed
   here) and filters. Calling it directly in node tests is intentional and safe. */
import { describe, it, expect, vi, beforeEach } from "vitest";

// useVisibleServices reads useData()/usePortal() and filters with the real isVisible matrix.
// The hook has no useState/useEffect, so with the two context hooks stubbed it can be called
// directly to exercise every mode × role branch without rendering.
vi.mock("@/components/portal/DataProvider", () => ({ useData: vi.fn() }));
vi.mock("@/components/portal/PortalProvider", () => ({ usePortal: vi.fn() }));

import { useData } from "@/components/portal/DataProvider";
import { usePortal } from "@/components/portal/PortalProvider";
import { useVisibleServices } from "@/components/hooks/useVisibleServices";
import type { Category } from "@/lib/types";

const svc = (id: string, cat: Category) => ({ id, cat });
const SERVICES = [
  svc("plex", "stream"),
  svc("overseerr", "request"),
  svc("sonarr", "automation"),
  svc("gatus", "monitor"),
  svc("prometheus", "infra"),
  svc("beszel", "infra"),
];

const setup = (role: "admin" | "user", visibility: { serviceId: string; groupName: string; visible: boolean }[] = []) => {
  vi.mocked(useData).mockReturnValue({ services: SERVICES as never, visibility } as never);
  vi.mocked(usePortal).mockReturnValue({ role } as never);
};

const ids = (mode: Parameters<typeof useVisibleServices>[0]) => useVisibleServices(mode).map((s) => s.id);

beforeEach(() => vi.clearAllMocks());

describe("useVisibleServices", () => {
  it("admins see every service in launcher and status modes", () => {
    setup("admin");
    expect(ids("launcher")).toEqual(SERVICES.map((s) => s.id));
    expect(ids("status")).toEqual(SERVICES.map((s) => s.id));
  });

  it("launcher (non-admin) drops infra, the metrics-only ids, and category-hidden services", () => {
    setup("user");
    // stream/request are member-visible by default; automation/monitor/infra are not.
    expect(ids("launcher")).toEqual(["plex", "overseerr"]);
  });

  it("status (non-admin) excludes infra; monitor still needs a share, then it shows", () => {
    setup("user");
    // monitor (gatus) is admin-only by default, like automation — and infra is always excluded.
    expect(ids("status")).toEqual(["plex", "overseerr"]);

    // share gatus explicitly → it appears in status (a monitored service), but never via the
    // launcher id/infra exclusions for prometheus/beszel.
    setup("user", [{ serviceId: "gatus", groupName: "friends", visible: true }]);
    expect(ids("status")).toEqual(["plex", "overseerr", "gatus"]);
  });

  it("an explicit visibility rule overrides the category default (both directions)", () => {
    setup("user", [
      { serviceId: "sonarr", groupName: "friends", visible: true }, // share an automation service
      { serviceId: "plex", groupName: "friends", visible: false }, // hide a stream service
    ]);
    const launcher = ids("launcher");
    expect(launcher).toContain("sonarr");
    expect(launcher).not.toContain("plex");
  });

  it("bare mode applies only the visibility matrix (no category/infra filtering)", () => {
    setup("user", [{ serviceId: "prometheus", groupName: "friends", visible: true }]);
    const bare = ids("bare");
    // shared infra service shows; default-hidden automation/monitor/infra stay hidden
    expect(bare).toContain("prometheus");
    expect(bare).toContain("plex"); // stream default-visible
    expect(bare).not.toContain("sonarr");
  });
});
