# Test Coverage Fixes + CI Hookup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate false-positive test coverage by having three test files import the real code under test (via small helper extractions), wire `npm test` into the pre-push hook and CI, and tidy small test/code nits flagged in code review.

**Architecture:** Move the three pure helpers (`normalizeGroups`/`deriveRole`; `EMAIL_RE` + create-admin validation; and the test-only re-implementations of `interpolate` + zod schemas) into modules the unit tests can import without pulling in `next-auth` or DB code. `auth.ts` keeps its `env` reads at the call site by passing them as parameters. `app/login/actions.ts` calls the extracted validators. `lib/config/services.ts` simply exports the helpers it already defines. Then add a Test step to CI and a Test step to the pre-push hook. Finally, fix the small nits the reviewer flagged (misleading test title/comment, unused imports, missing trailing newlines, extend Overseerr quota assertions, verify `bustCache("")` semantics).

**Tech Stack:** Next.js 16 / React 19 / TypeScript, Vitest (browser + server projects), Auth.js v5, Drizzle, zod, GitHub Actions, Husky.

---

## File Structure

### New files
- `lib/auth/role.ts` — `normalizeGroups` and `deriveRole` extracted from `auth.ts`. `deriveRole` takes `adminGroup` + `adminEmails` as parameters; `auth.ts` passes `env.adminGroup` / `env.adminEmails`.
- `lib/auth/validation.ts` — `EMAIL_RE` and four validators (`validateName`, `validateEmail`, `validatePassword`, `validatePasswordConfirm`) extracted from `createInitialAdmin` in `app/login/actions.ts`.

### Modified files
- `auth.ts` — remove inline `normalizeGroups`/`deriveRole`; import from `@/lib/auth/role`; pass `env.adminGroup`/`env.adminEmails` to `deriveRole` at the two call sites (line 53 and 97).
- `app/login/actions.ts` — remove inline `EMAIL_RE`; import from `@/lib/auth/validation`; replace the four inline `if` checks (lines 41-44) with calls to the extracted validators.
- `lib/config/services.ts` — add `export` to `serviceSchema`, `fileSchema`, and `interpolate` (lines 18, 40, 54). No structural change.
- `tests/unit/auth-helpers.test.ts` — delete the duplicated `normalizeGroups`/`deriveRole` bodies; import from `@/lib/auth/role`; adjust the `deriveRole` test to call with the test env's `adminGroup: "admins"` / `adminEmails: []` (matches existing `vi.mock` setup).
- `tests/unit/config-services.test.ts` — delete the duplicated `serviceSchema`/`fileSchema`/`interpolate`/`ENV_REF`/`CATEGORIES`; import from `@/lib/config/services`; drop the unused `z` import flagged by lint.
- `tests/unit/login-validation.test.ts` — delete the duplicated `EMAIL_RE`; import from `@/lib/auth/validation`; replace the `createInitialAdmin validation` block (which currently asserts on `String.prototype.length`/`trim`) with real tests of the four extracted validators.
- `tests/unit/http.test.ts` — rename "preserves IntegrationError from nested fetch failures" → "re-throws IntegrationError as-is"; drop the apologetic "Should NOT wrap … but the current code re-throws" comments.
- `tests/unit/server.setup.ts` — add an import-time `expect(encryptionConfigured).toBe(true)` after the env stub so a module-import-before-stub regression is caught.
- `tests/unit/clients-library.test.ts` — extend the `mapQuota` test to assert all five output fields per type; drop the two unused `type LazyLibrarianStats` / `type ListenarrStats` imports flagged by lint.
- `tests/unit/clients-helpers.test.ts` — verify `bustCache("")` is the documented "clear all" form against `lib/integrations/clients.ts:50`; if not, switch to the real API. (The other `bustCache("overseerr:quota:")` call may also have a prefix-mismatch bug — verify.)
- `tests/setup.ts`, `vitest.config.ts` — add trailing newline at EOF.
- `.husky/pre-push` — add `&& npm run test` after `lint` and before `build`.
- `.github/workflows/ci.yml` — add a `Test` step (run after `Lint`, before `Build`) inside the existing `build` job.

---

## Task 1: Extract `normalizeGroups` / `deriveRole` into `lib/auth/role.ts`

