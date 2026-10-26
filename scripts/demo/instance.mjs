#!/usr/bin/env node
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertDemoEnv, assertPortsFree, demoEnv } from "./env.mjs";
import { startUpstream } from "./upstream.mjs";
import { aerieYaml } from "./config.mjs";

/**
 * An isolated, throwaway Aerie instance: a fake upstream server with a fictional
 * media catalogue, a scratch SQLite database provisioned from a generated
 * `aerie.yaml`, and `next dev` pointed at both. Everything is torn down on stop.
 *
 *   make demo          # interactive: prints a URL and a throwaway login
 *   make screenshots   # uses startDemo() from scripts/demo/capture.mjs
 *
 * Aerie has no mock fallback (panels are empty until an upstream answers), so the
 * fake upstream stands in for Tautulli, Overseerr, Sonarr, Radarr, Gatus, Prometheus
 * and NZBGet. Isolation is enforced, not just documented (see ./env.mjs): a clean
 * env with no inherited secrets, all state under one mkdtemp dir, loopback-only
 * dedicated ports that must be free, and every service URL on loopback.
 *
 * Any startup failure runs the same teardown as a normal stop before the error
 * propagates. DEMO_HEALTH_TIMEOUT_MS (default 90000) bounds each readiness probe.
 */

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BIN = (name) => path.join(REPO_ROOT, "node_modules", ".bin", name);

export const DEMO_WEB_PORT = process.env.DEMO_WEB_PORT ?? "3930";
export const DEMO_UPSTREAM_PORT = process.env.DEMO_UPSTREAM_PORT ?? "3931";

const DEFAULT_HEALTH_TIMEOUT_MS = 90_000;
// Node timers (and AbortSignal.timeout) overflow above this and fire at once.
const MAX_TIMER_MS = 2 ** 31 - 1;

/** DEMO_HEALTH_TIMEOUT_MS, validated: how long each readiness probe may take. */
export function healthTimeoutMs(value = process.env.DEMO_HEALTH_TIMEOUT_MS) {
  if (value === undefined || value === "") return DEFAULT_HEALTH_TIMEOUT_MS;
  const ms = Number(value);
  if (!Number.isSafeInteger(ms) || ms <= 0 || ms > MAX_TIMER_MS)
    throw new Error(
      `DEMO_HEALTH_TIMEOUT_MS must be a positive integer (ms) up to ${MAX_TIMER_MS}, got "${value}"`,
    );
  return ms;
}

/**
 * Own process group (`detached`) so stop() can kill everything a server forks
 * (next dev spawns workers); a plain child.kill() would leak them.
 */
function spawnServer(name, cmd, args, opts, quiet) {
  const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], detached: true, ...opts });
  const out = (d) => !quiet && process.stdout.write(`[${name}] ${d}`);
  child.stdout.on("data", out);
  child.stderr.on("data", (d) => process.stderr.write(`[${name}] ${d}`));
  return child;
}

/** Parse `ps -A -o pid=,ppid=,pgid=` output; lines that are not three integers are skipped. */
export function parsePsRows(text) {
  const rows = [];
  for (const line of text.split("\n")) {
    const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s*$/.exec(line);
    if (match) rows.push({ pid: Number(match[1]), ppid: Number(match[2]), pgid: Number(match[3]) });
  }
  return rows;
}

/**
 * The process groups that descend from the `roots` groups in a `ps` snapshot: the
 * groups of every process reachable via parent links from a member of a root group.
 * turbo runs each task (sh, then tsc) in a group of its own, so killing turbo's group
 * misses them. Only finds what is still linked: a task whose parent already exited
 * was reparented and is out of reach (on Linux the /proc HOME sweep covers that).
 * Never returns a root, the caller's own group (`self`'s), or a pgid <= 1:
 * `kill(-0)` would hit the caller's group and `kill(-1)` every process it may signal.
 */
