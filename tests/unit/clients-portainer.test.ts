import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockHttp, mockClientsRegistry, mockEnv } from "./clientsMocks";

vi.mock("@/lib/integrations/http", () => mockHttp());
vi.mock("@/lib/integrations/registry", () => mockClientsRegistry());
vi.mock("@/lib/env", () => mockEnv());

import { fetchJson, fetchRaw } from "@/lib/integrations/http";
import { getServiceCredentials } from "@/lib/integrations/registry";
import { portainerEndpoints, portainerRestartContainer } from "@/lib/integrations/clients";

const mockJson = vi.mocked(fetchJson);
const mockRaw = vi.mocked(fetchRaw);
const mockCreds = vi.mocked(getServiceCredentials);

// Inspect the (url, opts) of the last fetchRaw call.
const lastRaw = () => mockRaw.mock.calls[mockRaw.mock.calls.length - 1] as [string, { method?: string; headers?: Record<string, string> }];

beforeEach(() => {
  vi.clearAllMocks();
  mockCreds.mockResolvedValue({ baseUrl: "http://portainer:9000/", apiKey: "ptr_tok", insecureTls: false } as never);
  mockRaw.mockResolvedValue({ ok: true, status: 204 } as never);
});

describe("portainerEndpoints", () => {
  it("maps Id/Name and sends the X-API-Key header", async () => {
    mockJson.mockResolvedValue([
      { Id: 1, Name: "local", extra: "ignored" },
      { Id: 2, Name: "agent-node" },
    ] as never);

    const endpoints = await portainerEndpoints("portainer");

    expect(endpoints).toEqual([{ Id: 1, Name: "local" }, { Id: 2, Name: "agent-node" }]);
    const [url, opts] = mockJson.mock.calls[0] as [string, { headers?: Record<string, string> }];
    expect(url).toBe("http://portainer:9000/api/endpoints");
    expect(opts.headers).toMatchObject({ "X-API-Key": "ptr_tok" });
  });

  it("tolerates a null/empty body", async () => {
    mockJson.mockResolvedValue(null as never);
    expect(await portainerEndpoints("portainer")).toEqual([]);
  });
});

describe("portainerRestartContainer", () => {
  it("POSTs the Docker restart path with the X-API-Key header", async () => {
    await portainerRestartContainer("portainer", "2", "jellyfin");

    const [url, opts] = lastRaw();
    expect(url).toBe("http://portainer:9000/api/endpoints/2/docker/containers/jellyfin/restart");
    expect(opts.method).toBe("POST");
    expect(opts.headers).toMatchObject({ "X-API-Key": "ptr_tok" });
  });

  it("url-encodes the endpoint id and container name", async () => {
    await portainerRestartContainer("portainer", "1", "my/container");
    const [url] = lastRaw();
    expect(url).toBe("http://portainer:9000/api/endpoints/1/docker/containers/my%2Fcontainer/restart");
  });

  it("throws an IntegrationError on a non-2xx response", async () => {
    mockRaw.mockResolvedValue({ ok: false, status: 404 } as never);
    await expect(portainerRestartContainer("portainer", "1", "nope")).rejects.toThrow(/HTTP 404/);
  });
});
