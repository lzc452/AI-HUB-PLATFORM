import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("test:api-data 只运行真实 PostgreSQL API 回归", async () => {
  const config = await readFile(
    new URL("../apps/api/vitest.api-data.config.ts", import.meta.url),
    "utf8",
  );

  assert.match(config, /root:\s*fileURLToPath/);
  assert.match(config, /test\/\*\*\/\*\.real\.e2e-spec\.ts/);
  assert.doesNotMatch(config, /test\/\*\*\/\*\.ts/);
});
