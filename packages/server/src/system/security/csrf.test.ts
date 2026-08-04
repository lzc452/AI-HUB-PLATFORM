import { describe, expect, it } from "vitest";
import { assertCsrfRequest } from "./csrf.js";

describe("assertCsrfRequest", () => {
  it("rejects a state-changing request without a matching origin and token", () => {
    expect(() =>
      assertCsrfRequest({
        method: "POST",
        expectedOrigin: "https://ai-hub.internal.example",
        headers: {},
      }),
    ).toThrow("CSRF_ORIGIN_REQUIRED");
  });

  it("accepts a state-changing request with same-origin double-submit token", () => {
    expect(() =>
      assertCsrfRequest({
        method: "POST",
        expectedOrigin: "https://ai-hub.internal.example",
        headers: {
          origin: "https://ai-hub.internal.example",
          cookie: "csrf_token=token-123",
          "x-csrf-token": "token-123",
        },
      }),
    ).not.toThrow();
  });
});
