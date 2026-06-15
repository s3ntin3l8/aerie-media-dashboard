import { describe, it, expect } from "vitest";
import { fmtBytes, fmtPercent, fmtMbps } from "@/lib/format";

describe("fmtBytes", () => {
  it("scales to TB / GB / MB with the right precision", () => {
    expect(fmtBytes(1_099_511_627_776)).toBe("1.0 TB");
    expect(fmtBytes(1_073_741_824)).toBe("1.0 GB");
    expect(fmtBytes(5 * 1_048_576)).toBe("5 MB"); // MB has no decimals
  });

  it("renders an em dash for null / undefined", () => {
    expect(fmtBytes(null)).toBe("—");
    expect(fmtBytes(undefined)).toBe("—");
  });
});

describe("fmtPercent", () => {
  it("rounds value/max to an integer percentage", () => {
    expect(fmtPercent(1, 4)).toBe(25);
    expect(fmtPercent(2, 3)).toBe(67);
  });

  it("clamps to 0–100 and guards a zero/absent max", () => {
    expect(fmtPercent(5, 4)).toBe(100); // over 100% clamps down
    expect(fmtPercent(-1, 4)).toBe(0);
    expect(fmtPercent(3, 0)).toBe(0);
    expect(fmtPercent(3, null)).toBe(0);
  });
});

describe("fmtMbps", () => {
  it("converts bytes/sec to a one-decimal megabit string", () => {
    expect(fmtMbps(12_300_000)).toBe("12.3");
    expect(fmtMbps(0)).toBe("0.0");
  });
});
