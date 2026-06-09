import { describe, it, expect } from "vitest";
import { CAT, catColor, CAT_ORDER, QUALITY_PROFILES } from "@/lib/categories";
import type { Category } from "@/lib/types";

describe("categories", () => {
  const allCats: Category[] = ["stream", "request", "automation", "monitor", "infra"];

  describe("CAT", () => {
    it("has an entry for every category", () => {
      for (const cat of allCats) {
        expect(CAT[cat]).toBeDefined();
        expect(CAT[cat].token).toBeTruthy();
        expect(CAT[cat].label).toBeTruthy();
      }
    });
  });

  describe("catColor", () => {
    it("returns the correct token per category", () => {
      expect(catColor("stream")).toBe(CAT.stream.token);
      expect(catColor("request")).toBe(CAT.request.token);
      expect(catColor("automation")).toBe(CAT.automation.token);
      expect(catColor("monitor")).toBe(CAT.monitor.token);
      expect(catColor("infra")).toBe(CAT.infra.token);
    });

    it("falls back to infra for an unknown category", () => {
      expect(catColor("unknown" as Category)).toBe(CAT.infra.token);
    });
  });

  describe("CAT_ORDER", () => {
    it("contains exactly the 5 categories in order", () => {
      expect(CAT_ORDER).toEqual(["stream", "request", "automation", "monitor", "infra"]);
    });

    it("has the same length as allCats", () => {
      expect(CAT_ORDER).toHaveLength(allCats.length);
    });
  });

  describe("QUALITY_PROFILES", () => {
    it("has exactly 3 profiles", () => {
      expect(QUALITY_PROFILES).toHaveLength(3);
    });

    it("has required fields on every profile", () => {
      for (const p of QUALITY_PROFILES) {
        expect(p.id).toBeTruthy();
        expect(p.label).toBeTruthy();
        expect(p.icon).toBeTruthy();
      }
    });

    it("has exactly one default profile", () => {
      const defaults = QUALITY_PROFILES.filter((p) => p.def);
      expect(defaults).toHaveLength(1);
      expect(defaults[0].id).toBe("hd1080");
    });
  });
});