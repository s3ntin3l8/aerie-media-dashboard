import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import { Sparkline } from "@/components/primitives";

const data = [3, 1, 4, 1, 5, 9, 2, 6];

describe("Sparkline", () => {
  it("renders a fixed-pixel SVG by default", () => {
    const { container } = render(<Sparkline data={data} w={260} h={40} />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("width")).toBe("260");
    expect(svg.getAttribute("height")).toBe("40");
    // No viewBox / fluid scaling in the default (fixed) mode.
    expect(svg.getAttribute("viewBox")).toBeNull();
    expect(svg.getAttribute("preserveAspectRatio")).toBeNull();
    expect(container.querySelector("path[vector-effect]")).toBeNull();
  });

  it("fills its container width when fluid, keeping the w×h geometry as the viewBox", () => {
    const { container } = render(<Sparkline data={data} w={260} h={40} fluid />);
    const svg = container.querySelector("svg")!;
    // Width is now responsive (100%) rather than a fixed 260px cap.
    expect(svg.getAttribute("width")).toBe("100%");
    expect(svg.getAttribute("height")).toBe("40");
    expect(svg.getAttribute("viewBox")).toBe("0 0 260 40");
    expect(svg.getAttribute("preserveAspectRatio")).toBe("none");
    // The stroke stays crisp under the horizontal stretch.
    expect(container.querySelector('path[vector-effect="non-scaling-stroke"]')).not.toBeNull();
  });

  it.each([
    ["no data", []],
    ["a single point", [5]],
  ])("draws no path for %s instead of an invalid one", (_label, series) => {
    const { container } = render(<Sparkline data={series} w={260} h={40} />);
    const ds = [...container.querySelectorAll("path")].map((p) => p.getAttribute("d"));
    // Nothing is drawn: an empty `d` is valid SVG, but a path with no moveto ("L260 40 L0 40 Z")
    // or NaN is not. Whether the empty <path> elements render at all is left open.
    expect(ds.every((d) => d === "")).toBe(true);
  });

  it("still draws a moveto-led path for two or more points", () => {
    const { container } = render(<Sparkline data={[1, 2]} w={260} h={40} />);
    for (const p of container.querySelectorAll("path")) expect(p.getAttribute("d")).toMatch(/^M/);
  });
});
