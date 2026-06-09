import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

describe("password", () => {
  describe("hashPassword + verifyPassword", () => {
    it("verifies a correct password", () => {
      const hash = hashPassword("correct-horse-battery");
      expect(verifyPassword("correct-horse-battery", hash)).toBe(true);
    });

    it("rejects a wrong password", () => {
      const hash = hashPassword("correct-horse-battery");
      expect(verifyPassword("wrong-password", hash)).toBe(false);
    });

    it("produces different hashes for the same password (random salt)", () => {
      const a = hashPassword("same");
      const b = hashPassword("same");
      expect(a).not.toBe(b);
    });

    it("handles an empty string password", () => {
      const hash = hashPassword("");
      expect(verifyPassword("", hash)).toBe(true);
      expect(verifyPassword("x", hash)).toBe(false);
    });
  });

  describe("verifyPassword edge cases", () => {
    it("returns false for a malformed stored hash (wrong prefix)", () => {
      expect(verifyPassword("test", "bcrypt$abc$def")).toBe(false);
    });

    it("returns false for a malformed stored hash (missing parts)", () => {
      expect(verifyPassword("test", "scrypt$onlyonepart")).toBe(false);
    });

    it("returns false for a malformed stored hash (empty string)", () => {
      expect(verifyPassword("test", "")).toBe(false);
    });

    it("returns false for a hash with a slightly different salt (wrong password)", () => {
      const hash = hashPassword("password");
      const parts = hash.split("$");
      const salt = Buffer.from(parts[1], "base64");
      const flipped = Buffer.from(salt);
      flipped[0] ^= 0xff;
      const tampered = `scrypt$${flipped.toString("base64")}$${parts[2]}`;
      expect(verifyPassword("password", tampered)).toBe(false);
    });
  });
});