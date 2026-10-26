import { existsSync, readFileSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

/**
 * Environment isolation for the demo instance and the screenshot pipeline.
 *
 * The demo must never see production or developer secrets. Next.js loads `.env*`
 * from its working directory (the repo root holds the real one, and `next dev`
 * has to run from there for the relative `drizzle/` migrations). So the demo
 * process gets an environment built from scratch (nothing is inherited except a
 * short allowlist) and Next is told its env is already processed, which makes
 * @next/env skip every `.env*` file. `assertDemoEnv` then refuses to start if
 * anything still points outside the scratch directory or at a non-loopback host.
 */

/** Inherited from the caller; everything else is dropped. */
const PASSTHROUGH = ["PATH", "LANG", "LC_ALL", "TERM", "TZ"];

/** Secret-looking keys the demo is allowed to set, always with generated values. */
const GENERATED_SECRETS = new Set(["AUTH_SECRET", "ENCRYPTION_KEY"]);

const SECRET_KEY = /(SECRET|PASSWORD|_KEY|_TOKEN|_PAT)$|ENCRYPTION/;
const PATH_KEY = /(_DIR|_PATH|_FILE)$/;
/** Keys that hold a URL the app would call or redirect to; they must be loopback. */
const URL_KEY = /(_URL|_ISSUER)$/;
/** Path-ish keys that legitimately point outside the scratch dir. */
const PATH_ALLOW = new Set(["PLAYWRIGHT_BROWSERS_PATH", "SCREENSHOTS_OUT_DIR"]);

/** Where Playwright keeps its browsers, resolved before HOME is redirected. */
export function playwrightBrowsersPath(parent = process.env) {
  return parent.PLAYWRIGHT_BROWSERS_PATH ?? path.join(os.homedir(), ".cache", "ms-playwright");
}

/**
 * A clean environment for a demo child process. HOME and TMPDIR point into the
 * scratch dir so no tool falls back to a real config directory.
 *
 * @param {string} demoDir
 * @param {Record<string, string | undefined>} [vars]
 * @param {Record<string, string | undefined>} [parent]
 * @returns {Record<string, string | undefined>}
 */
export function demoEnv(demoDir, vars = {}, parent = process.env) {
  /** @type {Record<string, string | undefined>} */
  const env = {};
  for (const key of PASSTHROUGH) if (parent[key] !== undefined) env[key] = parent[key];
  return {
    ...env,
    HOME: path.join(demoDir, "home"),
    TMPDIR: path.join(demoDir, "tmp"),
    // Tells Next.js the env is already loaded, so it skips every .env* file
    // (including the apps/web/.env.local symlink). Harmless for other processes.
    __NEXT_PROCESSED_ENV: "true",
    NEXT_TELEMETRY_DISABLED: "1",
    ...vars,
  };
}

/** Every file `next dev` would read from its working directory. */
export const NEXT_ENV_FILES = [".env", ".env.local", ".env.development", ".env.development.local"];

const inside = (dir, p) => {
  const rel = path.relative(dir, p);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
};

/**
 * Throws if `env` could reach anything outside `demoDir`. Returns the list of
 * problems instead when `collect` is true (used by the tests).
 *
 * `cwd` is where the process will run. The repo root normally holds a `.env`
 * on a dev box, so finding one is only a warning, as long as
 * `__NEXT_PROCESSED_ENV` is set: @next/env then skips merging them. Without it
 * they are refused. `tests/unit/demo-env.test.ts` fails if the installed
 * @next/env stops honouring that flag.
 */
/**
 * @param {Record<string, string | undefined>} env
 * @param {string} demoDir
 * @param {{ cwd?: string, collect?: boolean }} [options]
 * @returns {string[]}
 */
export function assertDemoEnv(env, demoDir, { cwd, collect = false } = {}) {
  const problems = [];
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) continue;
    if (key.startsWith("MULLION_")) problems.push(`${key} must not reach the demo`);
    // A blank value is how the demo switches a setting off (OIDC_*), not a secret.
    if (value !== "" && SECRET_KEY.test(key) && !GENERATED_SECRETS.has(key))
      problems.push(`${key} looks like a real secret; the demo never sets it`);
    if (
      PATH_KEY.test(key) &&
      !PATH_ALLOW.has(key) &&
      // Relative values resolve against the process's working directory.
      !inside(demoDir, path.resolve(cwd ?? demoDir, value))
    )
      problems.push(`${key}=${value} is outside the demo dir`);
    if (URL_KEY.test(key) && key !== "DATABASE_URL" && value !== "" && !isLoopbackUrl(value))
      problems.push(`${key}=${value} is not a loopback URL`);
  }
  const db = env.DATABASE_URL;
  if (db !== undefined) {
    const local = db.startsWith("file:") ? db.slice("file:".length) : null;
    if (!local || !inside(demoDir, path.resolve(cwd ?? demoDir, local)))
      problems.push("DATABASE_URL must be a file: path inside the demo dir");
  }
  // OIDC on would send logins to an identity provider; blank keeps credentials mode.
  for (const key of ["OIDC_ISSUER", "OIDC_CLIENT_ID", "OIDC_CLIENT_SECRET"])
    if (env[key]) problems.push(`${key} must be blank (the demo uses local credentials)`);
  for (const key of ["HOME", "TMPDIR"])
    if (!env[key] || !inside(demoDir, env[key]))
      problems.push(`${key} must be inside the demo dir`);
  const nextFiles = cwd ? NEXT_ENV_FILES.filter((f) => existsSync(path.join(cwd, f))) : [];
  if (nextFiles.length > 0) {
    if (env.__NEXT_PROCESSED_ENV !== "true")
      problems.push(`${cwd} has ${nextFiles.join(", ")} and Next is not told to skip them`);
    else if (!collect)
      console.warn(
        `[demo] ignoring ${nextFiles.join(", ")} in ${cwd} (__NEXT_PROCESSED_ENV is set)`,
      );
  }

  if (collect) return problems;
  if (problems.length > 0)
    throw new Error(`demo environment refused:\n  - ${problems.join("\n  - ")}`);
  return [];
}

