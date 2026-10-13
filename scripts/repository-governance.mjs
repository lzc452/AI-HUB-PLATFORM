import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export const REQUIRED_CODEX_FILES = Object.freeze([
  ".codex/README.md",
  ".codex/skills/update-processing-visualization/SKILL.md",
  ".codex/skills/update-processing-visualization/agents/openai.yaml",
]);

const credentialPatterns = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
  /\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]+/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bsk-[A-Za-z0-9]{20,}\b/,
  /\b(?:password|token|secret|api[_-]?key)\s*[:=]\s*["']?[A-Za-z0-9+/_=-]{16,}/i,
];

const absolutePathPattern =
  /(?:^|[\s"'=])(?:[A-Z]:[\\/]|\/(?:Users|home|root|opt|var|tmp)\/)/i;

export function findCodexViolations(relativePath, content) {
  const normalizedPath = relativePath.replaceAll("\\", "/");
  const violations = [];

  if (/\.codex\/(?:cache|local|node_modules)(?:\/|$)/i.test(normalizedPath)) {
    violations.push("local Codex state must not be committed");
  }
  if (/(?:^|\/)\.(?:local|secret)(?:\.|$)/i.test(normalizedPath)) {
    violations.push("local or secret Codex files must not be committed");
  }
  if (credentialPatterns.some((pattern) => pattern.test(content))) {
    violations.push("credential-like content was found");
  }
  if (absolutePathPattern.test(content)) {
    violations.push("machine-specific absolute path was found");
  }

  return violations;
}

async function collectFiles(directory, root, files = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    // 符号链接必须跳过，有两个独立原因：
    // 1. readdir 的 withFileTypes 走 lstat 语义，链接的 isDirectory() 恒为 false，
    //    于是它会被当成文件塞进列表，后面 readFile 抛 EISDIR 让整个检查崩掉；
    // 2. 更本质的是越界——链接指向机器本地状态（如 ~/.skills-manager），
    //    本次治理要扫的是仓库内受版本控制的文件，跟进链接既扫不到有效内容，
    //    又会把个人环境的绝对路径判成违规。
    if (entry.isSymbolicLink()) {
      continue;
    }
    if (entry.isDirectory()) {
      await collectFiles(absolute, root, files);
      continue;
    }
    files.push(path.relative(root, absolute).replaceAll("\\", "/"));
  }
  return files;
}

export async function checkRepositoryGovernance(root = process.cwd()) {
  const codexRoot = path.join(root, ".codex");
  const files = await collectFiles(codexRoot, root);
  const missing = REQUIRED_CODEX_FILES.filter((file) => !files.includes(file));
  const violations = [];

  for (const file of files) {
    const content = await readFile(path.join(root, file), "utf8");
    for (const violation of findCodexViolations(file, content)) {
      violations.push(`${file}: ${violation}`);
    }
  }

  return { files, missing, violations };
}

if (process.argv[1] && process.argv[1].endsWith("repository-governance.mjs")) {
  const result = await checkRepositoryGovernance();
  if (result.missing.length > 0 || result.violations.length > 0) {
    console.error("仓库治理检查失败");
    for (const file of result.missing) console.error(`缺失：${file}`);
    for (const violation of result.violations) console.error(violation);
    process.exitCode = 1;
  } else {
    console.log(
      `Repository governance passed: ${result.files.length} Codex files checked`,
    );
  }
}
