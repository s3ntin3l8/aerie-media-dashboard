import { describe, it, expect } from "vitest";

import { isMobileUserAgent } from "@/lib/viewport";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
const MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
// iPadOS reports a desktop (Mac) UA — deliberately classified as desktop; matchMedia
// corrects genuinely narrow viewports after mount.
const IPADOS =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";

describe("isMobileUserAgent", () => {
  it("classifies phone user-agents as mobile", () => {
    expect(isMobileUserAgent(IPHONE)).toBe(true);
    expect(isMobileUserAgent(ANDROID)).toBe(true);
  });

  it("classifies desktop user-agents as not mobile", () => {
    expect(isMobileUserAgent(MAC)).toBe(false);
    expect(isMobileUserAgent(WINDOWS)).toBe(false);
  });

  it("treats an iPadOS desktop UA as not mobile (matchMedia refines after mount)", () => {
    expect(isMobileUserAgent(IPADOS)).toBe(false);
  });

  it("defaults to desktop for a missing or empty user-agent", () => {
    expect(isMobileUserAgent(null)).toBe(false);
    expect(isMobileUserAgent(undefined)).toBe(false);
    expect(isMobileUserAgent("")).toBe(false);
  });
});