export function descendantGroups(rows, roots, self = process.pid) {
  const rootSet = new Set(roots.filter((pgid) => pgid > 1));
  // pid 0 and init are never anyone's descendant, and a self-parented entry (the
  // kernel's pid 0, some kernel threads) would be its own child. Cycles beyond that
  // are cut by `seen` below: each pid is expanded at most once.
  rows = rows.filter((row) => row.pid > 1 && row.pid !== row.ppid);
  const children = new Map();
  for (const row of rows) {
    if (!children.has(row.ppid)) children.set(row.ppid, []);
    children.get(row.ppid).push(row);
  }
  const ownGroup = rows.find((row) => row.pid === self)?.pgid;
  const seen = new Set();
  const queue = rows.filter((row) => rootSet.has(row.pgid));
  const groups = new Set();
  while (queue.length > 0) {
    const row = queue.pop();
    if (seen.has(row.pid)) continue;
    seen.add(row.pid);
    if (row.pgid > 1 && !rootSet.has(row.pgid) && row.pgid !== ownGroup) groups.add(row.pgid);
    queue.push(...(children.get(row.pid) ?? []));
  }
  return [...groups];
}

/**
 * Descendant groups of `roots` from a live `ps` snapshot. Portable (macOS has no
 * /proc). Synchronous, since the second-Ctrl-C path runs in a signal handler. Fails
 * soft: without a usable `ps`, there is nothing extra to kill.
 */
function snapshotDescendantGroups(roots) {
  try {
    const out = execFileSync("ps", ["-A", "-o", "pid=,ppid=,pgid="], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      // It runs inside the second-Ctrl-C handler, ahead of every SIGKILL: a wedged
      // ps must not hold those up for long. 1 s still leaves a loaded host room.
      timeout: 1_000,
    });
    return descendantGroups(parsePsRows(out), roots);
  } catch {
    return [];
  }
}

/**
 * Signal a whole process group. Refuses pgid <= 1 (and anything not a number):
 * `kill(-1)` reaches every process this user may signal, `kill(-0)` the caller's
 * own group, so the guard sits here rather than only in the callers.
 */
export const signalGroup = (pgid, sig) => {
  if (!(Number.isSafeInteger(pgid) && pgid > 1)) return false;
  try {
    process.kill(-pgid, sig);
    return true;
  } catch {
    return false; // Group already gone.
  }
};

/**
 * SIGKILL the given groups plus every group descending from them. The snapshot
 * comes first, while e.g. turbo is still alive and its tasks still list it as their
 * parent. Returns the descendant groups, so the caller can wait for them too.
 */
function hardKillTree(pgids) {
  const descendants = snapshotDescendantGroups(pgids);
  for (const pgid of pgids) signalGroup(pgid, "SIGKILL");
  for (const pgid of descendants) signalGroup(pgid, "SIGKILL");
  if (descendants.length > 0)
    console.log(`[demo] killed descendant process group(s) ${descendants.join(", ")}`);
  return descendants;
}

/**
 * SIGTERM the whole group, wait for it to go, SIGKILL whatever is left, together
 * with the groups it spawned (turbo's per-task groups), which the SIGTERM may not
 * have reached if turbo did not shut them down itself.
 */
async function killGroup(child, graceMs = 5_000) {
  if (!child) return;
  if (!signalGroup(child.pid, "SIGTERM")) return;
  // Done when the direct child has exited and no process in its group remains
  // (signal 0 only probes). next dev writes its config store on the way out.
  const alive = () => child.exitCode === null || signalGroup(child.pid, 0);
  const waitGone = async (ms, done) => {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline && !done()) await new Promise((r) => setTimeout(r, 100));
  };
  await waitGone(graceMs, () => !alive());
  if (!alive()) return;
  const descendants = hardKillTree([child.pid]);
  // Let the killed groups actually exit, so the scratch-dir delete does not race them.
  await waitGone(2_000, () => !alive() && !descendants.some((pgid) => signalGroup(pgid, 0)));
}

/**
 * Processes that escaped their process group but still run with this demo's
 * scratch HOME (unique per run), found via /proc on Linux. `next dev` spawns its
 * telemetry flush `detached` on exit, even with NEXT_TELEMETRY_DISABLED, and that
 * process recreates HOME/.config/nextjs-nodejs after the scratch dir is deleted.
 */
export function strayPids(home) {
  if (process.platform !== "linux") return [];
  const marker = `\0HOME=${home}\0`;
  const pids = [];
  for (const entry of readdirSync("/proc")) {
    if (!/^\d+$/.test(entry) || Number(entry) === process.pid) continue;
    try {
      if (`\0${readFileSync(`/proc/${entry}/environ`, "latin1")}`.includes(marker))
        pids.push(Number(entry));
    } catch {
      // Gone already, or not ours to read.
    }
  }
  return pids;
}


