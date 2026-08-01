import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("GitLab CI verifies before building container images", async () => {
  const config = await readFile(".gitlab-ci.yml", "utf8");

  assert.match(config, /node:24\.15\.0/);
  assert.match(config, /pnpm@10\.34\.5/);
  assert.match(config, /pnpm install --frozen-lockfile/);
  assert.match(config, /pnpm verify/);
  assert.match(config, /\.pnpm-store\//);
  assert.match(config, /auto_cancel:/);
  assert.match(config, /needs: \["verify"\]/);
  assert.match(config, /api\.Dockerfile/);
  assert.match(config, /worker\.Dockerfile/);
  assert.match(config, /web\.Dockerfile/);
});

test("GitHub Actions uses the same verification contract", async () => {
  const config = await readFile(".github/workflows/verify.yml", "utf8");

  assert.match(config, /actions\/checkout@v7/);
  assert.match(config, /actions\/setup-node@v6/);
  assert.match(config, /actions\/cache@v5/);
  assert.match(config, /docker\/setup-buildx-action@v4/);
  assert.match(config, /node-version: 24\.15\.0/);
  assert.match(config, /corepack prepare pnpm@10\.34\.5 --activate/);
  assert.match(config, /pnpm install --frozen-lockfile/);
  assert.match(config, /pnpm verify/);
  assert.match(config, /cancel-in-progress: true/);
  assert.match(config, /needs: verify/);
});

test("Turbo passes the isolated database URL to workspace tests", async () => {
  const config = JSON.parse(await readFile("turbo.json", "utf8"));

  assert.deepEqual(config.tasks?.test?.env, ["TEST_DATABASE_URL"]);
});
