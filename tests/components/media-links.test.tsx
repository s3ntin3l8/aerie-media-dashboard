import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { MediaLinks } from "@/components/modals/MediaLinks";
import type { MediaLink } from "@/lib/media/links";

const embed: MediaLink = { svc: "radarr", label: "Open in Radarr", icon: "open_in_new", role: "service", kind: "embed", deepPath: "/movie/dune" };
const external: MediaLink = { svc: "plex", label: "Watch on Plex", icon: "play_arrow", role: "watch", kind: "external", href: "https://app.plex.tv/x" };

describe("MediaLinks", () => {
  it("renders nothing when there are no links", () => {
    const { container } = render(<MediaLinks links={[]} onOpenService={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("calls onOpenService with (svc, deepPath) for an embed link", () => {
    const onOpenService = vi.fn();
    render(<MediaLinks links={[embed]} onOpenService={onOpenService} />);
    fireEvent.click(screen.getByRole("button", { name: /Open in Radarr/i }));
    expect(onOpenService).toHaveBeenCalledWith("radarr", "/movie/dune");
  });

  it("renders an external link as a new-tab anchor", () => {
    render(<MediaLinks links={[external]} onOpenService={vi.fn()} />);
    const a = screen.getByRole("link", { name: /Watch on Plex/i });
    expect(a).toHaveAttribute("href", "https://app.plex.tv/x");
    expect(a).toHaveAttribute("target", "_blank");
  });

  it("stops propagation so it doesn't trigger a clickable parent card", () => {
    const onOpenService = vi.fn();
    const parentClick = vi.fn();
    render(
      <div onClick={parentClick}>
        <MediaLinks links={[embed]} onOpenService={onOpenService} />
      </div>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Open in Radarr/i }));
    expect(onOpenService).toHaveBeenCalledTimes(1);
    expect(parentClick).not.toHaveBeenCalled();
  });
});
