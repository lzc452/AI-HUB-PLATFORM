import { describe, expect, it } from "vitest";
import { createIdentityCookieBridge } from "./identity-cookie.middleware.js";

function makeRequest(
  headers: Record<string, string | string[] | undefined>,
): Record<string, string | string[] | undefined> {
  return headers;
}

function callBridge(
  headers: Record<string, string | string[] | undefined>,
): Record<string, string | string[] | undefined> {
  const requestHeaders = makeRequest(headers);
  let called = false;
  createIdentityCookieBridge()({ headers: requestHeaders }, {}, () => {
    called = true;
  });
  expect(called).toBe(true);
  return requestHeaders;
}

describe("createIdentityCookieBridge", () => {
  it("maps aihub_eid/aihub_sid cookies to the identity headers", () => {
    const headers = callBridge({
      cookie: "aihub_eid=DEMO-SUPER-ADMIN; aihub_sid=session-abc; theme=dark",
    });
    expect(headers["x-employee-id"]).toBe("DEMO-SUPER-ADMIN");
    expect(headers["x-session-id"]).toBe("session-abc");
  });

  it("cookie wins over an explicitly sent header (consistent with PermissionGuard precedence)", () => {
    const headers = callBridge({
      cookie: "aihub_eid=DEMO-SUPER-ADMIN; aihub_sid=session-abc",
      "x-employee-id": "someone-else",
    });
    expect(headers["x-employee-id"]).toBe("DEMO-SUPER-ADMIN");
  });

  it("leaves headers untouched when no identity cookies are present", () => {
    const headers = callBridge({
      cookie: "theme=dark",
      "x-employee-id": "E001",
      "x-session-id": "session-1",
    });
    expect(headers["x-employee-id"]).toBe("E001");
    expect(headers["x-session-id"]).toBe("session-1");
  });

  it("leaves header-only clients (tests/scripts) untouched when no cookie header exists", () => {
    const headers = callBridge({
      "x-employee-id": "E001",
      "x-session-id": "session-1",
    });
    expect(headers["x-employee-id"]).toBe("E001");
    expect(headers["x-session-id"]).toBe("session-1");
  });

  it("handles a partial cookie set", () => {
    const headers = callBridge({ cookie: "aihub_sid=session-abc" });
    expect(headers["x-employee-id"]).toBeUndefined();
    expect(headers["x-session-id"]).toBe("session-abc");
  });
});
