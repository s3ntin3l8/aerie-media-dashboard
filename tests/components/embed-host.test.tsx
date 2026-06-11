import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";

// Controllable pathname + query (hoisted so the vi.mock factory can read them).
const nav = vi.hoisted(() => ({ path: "/s/sonarr", search: "" }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.path,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.search),
}));

vi.mock("@/components/portal/DataProvider", () => ({ useData: vi.fn() }));
// Stub ServiceView so we can assert mount/visibility + the deep-link prop without the iframe tree.
vi.mock("@/components/views/Launcher", () => ({
  ServiceView: ({ s, deepPath }: { s: { id: string }; deepPath?: string }) => (
    <div data-testid={`sv-${s.id}`} data-deep={deepPath ?? ""}>{s.id}</div>
  ),
}));

import { useData } from "@/components/portal/DataProvider";
import { EmbedHost } from "@/components/portal/EmbedHost";

const svc = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  name: id,
  cat: "automation",
  icon: "dns",
  host: `${id}.test`,
  scheme: "https",
  embeddable: true,
  active: true,
  keepAlive: true,
  version: "1",
  status: "up",
  uptime: 100,
  ms: 1,
  beats: [],
  note: "",
  ...over,
});

const setData = (services: unknown[]) =>
  vi.mocked(useData).mockReturnValue({ services } as never);

describe("EmbedHost", () => {
  beforeEach(() => {
    nav.path = "/s/sonarr";
    nav.search = "";
    vi.mocked(useData).mockReset();
  });

  it("mounts only the active keep-alive embed and ignores non-keep-alive services", () => {
    setData([svc("sonarr"), svc("radarr"), svc("plex", { keepAlive: false })]);
    const { container } = render(<EmbedHost />);

    expect(screen.getByTestId("sv-sonarr")).toBeInTheDocument();
    expect(screen.queryByTestId("sv-radarr")).not.toBeInTheDocument(); // not opened yet
    expect(screen.queryByTestId("sv-plex")).not.toBeInTheDocument(); // not keep-alive

    expect(container.firstChild).toHaveStyle({ display: "block" }); // layer visible
    expect(screen.getByTestId("sv-sonarr").parentElement).toHaveStyle({ display: "flex" });
  });

  it("keeps the previous embed mounted but hidden when navigating to another", async () => {
    setData([svc("sonarr"), svc("radarr")]);
    const { rerender } = render(<EmbedHost />);

    nav.path = "/s/radarr";
    rerender(<EmbedHost />);

    await waitFor(() => expect(screen.getByTestId("sv-radarr")).toBeInTheDocument());
    // sonarr stays in the DOM (state preserved) — only its visibility flips.
    expect(screen.getByTestId("sv-sonarr")).toBeInTheDocument();
    expect(screen.getByTestId("sv-sonarr").parentElement).toHaveStyle({ display: "none" });
    expect(screen.getByTestId("sv-radarr").parentElement).toHaveStyle({ display: "flex" });
  });

  it("hides the whole layer off a kept route while keeping iframes mounted", async () => {
    setData([svc("sonarr")]);
    const { rerender, container } = render(<EmbedHost />);

    nav.path = "/";
    rerender(<EmbedHost />);

    await waitFor(() => expect(container.firstChild).toHaveStyle({ display: "none" }));
    expect(screen.getByTestId("sv-sonarr")).toBeInTheDocument(); // kept alive
  });

  it("forwards the ?at deep path to the active embed only", async () => {
    setData([svc("sonarr"), svc("radarr")]);
    nav.search = "at=/series/the-show";
    const { rerender } = render(<EmbedHost />);
    expect(screen.getByTestId("sv-sonarr")).toHaveAttribute("data-deep", "/series/the-show");

    // Open radarr (different deep path); the now-inactive sonarr must not keep receiving it.
    nav.path = "/s/radarr";
    nav.search = "at=/movie/dune";
    rerender(<EmbedHost />);
    await waitFor(() => expect(screen.getByTestId("sv-radarr")).toBeInTheDocument());
    expect(screen.getByTestId("sv-radarr")).toHaveAttribute("data-deep", "/movie/dune");
    expect(screen.getByTestId("sv-sonarr")).toHaveAttribute("data-deep", "");
  });

  it("passes no deep path when ?at is absent", () => {
    setData([svc("sonarr")]);
    render(<EmbedHost />);
    expect(screen.getByTestId("sv-sonarr")).toHaveAttribute("data-deep", "");
  });

  it("prunes an embed when its keep-alive flag is turned off", async () => {
    setData([svc("sonarr"), svc("radarr")]);
    const { rerender } = render(<EmbedHost />);

    nav.path = "/s/radarr";
    rerender(<EmbedHost />);
    await waitFor(() => expect(screen.getByTestId("sv-radarr")).toBeInTheDocument());

    // Admin turns keep-alive off for radarr; navigate home.
    setData([svc("sonarr"), svc("radarr", { keepAlive: false })]);
    nav.path = "/";
    rerender(<EmbedHost />);

    await waitFor(() => expect(screen.queryByTestId("sv-radarr")).not.toBeInTheDocument());
    expect(screen.getByTestId("sv-sonarr")).toBeInTheDocument();
  });
});
