import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import React from "react";

const SimpleComponent = () => <div>Hello Test</div>;

describe("SimpleComponent", () => {
  it("renders correctly", () => {
    render(<SimpleComponent />);
    expect(screen.getByText("Hello Test")).toBeInTheDocument();
  });
});