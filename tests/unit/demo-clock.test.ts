// The demo's fixed clock (scripts/demo/clock.mjs): DEMO_NOW parsing, the Date the Next server gets, and the fake
// upstream's frozen/live clock with its control route.
import { describe, it, expect, afterEach } from "vitest";
import { createDemoClock, frozenDate, parseDemoNow } from "../../scripts/demo/clock.mjs";
import { startUpstream } from "../../scripts/demo/upstream.mjs";
import { startDemo } from "../../scripts/demo/instance.mjs";

describe("parseDemoNow", () => {
  it("is null when unset", () => {
    expect(parseDemoNow(undefined)).toBeNull();
    expect(parseDemoNow("")).toBeNull();
  });

  it("reads an ISO instant with a zone", () => {
    expect(parseDemoNow("2026-10-15T10:00:00Z")).toBe(Date.UTC(2026, 9, 15, 10));
    expect(parseDemoNow("2026-10-15T12:00+02:00")).toBe(Date.UTC(2026, 9, 15, 10));
  });

  it.each(["2026-10-15", "2026-10-15T10:00:00", "2026-02-30T10:00:00Z", "2026-10-15T24:00:00Z", "yesterday"])(
    "refuses %s",
    (value) => expect(() => parseDemoNow(value)).toThrow(/DEMO_NOW must be an ISO instant/),
  );
});

describe("frozenDate", () => {
  it("starts at the anchor and ticks with the real clock", () => {
    const real = Date.now();
    const anchor = Date.UTC(2026, 9, 15, 10);
    const FakeDate = frozenDate(Date, anchor, real);
    expect(Math.abs(FakeDate.now() - anchor)).toBeLessThan(2_000);
    expect(Math.abs(new FakeDate().getTime() - anchor)).toBeLessThan(2_000);
    // Everything but "now" is untouched.
    expect(new FakeDate("2020-01-01T00:00:00Z").toISOString()).toBe("2020-01-01T00:00:00.000Z");
    expect(new Date(0) instanceof FakeDate).toBe(true);
  });
});

describe("createDemoClock", () => {
  it("stays at the anchor while frozen and restarts from it each time it goes live", () => {
    let real = 1_000;
    const clock = createDemoClock(50_000, () => real);
    expect(clock.mode).toBe("frozen");
    real += 5_000;
    expect(clock.now()).toBe(50_000);

    expect(clock.set("live")).toBe(true);
    real += 3_000;
    expect(clock.now()).toBe(53_000);
    expect(clock.set("live")).toBe(false);
    expect(clock.now()).toBe(50_000);

    expect(clock.set("frozen")).toBe(true);
    real += 9_000;
    expect(clock.now()).toBe(50_000);
    expect(clock.set("frozen")).toBe(false);
  });

  it("refuses any other mode", () => {
    expect(() => createDemoClock(0).set("sideways")).toThrow(/live or frozen/);
  });
});

describe("the upstream's clock control", () => {
  let upstream: Awaited<ReturnType<typeof startUpstream>> | undefined;
  afterEach(async () => {
    await upstream?.close();
    upstream = undefined;
  });

  it("switches the clock over POST /__clock/<mode> and says whether it changed", async () => {
    const clock = createDemoClock(1_000);
    upstream = await startUpstream({ port: 0, clock: clock.now, control: clock });
    const post = (mode: string) => fetch(`${upstream!.url}/__clock/${mode}`, { method: "POST" });

    const live = await post("live");
    expect(await live.json()).toEqual({ mode: "live", changed: true });
    expect(clock.mode).toBe("live");
    expect(await (await post("live")).json()).toEqual({ mode: "live", changed: false });
    expect(await (await post("frozen")).json()).toEqual({ mode: "frozen", changed: true });

    const bad = await post("sideways");
    expect(bad.status).toBe(400);
  });

  it("is not there without a control, or for a GET", async () => {
    upstream = await startUpstream({ port: 0 });
    expect((await fetch(`${upstream.url}/__clock/live`, { method: "POST" })).status).toBe(404);
    await upstream.close();

    const clock = createDemoClock(0);
    upstream = await startUpstream({ port: 0, clock: clock.now, control: clock });
    expect((await fetch(`${upstream.url}/__clock/live`)).status).toBe(404);
    expect(clock.mode).toBe("frozen");
  });
});

describe("startDemo", () => {
  it("refuses a bad DEMO_NOW before creating anything", async () => {
    await expect(startDemo({ quiet: true, demoNow: "tomorrow", boot: async () => {} })).rejects.toThrow(
      /DEMO_NOW must be an ISO instant/,
    );
  });
});
