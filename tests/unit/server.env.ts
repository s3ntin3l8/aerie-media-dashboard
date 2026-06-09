// Stub the runtime env at module-load time so that any subsequent import of
// `@/lib/env` / `@/lib/crypto` / `@/lib/auth/*` sees a fully configured
// environment. This must run BEFORE any test file imports those modules.
process.env.AUTH_SECRET = "test-auth-secret-32-bytes-long!!";
process.env.ENCRYPTION_KEY = "0".repeat(64);
process.env.DATABASE_URL = "file::memory:";
process.env.OIDC_ISSUER = "";
process.env.OIDC_CLIENT_ID = "";
process.env.OIDC_CLIENT_SECRET = "";