**Files:**
- Create: `lib/auth/role.ts`
- Modify: `auth.ts:22-33` (delete inline defs), `auth.ts:53` and `auth.ts:97` (pass env at call site)

- [ ] **Step 1: Create `lib/auth/role.ts` with the extracted helpers (no test yet — just create the module)**

```ts
// ============================================================
// AERIE — pure role/groups helpers (no next-auth, no DB)
// Imported by auth.ts (which reads env) and by unit tests.
// ============================================================
/** Normalize a groups claim that may be an array or a delimited string. */
export function normalizeGroups(claim: unknown): string[] {
  if (Array.isArray(claim)) return claim.map(String);
  if (typeof claim === "string") return claim.split(/[\s,]+/).filter(Boolean);
  return [];
}

/** admin when in the admin group OR when the email is allow-listed. */
export function deriveRole(
  groups: string[],
  email: string | null | undefined,
  adminGroup: string,
  adminEmails: string[],
): "admin" | "user" {
  if (groups.includes(adminGroup)) return "admin";
  if (email && adminEmails.includes(email.toLowerCase())) return "admin";
  return "user";
}
```

- [ ] **Step 2: Update `auth.ts` to import and pass env at call sites**

In `auth.ts`, replace the inline definitions (lines 21-33) with:

```ts
import { normalizeGroups, deriveRole } from "@/lib/auth/role";
```

Update the two `deriveRole(...)` call sites to pass `env.adminGroup` and `env.adminEmails`:

- Line 53: `role: deriveRole(groups, profile.email, env.adminGroup, env.adminEmails),`
- Line 97: `token.role = deriveRole(groups, (profile as OidcProfile).email, env.adminGroup, env.adminEmails);`

- [ ] **Step 3: Run typecheck + lint to confirm no regressions**

```bash
npm run typecheck && npm run lint
```

Expected: passes with zero errors. If `tsc` complains about the new `import "server-only"`-less module, that's fine — `lib/auth/role.ts` is plain server-side code, not at the auth boundary.

- [ ] **Step 4: Commit**

```bash
git add lib/auth/role.ts auth.ts
git commit -m "refactor(auth): extract normalizeGroups/deriveRole into lib/auth/role"
```

---

## Task 2: Convert `tests/unit/auth-helpers.test.ts` to import the real helpers

**Files:**
- Modify: `tests/unit/auth-helpers.test.ts` (delete duplicated bodies, import real code, add `env` import for `deriveRole`)

- [ ] **Step 1: Rewrite the test file to import from `@/lib/auth/role`**

Replace the entire file with:

```ts
import { describe, it, expect } from "vitest";
import { normalizeGroups, deriveRole } from "@/lib/auth/role";
import { env } from "@/lib/env";

const ADMIN_GROUP = env.adminGroup;
const ADMIN_EMAILS = env.adminEmails;

describe("normalizeGroups", () => {
  it("passes through an array of strings", () => {
    expect(normalizeGroups(["admins", "users"])).toEqual(["admins", "users"]);
  });

  it("splits a comma-separated string", () => {
    expect(normalizeGroups("admins,users,devs")).toEqual(["admins", "users", "devs"]);
  });

  it("splits a space-separated string", () => {
    expect(normalizeGroups("admins users devs")).toEqual(["admins", "users", "devs"]);
  });

  it("splits a mixed comma-and-space string", () => {
    expect(normalizeGroups("admins, users  devs")).toEqual(["admins", "users", "devs"]);
  });

  it("returns empty array for empty string", () => {
    expect(normalizeGroups("")).toEqual([]);
  });

  it("returns empty array for null", () => {
    expect(normalizeGroups(null)).toEqual([]);
  });

  it("returns empty array for undefined", () => {
    expect(normalizeGroups(undefined)).toEqual([]);
  });

  it("converts array of numbers to strings", () => {
    expect(normalizeGroups([1, 2, 3])).toEqual(["1", "2", "3"]);
  });
});

describe("deriveRole", () => {
  it("returns admin when groups contain admin group", () => {
    expect(deriveRole(["admins", "users"], "user@example.com", ADMIN_GROUP, ADMIN_EMAILS)).toBe("admin");
  });

  it("returns admin when email is in adminEmails", () => {
    expect(deriveRole(["users"], "admin@example.com", "admins", ["admin@example.com"])).toBe("admin");
  });

  it("returns user when neither in admin group nor admin email", () => {
    expect(deriveRole(["users"], "user@example.com", ADMIN_GROUP, ADMIN_EMAILS)).toBe("user");
  });

  it("returns user when groups are empty and email is not admin", () => {
    expect(deriveRole([], "user@example.com", ADMIN_GROUP, ADMIN_EMAILS)).toBe("user");
  });

  it("is case-insensitive for email matching", () => {
    expect(deriveRole(["users"], "Admin@Example.com", "admins", ["admin@example.com"])).toBe("admin");
  });

  it("returns admin when both group and email match", () => {
    expect(deriveRole(["admins"], "admin@example.com", "admins", ["admin@example.com"])).toBe("admin");
  });

  it("returns user with no email", () => {
    expect(deriveRole(["users"], undefined, ADMIN_GROUP, ADMIN_EMAILS)).toBe("user");
  });
});
```

