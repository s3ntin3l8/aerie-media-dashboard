import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import React from "react";

import GlobalError from "@/app/global-error";
import PortalError from "@/app/(portal)/error";
import PortalNotFound from "@/app/(portal)/not-found";

// ── GlobalError ───────────────────────────────────────────────────────────────

describe("GlobalError", () => {
  it("renders the error message", () => {
    render(<GlobalError error={new Error("boom")} reset={vi.fn()} />);
    expect(screen.getByText(/Something went wrong/)).toBeInTheDocument();
  });

  it("renders the digest when present", () => {
    const err = Object.assign(new Error("boom"), { digest: "abc123" });
    render(<GlobalError error={err} reset={vi.fn()} />);
    expect(screen.getByText(/abc123/)).toBeInTheDocument();
  });

  it("does not render a digest span when digest is absent", () => {
    render(<GlobalError error={new Error("boom")} reset={vi.fn()} />);
    expect(screen.queryByText(/\(.*\)/)).not.toBeInTheDocument();
  });

  it("calls reset when Try again is clicked", () => {
    const reset = vi.fn();
    render(<GlobalError error={new Error("boom")} reset={reset} />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledTimes(1);
  });
});

// ── PortalError ───────────────────────────────────────────────────────────────

describe("PortalError", () => {
  it("renders the error message", () => {
    render(<PortalError error={new Error("boom")} reset={vi.fn()} />);
    expect(screen.getByText(/Something went wrong/)).toBeInTheDocument();
  });

  it("renders the digest when present", () => {
    const err = Object.assign(new Error("boom"), { digest: "xyz789" });
    render(<PortalError error={err} reset={vi.fn()} />);
    expect(screen.getByText(/xyz789/)).toBeInTheDocument();
  });

  it("calls reset when Try again is clicked", () => {
    const reset = vi.fn();
    render(<PortalError error={new Error("boom")} reset={reset} />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledTimes(1);
  });
});

// ── PortalNotFound ────────────────────────────────────────────────────────────

describe("PortalNotFound", () => {
  it("renders the not-found message", () => {
    render(<PortalNotFound />);
    expect(screen.getByText("Page not found.")).toBeInTheDocument();
  });

  it("renders a Go home link pointing to /", () => {
    render(<PortalNotFound />);
    const link = screen.getByRole("link", { name: "Go home" });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/");
  });
});
