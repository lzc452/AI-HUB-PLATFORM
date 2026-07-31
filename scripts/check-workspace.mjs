import { access } from "node:fs/promises";

const required = [
  "package.json",
  "pnpm-workspace.yaml",
  "turbo.json",
  "tsconfig.base.json",
  "eslint.config.mjs",
  "prettier.config.mjs",
];

export async function requiredWorkspaceFiles() {
  const checks = await Promise.all(
    required.map(async (path) => {
      try {
        await access(path);
        return null;
      } catch {
        return path;
      }
    }),
  );
  return checks.filter(Boolean);
}
