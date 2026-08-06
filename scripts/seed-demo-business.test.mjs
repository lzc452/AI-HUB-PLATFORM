import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const packageJson = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);

test("package registers the demo business seed command", () => {
  assert.equal(
    packageJson.scripts?.["seed:demo-business"],
    "tsx scripts/seed-demo-business.mts",
  );
});

test("demo business seed requires DATABASE_URL", () => {
  const environment = { ...process.env };
  delete environment.DATABASE_URL;

  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/seed-demo-business.mts"],
    {
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      encoding: "utf8",
      env: environment,
    },
  );

  assert.notEqual(result.status, 0);
  assert.match(
    `${result.stdout ?? ""}${result.stderr ?? ""}`,
    /DATABASE_URL is required/,
  );
});
