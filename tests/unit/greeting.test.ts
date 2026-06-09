import { describe, it, expect } from "vitest";
import { getGreeting } from "@/lib/greeting";

describe("getGreeting", () => {
  it('returns "Good night" for hours 0-4', () => {
    for (const h of [0, 1, 2, 3, 4]) {
      const d = new Date(2025, 0, 1, h, 0, 0);
      expect(getGreeting(d).greet).toBe("Good night");
    }
  });

  it('returns "Good morning" for hours 5-11', () => {
    for (const h of [5, 8, 11]) {
      const d = new Date(2025, 0, 1, h, 0, 0);
      expect(getGreeting(d).greet).toBe("Good morning");
    }
  });

  it('returns "Good afternoon" for hours 12-17', () => {
    for (const h of [12, 15, 17]) {
      const d = new Date(2025, 0, 1, h, 0, 0);
      expect(getGreeting(d).greet).toBe("Good afternoon");
    }
  });

  it('returns "Good evening" for hours 18-23', () => {
    for (const h of [18, 20, 23]) {
      const d = new Date(2025, 0, 1, h, 0, 0);
      expect(getGreeting(d).greet).toBe("Good evening");
    }
  });

  it("formats the date in en-US locale", () => {
    const d = new Date(2025, 5, 3);
    const result = getGreeting(d);
    expect(result.date).toBe("Tuesday, June 3");
  });

  it("defaults to current time when no argument is given", () => {
    const result = getGreeting();
    expect(result.greet).toBeTruthy();
    expect(result.date).toBeTruthy();
  });
});