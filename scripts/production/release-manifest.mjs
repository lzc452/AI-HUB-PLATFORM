import { writeFile } from "node:fs/promises";

export const RELEASE_SERVICES = Object.freeze(["api", "worker", "web"]);

const COMMIT_SHA = /^[a-f0-9]{40,64}$/i;
const RELEASE_TAG = /^v\d+\.\d+\.\d+$/;
const IMAGE_DIGEST = /^sha256:[a-f0-9]{64}$/i;

export function createReleaseManifest({
  commitSha,
  releaseTag,
  registry,
  imageDigests,
  generatedAt = new Date().toISOString(),
}) {
  if (!COMMIT_SHA.test(commitSha ?? "")) {
    throw new Error("commit SHA is required");
  }
  if (!RELEASE_TAG.test(releaseTag ?? "")) {
    throw new Error("release tag must use vX.Y.Z and cannot be mutable");
  }
  if (!registry || /:latest(?:$|\/)/i.test(registry)) {
    throw new Error("registry is required and cannot use latest");
  }
  for (const service of RELEASE_SERVICES) {
    if (!IMAGE_DIGEST.test(imageDigests?.[service] ?? "")) {
      throw new Error(`immutable digest is required for ${service}`);
    }
  }
  if (Number.isNaN(Date.parse(generatedAt))) {
    throw new Error("generatedAt must be an ISO timestamp");
  }

  const images = Object.fromEntries(
    RELEASE_SERVICES.map((service) => [
      service,
      {
        digest: imageDigests[service],
        ref: `${registry}/${service}@${imageDigests[service]}`,
      },
    ]),
  );

  return {
    schemaVersion: 1,
    commitSha,
    releaseTag,
    generatedAt,
    images,
    attestations: {
      sbom: "BuildKit SBOM attestation attached to each image digest",
      provenance:
        "BuildKit provenance attestation attached to each image digest",
    },
  };
}

function requiredArgument(args, name) {
  const index = args.indexOf(name);
  if (index < 0 || !args[index + 1]) throw new Error(`${name} is required`);
  return args[index + 1];
}

if (process.argv[1] && process.argv[1].endsWith("release-manifest.mjs")) {
  const args = process.argv.slice(2);
  const imageDigests = {};
  const imageArguments = args.reduce((values, value, index) => {
    if (value === "--image" && args[index + 1]) values.push(args[index + 1]);
    return values;
  }, []);

  for (const value of imageArguments) {
    const [service, digest] = value.split("=", 2);
    imageDigests[service] = digest;
  }

  const manifest = createReleaseManifest({
    commitSha: requiredArgument(args, "--commit"),
    releaseTag: requiredArgument(args, "--tag"),
    registry: requiredArgument(args, "--registry"),
    imageDigests,
    generatedAt: process.env.RELEASE_GENERATED_AT,
  });
  await writeFile(
    requiredArgument(args, "--output"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
}