const signalPid = (pid, sig) => {
  try {
    process.kill(pid, sig);
    return true;
  } catch {
    return false; // Already gone.
  }
};

/** SIGTERM the strays, wait for them to go, SIGKILL whatever is left. */
async function killStrays(home, graceMs = 2_000) {
  const pids = strayPids(home);
  if (pids.length === 0) return;
  console.log(`[demo] stopping ${pids.length} process(es) left outside the server groups`);
  for (const pid of pids) signalPid(pid, "SIGTERM");
  const waitGone = async (ms) => {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline && pids.some((pid) => signalPid(pid, 0)))
      await new Promise((r) => setTimeout(r, 50));
  };
  await waitGone(graceMs);
  for (const pid of pids) signalPid(pid, "SIGKILL");
  await waitGone(1_000);
}

export async function waitForHttp(url, timeoutMs = DEFAULT_HEALTH_TIMEOUT_MS) {
  const start = Date.now();
  let lastError;
  while (Date.now() - start < timeoutMs) {
    try {
      // Bound each request too: a server that accepts but never answers would
      // otherwise hold the loop past the deadline (undici's own limit is 5 min).
      const remaining = Math.max(1, timeoutMs - (Date.now() - start));
      const res = await fetch(url, { signal: AbortSignal.timeout(remaining) });
      if (res.status < 500) return;
    } catch (err) {
      lastError = err;
    }
    const left = timeoutMs - (Date.now() - start);
    if (left > 0) await new Promise((r) => setTimeout(r, Math.min(500, left)));
  }
  throw new Error(`Timed out waiting for ${url}${lastError ? `: ${lastError}` : ""}`);
}

/** Start `next dev` against the scratch env and wait until it answers. */
async function bootDemo({ webEnv, quiet, timeoutMs, spawnServer }) {
  console.log("[demo] starting web...");
  spawnServer(
    "web",
    BIN("next"),
    ["dev", "-p", DEMO_WEB_PORT, "-H", "127.0.0.1"],
    { cwd: REPO_ROOT, env: webEnv },
    quiet,
  );
  await waitForHttp(`http://127.0.0.1:${DEMO_WEB_PORT}/api/health`, timeoutMs);
}

/**
 * Start the demo. The admin login is generated per run (throwaway credentials) and
 * created through the app's own first-run setup form, so nothing writes the DB directly.
 *
 * `boot` replaces the spawn/wait sequence; tests use it to fail startup without
 * running the real server.
 */
