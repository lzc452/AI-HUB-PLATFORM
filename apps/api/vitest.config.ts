import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["test/**/*.ts"],
    exclude: ["test/reset-database.ts", "test/input-validation.e2e-spec.ts"],
    // 真实 e2e 在共享 TEST_DATABASE_URL（compose 测试环境）下需串行执行，
    // 避免各文件并发 runMigrations / 种子数据互相冲突。
    fileParallelism: false,
  },
});
