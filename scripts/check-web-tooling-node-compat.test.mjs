import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import semver from "semver";

const minimumSupportedNodeVersion = "18.18.0";
const workspaceDirectories = ["apps", "packages"];

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function findWorkspacePackageJsonPaths(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const packageJsonPaths = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isFile() && entry.name === "package.json") {
      packageJsonPaths.push(entryPath);
    }

    if (entry.isDirectory() && entry.name !== "node_modules") {
      packageJsonPaths.push(
        ...(await findWorkspacePackageJsonPaths(entryPath)),
      );
    }
  }

  return packageJsonPaths;
}

async function readInstalledPackageJson(packageName, packageDirectory) {
  const candidates = [
    path.join(packageDirectory, "node_modules", packageName, "package.json"),
    path.join("node_modules", packageName, "package.json"),
  ];

  for (const candidate of candidates) {
    try {
      return await readJson(candidate);
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
  }

  throw new Error(
    `Could not read installed metadata for ${packageName} declared by ${packageDirectory}`,
  );
}

test("direct third-party dependencies support the Node 18.18 platform baseline", async () => {
  const rootPackageJson = await readJson("package.json");
  const rootTsconfig = await readJson("tsconfig.base.json");
  const webTsconfig = await readJson("apps/web/tsconfig.json");

  assert.equal(rootPackageJson.engines?.node, ">=18.18.0");
  assert.equal(rootTsconfig.compilerOptions?.target, "ES2022");
  assert.ok(webTsconfig.compilerOptions?.lib?.includes("ES2022"));
  assert.ok(!webTsconfig.compilerOptions?.lib?.includes("ES2023"));
  assert.ok(
    rootPackageJson.packageManager?.startsWith("pnpm@10."),
    `packageManager must pin pnpm 10, got ${rootPackageJson.packageManager}`,
  );

  const packageJsonPaths = [
    "package.json",
    ...(
      await Promise.all(
        workspaceDirectories.map((directory) =>
          findWorkspacePackageJsonPaths(directory),
        ),
      )
    ).flat(),
  ];
  const incompatibilities = [];

  for (const packageJsonPath of packageJsonPaths) {
    const workspacePackageJson = await readJson(packageJsonPath);
    const packageDirectory = path.dirname(packageJsonPath);

    for (const dependencySection of ["dependencies", "devDependencies"]) {
      for (const [packageName, version] of Object.entries(
        workspacePackageJson[dependencySection] ?? {},
      )) {
        if (version.startsWith("workspace:")) {
          continue;
        }

        const installedPackageJson = await readInstalledPackageJson(
          packageName,
          packageDirectory,
        );
        const nodeEngineRange = installedPackageJson.engines?.node;

        if (
          nodeEngineRange &&
          !semver.satisfies(minimumSupportedNodeVersion, nodeEngineRange)
        ) {
          incompatibilities.push(
            `${packageJsonPath}: ${packageName}@${installedPackageJson.version} declares ${nodeEngineRange}`,
          );
        }
      }
    }
  }

  assert.deepEqual(
    incompatibilities,
    [],
    `all direct third-party dependencies must support Node ${minimumSupportedNodeVersion}+`,
  );
});
