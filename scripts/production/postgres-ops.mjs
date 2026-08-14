const MIN_BACKUP_SHA256 = /^[a-f0-9]{64}$/i;

export const REQUIRED_RESTORE_RELATIONS = Object.freeze([
  "kysely_migration",
  "kysely_migration_lock",
  "security_audit_events",
  "identity_audit_events",
  "application_audit_events",
  "ai_demand_audit_events",
  "analytics_audit_events",
  "outbox_events",
  "employees",
  "applications",
  "application_versions",
  "ai_demands",
  "analytics_daily_aggregates",
]);

const REQUIRED_INTEGRITY_CHECKS = Object.freeze([
  "applicationVersionOrphans",
  "demandApplicationOrphans",
  "invalidOutboxStatuses",
]);

function isIsoTimestamp(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function requireChronologicalWindow(errors, start, end, label) {
  if (!isIsoTimestamp(start) || !isIsoTimestamp(end)) return;
  if (Date.parse(end) < Date.parse(start)) {
    errors.push(`${label} timestamps must be chronological`);
  }
}

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
  if (!MIN_BACKUP_SHA256.test(evidence.restoreLogSha256 ?? "")) {
    errors.push("restoreLogSha256 is required");
  }
  if (!MIN_BACKUP_SHA256.test(evidence.verificationOutputSha256 ?? "")) {
    errors.push("verificationOutputSha256 is required");
  }
  if (!isIsoTimestamp(evidence.startedAt)) {
    errors.push("backup startedAt must be an ISO-8601 timestamp");
  }
  if (!isIsoTimestamp(evidence.finishedAt)) {
    errors.push("backup finishedAt must be an ISO-8601 timestamp");
  }
  if (!isIsoTimestamp(evidence.restoreStartedAt)) {
    errors.push("restoreStartedAt must be an ISO-8601 timestamp");
  }
  if (!isIsoTimestamp(evidence.restoredAt)) {
    errors.push("restore timestamp is required");
  }
  if (evidence.restoreCommandExitCode !== 0) {
    errors.push("restore command must exit successfully");
  }
  if (evidence.backupVerificationExitCode !== 0) {
    errors.push("backup verification command must exit successfully");
  }
  if (evidence.amcheckExitCode !== 0) {
    errors.push("amcheck must exit successfully");
  }
  if (evidence.restoreTargetIsIsolated !== true) {
    errors.push("restore target must be isolated");
  }
  if (!evidence.isolationEvidenceId) {
    errors.push("isolationEvidenceId is required");
  }
  if (!evidence.sourceDatabaseId || !evidence.restoreTargetId) {
    errors.push("source and restore target identifiers are required");
  } else if (evidence.sourceDatabaseId === evidence.restoreTargetId) {
    errors.push("source and restore target must be different");
  }
  if (
    !Number.isInteger(evidence.migrationCount) ||
    evidence.migrationCount < 1
  ) {
    errors.push("migrationCount must prove an applied migration");
  }
  if (!evidence.latestMigration) {
    errors.push("latestMigration is required");
  }
  if (!evidence.expectedLatestMigration) {
    errors.push("expectedLatestMigration is required");
  } else if (evidence.latestMigration !== evidence.expectedLatestMigration) {
    errors.push("latestMigration must match the release manifest");
  }
  requireChronologicalWindow(
    errors,
    evidence.startedAt,
    evidence.finishedAt,
    "backup",
  );
  requireChronologicalWindow(
    errors,
    evidence.restoreStartedAt,
    evidence.restoredAt,
    "restore",
  );

  const verified = new Map(
    (evidence.verifiedRelations ?? []).map((relation) => [
      relation?.name,
      relation,
    ]),
  );
  for (const relationName of REQUIRED_RESTORE_RELATIONS) {
    const relation = verified.get(relationName);
    if (
      relation?.kind !== "table" ||
      relation.readable !== true ||
      !Number.isInteger(relation.rowCount) ||
      relation.rowCount < 0
    ) {
      errors.push(`${relationName} relation must be readable after restore`);
    }
  }

  for (const checkName of REQUIRED_INTEGRITY_CHECKS) {
    if (evidence.integrityChecks?.[checkName] !== 0) {
      errors.push(`${checkName} integrity check must equal zero`);
    }
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
