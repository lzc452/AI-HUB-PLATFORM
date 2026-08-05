import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { test } from "node:test";

test("GitHub Actions owns the verification contract", async () => {
  const config = await readFile(".github/workflows/verify.yml", "utf8");

  assert.match(config, /actions\/checkout@v7/);
  assert.match(config, /actions\/setup-node@v6/);
  assert.match(config, /actions\/cache@v5/);
  assert.match(config, /docker\/setup-buildx-action@v4/);
  assert.match(config, /node-version: 24\.15\.0/);
  assert.match(config, /corepack prepare pnpm@10\.34\.5 --activate/);
  assert.match(config, /pnpm install --frozen-lockfile/);
  assert.match(config, /release-gate\.mjs --contract/);
  assert.match(config, /rollback-gate\.mjs --contract/);
  assert.match(config, /--dry-run/);
  assert.match(config, /forward-fix/);
  assert.match(config, /--provenance=mode=max/);
  assert.match(config, /--sbom=true/);
  assert.match(config, /pnpm verify/);
  assert.match(config, /cancel-in-progress: true/);
  assert.match(config, /needs: verify/);
  assert.match(config, /development/);
});

test("GitHub Actions owns immutable GHCR release publication", async () => {
  const config = await readFile(".github/workflows/release.yml", "utf8");

  assert.match(config, /tags:\s*\["v\*\.\*\.\*"\]/);
  assert.match(config, /packages:\s*write/);
  assert.match(config, /ghcr\.io\/lzc452\/ai-hub-platform/);
  assert.match(config, /docker\/build-push-action@v6/);
  assert.match(config, /git rev-parse HEAD/);
  assert.match(config, /sbom:\s*true/);
  assert.match(config, /provenance:\s*mode=max/);
  assert.match(config, /release-manifest\.mjs/);
  assert.match(config, /environment:\s*production/);
  assert.doesNotMatch(config, /:latest/);
});

test("GitLab CI is not a second authoritative pipeline", async () => {
  await assert.rejects(access(".gitlab-ci.yml"));
});

test("Turbo passes the isolated database URL to workspace tests", async () => {
  const config = JSON.parse(await readFile("turbo.json", "utf8"));

  assert.deepEqual(config.tasks?.test?.env, ["TEST_DATABASE_URL"]);
});
