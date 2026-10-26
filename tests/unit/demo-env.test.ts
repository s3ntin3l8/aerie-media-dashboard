// Guards for the screenshot pipeline's isolation (scripts/demo/env.mjs): the demo must never
// see real secrets, paths or hosts, and must never touch a running instance.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertDemoEnv, assertPortsFree, demoEnv, isLoopbackUrl } from "../../scripts/demo/env.mjs";
import { healthTimeoutMs } from "../../scripts/demo/instance.mjs";

let demoDir: string;
beforeAll(() => {
  demoDir = mkdtempSync(path.join(tmpdir(), "aerie-demo-test-"));
  mkdirSync(path.join(demoDir, "home"));
});
afterAll(() => rmSync(demoDir, { recursive: true, force: true }));

const demoVars = () => ({
  DATABASE_URL: `file:${path.join(demoDir, "aerie.db")}`,
  AERIE_CONFIG_FILE: path.join(demoDir, "aerie.yaml"),
  ENCRYPTION_KEY: "generated",
  AUTH_SECRET: "generated",
  OIDC_ISSUER: "",
});

describe("demoEnv", () => {
  it("drops everything but the allowlist and points HOME/TMPDIR into the demo dir", () => {
    const env = demoEnv(
      demoDir,
      demoVars(),
      { PATH: "/usr/bin", LANG: "C", ENCRYPTION_KEY: "real", DATABASE_URL: "file:./data/aerie.db" },
    );
    expect(env.PATH).toBe("/usr/bin");
    expect(env.HOME?.startsWith(demoDir)).toBe(true);
    expect(env.TMPDIR?.startsWith(demoDir)).toBe(true);
    expect(env.ENCRYPTION_KEY).toBe("generated");
    expect(env.__NEXT_PROCESSED_ENV).toBe("true");
    expect(assertDemoEnv(env, demoDir, { collect: true })).toEqual([]);
  });
});

describe("assertDemoEnv refuses a poisoned environment", () => {
  const base = () => demoEnv(demoDir, demoVars(), { PATH: "/usr/bin" });
  const refuses = (vars: Record<string, string | undefined>, cwd?: string) =>
    expect(assertDemoEnv({ ...base(), ...vars }, demoDir, { collect: true, cwd }).length).toBeGreaterThan(0);

  it("Mullion control-socket variables", () => refuses({ MULLION_SOCKET_PATH: "/x" }));
  it("a database outside the demo dir", () => refuses({ DATABASE_URL: "file:/srv/aerie/aerie.db" }));
  it("a relative database path that escapes the demo dir", () => refuses({ DATABASE_URL: "file:../../srv/a.db" }));
  it("a non-file database", () => refuses({ DATABASE_URL: "libsql://prod.example.com" }));
  it("secrets the demo did not generate", () => refuses({ TAUTULLI_API_KEY: "real" })); // pragma: allowlist secret
  it("a config file outside the demo dir", () => refuses({ AERIE_CONFIG_FILE: "/srv/aerie/aerie.yaml" }));
  it("HOME outside the demo dir", () => refuses({ HOME: "/home/me" }));
  it("blank OIDC settings are fine (they keep credentials mode)", () =>
    expect(
      assertDemoEnv({ ...base(), OIDC_CLIENT_ID: "", OIDC_CLIENT_SECRET: "" }, demoDir, { collect: true }),
    ).toEqual([]));
  it("an identity provider", () => refuses({ OIDC_ISSUER: "https://sso.example.com" }));
  it("a non-loopback service URL", () => refuses({ AERIE_PORTAL_URL: "https://media.example.com" }));

  it("a working directory with .env files when Next is not told to skip them", () => {
    const cwd = mkdtempSync(path.join(demoDir, "cwd-"));
    writeFileSync(path.join(cwd, ".env"), "ENCRYPTION_KEY=real\n");
    refuses({ __NEXT_PROCESSED_ENV: undefined }, cwd);
    // With the flag set, the files are expected on a dev box and only warned about.
    expect(assertDemoEnv(base(), demoDir, { cwd, collect: true })).toEqual([]);
  });
});

describe("isLoopbackUrl", () => {
  it("accepts loopback hosts only", () => {
    expect(isLoopbackUrl("http://127.0.0.1:3931/tautulli")).toBe(true);
    expect(isLoopbackUrl("http://localhost:3930")).toBe(true);
    expect(isLoopbackUrl("https://cdn.jsdelivr.net/gh/x.svg")).toBe(false);
    expect(isLoopbackUrl("http://127.0.0.1.evil.example")).toBe(false);
    expect(isLoopbackUrl("ftp://127.0.0.1")).toBe(false);
    expect(isLoopbackUrl("not a url")).toBe(false);
  });
});

describe("the installed Next.js", () => {
  // demoEnv relies on @next/env skipping every .env* file when this flag is set. If an
  // upgrade drops that, the demo would load the real .env. Checked by behaviour, not by
  // grepping for the flag's name.
  const fromRepo = createRequire(path.join(process.cwd(), "package.json"));
  const fromNext = createRequire(fromRepo.resolve("next/package.json"));
  const envModule = fromNext.resolve("@next/env");
  const MARKER = "AERIE_DEMO_ENV_CANARY";

  // A fresh copy per call: @next/env caches its first result, and a forced reload would
  // bypass the flag (which `next dev` itself never passes here).
  const loadsMarker = (flag: boolean) => {
    delete fromNext.cache[envModule];
    const { loadEnvConfig } = fromNext(envModule);
    const dir = mkdtempSync(path.join(demoDir, "next-env-"));
    // .env, not .env.local: under NODE_ENV=test Next skips .env.local anyway.
    writeFileSync(path.join(dir, ".env"), `${MARKER}=leaked\n`);
    const saved = process.env.__NEXT_PROCESSED_ENV;
    if (flag) process.env.__NEXT_PROCESSED_ENV = "true";
    else delete process.env.__NEXT_PROCESSED_ENV;
    try {
      loadEnvConfig(dir, true, { info() {}, error() {} });
      return process.env[MARKER] === "leaked";
    } finally {
      delete process.env[MARKER];
      if (saved === undefined) delete process.env.__NEXT_PROCESSED_ENV;
      else process.env.__NEXT_PROCESSED_ENV = saved;
    }
  };

  it("loads .env files without the flag (the test can see a leak)", () => {
    expect(loadsMarker(false)).toBe(true);
  });

  it("skips .env files when __NEXT_PROCESSED_ENV is set", () => {
    expect(loadsMarker(true)).toBe(false);
  });
});

describe("assertPortsFree", () => {
  it("rejects a port that is already listening", async () => {
    const server = net.createServer().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    const { port } = server.address() as net.AddressInfo;
    try {
      await expect(assertPortsFree([port])).rejects.toThrow(/already in use/);
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  it("passes for a free port", async () => {
    const server = net.createServer().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    const { port } = server.address() as net.AddressInfo;
    await new Promise((r) => server.close(r));
    await expect(assertPortsFree([port])).resolves.toBeUndefined();
  });
});

describe("healthTimeoutMs", () => {
  it("defaults, accepts a positive integer and rejects the rest", () => {
    expect(healthTimeoutMs(undefined)).toBe(90_000);
    expect(healthTimeoutMs("240000")).toBe(240_000);
    for (const bad of ["0", "-1", "1.5", "abc", String(2 ** 31)])
      expect(() => healthTimeoutMs(bad)).toThrow(/DEMO_HEALTH_TIMEOUT_MS/);
  });
});
