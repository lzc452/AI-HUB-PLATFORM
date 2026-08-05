import assert from "node:assert/strict";
import { test } from "node:test";

import {
  findCodexViolations,
  checkRepositoryGovernance,
} from "./repository-governance.mjs";

test("rejects Codex files containing credentials or machine-specific paths", () => {
  const violations = findCodexViolations(
    ".codex/local.yaml",
    "token: ghp_012345678901234567890123456789012345\npath: C:\\Users\\alice\\repo",
  );

  assert.match(violations.join("\n"), /credential/i);
  assert.match(violations.join("\n"), /machine|absolute path/i);
});

test("accepts repository Codex configuration without local state", () => {
  assert.deepEqual(
    findCodexViolations(
      ".codex/skills/example/SKILL.md",
      "---\nname: example\n---\nUse repository-relative files only.\n",
    ),
    [],
  );
});

test("requires the committed Codex configuration files", async () => {
  const result = await checkRepositoryGovernance(process.cwd());

  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.violations, []);
});
