import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertManualPromotionReady,
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
    [],
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
