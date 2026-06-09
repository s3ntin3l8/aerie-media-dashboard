import { describe, it, expect } from "vitest";
import { statusColor, statusWord, uptimeText, REQ_TONE, REQ_LABEL } from "@/lib/display";
import type { Service } from "@/lib/types";

describe("display", () => {
  describe("statusColor()", () => {
    it('returns --originator-own for "up"', () => {
      expect(statusColor("up")).toBe("var(--originator-own)");
    });
    it('returns --amber for "degraded"', () => {
      expect(statusColor("degraded")).toBe("var(--amber)");
    });
    it('returns --error for "down"', () => {
      expect(statusColor("down")).toBe("var(--error)");
    });
    it('returns --on-surface-variant for "unknown"', () => {
      expect(statusColor("unknown")).toBe("var(--on-surface-variant)");
    });
  });

  describe("statusWord()", () => {
    it('returns "OPERATIONAL" for "up"', () => {
      expect(statusWord("up")).toBe("OPERATIONAL");
    });
    it('returns "DEGRADED" for "degraded"', () => {
      expect(statusWord("degraded")).toBe("DEGRADED");
    });
    it('returns "DOWN" for "down"', () => {
      expect(statusWord("down")).toBe("DOWN");
    });
    it('returns "NO DATA" for "unknown"', () => {
      expect(statusWord("unknown")).toBe("NO DATA");
    });
  });

  describe("uptimeText()", () => {
    it('returns "—" when status is unknown', () => {
      const s: Pick<Service, "status" | "uptime"> = { status: "unknown", uptime: 99.5 };
      expect(uptimeText(s)).toBe("—");
    });

    it("formats uptime percentage for known status", () => {
      const s: Pick<Service, "status" | "uptime"> = { status: "up", uptime: 99.123 };
      expect(uptimeText(s)).toBe("99.12%");
    });

    it("formats 100% uptime", () => {
      const s: Pick<Service, "status" | "uptime"> = { status: "up", uptime: 100 };
      expect(uptimeText(s)).toBe("100.00%");
    });
  });

  describe("REQ_TONE", () => {
    const statuses: Array<keyof typeof REQ_TONE> = ["available", "approved", "pending", "declined", "processing", "failed"];
    it("maps all expected request statuses", () => {
      for (const s of statuses) {
        expect(REQ_TONE[s]).toBeDefined();
      }
    });

    it("has correct tone values", () => {
      expect(REQ_TONE.available).toBe("originator-own");
      expect(REQ_TONE.approved).toBe("originator-court");
      expect(REQ_TONE.pending).toBe("amber");
      expect(REQ_TONE.declined).toBe("error");
      expect(REQ_TONE.processing).toBe("primary");
      expect(REQ_TONE.failed).toBe("error");
    });
  });

  describe("REQ_LABEL", () => {
    it("has a label for every tone entry", () => {
      for (const key of Object.keys(REQ_TONE)) {
        expect(REQ_LABEL[key]).toBeDefined();
      }
    });
  });
});