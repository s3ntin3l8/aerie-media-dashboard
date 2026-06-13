import { describe, it, expect } from "vitest";
import { fmtTime } from "@/lib/time";

describe("fmtTime", () => {
  it("formats sub-hour durations as M:SS", () => {
    expect(fmtTime(0)).toBe("0:00");
    expect(fmtTime(5)).toBe("0:05");
    expect(fmtTime(65)).toBe("1:05");
    expect(fmtTime(600)).toBe("10:00");
  });

  it("formats hour+ durations as H:MM:SS", () => {
    expect(fmtTime(3661)).toBe("1:01:01");
    expect(fmtTime(8880)).toBe("2:28:00"); // a 148-minute movie
  });

  it("floors fractional seconds and clamps negatives to 0:00", () => {
    expect(fmtTime(90.9)).toBe("1:30");
    expect(fmtTime(-42)).toBe("0:00");
  });
});
