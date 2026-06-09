import { describe, it, expect, vi, beforeEach } from "vitest";
import { encrypt, decrypt, encryptionConfigured, type Encrypted } from "@/lib/crypto";

describe("crypto", () => {
  beforeEach(() => {
    vi.stubEnv("ENCRYPTION_KEY", "0".repeat(64));
  });

  describe("encrypt + decrypt round-trip", () => {
    it("round-trips with a hex key", () => {
      const plain = "hello world";
      const enc = encrypt(plain);
      expect(decrypt(enc)).toBe(plain);
    });

    it("round-trips an empty string", () => {
      const enc = encrypt("");
      expect(decrypt(enc)).toBe("");
    });

    it("round-trips unicode / multibyte", () => {
      const plain = "Héllo Wörld 🌍";
      const enc = encrypt(plain);
      expect(decrypt(enc)).toBe(plain);
    });

    it("round-trips a long string", () => {
      const plain = "x".repeat(10_000);
      const enc = encrypt(plain);
      expect(decrypt(enc)).toBe(plain);
    });

    it("produces different ciphertexts for different plaintexts", () => {
      const a = encrypt("foo");
      const b = encrypt("bar");
      expect(a.ciphertext).not.toBe(b.ciphertext);
    });

    it("produces different IVs per call (same plaintext)", () => {
      const a = encrypt("same");
      const b = encrypt("same");
      expect(a.iv).not.toBe(b.iv);
    });
  });

  describe("key derivation", () => {
    it("works with a base64 key", () => {
      vi.stubEnv("ENCRYPTION_KEY", Buffer.alloc(32).toString("base64"));
      const plain = "base64-key-test";
      expect(decrypt(encrypt(plain))).toBe(plain);
    });

    it("works with an arbitrary string key (sha256-stretched)", () => {
      vi.stubEnv("ENCRYPTION_KEY", "my-arbitrary-password");
      const plain = "stretched-key-test";
      expect(decrypt(encrypt(plain))).toBe(plain);
    });

    it("works with the dev fallback key (no ENCRYPTION_KEY)", () => {
      vi.stubEnv("ENCRYPTION_KEY", "");
      const plain = "fallback-key-test";
      expect(decrypt(encrypt(plain))).toBe(plain);
    });
  });

  describe("tamper detection", () => {
    it("rejects a tampered authTag", () => {
      const enc = encrypt("secret");
      const tampered: Encrypted = { ...enc, authTag: enc.authTag.replace(/^./, "Z") };
      expect(() => decrypt(tampered)).toThrow();
    });

    it("rejects tampered ciphertext", () => {
      const enc = encrypt("secret");
      const tampered: Encrypted = { ...enc, ciphertext: enc.ciphertext.replace(/^./, "Z") };
      expect(() => decrypt(tampered)).toThrow();
    });

    it("rejects a tampered IV", () => {
      const enc = encrypt("secret");
      const tampered: Encrypted = { ...enc, iv: enc.iv.replace(/^./, "Z") };
      expect(() => decrypt(tampered)).toThrow();
    });
  });

  describe("encryptionConfigured", () => {
    it("is true when ENCRYPTION_KEY is set", () => {
      expect(encryptionConfigured).toBe(true);
    });
  });
});