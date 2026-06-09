import { describe, it, expect } from "vitest";
import {
  EMAIL_RE,
  validateName,
  validateEmail,
  validatePassword,
  validatePasswordConfirm,
} from "@/lib/auth/validation";

describe("EMAIL_RE", () => {
  it("matches valid emails", () => {
    expect(EMAIL_RE.test("user@example.com")).toBe(true);
    expect(EMAIL_RE.test("user.name@example.co")).toBe(true);
    expect(EMAIL_RE.test("u@d.io")).toBe(true);
  });

  it("rejects emails without @", () => {
    expect(EMAIL_RE.test("userexample.com")).toBe(false);
  });

  it("rejects emails without domain", () => {
    expect(EMAIL_RE.test("user@")).toBe(false);
  });

  it("rejects emails without TLD", () => {
    expect(EMAIL_RE.test("user@example")).toBe(false);
  });

  it("rejects emails with spaces", () => {
    expect(EMAIL_RE.test("user @example.com")).toBe(false);
    expect(EMAIL_RE.test("user@ example.com")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(EMAIL_RE.test("")).toBe(false);
  });

  it("accepts emails with + subaddressing", () => {
    expect(EMAIL_RE.test("user+tag@example.com")).toBe(true);
  });

  it("rejects double @", () => {
    expect(EMAIL_RE.test("user@@example.com")).toBe(false);
  });
});

describe("validateName", () => {
  it("rejects empty string", () => {
    expect(validateName("")).toEqual({ ok: false, error: "Enter a display name." });
  });

  it("rejects whitespace-only string", () => {
    expect(validateName("   ")).toEqual({ ok: false, error: "Enter a display name." });
  });

  it("accepts a non-empty name", () => {
    expect(validateName("Admin")).toEqual({ ok: true });
  });
});

describe("validateEmail", () => {
  it("rejects empty string", () => {
    expect(validateEmail("")).toEqual({ ok: false, error: "Enter a valid email address." });
  });

  it("rejects malformed email", () => {
    expect(validateEmail("not-an-email")).toEqual({ ok: false, error: "Enter a valid email address." });
  });

  it("accepts a well-formed email", () => {
    expect(validateEmail("admin@example.com")).toEqual({ ok: true });
  });
});

describe("validatePassword", () => {
  it("rejects passwords shorter than 8 chars", () => {
    expect(validatePassword("abc1234")).toEqual({ ok: false, error: "Password must be at least 8 characters." });
  });

  it("accepts passwords of exactly 8 chars", () => {
    expect(validatePassword("abcdefgh")).toEqual({ ok: true });
  });

  it("accepts passwords longer than 8 chars", () => {
    expect(validatePassword("a-much-longer-password")).toEqual({ ok: true });
  });
});

describe("validatePasswordConfirm", () => {
  it("rejects mismatched passwords", () => {
    expect(validatePasswordConfirm("abcdefgh", "abcdefgh1")).toEqual({
      ok: false,
      error: "Passwords do not match.",
    });
  });

  it("accepts matching passwords", () => {
    expect(validatePasswordConfirm("abcdefgh", "abcdefgh")).toEqual({ ok: true });
  });

  it("accepts two empty strings as matching", () => {
    expect(validatePasswordConfirm("", "")).toEqual({ ok: true });
  });
});
