import { vi, beforeAll, expect } from "vitest";

vi.mock("server-only", () => ({}));

// Importing `@/lib/crypto` here (not in a test file) means its
// `encryptionConfigured` constant is evaluated against the env vars that
// `server.env.ts` set, which loads earlier in the setupFiles array. This is
// the sanity check: if any future change pulls `@/lib/crypto` in earlier than
// `server.env.ts`, the assertion fails at setup time rather than producing
// silent test-state drift.
import { encryptionConfigured } from "@/lib/crypto";
expect(encryptionConfigured).toBe(true);

beforeAll(() => {
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-32-bytes-long!!");
  vi.stubEnv("ENCRYPTION_KEY", "0".repeat(64));
  vi.stubEnv("DATABASE_URL", "file::memory:");
  vi.stubEnv("OIDC_ISSUER", "");
  vi.stubEnv("OIDC_CLIENT_ID", "");
  vi.stubEnv("OIDC_CLIENT_SECRET", "");
});