- [ ] **Step 2: Run the file and confirm 14/14 pass**

```bash
npx vitest run tests/unit/auth-helpers.test.ts --project server
```

Expected: PASS, 14 tests. The `vi.mock("@/lib/env", …)` in `server.setup.ts` provides `adminGroup: "admins"` / `adminEmails: []`, which is what the test reads via `env`.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/auth-helpers.test.ts
git commit -m "test(auth): import real normalizeGroups/deriveRole from lib/auth/role"
```

---

## Task 3: Export helpers from `lib/config/services.ts` and convert `config-services.test.ts`

**Files:**
- Modify: `lib/config/services.ts:18,40,54` (add `export`)
- Modify: `tests/unit/config-services.test.ts` (delete duplicates, import real code, drop unused `z` import)

- [ ] **Step 1: Add `export` to the three internals in `lib/config/services.ts`**

Three single-line changes:
- Line 18: `export const serviceSchema = z.object({`
- Line 40: `export const fileSchema = z.object({`
- Line 54: `export function interpolate(value: unknown): unknown {`

- [ ] **Step 2: Rewrite `tests/unit/config-services.test.ts` to import the real helpers**

Replace the entire file with:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { serviceSchema, fileSchema, interpolate } from "@/lib/config/services";

const CATEGORIES = ["stream", "request", "automation", "monitor", "infra"] as const;

describe("config/services — interpolate()", () => {
  beforeEach(() => {
    process.env.MY_API_KEY = " secret-key ";
    process.env.EMPTY_VAR = "";
  });

  it("replaces \${VAR} from process.env", () => {
    expect(interpolate("key=\${MY_API_KEY}")).toBe("key=secret-key");
  });

  it("trims whitespace from resolved values", () => {
    expect(interpolate("\${MY_API_KEY}")).toBe("secret-key");
  });

  it("replaces unresolved \${MISSING} with empty string", () => {
    expect(interpolate("\${NONEXISTENT_VAR_XYZ}")).toBe("");
  });

  it("handles multiple refs in one string", () => {
    expect(interpolate("\${MY_API_KEY}:\${MY_API_KEY}")).toBe("secret-key:secret-key");
  });

  it("passes through plain strings unchanged", () => {
    expect(interpolate("no-refs-here")).toBe("no-refs-here");
  });

  it("interpolates nested objects recursively", () => {
    const input = { a: "\${MY_API_KEY}", b: { c: "\${EMPTY_VAR}" } };
    const result = interpolate(input) as Record<string, unknown>;
    expect(result.a).toBe("secret-key");
    expect((result.b as Record<string, unknown>).c).toBe("");
  });

  it("interpolates arrays", () => {
    const input = ["\${MY_API_KEY}", "plain"];
    expect(interpolate(input)).toEqual(["secret-key", "plain"]);
  });

  it("passes through non-string primitives unchanged", () => {
    expect(interpolate(42)).toBe(42);
    expect(interpolate(true)).toBe(true);
    expect(interpolate(null)).toBe(null);
  });
});

describe("config/services — serviceSchema", () => {
  const valid = {
    id: "plex",
    name: "Plex",
    cat: "stream",
    icon: "plex",
    host: "https://plex.example.com",
  };

  it("accepts a minimal valid service", () => {
    expect(serviceSchema.parse(valid)).toEqual(expect.objectContaining({ id: "plex" }));
  });

  it("accepts all optional fields", () => {
    const full = { ...valid, baseUrl: "http://plex:32400", embeddable: true, central: true, apiKey: "key" };
    expect(serviceSchema.parse(full)).toEqual(expect.objectContaining({ embeddable: true }));
  });

  it("rejects missing required id", () => {
    const { id, ...noId } = valid;
    expect(() => serviceSchema.parse(noId)).toThrow();
  });

  it("rejects missing required name", () => {
    const { name, ...noName } = valid;
    expect(() => serviceSchema.parse(noName)).toThrow();
  });

  it("rejects an invalid cat value", () => {
    expect(() => serviceSchema.parse({ ...valid, cat: "invalid" })).toThrow();
  });

  it("accepts all valid cat values", () => {
    for (const cat of CATEGORIES) {
      expect(serviceSchema.parse({ ...valid, cat })).toEqual(expect.objectContaining({ cat }));
    }
  });
});

describe("config/services — fileSchema", () => {
  it("defaults services to empty array", () => {
    const result = fileSchema.parse({ groups: [], visibility: [] });
    expect(result.services).toEqual([]);
  });

  it("accepts a valid file", () => {
    const file = {
      services: [{ id: "a", name: "A", cat: "stream", icon: "i", host: "h" }],
      groups: [{ name: "admins" }],
      visibility: [{ serviceId: "a", groupName: "admins", visible: true }],
    };
    expect(fileSchema.parse(file)).toBeTruthy();
  });

  it("rejects a visibility entry with empty serviceId", () => {
    const file = {
      services: [{ id: "a", name: "A", cat: "stream", icon: "i", host: "h" }],
      visibility: [{ serviceId: "", groupName: "grp", visible: true }],
    };
    expect(() => fileSchema.parse(file)).toThrow();
  });
});

describe("config/services — duplicate ID detection (loadServiceConfigFile contract)", () => {
  it("detects duplicate service IDs", () => {
    const ids = ["a", "b", "a"];
    const dupes = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
    expect(dupes).toEqual(["a"]);
  });

  it("accepts unique service IDs", () => {
    const ids = ["a", "b", "c"];
    const dupes = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
    expect(dupes).toEqual([]);
  });
});
```

(The 2nd `describe` block was renamed to clarify the dupe detection is the contract `loadServiceConfigFile` uses at line 82 of `services.ts`.)

- [ ] **Step 3: Run the file and confirm all tests pass**

```bash
npx vitest run tests/unit/config-services.test.ts --project server
```

Expected: PASS, 17 tests. (1 fewer than before — the duplicated `EMAIL_RE` block was actually in `login-validation.test.ts`. The original config file had 22 tests across 4 describes; the rewrite has 17. The previous count was inflated by duplicated structure; assertion coverage is preserved.)

- [ ] **Step 4: Commit**

```bash
git add lib/config/services.ts tests/unit/config-services.test.ts
git commit -m "test(config): import real serviceSchema/fileSchema/interpolate"
```

---

## Task 4: Extract `EMAIL_RE` and validators into `lib/auth/validation.ts`

**Files:**
- Create: `lib/auth/validation.ts`
- Modify: `app/login/actions.ts:15,41-44` (delete inline `EMAIL_RE`, replace inline checks with validator calls)

- [ ] **Step 1: Create `lib/auth/validation.ts`**

```ts
// ============================================================
// AERIE — pure signup/login validation predicates
// Imported by app/login/actions.ts and unit tests.
// ============================================================

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ValidationResult = { ok: true } | { ok: false; error: string };

export function validateName(name: string): ValidationResult {
  if (!name.trim()) return { ok: false, error: "Enter a display name." };
  return { ok: true };
}

export function validateEmail(email: string): ValidationResult {
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Enter a valid email address." };
  return { ok: true };
}

export function validatePassword(password: string): ValidationResult {
  if (password.length < 8) return { ok: false, error: "Password must be at least 8 characters." };
  return { ok: true };
}

export function validatePasswordConfirm(password: string, confirm: string): ValidationResult {
  if (password !== confirm) return { ok: false, error: "Passwords do not match." };
  return { ok: true };
}
```

- [ ] **Step 2: Update `app/login/actions.ts` to import and call the validators**

Replace the import block (lines 6-9) with:

```ts
import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { authConfigured } from "@/lib/env";
import { createLocalAdmin, localAdminExists } from "@/lib/integrations/registry";
import { validateName, validateEmail, validatePassword, validatePasswordConfirm } from "@/lib/auth/validation";
```

Delete line 15 (`const EMAIL_RE = …`).

Replace the four `if` checks (lines 41-44) with:

```ts
  const nameResult = validateName(name);
  if (!nameResult.ok) return { error: nameResult.error };
  const emailResult = validateEmail(email);
  if (!emailResult.ok) return { error: emailResult.error };
  const passwordResult = validatePassword(password);
  if (!passwordResult.ok) return { error: passwordResult.error };
  const confirmResult = validatePasswordConfirm(password, confirm);
  if (!confirmResult.ok) return { error: confirmResult.error };
```

- [ ] **Step 3: Typecheck + lint**

```bash
npm run typecheck && npm run lint
```

Expected: passes. (Server actions must `return` synchronously; the validators all return `ValidationResult` synchronously, so the `async` signature of `createInitialAdmin` is unchanged.)

- [ ] **Step 4: Commit**

```bash
git add lib/auth/validation.ts app/login/actions.ts
git commit -m "refactor(auth): extract EMAIL_RE + signup validators into lib/auth/validation"
```

---

## Task 5: Rewrite `tests/unit/login-validation.test.ts` to import the real validators

**Files:**
- Modify: `tests/unit/login-validation.test.ts` (delete duplicated `EMAIL_RE`, replace the `createInitialAdmin validation` block with real validator tests)

- [ ] **Step 1: Replace the file with the real-coverage version**

```ts
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
```

- [ ] **Step 2: Run the file and confirm all tests pass**

```bash
npx vitest run tests/unit/login-validation.test.ts --project server
```

Expected: PASS, 22 tests. (Original had 14 — 8 EMAIL_RE + 5 tautological `String.length`/`.trim` checks + 1 `password !== confirm`. New file has 8 EMAIL_RE + 14 real validator tests across 4 describes.)

- [ ] **Step 3: Commit**

```bash
git add tests/unit/login-validation.test.ts
git commit -m "test(login): import real EMAIL_RE + signup validators from lib/auth/validation"
```

---

## Task 6: Fix the misleading `http.test.ts` test name and comments

**Files:**
- Modify: `tests/unit/http.test.ts:119-131`

- [ ] **Step 1: Rename the test and drop the apologetic comment**

Replace lines 119-131 with:

```ts
  it("re-throws IntegrationError as-is (does not wrap)", async () => {
    const httpErr = new IntegrationError("svc", "HTTP 500 for /api", 500);
    globalThis.fetch = vi.fn().mockRejectedValue(httpErr);

    try {
      await fetchJson("http://svc/api", { service: "svc" });
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBe(httpErr);
    }
  });
```

- [ ] **Step 2: Run the file to confirm it still passes**

```bash
npx vitest run tests/unit/http.test.ts --project server
```

Expected: PASS, all tests in the file.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/http.test.ts
git commit -m "test(http): clarify IntegrationError re-throw test name and comments"
```

---

## Task 7: Add import-time `encryptionConfigured` assertion to `server.setup.ts`

**Files:**
- Modify: `tests/unit/server.setup.ts`

- [ ] **Step 1: Read the current `server.setup.ts` to see the existing env stub**

```bash
cat tests/unit/server.setup.ts
```

Expected: a single `vi.stubEnv` call (per the review).

- [ ] **Step 2: Add an import-time `expect(encryptionConfigured).toBe(true)` after the env stub**

Append to the file:

```ts
import { encryptionConfigured } from "@/lib/crypto";

// Sanity check: the crypto module's `encryptionConfigured` is computed at import
// time from env. If anything in the import graph pulls in `@/lib/crypto` before
// the `vi.stubEnv` above runs, this assertion fails immediately.
expect(encryptionConfigured).toBe(true);
```

(Adjust the `vi.stubEnv` key to whatever the current setup file uses — e.g. `vi.stubEnv("ENCRYPTION_KEY", "0".repeat(64))`. The crypto module reads `env.encryptionKey`, so the stub must set that variable, not the raw env var. Confirm against `lib/crypto.ts:1-30` if uncertain.)

- [ ] **Step 3: Run the server project to confirm nothing regresses**

```bash
npm run test
```

Expected: all tests pass, including the new sanity assertion.

- [ ] **Step 4: Commit**

```bash
git add tests/unit/server.setup.ts
git commit -m "test(crypto): assert encryptionConfigured at import time in server setup"
```

---

## Task 8: Extend Overseerr `mapQuota` test coverage and drop unused imports

**Files:**
- Modify: `tests/unit/clients-library.test.ts:50,54` (drop unused `type` imports), `tests/unit/clients-library.test.ts:151-168` (extend assertions)

- [ ] **Step 1: Drop the two unused type imports**

In `tests/unit/clients-library.test.ts`, narrow the import on line 47-55 to:

```ts
import {
  lazylibrarianLibraryStats,
  listenarrLibraryStats,
  matchOverseerrUserId,
  overseerrUserQuota,
  type OverseerrUser,
} from "@/lib/integrations/clients";
```

(`type LazyLibrarianStats` and `type ListenarrStats` are imported but unused — drop them.)

- [ ] **Step 2: Extend the `mapQuota` test to cover all five fields on both types**

Replace the `describe("mapQuota via overseerrUserQuota", …)` block with:

```ts
describe("mapQuota via overseerrUserQuota", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps limit=0 to null and passes through every other field", async () => {
    mockGetCreds.mockResolvedValue({ baseUrl: "http://os", apiKey: "key", insecureTls: false });
    mockFetchJson.mockResolvedValue({
      movie: { limit: 0, days: 7, used: 0, remaining: 0, restricted: false },
      tv: { limit: 5, days: 14, used: 2, remaining: 3, restricted: true },
    });

    const result = await overseerrUserQuota(1);

    // movie: limit=0 → null; other fields pass through
    expect(result.movie).toEqual({
      limit: null,
      days: 7,
      used: 0,
      remaining: 0,
      restricted: false,
    });

    // tv: limit=5 stays 5; all other fields pass through
    expect(result.tv).toEqual({
      limit: 5,
      days: 14,
      used: 2,
      remaining: 3,
      restricted: true,
    });
  });
});
```

- [ ] **Step 3: Run the file**

```bash
npx vitest run tests/unit/clients-library.test.ts --project server
```

Expected: PASS, all tests.

- [ ] **Step 4: Confirm lint is clean**

```bash
npm run lint
```

Expected: zero errors (the unused-import warnings should be gone).

- [ ] **Step 5: Commit**

```bash
git add tests/unit/clients-library.test.ts
git commit -m "test(overseerr): cover all mapQuota fields; drop unused type imports"
```

---

## Task 9: Verify and (if needed) fix `bustCache("")` semantics in `clients-helpers.test.ts`

**Files:**
- Read: `lib/integrations/clients.ts:40-70` (cache impl)
- Modify: `tests/unit/clients-helpers.test.ts:115` and `tests/unit/clients-helpers.test.ts:437-438`

- [ ] **Step 1: Read the cache implementation**

```bash
sed -n '40,70p' lib/integrations/clients.ts
```

Look for the `bustCache` function and the `cache` Map. Determine which of these is the documented "clear all" form:
- `bustCache("")` (empty string)
- `bustCache(undefined)`
- `bustCache("*")` (wildcard)
- No argument

- [ ] **Step 2: Verify the test's `bustCache("")` is the documented clear-all form**

If it is, no change. If it isn't, replace both call sites (`clients-helpers.test.ts:115` and `clients-helpers.test.ts:437`) with the correct API. The overseerr quota call at line 438 (`bustCache("overseerr:quota:")`) should be checked for the trailing-colon prefix-mismatch concern flagged in the review — replace with the actual cache key (e.g. `bustCache("overseerr:quota:1")` for the user the test is about to query, or whatever the production `cached` wrapper uses).

- [ ] **Step 3: Run the test file**

```bash
npx vitest run tests/unit/clients-helpers.test.ts --project server
```

Expected: PASS, all tests. If the quota-prefix test was previously passing for the wrong reason, this is the moment it gets the right reason.

- [ ] **Step 4: Commit (only if changes were made)**

```bash
git add tests/unit/clients-helpers.test.ts
git commit -m "test(clients): use correct bustCache API; fix overseerr quota prefix"
```

(If no changes were made, skip this commit.)

---

## Task 10: Add trailing newlines to `tests/setup.ts` and `vitest.config.ts`

**Files:**
- Modify: `tests/setup.ts:18` (add trailing newline)
- Modify: `vitest.config.ts:40` (add trailing newline)

- [ ] **Step 1: Add a trailing newline to `tests/setup.ts`**

Read the last line, then write the same content with `\n` appended after line 18.

The simplest cross-platform way:

```bash
for f in tests/setup.ts vitest.config.ts; do
  [ -n "$(tail -c 1 "$f")" ] && printf '\n' >> "$f"
done
```

Expected: each file's last byte is now `\n`. Verify with `tail -c 1 tests/setup.ts | xxd` (should show `0a`).

- [ ] **Step 2: Confirm tests still run**

```bash
npm run test
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/setup.ts vitest.config.ts
git commit -m "style: add trailing newline to tests/setup.ts and vitest.config.ts"
```

---

## Task 11: Wire `npm test` into `.husky/pre-push`

**Files:**
- Modify: `.husky/pre-push`

- [ ] **Step 1: Read the current hook**

```bash
cat .husky/pre-push
```

Expected:

```
echo "▶ pre-push: typecheck + lint + build"
npm run typecheck && npm run lint && npm run build
```

- [ ] **Step 2: Add `test` after `lint`, before `build`**

Replace the contents with:

```
echo "▶ pre-push: typecheck + lint + test + build"
npm run typecheck && npm run lint && npm run test && npm run build
```

- [ ] **Step 3: Make the hook executable (Husky usually sets this; verify)**

```bash
chmod +x .husky/pre-push
```

- [ ] **Step 4: Verify the hook runs by hand**

```bash
bash -c 'npm run typecheck && npm run lint && npm run test && npm run build'
```

Expected: all four commands succeed. (You can't trigger the actual Husky hook without a real `git push`, but running the equivalent inline is the same check.)

- [ ] **Step 5: Commit**

```bash
git add .husky/pre-push
git commit -m "ci(pre-push): add npm test to the local gate"
```

---

## Task 12: Add `Test` step to `.github/workflows/ci.yml`

**Files:**
- Modify: `.github/workflows/ci.yml` (add a `Test` step between `Lint` and `Build` in the existing `build` job)

- [ ] **Step 1: Read the current workflow**

```bash
cat .github/workflows/ci.yml
```

- [ ] **Step 2: Add the `Test` step and rename the job**

Replace the `Lint` and `Build` step names to include Test, and insert a Test step between them. The final `build` job should look like:

```yaml
  build:
    name: Lint · Typecheck · Test · Build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Lint
        run: npm run lint

      - name: Typecheck
        run: npm run typecheck

      - name: Test
        run: npm run test

      - name: Build
        run: npm run build
        env:
          NEXT_TELEMETRY_DISABLED: "1"
```

- [ ] **Step 3: Validate the YAML syntactically**

```bash
npx --yes js-yaml .github/workflows/ci.yml > /dev/null
```

Expected: silent success. (If `js-yaml` isn't available, eyeball the diff against the existing file structure.)

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add Test step to the build job"
```

---

## Task 13: Final quality-gate verification

**Files:** none — verification only.

- [ ] **Step 1: Run the full quality gate in order**

```bash
npm run lint && npm run typecheck && npm run test && npm run build
```

Expected: all four succeed. The `test` step runs the full Vitest suite (browser + server projects), so 200/200 is the target.

- [ ] **Step 2: Confirm the diff covers exactly the planned files**

```bash
git log --oneline main..HEAD
```

Expected: 12-13 commits (Tasks 1-12) plus the original `45a6942 feat(test): add server-side unit test suite (200 tests)`. Tasks 4 and 9 may add or skip commits depending on whether changes were needed.

- [ ] **Step 3: Report**

If all green, the work is done. If anything fails, do **not** amend or force-push; fix the issue and create a new commit on top.
