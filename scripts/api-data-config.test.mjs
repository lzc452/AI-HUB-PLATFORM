import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";

import { containerBackedCommands, verificationCommands } from "./verify.mjs";

/**
 * 找出仓库里所有 vitest 配置文件（排除 node_modules 与 workspace 聚合配置）。
 */
async function findVitestConfigs(dir = "apps", found = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      await findVitestConfigs(path, found);
      continue;
    }
    if (entry.name.startsWith("vitest.") && entry.name.endsWith(".config.ts")) {
      found.push(path);
    }
  }
  return found;
}

test("每个 vitest 配置文件都必须有 verify 入口，否则等于没跑", async () => {
  const configs = await findVitestConfigs();
  assert.ok(configs.length > 0, "未发现 vitest 配置文件，扫描逻辑可能已失效");

  const allCommands = [...verificationCommands, ...containerBackedCommands];
  // verify 里引用的是脚本名（`pnpm test:api-data`）而非配置文件路径，
  // 因此这里做双向匹配：命令直接点名该配置，或点名的脚本确实以该配置为入口。
  const scriptToConfig = new Map([
    ["pnpm test:api-data", "apps/api/vitest.api-data.config.ts"],
    [
      "pnpm test:input-validation",
      "apps/api/vitest.input-validation.config.ts",
    ],
  ]);

  const uncovered = configs.filter((config) => {
    // 默认配置（vitest.config.ts）由所属包的 `test` 脚本经 turbo 覆盖，无需单独入口。
    if (config.endsWith("/vitest.config.ts")) return false;
    const explicitlyNamed = allCommands.some((command) =>
      command.includes(config),
    );
    const reachableViaScript = [...scriptToConfig.entries()].some(
      ([command, mapped]) => mapped === config && allCommands.includes(command),
    );
    return !explicitlyNamed && !reachableViaScript;
  });

  assert.deepEqual(
    uncovered,
    [],
    `以下 vitest 配置没有任何 verify 调用方：${uncovered.join("、")}。` +
      "未接入 verify 的套件无法暴露真实依赖缺陷（见 docs/code-review-2026-10-08.md P0）。",
  );
});

test("test:api-data 只运行真实 PostgreSQL API 回归", async () => {
  const config = await readFile(
    new URL("../apps/api/vitest.api-data.config.ts", import.meta.url),
    "utf8",
  );

  assert.match(config, /root:\s*fileURLToPath/);
  assert.match(config, /test\/\*\*\/\*\.real\.e2e-spec\.ts/);
  assert.doesNotMatch(config, /test\/\*\*\/\*\.ts/);
});
