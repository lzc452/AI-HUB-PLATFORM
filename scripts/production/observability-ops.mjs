const REQUIRED_TARGETS = ["api", "worker", "postgres", "garage", "loki"];
const REQUIRED_METRICS = [
  "availability",
  "error_rate",
  "replication_lag",
  "wal_archive_lag",
  "backup_age",
];

export function validateObservabilitySettings(settings) {
  const errors = [];
  for (const target of REQUIRED_TARGETS) {
    if (!settings.targets?.includes(target))
      errors.push(`${target} target is required`);
  }
  for (const metric of REQUIRED_METRICS) {
    if (!settings.metrics?.includes(metric))
      errors.push(`${metric} metric is required`);
  }
  if (settings.availabilityTarget < 0.995)
    errors.push("availability target must be at least 99.5%");
  if (settings.rpoMinutes > 15) errors.push("RPO must be at most 15 minutes");
  if (settings.rtoMinutes > 120) errors.push("RTO must be at most 120 minutes");
  if (settings.logDestination !== "loki")
    errors.push("central log destination must be Loki");
  if (settings.logRetentionDays < 30)
    errors.push("central log retention must be at least 30 days");
  if (errors.length > 0)
    throw new Error(`Invalid observability settings: ${errors.join("; ")}`);
  return true;
}

export function validateAlertingSettings(settings) {
  const errors = [];
  if (!settings.receiver || ["null", "default"].includes(settings.receiver)) {
    errors.push("a production alert receiver is required");
  }
  for (const route of ["availability", "security", "backup", "replication"]) {
    if (!settings.routes?.includes(route))
      errors.push(`${route} alert route is required`);
  }
  if (!settings.repeatInterval || settings.repeatInterval === "0s") {
    errors.push("alert repeat interval is required");
  }
  if (errors.length > 0)
    throw new Error(`Invalid alerting settings: ${errors.join("; ")}`);
  return true;
}

export function redactCentralLog(value) {
  return value
    .replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, "[Redacted]")
    .replace(
      /\b(?:password|secret|token|cookie|authorization)\s*[:=]\s*[^\s,;]+/gi,
      "[Redacted]",
    )
    .replace(/\bE\d{3,}\b/g, "[Redacted]");
}
