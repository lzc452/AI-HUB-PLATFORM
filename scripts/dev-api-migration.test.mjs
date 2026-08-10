import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

async function createFakePnpm(testContext, migrateExitCode) {
  const directory = await mkdtemp(path.join(tmpdir(), "ai-hub-dev-api-"));
  const logPath = path.join(directory, "pnpm.log");
  const executablePath = path.join(
    directory,
    process.platform === "win32" ? "pnpm.cmd" : "pnpm",
  );
  const source =
    process.platform === "win32"
      ? [
          "@echo off",
          '>>"%AI_HUB_TEST_PNPM_LOG%" echo %*',
          'if "%1"=="migrate" exit /b %AI_HUB_TEST_MIGRATE_EXIT%',
          "exit /b 0",
          "",
        ].join("\r\n")
      : [
          "#!/bin/sh",
          'printf \'%s\\n\' "$*" >> "$AI_HUB_TEST_PNPM_LOG"',
          'if [ "$1" = "migrate" ]; then exit "$AI_HUB_TEST_MIGRATE_EXIT"; fi',
          "exit 0",
          "",
        ].join("\n");

  await writeFile(executablePath, source, "utf8");
  if (process.platform !== "win32") await chmod(executablePath, 0o755);
  testContext.after(() => rm(directory, { force: true, recursive: true }));

  return { directory, logPath, migrateExitCode };
}

function runDevApi(fake) {
  const lookup = spawnSync(
    process.platform === "win32" ? "where.exe" : "which",
    [process.platform === "win32" ? "pnpm.cmd" : "pnpm"],
    { encoding: "utf8" },
  );
  assert.equal(lookup.status, 0, lookup.stderr);
  const packageManagerPath = lookup.stdout
    .trim()
    .split(/\r?\n/)[0]
    ?.replace(/^"(.*)"$/, "$1");
  assert.ok(packageManagerPath, "无法解析真实 pnpm 路径");
  return spawnSync(packageManagerPath, ["run", "dev:api"], {
    cwd: process.cwd(),
    encoding: "utf8",
    shell: process.platform === "win32",
    env: {
      ...process.env,
      AI_HUB_TEST_MIGRATE_EXIT: String(fake.migrateExitCode),
      AI_HUB_TEST_PNPM_LOG: fake.logPath,
      PATH: `${fake.directory}${path.delimiter}${process.env.PATH ?? ""}`,
    },
  });
}

async function readInvocations(logPath) {
  return (await readFile(logPath, "utf8"))
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);
}

test("dev:api 在启动 API 前先执行 migration", async (testContext) => {
  const fake = await createFakePnpm(testContext, 0);
  const result = runDevApi(fake);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.deepEqual(await readInvocations(fake.logPath), [
    "migrate",
    "--filter @ai-hub/api dev",
  ]);
});

test("migration 失败时 dev:api 不启动 API", async (testContext) => {
  const fake = await createFakePnpm(testContext, 23);
  const result = runDevApi(fake);

  assert.notEqual(result.status, 0);
  assert.deepEqual(await readInvocations(fake.logPath), ["migrate"]);
});
