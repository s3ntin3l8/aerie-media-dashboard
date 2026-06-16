import "@testing-library/jest-dom";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Node 22+ ships a native experimental Web Storage `localStorage`/`sessionStorage` global that is
// `undefined` without --localstorage-file. Under vitest's jsdom environment `window === globalThis`,
// so this native accessor shadows jsdom's storage and `localStorage` resolves to `undefined`
// (Node 26 locally vs. CI's Node 24, which has no such global). Install a small in-memory Storage
// so bare `localStorage` works in tests and in components that use it (e.g. PortalProvider).
class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  clear() {
    this.store.clear();
  }
  getItem(key: string) {
    return this.store.has(key) ? (this.store.get(key) as string) : null;
  }
  key(index: number) {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  setItem(key: string, value: string) {
    this.store.set(key, String(value));
  }
}
for (const key of ["localStorage", "sessionStorage"] as const) {
  Object.defineProperty(globalThis, key, {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
  });
}

// Automatically cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock next/navigation if needed
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));
