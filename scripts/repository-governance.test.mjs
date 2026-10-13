import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

test("跳过符号链接，避免 EISDIR 与越界扫描", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "ai-hub-governance-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, ".codex", "skills", "real"), { recursive: true });
  await writeFile(
    join(root, ".codex", "skills", "real", "SKILL.md"),
    "---\nname: real\n---\n",
    "utf8",
  );
  // 模拟本机skills-manager 的符号链接，指向仓库外的目录。
  // 注意不能预先 mkdir 这个名字，否则 symlink 会 EEXIST。
  const outside = await mkdtemp(join(tmpdir(), "ai-hub-outside-"));
  t.after(() => rm(outside, { recursive: true, force: true }));
  await symlink(outside, join(root, ".codex", "skills", "linked"), "junction");

  const result = await checkRepositoryGovernance(root);

  // 链接本身不应出现在文件列表里；否则 readFile 会因目标是目录而抛 EISDIR。
  assert.ok(!result.files.some((file) => file.includes("linked")));
  assert.ok(result.files.some((file) => file.endsWith("real/SKILL.md")));
});
