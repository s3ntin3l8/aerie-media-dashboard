// warmEnrichment (scripts/demo/admin.mjs) makes the demo's ready line mean "the first page load is
// complete": Overseerr titles arrive on a later poll, so it polls the snapshot until they have.
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { warmEnrichment } from "../../scripts/demo/admin.mjs";

const servers: http.Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((r) => s.close(r))));
});

async function snapshotServer(bodyFor: (call: number, cookie: string | undefined) => { status?: number; body: string }) {
  let calls = 0;
  const seen: (string | undefined)[] = [];
  const server = http.createServer((req, res) => {
    seen.push(req.headers.cookie);
    const { status = 200, body } = bodyFor(++calls, req.headers.cookie);
    res.writeHead(status, { "content-type": "application/json" });
    res.end(body);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  servers.push(server);
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, calls: () => calls, seen };
}

const state = { cookies: [{ name: "authjs.session-token", value: "abc" }] };
const placeholders = JSON.stringify({ requests: [{ title: "Request 41" }, { title: "Glasswing" }] });
const enriched = JSON.stringify({ requests: [{ title: "Under the Tin Moon" }, { title: "Glasswing" }] });

describe("warmEnrichment", () => {
  it("polls the snapshot as the admin until no request title is a placeholder", async () => {
    const srv = await snapshotServer((n) => ({ body: n < 3 ? placeholders : enriched }));
    await warmEnrichment({ webUrl: srv.url, state, intervalMs: 10 });
    expect(srv.calls()).toBe(3);
    expect(new Set(srv.seen)).toEqual(new Set(["authjs.session-token=abc"]));
  });

  it("keeps polling through a failing snapshot, then gives up with the last reason", async () => {
    const srv = await snapshotServer(() => ({ status: 500, body: "{}" }));
    await expect(warmEnrichment({ webUrl: srv.url, state, timeoutMs: 150, intervalMs: 10 })).rejects.toThrow(
      /not enriched within .*HTTP 500/,
    );
    expect(srv.calls()).toBeGreaterThan(1);
  });

  it("does not take a real title that merely starts with 'Request' for a placeholder", async () => {
    const srv = await snapshotServer(() => ({ body: JSON.stringify({ requests: [{ title: "Request Denied" }] }) }));
    await warmEnrichment({ webUrl: srv.url, state, intervalMs: 10 });
    expect(srv.calls()).toBe(1);
  });
});
