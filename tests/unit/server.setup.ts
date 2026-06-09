import { vi, beforeAll } from "vitest";

vi.mock("server-only", () => ({}));

beforeAll(() => {
  process.env.AUTH_SECRET = "test-auth-secret-32-bytes-long!!";
  process.env.ENCRYPTION_KEY = "0".repeat(64);
  process.env.DATABASE_URL = "file::memory:";
  process.env.OIDC_ISSUER = "";
  process.env.OIDC_CLIENT_ID = "";
  process.env.OIDC_CLIENT_SECRET = "";
});
