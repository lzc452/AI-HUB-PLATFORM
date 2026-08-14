import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  assertManualPromotionReady,
  REQUIRED_RESTORE_RELATIONS,
  validateBackupEvidence,
  validatePostgresSettings,
} from "./postgres-ops.mjs";

test("accepts primary streaming and WAL archive settings", () => {
  assert.deepEqual(
    validatePostgresSettings({
      role: "primary",
      wal_level: "replica",
      archive_mode: "on",
      archive_command: "test ! -f /archive/%f && cp %p /archive/%f",
      max_wal_senders: "10",
      max_replication_slots: "2",
      hot_standby: "off",
    }),
    true,
  );
});

test("rejects standby settings without streaming and hot standby", () => {
  assert.throws(
    () =>
      validatePostgresSettings({
        role: "standby",
        wal_level: "minimal",
        archive_mode: "off",
        archive_command: "",
        max_wal_senders: "0",
        max_replication_slots: "0",
        hot_standby: "off",
      }),
    /wal_level|archive|hot_standby/i,
  );
});

test("requires checksum and restore evidence for a backup", () => {
  assert.throws(
    () =>
      validateBackupEvidence({
        backupId: "backup-2026-08-04T100000Z",
        startedAt: "2026-08-04T10:00:00Z",
        finishedAt: "2026-08-04T10:04:00Z",
        sha256: "",
        restoredAt: "",
        verifiedTables: [],
      }),
    /sha256|restore|verified/i,
  );
});

test("恢复证据必须来自隔离目标，并覆盖仓库真实的迁移、审计、Outbox 与关键业务关系", () => {
  const verifiedRelations = REQUIRED_RESTORE_RELATIONS.map((name) => ({
    name,
    kind: "table",
    readable: true,
    rowCount: 0,
  }));

  assert.equal(
    validateBackupEvidence({
      backupId: "backup-2026-08-12T100000Z",
      sourceDatabaseId: "production-primary",
      restoreTargetId: "restore-drill-2026-08-12",
      restoreTargetIsIsolated: true,
      isolationEvidenceId: "change-2026-08-12-restore-network",
      startedAt: "2026-08-12T10:00:00.000Z",
      finishedAt: "2026-08-12T10:04:00.000Z",
      restoreStartedAt: "2026-08-12T11:00:00.000Z",
      restoredAt: "2026-08-12T11:08:00.000Z",
      backupVerificationExitCode: 0,
      restoreCommandExitCode: 0,
      amcheckExitCode: 0,
      sha256: "a".repeat(64),
      restoreLogSha256: "b".repeat(64),
      verificationOutputSha256: "c".repeat(64),
      migrationCount: 22,
      latestMigration: "0022_outbox_claim_lease",
      expectedLatestMigration: "0022_outbox_claim_lease",
      verifiedRelations,
      integrityChecks: {
        applicationVersionOrphans: 0,
        demandApplicationOrphans: 0,
        invalidOutboxStatuses: 0,
      },
    }),
    true,
  );

  assert.ok(REQUIRED_RESTORE_RELATIONS.includes("kysely_migration"));
  assert.ok(REQUIRED_RESTORE_RELATIONS.includes("security_audit_events"));
  assert.ok(REQUIRED_RESTORE_RELATIONS.includes("outbox_events"));
  assert.ok(REQUIRED_RESTORE_RELATIONS.includes("applications"));
  assert.ok(!REQUIRED_RESTORE_RELATIONS.includes("schema_migrations"));
  assert.ok(!REQUIRED_RESTORE_RELATIONS.includes("audit_events"));
});

test("拒绝只有声明值或仍引用不存在对象的恢复证据", () => {
  assert.throws(
    () =>
      validateBackupEvidence({
        backupId: "backup-2026-08-12T100000Z",
        sourceDatabaseId: "production-primary",
        restoreTargetId: "production-primary",
        restoreTargetIsIsolated: false,
        isolationEvidenceId: "",
        backupVerificationExitCode: 0,
        restoreCommandExitCode: 0,
        amcheckExitCode: 0,
        sha256: "b".repeat(64),
        restoreLogSha256: "c".repeat(64),
        verificationOutputSha256: "d".repeat(64),
        startedAt: "2026-08-12T10:00:00.000Z",
        finishedAt: "2026-08-12T10:04:00.000Z",
        restoreStartedAt: "2026-08-12T11:00:00.000Z",
        restoredAt: "2026-08-12T11:08:00.000Z",
        migrationCount: 1,
        latestMigration: "0001_system_foundation",
        expectedLatestMigration: "0001_system_foundation",
        verifiedTables: ["schema_migrations", "audit_events", "outbox_events"],
      }),
    /isolated|relation|integrity|source|target/i,
  );
});

