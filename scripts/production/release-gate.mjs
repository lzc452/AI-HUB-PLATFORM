const IMAGE_DIGEST = /@sha256:[a-f0-9]{64}$/i;
const COMMIT_SHA = /^[a-f0-9]{40,64}$/i;

export function validateReleaseMetadata(metadata) {
  const errors = [];
  if (!COMMIT_SHA.test(metadata.commitSha ?? ""))
    errors.push("commit SHA is required");
  if (
    !Array.isArray(metadata.imageDigests) ||
    metadata.imageDigests.length === 0
  ) {
    errors.push("image digests are required");
  } else if (
    metadata.imageDigests.some(
      (image) => !IMAGE_DIGEST.test(image) || /:latest(?:@|$)/i.test(image),
    )
  ) {
    errors.push("all images must use immutable digests");
  }
  if (!metadata.sbomPath) errors.push("SBOM evidence is required");
  if (!metadata.provenancePath) errors.push("provenance evidence is required");
  if (!metadata.releaseMarker) errors.push("release marker is required");
  if (!metadata.rollbackMarker) errors.push("rollback marker is required");
  if (errors.length > 0)
    throw new Error(`Invalid release metadata: ${errors.join("; ")}`);
  return [];
}

export function validateMigrationPlan(plan) {
  const errors = [];
  if (!Array.isArray(plan.migrationNames) || plan.migrationNames.length === 0) {
    errors.push("migration plan is required");
  }
  if (plan.forwardCompatible !== true)
    errors.push("migration must be forward compatible");
  if (
    (plan.migrationNames ?? []).some((name) =>
      /drop|truncate|delete/i.test(name),
    )
  ) {
    errors.push("destructive migration requires a separately reviewed plan");
  }
  if (errors.length > 0)
    throw new Error(`Invalid migration plan: ${errors.join("; ")}`);
  return [];
}

export function validateSupplyChainReport(report) {
  const errors = [];
  if (report.signed !== true) errors.push("signed provenance is required");
  if (report.source !== "registry") errors.push("registry source is required");
  if (report.critical !== 0)
    errors.push("critical vulnerabilities must be zero");
  if (report.high !== 0) errors.push("high vulnerabilities must be zero");
  if (errors.length > 0)
    throw new Error(`Invalid supply-chain report: ${errors.join("; ")}`);
  return [];
}

export function validateSourceContract(files) {
  const errors = [];
  if (
    !files.compose.includes("API_IMAGE:?") ||
    !files.compose.includes("WORKER_IMAGE:?") ||
    !files.compose.includes("WEB_IMAGE:?")
  ) {
    errors.push("production Compose must require digest image variables");
  }
  if (!files.workflow.includes("release-gate.mjs"))
    errors.push("CI must run the release gate");
  if (!files.workflow.includes("--sbom"))
    errors.push("CI must request SBOM output");
  if (!files.workflow.includes("--provenance"))
    errors.push("CI must request provenance output");
  if (errors.length > 0)
    throw new Error(`Invalid CI release contract: ${errors.join("; ")}`);
  return [];
}

if (process.argv.includes("--contract")) {
  const { readFile } = await import("node:fs/promises");
  const compose = await readFile("compose.production.yaml", "utf8");
  const workflow = `${await readFile(".github/workflows/verify.yml", "utf8")}\n${await readFile(".gitlab-ci.yml", "utf8")}`;
  validateSourceContract({ compose, workflow });
  console.log("Production release contract passed");
}
