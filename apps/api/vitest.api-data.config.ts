import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  test: {
    fileParallelism: false,
    globals: true,
    hookTimeout: 60_000,
    include: ["test/**/*.real.e2e-spec.ts"],
    testTimeout: 60_000,
  },
});
