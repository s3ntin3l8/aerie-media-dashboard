// ============================================================
// AERIE — AES-256-GCM at-rest encryption for service secrets
// ============================================================
import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";
import { env } from "@/lib/env";

const ALGO = "aes-256-gcm";

function key(): Buffer {
  const k = env.encryptionKey;
  // Dev fallback (insecure) so the app runs without ENCRYPTION_KEY configured.
  if (!k) return createHash("sha256").update("aerie-dev-insecure-key").digest();
  if (/^[0-9a-fA-F]{64}$/.test(k)) return Buffer.from(k, "hex");
  const b64 = Buffer.from(k, "base64");
  if (b64.length === 32) return b64;
  // Any other string → stretch to 32 bytes deterministically.
  return createHash("sha256").update(k).digest();
}

export interface Encrypted {
  iv: string;
  authTag: string;
  ciphertext: string;
}

export function encrypt(plain: string): Encrypted {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return {
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    ciphertext: ct.toString("base64"),
  };
}

export function decrypt(enc: Encrypted): string {
  const decipher = createDecipheriv(ALGO, key(), Buffer.from(enc.iv, "base64"));
  decipher.setAuthTag(Buffer.from(enc.authTag, "base64"));
  const pt = Buffer.concat([decipher.update(Buffer.from(enc.ciphertext, "base64")), decipher.final()]);
  return pt.toString("utf8");
}

/** True when a real ENCRYPTION_KEY is configured (not the dev fallback). */
export const encryptionConfigured = Boolean(env.encryptionKey);
