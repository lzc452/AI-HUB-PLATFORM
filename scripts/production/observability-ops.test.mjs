import assert from "node:assert/strict";
import { test } from "node:test";
import {
  redactCentralLog,
  validateAlertingSettings,
  validateObservabilitySettings,
} from "./observability-ops.mjs";

test("requires production observability coverage and SLO evidence", () => {
  assert.deepEqual(
    validateObservabilitySettings({
      targets: ["api", "worker", "postgres", "garage", "loki"],
      metrics: [
        "availability",
        "error_rate",
        "replication_lag",
        "wal_archive_lag",
        "backup_age",
      ],
      availabilityTarget: 0.995,
      rpoMinutes: 15,
      rtoMinutes: 120,
      logDestination: "loki",
      logRetentionDays: 30,
    }),
    [],
  );
});

test("rejects incomplete production observability settings", () => {
  assert.throws(
    () =>
      validateObservabilitySettings({
        targets: ["api"],
        metrics: ["availability"],
        availabilityTarget: 0.9,
        rpoMinutes: 60,
        rtoMinutes: 300,
        logDestination: "stdout",
        logRetentionDays: 0,
      }),
    /target|replication|RPO|RTO|retention/i,
  );
});

test("requires a non-default alert receiver and critical routes", () => {
  assert.deepEqual(
    validateAlertingSettings({
      receiver: "oncall-prod",
      routes: ["availability", "security", "backup", "replication"],
      repeatInterval: "4h",
    }),
    [],
  );
  assert.throws(
    () =>
      validateAlertingSettings({
        receiver: "null",
        routes: [],
        repeatInterval: "0s",
      }),
    /receiver|route|interval/i,
  );
});

test("redacts secrets, cookies, employee numbers, and database URLs from central logs", () => {
  const output = redactCentralLog(
    "employee E100 password=secret cookie=session=abc postgres://ai_hub:pw@db/ai_hub",
  );
  assert.doesNotMatch(output, /E100|secret|session=abc|postgres:\/\//);
  assert.match(output, /Redacted/);
});
