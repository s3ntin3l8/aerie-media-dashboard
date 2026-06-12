import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

// ArrDetailSection imports a server action at module load — mock it (the pure
// arrBadges/ArrQuality exports under test don't use it).
vi.mock("@/app/(portal)/requests/actions", () => ({ getMediaDetail: vi.fn().mockResolvedValue({}) }));
// It also imports SectionLabel from ModalShell, which pulls in PortalProvider
// (→ next-auth) — mock the provider to keep this a pure component test.
vi.mock("@/components/portal/PortalProvider", () => ({ usePortal: () => ({ setModalOpen: vi.fn() }) }));

import { arrBadges, ArrQuality } from "@/components/modals/ArrDetailSection";

describe("arrBadges", () => {
  it("renders Downloaded + Monitored pills and the studio", () => {
    render(<div>{arrBadges({ hasFile: true, monitored: true, studio: "HBO" })}</div>);
    expect(screen.getByText("Downloaded")).toBeInTheDocument();
    expect(screen.getByText("Monitored")).toBeInTheDocument();
    expect(screen.getByText("HBO")).toBeInTheDocument();
  });

  it("shows Unmonitored when monitored is false", () => {
    render(<div>{arrBadges({ monitored: false })}</div>);
    expect(screen.getByText("Unmonitored")).toBeInTheDocument();
  });

  it("returns null when there's nothing to show", () => {
    expect(arrBadges({})).toBeNull();
    expect(arrBadges(null)).toBeNull();
  });
});

describe("ArrQuality", () => {
  const seasons = [
    { season: 1, label: "1080p WEB-DL", episodeCount: 8, sizeBytes: 8e9 },
    { season: 2, label: "720p HDTV", episodeCount: 10 },
  ];

  it("renders nothing when not available, even with downloaded seasons", () => {
    const { container } = render(<ArrQuality kind="series" available={false} detail={{ seasons }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the movie file quality when available", () => {
    render(<ArrQuality kind="movie" available detail={{ fileInfo: { label: "2160p Blu-ray", sizeBytes: 8e9 } }} />);
    expect(screen.getByText("Available quality")).toBeInTheDocument();
    expect(screen.getByText("2160p Blu-ray")).toBeInTheDocument();
  });

  it("renders a card per season for a series when available", () => {
    render(<ArrQuality kind="series" available detail={{ seasons }} />);
    expect(screen.getByText("Season 1")).toBeInTheDocument();
    expect(screen.getByText("Season 2")).toBeInTheDocument();
    expect(screen.getByText("1080p WEB-DL")).toBeInTheDocument();
  });

  it("renders nothing when there's no downloaded quality", () => {
    const { container } = render(<ArrQuality kind="movie" available detail={{}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
