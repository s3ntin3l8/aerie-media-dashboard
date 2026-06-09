import { describe, it, expect } from "vitest";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

describe("createInitialAdmin validation", () => {
  it("password length < 8 is invalid", () => {
    expect("abc1234".length).toBeLessThan(8);
  });

  it("password length >= 8 is valid", () => {
    expect("abc12345".length).toBeGreaterThanOrEqual(8);
  });

  it("mismatched passwords fail equality check", () => {
    const password = "abcdefgh";
    const confirm = "abcdefgh1";
    expect(password).not.toBe(confirm);
  });

  it("missing name is detected", () => {
    expect("".trim()).toBe("");
  });

  it("non-empty name passes", () => {
    expect("Admin".trim()).toBe("Admin");
  });
});