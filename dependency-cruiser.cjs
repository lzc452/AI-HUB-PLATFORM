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

function flattenExportTargets(value) {
  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap(flattenExportTargets);
  }

  if (value && typeof value === "object") {
    return Object.values(value).flatMap(flattenExportTargets);
  }

  return [];
}

function sourceExportPattern(packageName, target) {
  const sourcePath = `packages/${packageName}/${target.slice(2)}`;

  return `^${escapeRegularExpression(sourcePath).replace(/\\\*/g, ".*")}$`;
}

function exportedSourcePatterns(packageName) {
  const packageJsonPath = path.join("packages", packageName, "package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  const exportTargets = flattenExportTargets(packageJson.exports);

  return [
    ...new Set(
      exportTargets
        .filter((target) => target.startsWith("./src/"))
        .map((target) => sourceExportPattern(packageName, target)),
    ),
  ];
}

// 业务逻辑层禁用的运行时依赖。
//
// 路径写「裸包名」而不是 node_modules/xxx：dependency-cruiser 比较依赖时
// 传入的是模块名本身（`kysely`、`axios`），不是 node 解析后的完整路径。
// 原文写成 ^node_modules/(?:...)，因此对所有外部依赖都匹配不上——
// 同样是一条从未生效的死规则。
//
// 刻意**不含 `@nestjs/`**：框架异常目前散落在 service 里，
// `application-upload.service.ts` 就有 28 处。那是独立的技术债清理
// （与 P1-5「HTTP 语义不应进业务层」同根），改造面大，
// 不适合在补边界规则的同一次改动里顺手做掉——混在一起会让规则一上线就红，
// 反而促成「放宽规则」而不是「修代码」。
// 待异常统一为领域错误码后，再把 `@nestjs/` 加回此列表。
const domainForbiddenRuntimePath = [
  "(?:",
  "kysely|pg|",
  "axios|got|undici|node-fetch|superagent|",
  "@aws-sdk/|@azure/|@google-cloud/|@anthropic-ai/|",
  "openai|stripe|",
  "[^/]*-sdk(?:/|$)|",
  "@[^/]+/[^/]*-sdk(?:/|$)",
  ")",
].join("");

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
    // 以下两条原本匹配 `packages/server/src/**/domain/`，但该目录从未存在
    // （实际结构是按业务域平铺：demand/、application/ …，每层内含
    // service / repository / types / controller）。规则从未命中任何文件，
    // 是典型的「看着在守护架构、实际完全空转」的死规则。
    //
    // 现改为匹配真正的分层边界：**业务逻辑层不得直接依赖持久化与传输实现**。
    // `*.repository.ts` 是唯一允许触碰 kysely 的位置（它就是持久化适配器），
    // controller 允许 node:http（框架传输）；service 与 types 必须保持纯净，
    // 否则业务规则会与SQL 实现纠缠，重构时无法独立验证。
    {
      name: "server-business-logic-does-not-use-persistence",
      severity: "error",
      comment:
        "Service and types files must stay free of persistence implementations. Put SQL behind *.repository.ts.",
      from: {
        path: "^packages/server/src/[^/]+/(?:[^/]*(?:service|types)|[^/]*\\.types)[^/]*\\.[cm]?[jt]s$",
      },
      to: { path: domainForbiddenRuntimePath },
    },
    {
      name: "server-business-logic-does-not-use-node-http",
      severity: "error",
      comment:
        "HTTP transport is an infrastructure concern; service/types must not depend on it.",
      from: {
        path: "^packages/server/src/[^/]+/(?:[^/]*(?:service|types)|[^/]*\\.types)[^/]*\\.[cm]?[jt]s$",
      },
      to: { path: "^(?:node:)?https?$" },
    },
    // 仓储层不得引入 HTTP 客户端或外部 SDK：它只该关心数据进出，
    // 一旦开始调HTTP，「单元测试不需要网络」这个前提就没了。
    {
      name: "server-repository-does-not-use-http-clients",
      severity: "error",
      comment:
        "Repositories are persistence adapters; HTTP clients and SDKs belong to infrastructure modules.",
      from: {
        path: "^packages/server/src/[^/]+/[^/]*\\.repository\\.[cm]?[jt]s$",
      },
      to: {
        // 同样是裸包名/ 内置模块名，不是 node_modules/ 前缀的完整路径。
        path: "^(?:node:)?https?$|^(?:axios|got|undici|node-fetch|superagent)(?:/|$)|^@(?:aws-sdk|azure|google-cloud)/|^openai$|^stripe$|@[^/]+/[^/]*-sdk(?:/|$)",
      },
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