/** Whether `value` is an http(s) URL on the loopback interface. */
export function isLoopbackUrl(value) {
  try {
    const u = new URL(value);
    return (
      (u.protocol === "http:" || u.protocol === "https:") &&
      ["127.0.0.1", "localhost", "[::1]"].includes(u.hostname)
    );
  } catch {
    return false;
  }
}

/**
 * Rejects if something already listens on one of the ports (likely a real
 * instance). Probes IPv4 and IPv6 loopback, so a server bound to either is seen.
 */
export async function assertPortsFree(ports, hosts = ["127.0.0.1", "::1"]) {
  const listening = (port, host) =>
    new Promise((resolve) => {
      const socket = net.connect({ port: Number(port), host });
      socket.once("connect", () => {
        socket.destroy();
        resolve(true);
      });
      socket.once("error", () => resolve(false));
    });
  for (const port of ports)
    for (const host of hosts)
      if (await listening(port, host))
        throw new Error(`port ${port} is already in use on ${host}; refusing to start the demo`);
}

/**
 * `DEMO_STORAGE_STATE` names a file the demo writes the admin's session to and deletes again on
 * stop. It comes from the caller's environment, so a wrong value must never end in deleting
 * something real: it has to be a `.json` file, and if it already exists it has to be a Playwright
 * storage state (a leftover of a crashed run), never any other file.
 *
 * @param {string} file
 */
export function assertStorageStatePath(file) {
  if (path.extname(file) !== ".json")
    throw new Error(`DEMO_STORAGE_STATE=${file} must be a .json file; the demo deletes it on stop`);
  if (!existsSync(file)) return;
  let isState = false;
  try {
    isState = Array.isArray(JSON.parse(readFileSync(file, "utf8"))?.cookies);
  } catch {
    // Not JSON.
  }
  if (!isState)
    throw new Error(`DEMO_STORAGE_STATE=${file} exists and is not a Playwright storage state; refusing to overwrite and later delete it`);
}