test("最小权限 bootstrap 与验证 SQL 不含凭据，并固化四类角色边界", async () => {
  const [bootstrap, verification] = await Promise.all([
    readFile("infra/postgres/bootstrap-application-roles.sql", "utf8"),
    readFile("infra/postgres/verify-application-roles.sql", "utf8"),
  ]);

  for (const role of [
    "ai_hub_migration",
    "ai_hub_api",
    "ai_hub_worker",
    "ai_hub_observability",
  ]) {
    assert.match(bootstrap, new RegExp(role, "u"));
    assert.match(verification, new RegExp(role, "u"));
  }
  assert.match(bootstrap, /AI_HUB_MIGRATION_DB_PASSWORD/u);
  assert.match(bootstrap, /AI_HUB_API_DB_PASSWORD/u);
  assert.match(bootstrap, /AI_HUB_WORKER_DB_PASSWORD/u);
  assert.match(bootstrap, /AI_HUB_OBSERVABILITY_DB_PASSWORD/u);
  assert.match(
    bootstrap,
    /ALTER DEFAULT PRIVILEGES FOR ROLE ai_hub_migration/u,
  );
  assert.match(bootstrap, /REVOKE CREATE ON SCHEMA public FROM PUBLIC/u);
  assert.match(bootstrap, /GRANT pg_monitor TO ai_hub_observability/u);
  assert.match(verification, /rolsuper/u);
  assert.match(verification, /has_table_privilege/u);
  assert.doesNotMatch(
    `${bootstrap}\n${verification}`,
    /(?:password|secret)\s*=\s*[^:\s][^\n]*/iu,
  );
});

test("隔离恢复验证 SQL 检查真实对象和关键关系完整性", async () => {
  const sql = await readFile(
    "infra/postgres/verify-restored-database.sql",
    "utf8",
  );

  for (const relation of REQUIRED_RESTORE_RELATIONS) {
    assert.match(sql, new RegExp(relation, "u"));
  }
  assert.match(sql, /application_versions/u);
  assert.match(sql, /ai_demand_applications/u);
  assert.match(sql, /invalidOutboxStatuses/u);
  assert.match(sql, /EXPECTED_LATEST_MIGRATION/u);
  assert.doesNotMatch(sql, /\bschema_migrations\b/u);
  assert.doesNotMatch(sql, /\baudit_events\b/u);
});

test("恢复证据校验拒绝时间倒序、未知关系类型和不可读关系", () => {
  const verifiedRelations = REQUIRED_RESTORE_RELATIONS.map((name) => ({
    name,
    kind: "table",
    readable: true,
    rowCount: 0,
  }));
  verifiedRelations[0] = {
    name: REQUIRED_RESTORE_RELATIONS[0],
    kind: "view",
    readable: false,
  };

  assert.throws(
    () =>
      validateBackupEvidence({
        backupId: "backup-2026-08-12T100000Z",
        sourceDatabaseId: "production-primary",
        restoreTargetId: "restore-drill-2026-08-12",
        restoreTargetIsIsolated: true,
        isolationEvidenceId: "change-2026-08-12-restore-network",
        startedAt: "2026-08-12T10:04:00.000Z",
        finishedAt: "2026-08-12T10:00:00.000Z",
        restoreStartedAt: "2026-08-12T11:08:00.000Z",
        restoredAt: "2026-08-12T11:00:00.000Z",
        backupVerificationExitCode: 0,
        restoreCommandExitCode: 0,
        amcheckExitCode: 0,
        sha256: "c".repeat(64),
        restoreLogSha256: "d".repeat(64),
        verificationOutputSha256: "e".repeat(64),
        migrationCount: 22,
        latestMigration: "0022_outbox_claim_lease",
        expectedLatestMigration: "0022_outbox_claim_lease",
        verifiedRelations,
        integrityChecks: {
          applicationVersionOrphans: 0,
          demandApplicationOrphans: 0,
          invalidOutboxStatuses: 0,
        },
      }),
    /chronological|readable/i,
  );
});

test("requires fencing and fresh backup before manual promotion", () => {
  assert.throws(
    () =>
      assertManualPromotionReady({
        fencedPrimary: false,
        latestBackupAt: "2026-08-04T07:00:00Z",
        now: "2026-08-04T10:00:00Z",
        replicationLagSeconds: 30,
      }),
    /fenc|backup|lag/i,
  );
});
