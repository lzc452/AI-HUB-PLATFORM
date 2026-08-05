const IMAGE_DIGEST = /@sha256:[a-f0-9]{64}$/i;

export function validateRollbackPlan(plan) {
  const errors = [];
  if (
    !Array.isArray(plan.previousImageDigests) ||
    plan.previousImageDigests.length === 0
  ) {
    errors.push("previous image digests are required");
  } else if (
    plan.previousImageDigests.some((image) => !IMAGE_DIGEST.test(image))
  ) {
    errors.push("rollback images must use immutable digests");
  }
  if (plan.databaseRollbackMode !== "forward-fix") {
    errors.push("database rollback must use a forward-fix");
  }
  if (!plan.backupId) errors.push("rollback backup is required");
  if (!plan.restoreVerificationPath)
    errors.push("restore verification evidence is required");
  if (!plan.approvalMarker) errors.push("rollback approval marker is required");
  if (plan.dryRun !== true) errors.push("rollback must be a dry-run first");
  if (plan.fencingRequired !== true)
    errors.push("rollback must require writer fencing");
  if (errors.length > 0) {
    throw new Error(`Invalid rollback plan: ${errors.join("; ")}`);
  }
  return true;
}

export function validateRollbackSourceContract(workflow) {
  const requiredMarkers = [
    "rollback-gate.mjs --contract",
    "--dry-run",
    "forward-fix",
    "NO_AUTOMATIC_DOWN_MIGRATION",
  ];
  const missing = requiredMarkers.filter(
    (marker) => !workflow.includes(marker),
  );
  if (missing.length > 0) {
    throw new Error(`CI rollback contract is missing: ${missing.join(", ")}`);
  }
  return true;
}

if (process.argv.includes("--contract")) {
  const { readFile } = await import("node:fs/promises");
  const workflow = `${await readFile(".github/workflows/verify.yml", "utf8")}\n${await readFile(".github/workflows/release.yml", "utf8")}`;
  validateRollbackSourceContract(workflow);
  console.log("Production rollback contract passed");
}
