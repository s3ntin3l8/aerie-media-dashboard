import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/data/snapshot", () => ({ getSnapshot: vi.fn(async () => ({ services: [] })) }));
vi.mock("@/lib/integrations/clients", () => ({ overseerrSearch: vi.fn() }));
vi.mock("@/lib/integrations/registry", () => ({ getServiceSecret: vi.fn() }));
vi.mock("@/lib/session", () => ({ getSessionUser: vi.fn() }));

import { getSessionUser } from "@/lib/session";
import { GET as snapshotGET } from "@/app/api/snapshot/route";
import { GET as discoverGET } from "@/app/api/discover/route";
import { GET as iconsGET } from "@/app/api/icons/route";

const asAnon = () => vi.mocked(getSessionUser).mockResolvedValue({ id: "anon", name: "Guest", email: "", role: "user", groups: [] });
const asUser = () => vi.mocked(getSessionUser).mockResolvedValue({ id: "u1", name: "User", email: "u@x", role: "user", groups: [] });

beforeEach(() => vi.clearAllMocks());

describe("API route auth gates", () => {
  it("/api/snapshot rejects anonymous", async () => {
    asAnon();
    const res = await snapshotGET();
    expect(res.status).toBe(401);
  });

  it("/api/snapshot allows authenticated user", async () => {
    asUser();
    const res = await snapshotGET();
    expect(res.status).toBe(200);
  });

  it("/api/discover rejects anonymous", async () => {
    asAnon();
    const req = new Request("http://localhost/api/discover?q=test");
    const res = await discoverGET({ nextUrl: new URL(req.url) } as never);
    expect(res.status).toBe(401);
  });

  it("/api/discover allows authenticated user", async () => {
    asUser();
    const req = new Request("http://localhost/api/discover?q=test");
    const res = await discoverGET({ nextUrl: new URL(req.url) } as never);
    expect(res.status).not.toBe(401);
  });

  it("/api/icons rejects anonymous", async () => {
    asAnon();
    const req = new Request("http://localhost/api/icons?q=test");
    const res = await iconsGET({ nextUrl: new URL(req.url) } as never);
    expect(res.status).toBe(401);
  });
});
