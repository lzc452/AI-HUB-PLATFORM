import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import semver from "semver";

const minimumSupportedNodeVersion = "20.19.0";
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

async function resolveInstalledPackage(
  packageName,
  packageDirectory,
  optional = false,
) {
  const workspaceRoot = path.resolve(".");
  let searchDirectory = path.resolve(packageDirectory);

  while (searchDirectory.startsWith(workspaceRoot)) {
    const packageJsonPath = path.join(
      searchDirectory,
      "node_modules",
      packageName,
      "package.json",
    );

    try {
      return {
        packageDirectory: path.dirname(packageJsonPath),
        packageJson: await readJson(packageJsonPath),
        packageJsonPath,
      };
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }

    if (searchDirectory === workspaceRoot) {
      break;
    }

    searchDirectory = path.dirname(searchDirectory);
  }

  if (optional) {
    return null;
  }

  throw new Error(
    `Could not resolve installed runtime dependency ${packageName} from ${packageDirectory}`,
  );
}

test("direct third-party dependencies support the Node >18 platform baseline", async () => {
  const rootPackageJson = await readJson("package.json");
  const rootTsconfig = await readJson("tsconfig.base.json");
  const webTsconfig = await readJson("apps/web/tsconfig.json");

  assert.equal(rootPackageJson.engines?.node, ">18.0.0");
  assert.equal(rootTsconfig.compilerOptions?.target, "ES2022");
  assert.ok(webTsconfig.compilerOptions?.lib?.includes("ES2022"));
  assert.ok(!webTsconfig.compilerOptions?.lib?.includes("ES2023"));
  assert.ok(
    rootPackageJson.packageManager?.startsWith("pnpm@10."),
    `packageManager must pin pnpm 10, got ${rootPackageJson.packageManager}`,
  );
  assert.equal(
    rootPackageJson.scripts?.test,
    "node --test scripts/*.test.mjs && turbo run test --concurrency=1",
    "the root checks and complete test graph must fit constrained local and CI runners",
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

test("installed runtime dependency graph supports the Node >18 platform baseline", async () => {
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
  const queue = [];

  for (const packageJsonPath of packageJsonPaths) {
    const packageJson = await readJson(packageJsonPath);

    for (const dependencySection of ["dependencies", "devDependencies"]) {
      for (const [packageName, version] of Object.entries(
        packageJson[dependencySection] ?? {},
      )) {
        if (!version.startsWith("workspace:")) {
          queue.push({
            packageDirectory: path.dirname(packageJsonPath),
            packageName,
            requiredBy: packageJsonPath,
          });
        }
      }
    }
  }

  const incompatibilities = [];
  const visited = new Set();

  while (queue.length > 0) {
    const dependency = queue.shift();
    const installed = await resolveInstalledPackage(
      dependency.packageName,
      dependency.packageDirectory,
      dependency.optional,
    );

    if (!installed || visited.has(installed.packageJsonPath)) {
      continue;
    }

    visited.add(installed.packageJsonPath);

    const nodeEngineRange = installed.packageJson.engines?.node;
    if (
      nodeEngineRange &&
      !semver.satisfies(minimumSupportedNodeVersion, nodeEngineRange)
    ) {
      incompatibilities.push(
        `${dependency.packageName}@${installed.packageJson.version} declares ${nodeEngineRange} (required by ${dependency.requiredBy})`,
      );
    }

    for (const packageName of Object.keys(
      installed.packageJson.dependencies ?? {},
    )) {
      queue.push({
        packageDirectory: installed.packageDirectory,
        packageName,
        requiredBy: `${dependency.packageName}@${installed.packageJson.version}`,
      });
    }

    for (const packageName of Object.keys(
      installed.packageJson.optionalDependencies ?? {},
    )) {
      queue.push({
        optional: true,
        packageDirectory: installed.packageDirectory,
        packageName,
        requiredBy: `${dependency.packageName}@${installed.packageJson.version}`,
      });
    }
  }

  assert.deepEqual(
    incompatibilities,
    [],
    `all installed runtime dependencies must support Node ${minimumSupportedNodeVersion}+`,
  );
});
