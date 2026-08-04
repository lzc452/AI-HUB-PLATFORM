import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const SCENARIOS = new Set([
  "dns-cutover",
  "postgres-failure",
  "object-storage-failure",
]);

const MAX_RPO_SECONDS = 15 * 60;
const MAX_RTO_SECONDS = 2 * 60 * 60;

function fail(message) {
  throw new Error(message);
}

function parseTimestamp(value, field) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    fail(`${field} must be an ISO-8601 timestamp`);
  }
  return timestamp;
}

export function validateRecoveryDrillEvidence(evidence) {
  if (!evidence || typeof evidence !== "object") {
    fail("drill evidence is required");
  }

  if (!evidence.drillId || !/^[a-z0-9][a-z0-9-]{5,80}$/i.test(evidence.drillId)) {
    fail("drillId must be a stable evidence identifier");
  }
  if (!SCENARIOS.has(evidence.scenario)) {
    fail("scenario must be dns-cutover, postgres-failure, or object-storage-failure");
  }

  const startedAt = parseTimestamp(evidence.startedAt, "startedAt");
  const endedAt = parseTimestamp(evidence.endedAt, "endedAt");
  if (endedAt < startedAt) {
    fail("drill timestamps must be chronological");
  }

  if (!Array.isArray(evidence.events) || evidence.events.length < 2) {
    fail("drill events must include failure and recovery evidence");
  }

  let previousEventAt = startedAt;
  for (const [index, event] of evidence.events.entries()) {
    if (!event || typeof event.type !== "string" || event.type.length === 0) {
      fail(`event ${index} must have a type`);
    }
    const eventAt = parseTimestamp(event.at, `event ${index}.at`);
    if (eventAt < previousEventAt) {
      fail("drill events must be chronological");
    }
    if (eventAt < startedAt || eventAt > endedAt) {
      fail("drill events must be inside the drill window");
    }
    previousEventAt = eventAt;
  }

  const requiredEvent =
    evidence.scenario === "dns-cutover"
      ? "dns-cutover"
      : evidence.scenario === "postgres-failure"
        ? "standby-promoted"
        : "object-storage-cutover";
  if (!evidence.events.some((event) => event.type === requiredEvent)) {
    fail(`${evidence.scenario} requires ${requiredEvent} evidence`);
  }
  if (evidence.fencingVerified !== true) {
    fail("fencing must be verified before recovery writes");
  }
  if (evidence.restoreVerified !== true) {
    fail("checksum-verified restore evidence is required");
  }

  if (!Number.isInteger(evidence.rpoSeconds) || evidence.rpoSeconds < 0) {
    fail("rpoSeconds must be a non-negative integer");
  }
  if (evidence.rpoSeconds > MAX_RPO_SECONDS) {
    fail("RPO exceeds 15 minutes");
  }
  if (!Number.isInteger(evidence.rtoSeconds) || evidence.rtoSeconds < 0) {
    fail("rtoSeconds must be a non-negative integer");
  }
  if (evidence.rtoSeconds > MAX_RTO_SECONDS) {
    fail("RTO exceeds 2 hours");
  }

  return {
    ok: true,
    rpoSeconds: evidence.rpoSeconds,
    rtoSeconds: evidence.rtoSeconds,
  };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const evidenceFlagIndex = process.argv.indexOf("--evidence");
  const evidencePath = process.argv[evidenceFlagIndex + 1];
  if (!evidencePath) {
    console.error("Usage: node scripts/production/drills/drill-ops.mjs --evidence <json-file>");
    process.exitCode = 2;
  } else {
    const result = validateRecoveryDrillEvidence(
      JSON.parse(readFileSync(resolve(evidencePath), "utf8")),
    );
    console.log(JSON.stringify(result));
  }
}
