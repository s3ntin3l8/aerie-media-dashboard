import { describe, it, expect } from "vitest";
import { keepAliveDisplay } from "@/lib/embed/keepAliveDisplay";
import type { Service } from "@/lib/types";

// Minimal Service factory — only the fields keepAliveDisplay reads matter.
const svc = (over: Partial<Service> = {}): Service =>
  ({ id: "x", name: "X", embeddable: true, keepAlive: true, ...over }) as Service;

describe("keepAliveDisplay", () => {
  it("hides the indicator for non-embeddable or non-keep-alive services", () => {
    expect(keepAliveDisplay(svc({ keepAlive: false }), false).show).toBe(false);
    expect(keepAliveDisplay(svc({ embeddable: false }), true).show).toBe(false);
    // Even if reported live, a non-flagged service never reads as live.
    expect(keepAliveDisplay(svc({ keepAlive: false }), true).live).toBe(false);
  });

  it("flagged-but-idle: shown, not live, muted", () => {
    const d = keepAliveDisplay(svc(), false);
    expect(d.show).toBe(true);
    expect(d.live).toBe(false);
    expect(d.color).toBe("var(--on-surface-variant)");
    expect(d.title).toMatch(/persists in the background/i);
  });

  it("live: shown, live, accent-tinted", () => {
    const d = keepAliveDisplay(svc(), true);
    expect(d.show).toBe(true);
    expect(d.live).toBe(true);
    expect(d.color).toBe("var(--primary)");
    expect(d.title).toMatch(/running in the background now/i);
  });
});
