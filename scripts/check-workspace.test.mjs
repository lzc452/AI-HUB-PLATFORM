import assert from "node:assert/strict";
import { test } from "node:test";
import { requiredWorkspaceFiles } from "./check-workspace.mjs";

test("workspace declares every required root file", async () => {
  const missing = await requiredWorkspaceFiles();
  assert.deepEqual(missing, []);
});
