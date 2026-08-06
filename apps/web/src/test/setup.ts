import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach, beforeEach } from "vitest";

import { setSession } from "../modules/auth/session.store";

configure({ asyncUtilTimeout: 5000 });

class ResizeObserverStub {
  disconnect() {}
  observe() {}
  unobserve() {}
}

Object.defineProperty(globalThis, "ResizeObserver", {
  configurable: true,
  value: ResizeObserverStub,
});

Object.defineProperty(globalThis.window, "matchMedia", {
  configurable: true,
  value: (query: string) => ({
    addEventListener: () => {},
    addListener: () => {},
    dispatchEvent: () => false,
    matches: false,
    media: query,
    onchange: null,
    removeEventListener: () => {},
    removeListener: () => {},
  }),
});

beforeEach(() => {
  setSession({ employeeId: "E0001", sessionId: "test-session" });
});

afterEach(() => {
  cleanup();
});
