import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

// The login server actions are mocked so we can assert they're invoked with the
// right FormData (the view drives them via React's useActionState).
import type { LoginState } from "@/app/login/actions";

const signInWithPassword = vi.fn(async (_prev: LoginState, _fd: FormData): Promise<LoginState> => ({}));
const createInitialAdmin = vi.fn(async (_prev: LoginState, _fd: FormData): Promise<LoginState> => ({}));

vi.mock("@/app/login/actions", () => ({
  signInWithPassword: (prev: LoginState, fd: FormData) => signInWithPassword(prev, fd),
  createInitialAdmin: (prev: LoginState, fd: FormData) => createInitialAdmin(prev, fd),
}));

import { Login } from "@/components/views/Login";

const baseProps = {
  providerName: "Authentik",
  providerIcon: "shield",
  signInWithPassword,
  createInitialAdmin,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Login — OIDC mode", () => {
  it("renders the provider sign-in button and SSO copy, no credential fields", () => {
    const oidcSignIn = vi.fn(async () => {});
    render(<Login {...baseProps} mode="oidc" oidcSignIn={oidcSignIn} />);

    expect(screen.getByRole("button", { name: /Continue with Authentik/i })).toBeInTheDocument();
    expect(screen.getByText(/managed through single sign-on/i)).toBeInTheDocument();
    // No email/password form in OIDC mode.
    expect(screen.queryByRole("button", { name: /^Sign in$/i })).toBeNull();
  });

  it("invokes the oidcSignIn action and swaps to a redirecting state on submit", async () => {
    const oidcSignIn = vi.fn(async () => {});
    render(<Login {...baseProps} mode="oidc" oidcSignIn={oidcSignIn} />);

    fireEvent.click(screen.getByRole("button", { name: /Continue with Authentik/i }));

    await waitFor(() => expect(oidcSignIn).toHaveBeenCalled());
    // The button label flips to the redirecting affordance and disables.
    expect(screen.getByText(/Redirecting/i)).toBeInTheDocument();
  });
});

describe("Login — credentials mode", () => {
  it("renders the email + password form", () => {
    render(<Login {...baseProps} mode="credentials" />);
    expect(screen.getByRole("button", { name: /Sign in/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Continue with/i })).toBeNull();
  });

  it("submits the entered email/password through signInWithPassword", async () => {
    const { container } = render(<Login {...baseProps} mode="credentials" />);

    fireEvent.change(container.querySelector('input[name="email"]')!, { target: { value: "ada@example.com" } });
    fireEvent.change(container.querySelector('input[name="password"]')!, { target: { value: "hunter2pw" } });

    fireEvent.click(screen.getByRole("button", { name: /Sign in/i }));

    await waitFor(() => expect(signInWithPassword).toHaveBeenCalled());
    // useActionState passes (prevState, formData) — grab the FormData arg.
    const fd = signInWithPassword.mock.calls[0][1];
    expect(fd.get("email")).toBe("ada@example.com");
    expect(fd.get("password")).toBe("hunter2pw");
  });

  it("surfaces the action error returned from a failed sign-in", async () => {
    signInWithPassword.mockResolvedValueOnce({ error: "Invalid email or password." });
    const { container } = render(<Login {...baseProps} mode="credentials" />);

    fireEvent.change(container.querySelector('input[name="email"]')!, { target: { value: "x@y.z" } });
    fireEvent.change(container.querySelector('input[name="password"]')!, { target: { value: "nope" } });
    fireEvent.click(screen.getByRole("button", { name: /Sign in/i }));

    expect(await screen.findByText("Invalid email or password.")).toBeInTheDocument();
  });
});

describe("Login — setup mode (first-run admin)", () => {
  it("renders the four-field admin creation form", () => {
    const { container } = render(<Login {...baseProps} mode="setup" />);
    expect(screen.getByRole("button", { name: /Create admin account/i })).toBeInTheDocument();
    expect(container.querySelector('input[name="name"]')).not.toBeNull();
    expect(container.querySelector('input[name="email"]')).not.toBeNull();
    expect(container.querySelector('input[name="password"]')).not.toBeNull();
    expect(container.querySelector('input[name="confirm"]')).not.toBeNull();
  });

  it("submits the new admin's details through createInitialAdmin", async () => {
    const { container } = render(<Login {...baseProps} mode="setup" />);

    fireEvent.change(container.querySelector('input[name="name"]')!, { target: { value: "Ada Admin" } });
    fireEvent.change(container.querySelector('input[name="email"]')!, { target: { value: "ada@example.com" } });
    fireEvent.change(container.querySelector('input[name="password"]')!, { target: { value: "supersecret" } });
    fireEvent.change(container.querySelector('input[name="confirm"]')!, { target: { value: "supersecret" } });

    fireEvent.click(screen.getByRole("button", { name: /Create admin account/i }));

    await waitFor(() => expect(createInitialAdmin).toHaveBeenCalled());
    expect(signInWithPassword).not.toHaveBeenCalled();
    const fd = createInitialAdmin.mock.calls[0][1];
    expect(fd.get("name")).toBe("Ada Admin");
    expect(fd.get("email")).toBe("ada@example.com");
    expect(fd.get("password")).toBe("supersecret");
    expect(fd.get("confirm")).toBe("supersecret");
  });

  it("surfaces the validation error returned by createInitialAdmin", async () => {
    createInitialAdmin.mockResolvedValueOnce({ error: "Passwords do not match." });
    const { container } = render(<Login {...baseProps} mode="setup" />);

    fireEvent.change(container.querySelector('input[name="name"]')!, { target: { value: "Ada" } });
    fireEvent.change(container.querySelector('input[name="email"]')!, { target: { value: "ada@example.com" } });
    fireEvent.change(container.querySelector('input[name="password"]')!, { target: { value: "supersecret" } });
    fireEvent.change(container.querySelector('input[name="confirm"]')!, { target: { value: "mismatch" } });
    fireEvent.click(screen.getByRole("button", { name: /Create admin account/i }));

    expect(await screen.findByText("Passwords do not match.")).toBeInTheDocument();
  });
});
