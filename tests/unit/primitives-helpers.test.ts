import { describe, it, expect } from "vitest";
import { TRUNCATE, listDivider } from "@/components/primitives";

describe("listDivider", () => {
  it("draws no border above the first row (index 0)", () => {
    expect(listDivider(0)).toBe("none");
  });

  it("draws a hairline for subsequent rows, default 45% opacity", () => {
    expect(listDivider(1)).toBe("1px solid color-mix(in srgb, var(--outline-variant) 45%, transparent)");
  });

  it("honours a custom opacity (e.g. 50 for stream rows)", () => {
    expect(listDivider(3, 50)).toBe("1px solid color-mix(in srgb, var(--outline-variant) 50%, transparent)");
  });
});

describe("TRUNCATE", () => {
  it("is the single-line ellipsis style triplet", () => {
    expect(TRUNCATE).toEqual({ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" });
  });
});
