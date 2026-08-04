const MIN_BACKUP_SHA256 = /^[a-f0-9]{64}$/i;

/**
 * @typedef {object} PromotionReadiness
 * @property {boolean} fencedPrimary
 * @property {string} latestBackupAt
 * @property {string} now
 * @property {number} replicationLagSeconds
 */

export function validatePostgresSettings(settings) {
  const errors = [];
  if (!["primary", "standby"].includes(settings.role)) {
    errors.push("role must be primary or standby");
  }
  if (!["replica", "logical"].includes(settings.wal_level)) {
    errors.push("wal_level must enable streaming replication");
  }
  if (settings.archive_mode !== "on") errors.push("archive_mode must be on");
  if (
    typeof settings.archive_command !== "string" ||
    settings.archive_command.trim() === ""
  ) {
    errors.push("archive_command is required");
  }
  if (Number(settings.max_wal_senders) < 1)
    errors.push("max_wal_senders must be positive");
  if (Number(settings.max_replication_slots) < 1) {
    errors.push("max_replication_slots must be positive");
  }
  if (settings.role === "standby" && settings.hot_standby !== "on") {
    errors.push("hot_standby must be on for standby");
  }
  if (errors.length > 0)
    throw new Error(`Invalid PostgreSQL settings: ${errors.join("; ")}`);
  return true;
}

export function validateBackupEvidence(evidence) {
  const errors = [];
  if (!evidence.backupId) errors.push("backupId is required");
  if (!MIN_BACKUP_SHA256.test(evidence.sha256 ?? ""))
    errors.push("sha256 is required");
  if (!evidence.restoredAt) errors.push("restore timestamp is required");
  const verified = new Set(evidence.verifiedTables ?? []);
  for (const table of [
    "schema_migrations",
    "audit_events",
    "outbox_events",
    "analytics_daily_aggregates",
  ]) {
    if (!verified.has(table))
      errors.push(`${table} must be verified after restore`);
  }
  if (errors.length > 0)
    throw new Error(`Invalid backup evidence: ${errors.join("; ")}`);
  return true;
}

/** @param {PromotionReadiness} input */
export function assertManualPromotionReady(input) {
  if (!input.fencedPrimary) throw new Error("PRIMARY_FENCING_REQUIRED");
  const now = new Date(input.now).valueOf();
  const backupAt = new Date(input.latestBackupAt).valueOf();
  if (
    Number.isNaN(now) ||
    Number.isNaN(backupAt) ||
    now - backupAt > 15 * 60 * 1000
  ) {
    throw new Error("FRESH_BACKUP_REQUIRED");
  }
  if (input.replicationLagSeconds > 15 * 60)
    throw new Error("REPLICATION_LAG_TOO_HIGH");
  return true;
}
