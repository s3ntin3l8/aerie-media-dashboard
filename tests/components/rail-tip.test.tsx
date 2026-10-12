import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { RailTip } from "@/components/primitives";

// Tooltips are hover affordances: a touch tap must not leave one stuck over the page.
describe("RailTip", () => {
  it("shows on mouse hover and hides on leave", () => {
    render(<RailTip label="Dashboard"><button>x</button></RailTip>);
    const wrap = screen.getByText("x").parentElement!;
    fireEvent.pointerEnter(wrap, { pointerType: "mouse" });
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    fireEvent.pointerLeave(wrap, { pointerType: "mouse" });
    expect(screen.queryByText("Dashboard")).toBeNull();
  });

  it("does not show for touch pointers", () => {
    render(<RailTip label="Dashboard"><button>x</button></RailTip>);
    fireEvent.pointerEnter(screen.getByText("x").parentElement!, { pointerType: "touch" });
    expect(screen.queryByText("Dashboard")).toBeNull();
  });
});
