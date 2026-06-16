import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import ServiceWorkerRegister from "@/components/pwa/ServiceWorkerRegister";

const register = vi.fn();

const setServiceWorker = (value: unknown) =>
  Object.defineProperty(navigator, "serviceWorker", { value, configurable: true });

beforeEach(() => register.mockReset());
afterEach(() => {
  // Restore the "unsupported" default jsdom navigator between tests.
  Reflect.deleteProperty(navigator as unknown as Record<string, unknown>, "serviceWorker");
});

describe("ServiceWorkerRegister", () => {
  it("registers /sw.js when the API is available", () => {
    register.mockResolvedValue(undefined);
    setServiceWorker({ register });
    const { container } = render(<ServiceWorkerRegister />);
    expect(register).toHaveBeenCalledWith("/sw.js");
    expect(register).toHaveBeenCalledTimes(1);
    expect(container).toBeEmptyDOMElement(); // renders nothing
  });

  it("is a no-op when serviceWorker is unsupported", () => {
    // No serviceWorker on navigator → must not throw and must not register.
    expect(() => render(<ServiceWorkerRegister />)).not.toThrow();
    expect(register).not.toHaveBeenCalled();
  });

  it("attaches a rejection handler so a failed registration can't break the app", () => {
    // Hand back a fake thenable: asserting .catch is attached proves the failure
    // is swallowed, without creating a real rejected promise (which would surface
    // as an unhandled rejection regardless of the component's handling).
    const onCatch = vi.fn();
    register.mockReturnValue({ catch: onCatch });
    setServiceWorker({ register });
    expect(() => render(<ServiceWorkerRegister />)).not.toThrow();
    expect(register).toHaveBeenCalledWith("/sw.js");
    expect(onCatch).toHaveBeenCalledOnce();
  });
});
