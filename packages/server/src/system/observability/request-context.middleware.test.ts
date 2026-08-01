import { describe, expect, it, vi } from "vitest";

import {
  getTraceId,
  normalizeTraceId,
  RequestContextMiddleware,
} from "./request-context.middleware.js";

describe("normalizeTraceId", () => {
  it("keeps a valid caller trace id", () => {
    expect(normalizeTraceId("01JZ3M8V9Z3V4F2V3K0R4Y8P6S")).toBe(
      "01JZ3M8V9Z3V4F2V3K0R4Y8P6S",
    );
  });

  it("replaces an unsafe value", () => {
    expect(normalizeTraceId("bad value\r\n")).toMatch(
      /^[0-9A-HJKMNP-TV-Z]{26}$/,
    );
  });

  it("publishes the trace id to the response and request context", () => {
    const finishListeners: Array<() => void> = [];
    const metrics = {
      trackHttpRequest: vi.fn(() => vi.fn()),
    };
    const middleware = new RequestContextMiddleware(metrics);
    const request = {
      headers: { "x-request-id": "01JZ3M8V9Z3V4F2V3K0R4Y8P6S" },
      method: "GET",
      originalUrl: "/internal/health/live",
    };
    const response = {
      statusCode: 200,
      setHeader: vi.fn(),
      once: vi.fn((event: string, listener: () => void) => {
        if (event === "finish") finishListeners.push(listener);
        return response;
      }),
    };

    middleware.use(request, response, () => {
      expect(getTraceId()).toBe("01JZ3M8V9Z3V4F2V3K0R4Y8P6S");
    });

    expect(response.setHeader).toHaveBeenCalledWith(
      "x-request-id",
      "01JZ3M8V9Z3V4F2V3K0R4Y8P6S",
    );
    expect(request.headers["x-request-id"]).toBe("01JZ3M8V9Z3V4F2V3K0R4Y8P6S");
    finishListeners[0]?.();
    expect(metrics.trackHttpRequest).toHaveBeenCalledOnce();
  });

  it("shares a generated trace id with later middleware", () => {
    const request = {
      headers: { "x-request-id": "unsafe" },
      method: "GET",
      originalUrl: "/internal/health/live",
    };
    const response = {
      statusCode: 200,
      setHeader: vi.fn(),
      once: vi.fn(),
    };
    const middleware = new RequestContextMiddleware({
      trackHttpRequest: () => vi.fn(),
    });

    middleware.use(request, response, () => {});

    expect(request.headers["x-request-id"]).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(response.setHeader).toHaveBeenCalledWith(
      "x-request-id",
      request.headers["x-request-id"],
    );
  });
});
