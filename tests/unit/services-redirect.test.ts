import { describe, it, expect, vi } from "vitest";

// services/page.tsx is a server component that 307-redirects /services → /status.
// Mock redirect so calling the component doesn't throw a NEXT_REDIRECT error.
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { redirect } from "next/navigation";
import ServicesPage from "@/app/(portal)/services/page";

describe("ServicesPage redirect", () => {
  it("redirects /services → /status", () => {
    ServicesPage();
    expect(redirect).toHaveBeenCalledWith("/status");
  });
});
