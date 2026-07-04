import { describe, it, expect } from "vitest";
import { computeSecureCookies } from "@/lib/env";

// computeSecureCookies pins Auth.js Secure-prefixed cookies to production only, so prod fails safe
// even if the reverse proxy stops forwarding X-Forwarded-Proto, while dev/HTTP keeps plain cookies.
describe("computeSecureCookies", () => {
  it("forces secure cookies in production", () => {
    expect(computeSecureCookies("production")).toBe(true);
  });

  it("keeps plain cookies in development and test", () => {
    expect(computeSecureCookies("development")).toBe(false);
    expect(computeSecureCookies("test")).toBe(false);
  });

  it("defaults to plain cookies when NODE_ENV is unset", () => {
    expect(computeSecureCookies(undefined)).toBe(false);
  });
});
