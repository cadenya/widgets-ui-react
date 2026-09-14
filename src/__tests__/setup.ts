import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Without vitest globals, Testing Library does not auto-unmount between
// tests; do it here so one test's DOM never leaks into the next.
afterEach(cleanup);

/**
 * DOM shims for component tests (jsdom lacks ResizeObserver, which Radix
 * ScrollArea expects to exist).
 */
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
