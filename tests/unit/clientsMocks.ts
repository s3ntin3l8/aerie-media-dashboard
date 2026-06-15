// Shared vi.mock factories for the integration-client unit tests (clients-*.test.ts).
// Each test file mocks the same three modules with the same shape; these factories
// centralise that boilerplate. Usage (the import is safe to reference inside a hoisted
// vi.mock factory because it is itself hoisted):
//
//   import { mockHttp, mockClientsRegistry, mockEnv } from "./clientsMocks";
//   vi.mock("@/lib/integrations/http", () => mockHttp());
//   vi.mock("@/lib/integrations/registry", () => mockClientsRegistry());
//   vi.mock("@/lib/env", () => mockEnv());
import { vi } from "vitest";

/** The IntegrationError shape the real http module exports (message prefixed with [service]). */
export class MockIntegrationError extends Error {
  service: string;
  status?: number;
  constructor(service: string, message: string, status?: number) {
    super(`[${service}] ${message}`);
    this.name = "IntegrationError";
    this.service = service;
    this.status = status;
  }
}

/** Mock of @/lib/integrations/http — every network primitive as a vi.fn(). */
export function mockHttp() {
  return {
    fetchJson: vi.fn(),
    fetchJsonRaw: vi.fn(),
    fetchRaw: vi.fn(),
    IntegrationError: MockIntegrationError,
  };
}

/** Mock of @/lib/integrations/registry — the minimal surface the client functions read. */
export function mockClientsRegistry() {
  return {
    getServiceSecret: vi.fn(),
    getServiceCredentials: vi.fn(),
    getDeploymentSetting: vi.fn(),
  };
}

/** Mock of @/lib/env — the server-only env with auth disabled (clients don't need OIDC). */
export function mockEnv() {
  return {
    env: { encryptionKey: "0".repeat(64), authSecret: "test", configFile: "/dev/null", databaseUrl: "file::memory:" },
    authConfigured: false,
  };
}
