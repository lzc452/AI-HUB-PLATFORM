import { describe, expect, it } from "vitest";
import { parseRuntimeConfig } from "./runtime-config.js";

describe("parseRuntimeConfig", () => {
  it("rejects a missing database URL", () => {
    expect(() =>
      parseRuntimeConfig({
        NODE_ENV: "test",
        API_PORT: "3000",
        COOKIE_SECRET: "12345678901234567890123456789012",
      }),
    ).toThrow(/DATABASE_URL/);
  });

  it("normalizes valid values", () => {
    expect(
      parseRuntimeConfig({
        NODE_ENV: "test",
        API_PORT: "3100",
        DATABASE_URL: "postgres://ai_hub:ai_hub@postgres:5432/ai_hub",
        COOKIE_SECRET: "12345678901234567890123456789012",
        LOG_LEVEL: "warn",
        OUTBOX_POLL_INTERVAL_MS: "750",
        WORKER_METRICS_PORT: "9465",
        ENABLE_API_DOCS: "true",
      }),
    ).toEqual({
      nodeEnv: "test",
      apiPort: 3100,
      databaseUrl: "postgres://ai_hub:ai_hub@postgres:5432/ai_hub",
      cookieSecret: "12345678901234567890123456789012",
      logLevel: "warn",
      outboxPollIntervalMs: 750,
      workerMetricsPort: 9465,
      enableApiDocs: true,
    });
  });

  it("defaults API docs to disabled", () => {
    expect(
      parseRuntimeConfig({
        NODE_ENV: "development",
        DATABASE_URL: "postgres://ai_hub:ai_hub@postgres:5432/ai_hub",
        COOKIE_SECRET: "12345678901234567890123456789012",
      }).enableApiDocs,
    ).toBe(false);
  });

  it("reads production secrets from mounted files", () => {
    expect(
      parseRuntimeConfig({
        NODE_ENV: "production",
        API_PORT: "3000",
        DATABASE_URL_FILE: "./test-fixtures/database-url",
        COOKIE_SECRET_FILE: "./test-fixtures/cookie-secret",
      }),
    ).toMatchObject({
      nodeEnv: "production",
      databaseUrl: "postgres://ai_hub@postgres:5432/ai_hub",
      cookieSecret: "production-cookie-secret-with-32-chars",
    });
  });
});
