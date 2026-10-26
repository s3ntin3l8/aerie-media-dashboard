// Guards for the demo instance's teardown machinery (scripts/demo/instance.mjs): the process-group
// helpers it relies on to leave nothing running, and that a failed startup removes the scratch dir.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
// The demo's ports are read when the module loads. Move them off 3930/3931 so this test never
// owns (or collides with) the ports a real `make demo` or capture holds.
vi.hoisted(() => {
  const base = 20_000 + Math.floor(Math.random() * 20_000);
  process.env.DEMO_WEB_PORT = String(base);
  process.env.DEMO_UPSTREAM_PORT = String(base + 1);
});

import { descendantGroups, parsePsRows, snapshotDescendantGroups, startDemo } from "../../scripts/demo/instance.mjs";

describe("parsePsRows", () => {
  it("reads pid/ppid/pgid triples and skips everything else", () => {
    expect(parsePsRows("  10   1  10\n 11 10 11\nPID PPID PGID\n\n 12 10\n")).toEqual([
      { pid: 10, ppid: 1, pgid: 10 },
      { pid: 11, ppid: 10, pgid: 11 },
    ]);
  });
});

describe("descendantGroups", () => {
  const rows = [
    { pid: 100, ppid: 1, pgid: 100 }, // root group leader
    { pid: 101, ppid: 100, pgid: 101 }, // child that left the root group
    { pid: 102, ppid: 101, pgid: 102 }, // grandchild in yet another group
    { pid: 200, ppid: 1, pgid: 200 }, // unrelated
    { pid: 300, ppid: 100, pgid: 100 }, // same group as the root: not a descendant group
  ];

  it("finds the groups below a root group, never the root or unrelated ones", () => {
    expect(descendantGroups(rows, [100], 999).sort()).toEqual([101, 102]);
  });

  it("never returns the caller's own group or an unsafe pgid", () => {
    expect(descendantGroups(rows, [100], 101)).toEqual([102]);
    expect(descendantGroups([{ pid: 5, ppid: 1, pgid: 0 }, { pid: 6, ppid: 5, pgid: 1 }], [0, 1], 999)).toEqual([]);
  });
});

describe("snapshotDescendantGroups", () => {
  const spawned: number[] = [];
  afterEach(() => {
    for (const pid of spawned.splice(0)) {
      try {
        process.kill(-pid, "SIGKILL");
      } catch {
        // Already gone.
      }
    }
  });

  // Regression: execFileSync was never imported, so this threw inside its own catch and always
  // returned [] — the SIGKILL fallback then never reached the groups a server had forked.
  it("sees a process group forked below a live root", async () => {
    const parent = spawn(
      process.execPath,
      [
        "-e",
        "const c=require('node:child_process').spawn('sleep',['30'],{detached:true,stdio:'ignore'});" +
          "console.log(c.pid);setTimeout(()=>{},30000)",
      ],
      { detached: true, stdio: ["ignore", "pipe", "ignore"] },
    );
    spawned.push(parent.pid as number);
    const childPid = await new Promise<number>((resolve) =>
      parent.stdout.once("data", (d) => resolve(Number(String(d).trim()))),
    );
    spawned.push(childPid);
    expect(snapshotDescendantGroups([parent.pid as number])).toEqual([childPid]);
  });
});

describe("startDemo failure", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  it("rejects at once and removes the scratch dir when a server cannot be spawned", async () => {
    const started = Date.now();
    const tmp = mkdtempSync(path.join(tmpdir(), "aerie-demo-fail-"));
    dirs.push(tmp);
    const saved = process.env.TMPDIR;
    process.env.TMPDIR = tmp;
    try {
      await expect(
        startDemo({
          quiet: true,
          boot: async ({ spawnServer, spawnFailed }) => {
            spawnServer("web", path.join(tmp, "no-such-binary"), [], {}, true);
            await spawnFailed;
          },
        }),
      ).rejects.toThrow(/web failed to start/);
      expect(readdirSync(tmp).filter((f) => f.startsWith("aerie-demo-"))).toEqual([]);
      expect(Date.now() - started).toBeLessThan(10_000);
    } finally {
      if (saved === undefined) delete process.env.TMPDIR;
      else process.env.TMPDIR = saved;
    }
  }, 30_000);
});

describe("stopping the demo with a signal", () => {
  // The audit capture stops the demo by signalling its whole process group, which reaches the
  // demo directly and again via `make`. That must be one graceful stop, not a hard stop.
  it("treats a doubled SIGTERM as one request and removes the scratch dir and session file", async () => {
    const tmp = mkdtempSync(path.join(tmpdir(), "aerie-demo-sig-"));
    const stateFile = path.join(tmp, "state", "demo-storage-state.json");
    const saved = process.env.TMPDIR;
    process.env.TMPDIR = tmp;
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    try {
      const demo = await startDemo({
        quiet: true,
        createAdmin: false,
        storageStatePath: stateFile,
        boot: async () => {
          mkdirSync(path.dirname(stateFile), { recursive: true });
          writeFileSync(stateFile, "{}");
        },
      });
      process.emit("SIGTERM");
      process.emit("SIGTERM");
      await demo.stop();
      await vi.waitFor(() => expect(exit).toHaveBeenCalled(), { timeout: 10_000 });
      expect(exit.mock.calls).toEqual([[0]]); // never the hard-stop code 130
      expect(readdirSync(tmp).filter((f) => f.startsWith("aerie-demo-"))).toEqual([]);
      expect(existsSync(stateFile)).toBe(false);
    } finally {
      exit.mockRestore();
      if (saved === undefined) delete process.env.TMPDIR;
      else process.env.TMPDIR = saved;
      rmSync(tmp, { recursive: true, force: true });
    }
  }, 30_000);

  it("survives its reader closing the pipe while a server is still logging (EPIPE)", async () => {
    const tmp = mkdtempSync(path.join(tmpdir(), "aerie-demo-pipe-"));
    const saved = process.env.TMPDIR;
    process.env.TMPDIR = tmp;
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    try {
      const demo = await startDemo({ quiet: true, createAdmin: false, boot: async () => {} });
      const epipe = Object.assign(new Error("write EPIPE"), { code: "EPIPE" });
      expect(() => process.stdout.emit("error", epipe)).not.toThrow();
      expect(() => process.stderr.emit("error", epipe)).not.toThrow();
      // Other stream errors are still fatal.
      expect(() => process.stdout.emit("error", Object.assign(new Error("boom"), { code: "EIO" }))).toThrow("boom");
      await demo.stop();
    } finally {
      exit.mockRestore();
      if (saved === undefined) delete process.env.TMPDIR;
      else process.env.TMPDIR = saved;
      rmSync(tmp, { recursive: true, force: true });
    }
  }, 30_000);
});
