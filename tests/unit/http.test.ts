import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchJson, IntegrationError } from "@/lib/integrations/http";

describe("IntegrationError", () => {
  it("sets service, message, and status", () => {
    const err = new IntegrationError("gatus", "HTTP 404 for /api", 404);
    expect(err.service).toBe("gatus");
    expect(err.status).toBe(404);
    expect(err.message).toBe("[gatus] HTTP 404 for /api");
    expect(err.name).toBe("IntegrationError");
  });

  it("works without status", () => {
    const err = new IntegrationError("sonarr", "network error");
    expect(err.service).toBe("sonarr");
    expect(err.status).toBeUndefined();
    expect(err.message).toBe("[sonarr] network error");
  });
});

describe("fetchJson", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
  });

  it("makes a GET request and returns parsed JSON", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: "up" }),
    });

    const result = await fetchJson<{ status: string }>("http://svc/api", { service: "svc" });
    expect(result).toEqual({ status: "up" });
    expect(globalThis.fetch).toHaveBeenCalledWith("http://svc/api", expect.objectContaining({
      method: "GET",
      cache: "no-store",
    }));
  });

  it("merges custom headers with Accept", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    await fetchJson("http://svc/api", {
      service: "svc",
      headers: { "X-Api-Key": "abc123" },
    });

    const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs[1].headers).toEqual(
      expect.objectContaining({
        Accept: "application/json",
        "X-Api-Key": "abc123",
      }),
    );
  });

  it("sends POST with JSON body", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    await fetchJson("http://svc/api", {
      service: "svc",
      method: "POST",
      body: { name: "test" },
    });

    const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs[1].method).toBe("POST");
    expect(callArgs[1].body).toBe(JSON.stringify({ name: "test" }));
  });

  it("does not send body when body is null/undefined", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    await fetchJson("http://svc/api", { service: "svc" });

    const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs[1].body).toBeUndefined();
  });

  it("throws IntegrationError on HTTP error with status", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
    });

    await expect(
      fetchJson("http://svc/api", { service: "svc" }),
    ).rejects.toThrow(IntegrationError);

    await expect(
      fetchJson("http://svc/api", { service: "svc" }),
    ).rejects.toThrow("HTTP 503");
  });

  it("wraps network errors in IntegrationError", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(
      fetchJson("http://svc/api", { service: "svc" }),
    ).rejects.toThrow(IntegrationError);
  });

  it("re-throws IntegrationError as-is (does not wrap)", async () => {
    const httpErr = new IntegrationError("svc", "HTTP 500 for /api", 500);
    globalThis.fetch = vi.fn().mockRejectedValue(httpErr);

    try {
      await fetchJson("http://svc/api", { service: "svc" });
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBe(httpErr);
    }
  });

  it("aborts requests that exceed the timeout", async () => {
    vi.useRealTimers();
    let abortSignal: AbortSignal | undefined;
    globalThis.fetch = vi.fn().mockImplementation(async (_url: string, opts: RequestInit) => {
      abortSignal = opts.signal ?? undefined;
      await new Promise((_resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        }, 10000);
        opts.signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(new DOMException("The operation was aborted.", "AbortError"));
        });
      });
      return { ok: true, json: () => Promise.resolve({}) };
    });

    const promise = fetchJson("http://svc/api", { service: "svc", timeoutMs: 50 });
    await expect(promise).rejects.toThrow(IntegrationError);
    expect(abortSignal?.aborted ?? false).toBe(true);
  });

  it("clears the timeout on success", async () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    });

    await fetchJson("http://svc/api", { service: "svc" });
    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });
});