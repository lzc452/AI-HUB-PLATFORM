import { describe, expect, it } from "vitest";
import { createProductionSecurityMiddleware } from "./production.middleware.js";

describe("production security middleware", () => {
  it("does not persist an employee identity taken from an untrusted request header", async () => {
    let capturedActor: string | undefined;
    const middleware = createProductionSecurityMiddleware({
      enabled: true,
      expectedOrigin: "https://ai-hub.internal.example",
      replayStore: {
        async consume(input) {
          capturedActor = input.actorEmployeeId;
          return true;
        },
      },
    });
    const response = {
      status: () => response,
      setHeader: () => response,
      json: () => undefined,
    };

    middleware(
      {
        method: "POST",
        url: "/internal/analytics/exports",
        headers: {
          origin: "https://ai-hub.internal.example",
          cookie: "csrf_token=csrf-value",
          "x-csrf-token": "csrf-value",
          "x-request-nonce": "nonce-1234567890",
          "x-request-timestamp": new Date().toISOString(),
          "x-employee-id": "attacker-controlled",
        },
      },
      response,
      () => undefined,
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(capturedActor).toBe("authenticated-request");
  });
});
