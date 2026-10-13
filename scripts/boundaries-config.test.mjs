import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import config from "../dependency-cruiser.cjs";

/**
 * 边界规则本身的门禁。
 *
 * 存在理由：2026-10-09 发现 server-domain-does-not-* 两条规则
 * 匹配 packages/server/src 下任意 domain 子目录，而该目录从未存在——
 * 规则从未命中任何文件，却因为「配置里有规则、CI 绿」而一直被视为有效。
 *
 * 这类「死规则」比没有规则更糟：它制造了架构已被守护的错觉。
 * 下面的用例会断言每条分层规则的 from.path 至少能匹配仓库里真实存在的文件，
 * 规则一旦再次指向不存在的目录就会失败。
 */

const rules = config.forbidden;

function ruleByName(name) {
  const found = rules.find((rule) => rule.name === name);
  assert.ok(found, `未找到规则 ${name}`);
  return found;
}

/** 收集仓库中匹配 `*.repository.ts` / `*.service.ts` 的真实文件路径。 */
async function existingFiles(suffix) {
  const { readdir } = await import("node:fs/promises");
  const roots = ["packages/server/src"];
  const found = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory()) await walk(full);
      else if (full.endsWith(suffix)) found.push(full);
    }
  }
  for (const root of roots) await walk(root);
  return found;
}

test("分层规则不得指向不存在的目录（死规则检测）", async () => {
  const layerRules = rules.filter(
    (rule) =>
      rule.from?.path?.includes("packages/server/src") &&
      rule.from.path.includes("domain"),
  );
  assert.deepEqual(
    layerRules.map((rule) => rule.name),
    [],
    "存在匹配 domain/ 目录的规则，但 packages/server/src 下没有 domain 目录——这是死规则",
  );
});

test("业务逻辑层禁用持久化的规则能匹配真实文件", async () => {
  const rule = ruleByName("server-business-logic-does-not-use-persistence");
  const services = await existingFiles(".service.ts");
  const types = await existingFiles(".types.ts");
  assert.ok(services.length > 0, "未找到任何 .service.ts，规则可能已失效");

  const matches = [...services, ...types].filter((file) =>
    new RegExp(rule.from.path).test(file),
  );
  assert.ok(
    matches.length > 0,
    `规则 ${rule.name} 匹配不到任何真实文件，等同死规则`,
  );
});

test("仓储层禁用 HTTP 客户端的规则能匹配真实文件", async () => {
  const rule = ruleByName("server-repository-does-not-use-http-clients");
  const repositories = await existingFiles(".repository.ts");
  assert.ok(
    repositories.length > 0,
    "未找到任何 .repository.ts，规则可能已失效",
  );

  const matches = repositories.filter((file) =>
    new RegExp(rule.from.path).test(file),
  );
  assert.ok(
    matches.length > 0,
    `规则 ${rule.name} 匹配不到任何真实文件，等同死规则`,
  );
});

test("仓储层规则确实禁得住 HTTP 客户端（反向验证）", () => {
  const rule = ruleByName("server-repository-does-not-use-http-clients");
  const forbidden = new RegExp(rule.to.path);
  assert.ok(forbidden.test("node:https"));
  assert.ok(forbidden.test("https"));
  assert.ok(forbidden.test("axios"));
  assert.ok(forbidden.test("undici/index.js"));
  assert.ok(forbidden.test("@aws-sdk/client-s3"));
  // 反过来，持久化与普通路径不应被这条规则误伤。
  assert.equal(forbidden.test("kysely"), false);
  assert.equal(
    forbidden.test("packages/server/src/demand/demand.service.ts"),
    false,
  );
});

test("业务逻辑层规则确实禁得住持久化与外部包（反向验证）", () => {
  const rule = ruleByName("server-business-logic-does-not-use-persistence");
  const forbidden = new RegExp(rule.to.path);
  // 关键回归：原文写成 ^node_modules/(?:...) 时，
  // dependency-cruiser 传入的裸包名永远匹配不上，规则等于不存在。
  assert.ok(forbidden.test("kysely"));
  assert.ok(forbidden.test("pg"));
  assert.ok(forbidden.test("axios"));
  assert.ok(forbidden.test("@aws-sdk/client-s3"));
  assert.ok(forbidden.test("@anthropic-ai/sdk"));
});

test("分层规则的 from 侧必须覆盖真实文件且不误伤仓储层", () => {
  const biz = ruleByName("server-business-logic-does-not-use-persistence");
  const bizPattern = new RegExp(biz.from.path);
  assert.ok(bizPattern.test("packages/server/src/demand/demand.service.ts"));
  assert.ok(bizPattern.test("packages/server/src/identity/identity.types.ts"));
  // 仓储是持久化适配器，必须被排除在业务层规则之外。
  assert.equal(
    bizPattern.test("packages/server/src/demand/demand.repository.ts"),
    false,
  );
  // controller 属于传输层，不在业务层规则范围内。
  assert.equal(
    bizPattern.test("packages/server/src/demand/demand.controller.ts"),
    false,
  );
});

test("@nestjs暂未纳入业务层禁列（异常清理是独立技术债）", () => {
  const rule = ruleByName("server-business-logic-does-not-use-persistence");
  const forbidden = new RegExp(rule.to.path);
  // 当前刻意放行：service 里仍有 28 处 BadRequestException 等框架异常，
  // 待统一为领域错误码后再收紧。放行是有意的，不是遗漏。
  assert.equal(forbidden.test("node_modules/@nestjs/common/index.js"), false);
});

test("配置仍保留核心的循环依赖与深层导入防护", async () => {
  const names = rules.map((rule) => rule.name);
  assert.ok(names.includes("no-circular-dependencies"));
  // 深层导入规则按包与 web feature 动态生成，各至少一条。
  assert.ok(
    names.some((name) => name.startsWith("no-server-source-deep-imports")),
    "缺少 server 包深层导入防护",
  );
  assert.ok(
    names.some((name) => name.startsWith("no-deep-imports-into-web-feature-")),
    "缺少 web feature 深层导入防护",
  );

  // 配置必须可被解析（防止改坏成语法错误却静默通过）
  const raw = await readFile("dependency-cruiser.cjs", "utf8");
  assert.match(raw, /forbidden/);
});
