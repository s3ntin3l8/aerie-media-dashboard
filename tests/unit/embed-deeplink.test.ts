import { describe, it, expect } from "vitest";
import { sanitizeEmbedPath, embedSrc } from "@/lib/embed/deepLink";

describe("embed/deepLink — sanitizeEmbedPath", () => {
  it("accepts a root-relative path", () => {
    expect(sanitizeEmbedPath("/movie/the-matrix-1999")).toBe("/movie/the-matrix-1999");
    expect(sanitizeEmbedPath("/series/breaking-bad")).toBe("/series/breaking-bad");
  });

  it("rejects empty / nullish input", () => {
    expect(sanitizeEmbedPath(undefined)).toBeUndefined();
    expect(sanitizeEmbedPath(null)).toBeUndefined();
    expect(sanitizeEmbedPath("")).toBeUndefined();
  });

  it("rejects protocol-relative paths", () => {
    expect(sanitizeEmbedPath("//evil.com/x")).toBeUndefined();
  });

  it("rejects absolute URLs with a scheme", () => {
    expect(sanitizeEmbedPath("https://evil.com")).toBeUndefined();
    expect(sanitizeEmbedPath("/movie/x:y")).toBeUndefined(); // colon anywhere is rejected
  });

  it("rejects non-root-relative and backslash paths", () => {
    expect(sanitizeEmbedPath("movie/x")).toBeUndefined();
    expect(sanitizeEmbedPath("/movie\\x")).toBeUndefined();
  });
});

describe("embed/deepLink — embedSrc", () => {
  it("returns the base origin when no path", () => {
    expect(embedSrc("https", "radarr.example.com")).toBe("https://radarr.example.com");
  });

  it("appends a valid deep path", () => {
    expect(embedSrc("https", "radarr.example.com", "/movie/dune-2024")).toBe(
      "https://radarr.example.com/movie/dune-2024",
    );
  });

  it("falls back to base for an unsafe path", () => {
    expect(embedSrc("https", "radarr.example.com", "//evil.com")).toBe("https://radarr.example.com");
  });
});