export async function startDemo({ quiet = false, keep = false, boot } = {}) {
  // Refused before anything is created: nothing to tear down yet.
  const timeoutMs = healthTimeoutMs();
  await assertPortsFree([DEMO_WEB_PORT, DEMO_UPSTREAM_PORT]);

  const demoDir = await mkdtemp(path.join(tmpdir(), "aerie-demo-"));
  const upstreamUrl = `http://127.0.0.1:${DEMO_UPSTREAM_PORT}`;
  const login = {
    name: "Demo Admin",
    email: "demo@aerie.invalid",
    password: randomBytes(12).toString("base64url"),
  };

  /** Every server process group started so far; teardown kills them all. */
  const children = [];
  let upstream;
  const home = path.join(demoDir, "home");
  let stopping;
  const teardown = async () => {
    // Wait for every process to exit first: dying next dev workers otherwise
    // recreate files under the scratch HOME after it was deleted.
    await Promise.all(children.map((child) => killGroup(child)));
    await upstream?.close();
    // Then anything they spawned outside their groups (Next's telemetry flush).
    await killStrays(home);
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
    if (keep) return console.log(`[demo] kept ${demoDir}`);
    // Next's server worker can still write its config store under HOME just after
    // it is signalled, so delete until the directory stays gone.
    for (let attempt = 0; attempt < 5; attempt++) {
      await rm(demoDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }).catch(
        (err) => console.warn(`[demo] cleanup attempt failed: ${err}`),
      );
      await new Promise((r) => setTimeout(r, 1_000));
      if (!existsSync(demoDir)) return;
    }
    console.warn(`[demo] could not fully remove ${demoDir}`);
  };
  const stop = () => (stopping ??= teardown());
  // Installed before anything is spawned: the server runs in its own process group,
  // out of reach of the terminal's Ctrl-C, so without this a Ctrl-C during boot
  // would orphan it. A second Ctrl-C during the grace period SIGKILLs the groups.
  function onSignal() {
    if (stopping) {
      const targets = [...children.map((child) => child.pid), ...hardKillTree(children.map((c) => c.pid))];
      const deadline = Date.now() + 2_000;
      let attempts = 0;
      const finish = () => {
        if (targets.some((pgid) => signalGroup(pgid, 0)) && Date.now() < deadline)
          return setTimeout(finish, 50);
        if (keep) process.exit(130);
        // A dying worker can recreate files just after the delete, so repeat it.
        for (const pid of strayPids(home)) signalPid(pid, "SIGKILL");
        rmSync(demoDir, { recursive: true, force: true });
        if (++attempts < 5)
          return setTimeout(() => (existsSync(demoDir) ? finish() : process.exit(130)), 500);
        if (existsSync(demoDir)) console.warn(`[demo] hard stop: remove ${demoDir} by hand`);
        process.exit(130);
      };
      return finish();
    }
    stop().then(() => process.exit(0));
  }
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  /** spawnServer that registers the group for teardown; refuses once stopping. */
  const startServer = (...args) => {
    if (stopping) throw new Error("demo is stopping; not starting more servers");
    const child = spawnServer(...args);
    children.push(child);
    return child;
  };

  // Everything from here on runs under the same teardown as a normal stop, so a
  // failure at any step (env guard, upstream, boot, readiness) leaves no scratch
  // dir or process group behind.
  try {
    console.log(`[demo] scratch dir ${demoDir}`);
    for (const dir of ["home", "tmp"]) await mkdir(path.join(demoDir, dir), { recursive: true });

    const configFile = path.join(demoDir, "aerie.yaml");
    await writeFile(configFile, aerieYaml(upstreamUrl));
    const webEnv = demoEnv(demoDir, {
      NODE_ENV: "development",
      DATABASE_URL: `file:${path.join(demoDir, "aerie.db")}`,
      AERIE_CONFIG_FILE: configFile,
      ENCRYPTION_KEY: randomBytes(32).toString("base64"),
      AUTH_SECRET: randomBytes(32).toString("base64url"),
      // Blank = credentials mode (no identity provider is contacted).
      OIDC_ISSUER: "",
      OIDC_CLIENT_ID: "",
      OIDC_CLIENT_SECRET: "",
      PORT: DEMO_WEB_PORT,
    });
    assertDemoEnv(webEnv, demoDir, { cwd: REPO_ROOT });

    upstream = await startUpstream({ port: Number(DEMO_UPSTREAM_PORT), demoDir });
    await (boot ?? bootDemo)({
      demoDir,
      webEnv,
      quiet,
      timeoutMs,
      spawnServer: startServer,
      stop,
    });
  } catch (err) {
    // A stop (Ctrl-C/SIGTERM) mid-boot fails the step it killed; that is no startup failure.
    if (!stopping) console.error(`[demo] startup failed, tearing down: ${err?.message ?? err}`);
    await stop();
    throw err;
  }

  return {
    webUrl: `http://127.0.0.1:${DEMO_WEB_PORT}`,
    upstreamUrl,
    demoDir,
    login,
    stop,
  };
}

const invokedDirectly = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (invokedDirectly) {
  const keep = process.argv.includes("--keep");
  let demo;
  try {
    demo = await startDemo({ keep });
    // The throwaway login goes to a private file in the scratch dir (deleted on
    // exit) rather than to the terminal. The admin does not exist yet: the first
    // visit to /login shows the setup form, and these are the values to enter.
    const loginFile = path.join(demo.demoDir, "login.txt");
    await writeFile(loginFile, `email    ${demo.login.email}\npassword ${demo.login.password}\n`, {
      mode: 0o600,
    });
    console.log(`
[demo] Aerie demo is up: ${demo.webUrl}
[demo] First visit shows the setup form; use the throwaway login in ${loginFile}
[demo] Ctrl-C stops it and deletes all demo data.`);
  } catch (err) {
    console.error(`[demo] ${err?.stack ?? err}`);
    await demo?.stop();
    process.exit(1);
  }
}
