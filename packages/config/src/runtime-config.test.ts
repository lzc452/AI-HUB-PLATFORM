import { describe, expect, it } from "vitest";
import { parseRuntimeConfig } from "./runtime-config.js";

const BASE_ENV = {
  DATABASE_URL: "postgres://ai_hub:ai_hub@postgres:5432/ai_hub",
  COOKIE_SECRET: "12345678901234567890123456789012",
} as const;

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
        OUTBOX_LEASE_DURATION_MS: "901000",
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
      outboxLeaseDurationMs: 901000,
      workerMetricsPort: 9465,
      storageDirectory: ".storage/artifacts",
      artifactUploadEnabled: false,
      artifactMaxSizeBytes: 64 * 1024 * 1024,
      enableApiDocs: true,
      demoDataEnabled: false,
      demoMode: false,
      loginEncryptionPrivateKey: undefined,
      dingtalkSsoEnabled: false,
      dingtalkClientId: undefined,
      dingtalkClientSecret: undefined,
      dingtalkCorpId: undefined,
      dingtalkRedirectUri: undefined,
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

  it("defaults the Outbox lease to fifteen minutes", () => {
    expect(
      parseRuntimeConfig({
        ...BASE_ENV,
        NODE_ENV: "development",
      }).outboxLeaseDurationMs,
    ).toBe(900_000);
  });

  it("rejects an Outbox lease shorter than one minute", () => {
    expect(() =>
      parseRuntimeConfig({
        ...BASE_ENV,
        NODE_ENV: "development",
        OUTBOX_LEASE_DURATION_MS: "59999",
      }),
    ).toThrow(/OUTBOX_LEASE_DURATION_MS/u);
  });

  it("rejects the local artifact adapter in production", () => {
    expect(() =>
      parseRuntimeConfig({
        ...BASE_ENV,
        NODE_ENV: "production",
        ARTIFACT_UPLOAD_ENABLED: "true",
        LOGIN_ENCRYPTION_PRIVATE_KEY_FILE: "./test-fixtures/encryption-key.pem",
      }),
    ).toThrow("ARTIFACT_UPLOAD_PRODUCTION_ADAPTER_REQUIRED");
  });

  it("rejects a direct-upload limit above 64 MiB", () => {
    expect(() =>
      parseRuntimeConfig({
        ...BASE_ENV,
        NODE_ENV: "development",
        ARTIFACT_MAX_SIZE_BYTES: String(64 * 1024 * 1024 + 1),
      }),
    ).toThrow(/ARTIFACT_MAX_SIZE_BYTES/u);
  });

  it("reads production secrets from mounted files", () => {
    expect(
      parseRuntimeConfig({
        NODE_ENV: "production",
        API_PORT: "3000",
        DATABASE_URL_FILE: "./test-fixtures/database-url",
        COOKIE_SECRET_FILE: "./test-fixtures/cookie-secret",
        LOGIN_ENCRYPTION_PRIVATE_KEY_FILE: "./test-fixtures/encryption-key.pem",
      }),
    ).toMatchObject({
      nodeEnv: "production",
      databaseUrl: "postgres://ai_hub@postgres:5432/ai_hub",
      cookieSecret: "production-cookie-secret-with-32-chars",
    });
  });

  it("rejects production mode without login encryption private key", () => {
    expect(() =>
      parseRuntimeConfig({
        ...BASE_ENV,
        NODE_ENV: "production",
      }),
    ).toThrow(/LOGIN_ENCRYPTION/);
  });

  it("accepts production mode with login encryption private key file", () => {
    expect(
      parseRuntimeConfig({
        ...BASE_ENV,
        NODE_ENV: "production",
        LOGIN_ENCRYPTION_PRIVATE_KEY_FILE: "./test-fixtures/encryption-key.pem",
      }),
    ).toMatchObject({
      nodeEnv: "production",
      loginEncryptionPrivateKey: expect.stringContaining("PRIVATE KEY"),
    });
  });

  it("defaults login encryption key to undefined in dev mode", () => {
    expect(
      parseRuntimeConfig({
        ...BASE_ENV,
        NODE_ENV: "development",
      }).loginEncryptionPrivateKey,
    ).toBeUndefined();
  });

  it("reads login encryption key from file in dev mode when provided", () => {
    expect(
      parseRuntimeConfig({
        ...BASE_ENV,
        NODE_ENV: "development",
        LOGIN_ENCRYPTION_PRIVATE_KEY_FILE: "./test-fixtures/encryption-key.pem",
      }),
    ).toMatchObject({
      loginEncryptionPrivateKey: expect.stringContaining("PRIVATE KEY"),
    });
  });

  it("rejects DingTalk SSO enabled without required fields", () => {
    expect(() =>
      parseRuntimeConfig({
        ...BASE_ENV,
        NODE_ENV: "development",
        DINGTALK_SSO_ENABLED: "true",
        DINGTALK_CLIENT_ID: "client-id",
        // missing CLIENT_SECRET, CORP_ID, REDIRECT_URI
      }),
    ).toThrow(/DINGTALK/);
  });

  it("accepts complete DingTalk SSO configuration", () => {
    expect(
      parseRuntimeConfig({
        ...BASE_ENV,
        NODE_ENV: "development",
        DINGTALK_SSO_ENABLED: "true",
        DINGTALK_CLIENT_ID: "dingtalk-client-id",
        DINGTALK_CLIENT_SECRET_FILE: "./test-fixtures/dingtalk-secret",
        DINGTALK_CORP_ID: "corp-id-123",
        DINGTALK_REDIRECT_URI: "https://hub.example.com/auth/dingtalk-callback",
      }),
    ).toMatchObject({
      dingtalkSsoEnabled: true,
      dingtalkClientId: "dingtalk-client-id",
      dingtalkClientSecret: "test-dingtalk-secret",
      dingtalkCorpId: "corp-id-123",
      dingtalkRedirectUri: "https://hub.example.com/auth/dingtalk-callback",
    });
  });

  it("defaults DingTalk SSO to disabled", () => {
    expect(
      parseRuntimeConfig({
        ...BASE_ENV,
        NODE_ENV: "development",
      }).dingtalkSsoEnabled,
    ).toBe(false);
  });
});
