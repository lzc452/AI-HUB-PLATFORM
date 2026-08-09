import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

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
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.includes("/internal/identity/actor")) {
        return Response.json({
          employeeId: "E0001",
          roleCodes: ["employee", "super_admin"],
          permissions: ["*"],
          departmentIds: ["dept-1"],
          primaryDepartmentId: "dept-1",
          sessionId: "test-session",
        });
      }
      if (path.includes("/internal/notifications")) {
        return Response.json([]);
      }
      return Response.json({}, { status: 404 });
    }),
  );
});

afterEach(() => {
  cleanup();
  setSession(null);
  vi.unstubAllGlobals();
});
