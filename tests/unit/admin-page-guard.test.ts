import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";

// admin/page.tsx is a server component that gates on the session role and
// redirects non-admins to "/". The real next/navigation redirect() throws to
// halt rendering; mimic that so the guard's control flow is exercised. Stub the
// session + the Admin view (a client component we don't want to render here).
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));
const sessionUser = vi.hoisted(() => ({ role: "admin" as "admin" | "user" }));
vi.mock("@/lib/session", () => ({ getSessionUser: vi.fn(async () => sessionUser) }));
vi.mock("@/components/views/Admin", () => ({ Admin: () => null }));

import { redirect } from "next/navigation";
import { Admin } from "@/components/views/Admin";
import AdminPage from "@/app/(portal)/admin/page";

describe("AdminPage — server-side admin guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects a non-admin to / and never renders the Admin view", async () => {
    sessionUser.role = "user";
    await expect(AdminPage()).rejects.toThrow("NEXT_REDIRECT:/");
    expect(redirect).toHaveBeenCalledWith("/");
  });

  it("renders the Admin view for an admin", async () => {
    sessionUser.role = "admin";
    const el = await AdminPage();
    expect(redirect).not.toHaveBeenCalled();
    expect(React.isValidElement(el) && el.type === Admin).toBe(true);
  });
});
