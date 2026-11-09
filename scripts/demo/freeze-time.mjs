/**
 * Node preload (`node --import`) that moves the demo's Next server to a fixed instant.
 *
 * With DEMO_NOW set (an ISO instant), `Date.now()` and `new Date()` start at DEMO_NOW and tick from there;
 * everything else on `Date` (parsing, UTC, explicit arguments, instance methods) is untouched. The ticking
 * keeps timers, cache TTLs and session expiry working. It matters for what the server renders itself: the
 * greeting ("Good morning", "Thursday, October 15") is server-rendered and React keeps that text on hydration,
 * so the page would otherwise show the day the capture ran, whatever the browser's clock says. Without
 * DEMO_NOW this file does nothing.
 *
 * DEMO_CLOCK_BASE (epoch ms, set by the instance) is the real moment DEMO_NOW stands for, so every process
 * agrees with the fake upstream.
 */
import { frozenDate, parseDemoNow } from "./clock.mjs";

const anchor = parseDemoNow(process.env.DEMO_NOW);
if (anchor !== null) {
  const base = Number(process.env.DEMO_CLOCK_BASE);
  globalThis.Date = frozenDate(Date, anchor, Number.isFinite(base) && base > 0 ? base : Date.now());
}
