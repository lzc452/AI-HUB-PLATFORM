import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { validateProductionConfig } from "./validate-config.mjs";

const validEnvironment = {
  NODE_ROLE: "active",
  PUBLIC_HOSTNAME: "ai-hub.internal.example",
  PUBLIC_ORIGIN: "https://ai-hub.internal.example",
  DATABASE_URL: "postgres://ai_hub@postgres:5432/ai_hub",
  DATABASE_URL_FILE: "/run/secrets/database_url",
  WORKER_DATABASE_URL_FILE: "/run/secrets/worker_database_url",
  COOKIE_SECRET_FILE: "/run/secrets/cookie_secret",
  DB_PASSWORD_FILE: "/run/secrets/db_password",
  GARAGE_ACCESS_KEY_FILE: "/run/secrets/garage_access_key",
  GARAGE_SECRET_KEY_FILE: "/run/secrets/garage_secret_key",
  GARAGE_ADMIN_TOKEN_FILE: "/run/secrets/garage_admin_token",
  GARAGE_METRICS_TOKEN_FILE: "/run/secrets/garage_metrics_token",
  GARAGE_RPC_SECRET_FILE: "/run/secrets/garage_rpc_secret",
  TLS_CERT_FILE: "/run/secrets/tls_certificate",
  TLS_KEY_FILE: "/run/secrets/tls_private_key",
  POSTGRES_EXPORTER_DSN_FILE: "/run/secrets/postgres_exporter_dsn",
  GRAFANA_ADMIN_PASSWORD_FILE: "/run/secrets/grafana_admin_password",
  API_IMAGE: "registry.example/ai-hub-api@sha256:" + "a".repeat(64),
  WORKER_IMAGE: "registry.example/ai-hub-worker@sha256:" + "b".repeat(64),
  WEB_IMAGE: "registry.example/ai-hub-web@sha256:" + "c".repeat(64),
  POSTGRES_IMAGE: "postgres@sha256:" + "d".repeat(64),
  GARAGE_IMAGE: "garage@sha256:" + "e".repeat(64),
  CLAMAV_IMAGE: "clamav@sha256:" + "7".repeat(64),
  PROXY_IMAGE: "nginx@sha256:" + "f".repeat(64),
  PROMETHEUS_IMAGE: "prometheus@sha256:" + "1".repeat(64),
  POSTGRES_EXPORTER_IMAGE: "postgres-exporter@sha256:" + "2".repeat(64),
  ALERTMANAGER_IMAGE: "alertmanager@sha256:" + "3".repeat(64),
  GRAFANA_IMAGE: "grafana@sha256:" + "4".repeat(64),
  LOKI_IMAGE: "loki@sha256:" + "5".repeat(64),
  PROMTAIL_IMAGE: "promtail@sha256:" + "6".repeat(64),
};

test("accepts a complete production environment with digest-pinned images", () => {
  assert.deepEqual(
    validateProductionConfig(validEnvironment, "services: {}"),
    true,
  );
});

test("accepts file-only API and Worker database credentials", () => {
  const environment = { ...validEnvironment };
  delete environment.DATABASE_URL;

  assert.equal(validateProductionConfig(environment, "services: {}"), true);
});

test("rejects missing production secrets and node role", () => {
  const environment = { ...validEnvironment };
  delete environment.NODE_ROLE;
  delete environment.COOKIE_SECRET_FILE;

  assert.throws(
    () => validateProductionConfig(environment, "services: {}"),
    /NODE_ROLE.*COOKIE_SECRET_FILE|COOKIE_SECRET_FILE.*NODE_ROLE/,
  );
});

test("rejects a production environment missing the ClamAV image digest", () => {
  const environment = { ...validEnvironment };
  delete environment.CLAMAV_IMAGE;
  assert.throws(
    () => validateProductionConfig(environment, "services: {}"),
    /CLAMAV_IMAGE/i,
  );
});

test("rejects mutable image tags and development fallback secrets", () => {
  const environment = {
    ...validEnvironment,
    API_IMAGE: "registry.example/ai-hub-api:latest",
    COOKIE_SECRET: "ai-hub-local-cookie-secret-change-me",
  };

  assert.throws(
    () => validateProductionConfig(environment, "services: {}"),
    /digest|latest|development|local/i,
  );
});

test("rejects database and object storage host ports", () => {
  const compose = `
services:
  postgres:
    ports: ["5432:5432"]
  garage:
    ports: ["3900:3900"]
`;

  assert.throws(
    () => validateProductionConfig(validEnvironment, compose),
    /postgres.*port|garage.*port/i,
  );
});

test("production Compose exposes only the proxy and uses external secrets", async () => {
  const compose = await readFile("compose.production.yaml", "utf8");

  assert.match(compose, /services:/);
  assert.match(compose, /proxy:/);
  assert.match(compose, /secrets:/);
  assert.doesNotMatch(compose, /image:\s*[^\n]*:latest/);
  assert.doesNotMatch(compose, /ports:\s*\[[^\]]*(?:5432|3900|3901)/);
  assert.match(compose, /DATABASE_URL_FILE/);
  assert.match(compose, /WORKER_DATABASE_URL_FILE/);
  assert.match(compose, /COOKIE_SECRET_FILE/);
  assert.match(compose, /worker_database_url/);
});
