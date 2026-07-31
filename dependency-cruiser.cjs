const { existsSync, readFileSync, readdirSync } = require("node:fs");
const path = require("node:path");

const sourceExtensions = "(?:[cm]?[jt]sx?)";

function escapeRegularExpression(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function directoriesIn(directory) {
  if (!existsSync(directory)) {
    return [];
  }

  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

function exportedSourcePatterns(packageName) {
  const packageJsonPath = path.join("packages", packageName, "package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  const exportTargets = Object.values(packageJson.exports ?? {}).flatMap(
    (target) => (typeof target === "string" ? [target] : Object.values(target)),
  );

  return exportTargets
    .filter(
      (target) => typeof target === "string" && target.startsWith("./src/"),
    )
    .map(
      (target) =>
        `^packages/${escapeRegularExpression(packageName)}/${escapeRegularExpression(target.slice(2))}$`,
    );
}

const packageDeepImportRules = directoriesIn("packages").map((packageName) => {
  const escapedPackageName = escapeRegularExpression(packageName);

  return {
    name: `no-${packageName}-source-deep-imports`,
    severity: "error",
    comment: `Consume @ai-hub/${packageName} through its declared package exports.`,
    from: {
      path: `^(?!packages/${escapedPackageName}(?:/|$))(?:apps|packages)/`,
    },
    to: {
      path: `^packages/${escapedPackageName}/src/`,
      pathNot: exportedSourcePatterns(packageName),
    },
  };
});

const webFeatureDeepImportRules = directoriesIn("apps/web/src/modules").map(
  (featureName) => {
    const escapedFeatureName = escapeRegularExpression(featureName);

    return {
      name: `no-deep-imports-into-web-feature-${featureName}`,
      severity: "error",
      comment:
        "Web features may consume another feature only through its public index.",
      from: {
        path: `^apps/web/src/modules/(?!${escapedFeatureName}(?:/|$))`,
      },
      to: {
        path: `^apps/web/src/modules/${escapedFeatureName}/`,
        pathNot: `^apps/web/src/modules/${escapedFeatureName}/index\\.${sourceExtensions}$`,
      },
    };
  },
);

module.exports = {
  forbidden: [
    {
      name: "no-circular-dependencies",
      severity: "error",
      comment: "Circular dependencies make package ownership unpredictable.",
      from: {},
      to: { circular: true },
    },
    ...packageDeepImportRules,
    {
      name: "server-domain-does-not-use-runtime-frameworks",
      severity: "error",
      comment:
        "Server domain code must remain independent from frameworks, persistence, HTTP clients, and external SDKs.",
      from: { path: "^packages/server/src/(?:domain|.{1,240}/domain)/" },
      to: {
        dependencyTypes: [
          "npm",
          "npm-bundled",
          "npm-dev",
          "npm-no-pkg",
          "npm-optional",
          "npm-peer",
          "npm-unknown",
        ],
      },
    },
    {
      name: "server-domain-does-not-use-node-http",
      severity: "error",
      comment: "HTTP transport is an infrastructure concern.",
      from: { path: "^packages/server/src/(?:domain|.{1,240}/domain)/" },
      to: { path: "^(?:node:)?https?$" },
    },
    {
      name: "server-does-not-import-apps",
      severity: "error",
      comment:
        "Reusable server infrastructure must not depend on app entrypoints.",
      from: { path: "^packages/server/" },
      to: { path: "^apps/" },
    },
    ...webFeatureDeepImportRules,
  ],
  options: {
    doNotFollow: {
      path: "(^|/)node_modules/",
      dependencyTypes: [
        "npm",
        "npm-bundled",
        "npm-dev",
        "npm-no-pkg",
        "npm-optional",
        "npm-peer",
        "npm-unknown",
      ],
    },
    exclude: "(^|/)(?:dist|coverage|output|\\.cache|\\.turbo|\\.vite)(?:/|$)",
    tsConfig: { fileName: "tsconfig.base.json" },
  },
};
