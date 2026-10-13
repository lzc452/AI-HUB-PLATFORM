import assert from "node:assert/strict";
import { test } from "node:test";

import {
  containerBackedCommands,
  detectContainerRuntime,
  runVerification,
  verificationCommands,
} from "./verify.mjs";

test("verification commands run in the required order", () => {
  assert.deepEqual(verificationCommands, [
    "pnpm format:check",
    "pnpm lint",
    "pnpm typecheck",
    "pnpm boundaries",
    "pnpm test",
    "pnpm test:input-validation",
    "pnpm build",
    "node scripts/verify-doc-links.mjs",
    "node scripts/repository-governance.mjs",
    "docker compose -f compose.yaml -f compose.test.yaml config --quiet",
  ]);
});

test("真实依赖套件被 verify 覆盖（缺失则等于没跑）", () => {
  // 这条断言是本次改动的核心：2026-10-08 之前 test:api-data 从未被verify 调用，
  // 导致「授权器按不存在的角色码判定」这类缺陷长期隐身。
  assert.deepEqual(containerBackedCommands, ["pnpm test:api-data"]);
});

test("verification stops at the first failing command", () => {
  const calls = [];
  const exitCode = runVerification(
    (command) => {
      calls.push(command);
      return { status: command === verificationCommands[1] ? 7 : 0 };
    },
    { probe: { available: true, reason: "test" } },
  );

  assert.equal(exitCode, 7);
  assert.deepEqual(calls, verificationCommands.slice(0, 2));
});

test("静态门禁全绿后继续执行真实依赖套件", () => {
  const calls = [];
  const exitCode = runVerification(
    (command) => {
      calls.push(command);
      return { status: 0 };
    },
    { probe: { available: true, reason: "test" } },
  );

  assert.equal(exitCode, 0);
  assert.deepEqual(calls, [
    ...verificationCommands,
    ...containerBackedCommands,
  ]);
});

test("真实依赖套件失败时verify 返回非零", () => {
  const exitCode = runVerification(
    (command) => ({ status: command === "pnpm test:api-data" ? 1 : 0 }),
    { probe: { available: true, reason: "test" } },
  );

  assert.equal(exitCode, 1);
});

test("容器运行时不可用时跳过真实依赖套件而非让整条验证链失败", () => {
  const calls = [];
  const exitCode = runVerification(
    (command) => {
      calls.push(command);
      return { status: 0 };
    },
    { probe: { available: false, reason: "docker daemon 不可用" } },
  );

  assert.equal(exitCode, 0);
  assert.deepEqual(calls, verificationCommands);
  assert.ok(!calls.includes("pnpm test:api-data"));
});

test("探测到TEST_DATABASE_URL 时不要求本地 Docker", () => {
  const previous = process.env.TEST_DATABASE_URL;
  process.env.TEST_DATABASE_URL = "postgres://ci/ci";
  try {
    const result = detectContainerRuntime(() => {
      throw new Error("不应调用 docker探测");
    });
    assert.equal(result.available, true);
  } finally {
    if (previous === undefined) {
      delete process.env.TEST_DATABASE_URL;
    } else {
      process.env.TEST_DATABASE_URL = previous;
    }
  }
});

test("docker daemon 不可用时判定为不可用", () => {
  const previous = process.env.TEST_DATABASE_URL;
  delete process.env.TEST_DATABASE_URL;
  try {
    const result = detectContainerRuntime(() => ({ status: 1 }));
    assert.equal(result.available, false);
  } finally {
    if (previous !== undefined) {
      process.env.TEST_DATABASE_URL = previous;
    }
  }
});
