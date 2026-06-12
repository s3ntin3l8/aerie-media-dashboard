import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { MediaDetailBody } from "@/components/modals/MediaDetailBody";

describe("MediaDetailBody — full variant", () => {
  it("renders title, meta row and rating", () => {
    render(
      <MediaDetailBody
        title="Dune: Part Two"
        kind="movie"
        showTitle
        meta={["Movie", "2024", "166 min"]}
        rating={8.3}
      />,
    );
    expect(screen.getByRole("heading", { name: "Dune: Part Two" })).toBeInTheDocument();
    expect(screen.getByText("Movie · 2024 · 166 min")).toBeInTheDocument();
    expect(screen.getByText("8.3")).toBeInTheDocument();
  });

  it("hides the in-body title when showTitle is false (title lives in the shell header)", () => {
    render(<MediaDetailBody title="Hidden" kind="series" showTitle={false} meta={["Series", "2022"]} />);
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.getByText("Series · 2022")).toBeInTheDocument();
  });

  it("caps genre chips at five", () => {
    render(
      <MediaDetailBody
        title="X"
        kind="movie"
        meta={["Movie", "2024"]}
        genres={["A", "B", "C", "D", "E", "F", "G"]}
      />,
    );
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("E")).toBeInTheDocument();
    expect(screen.queryByText("F")).not.toBeInTheDocument();
    expect(screen.queryByText("G")).not.toBeInTheDocument();
  });

  it("renders the overview when present, else the empty-state copy", () => {
    const { rerender } = render(
      <MediaDetailBody title="X" kind="movie" meta={["Movie"]} overview="A synopsis." emptyOverview="No synopsis available." />,
    );
    expect(screen.getByText("A synopsis.")).toBeInTheDocument();
    expect(screen.queryByText("No synopsis available.")).not.toBeInTheDocument();

    rerender(<MediaDetailBody title="X" kind="movie" meta={["Movie"]} emptyOverview="No synopsis available." />);
    expect(screen.getByText("No synopsis available.")).toBeInTheDocument();
  });

  it("renders the badges, releaseRows and links slots", () => {
    render(
      <MediaDetailBody
        title="X"
        kind="movie"
        meta={["Movie"]}
        badges={<span>Downloaded</span>}
        releaseRows={<div>In cinemas</div>}
        links={<a href="/x">Open</a>}
      />,
    );
    expect(screen.getByText("Downloaded")).toBeInTheDocument();
    expect(screen.getByText("In cinemas")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open" })).toBeInTheDocument();
  });
});

describe("MediaDetailBody — compact variant", () => {
  it("renders title and meta, places titleRight and footer, and omits the full-only overview block", () => {
    render(
      <MediaDetailBody
        title="The Bear"
        kind="series"
        variant="compact"
        meta={["Series", "2023"]}
        titleRight={<span>PENDING</span>}
        overview="Should not show in compact"
        footer={<button>Cancel</button>}
        links={<a href="/watch">Watch</a>}
      />,
    );
    expect(screen.getByText("The Bear")).toBeInTheDocument();
    expect(screen.getByText("Series · 2023")).toBeInTheDocument();
    expect(screen.getByText("PENDING")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Watch" })).toBeInTheDocument();
    // overview is a full-variant concept and must not render in the compact card
    expect(screen.queryByText("Should not show in compact")).not.toBeInTheDocument();
  });
});
