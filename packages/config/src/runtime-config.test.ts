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
      }),
    ).toEqual({
      nodeEnv: "test",
      apiPort: 3100,
      databaseUrl: "postgres://ai_hub:ai_hub@postgres:5432/ai_hub",
      cookieSecret: "12345678901234567890123456789012",
      logLevel: "warn",
      outboxPollIntervalMs: 750,
    });
  });
});
