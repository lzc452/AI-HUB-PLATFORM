import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/internal": "http://localhost:3000",
    },
  },
  test: {
    testTimeout: 10_000,
    // Ant Design portal/table 在 jsdom 中共享 window 资源；串行文件执行
    // 避免并行 worker 争用导致偶发超时和未处理的 portal cleanup。
    fileParallelism: false,
    alias: {
      "@ant-design/icons": fileURLToPath(
        new URL("./src/test/icons.tsx", import.meta.url),
      ),
      "echarts-for-react": fileURLToPath(
        new URL("./src/test/echarts.tsx", import.meta.url),
      ),
    },
    environment: "./src/test/environment.ts",
    include: ["src/**/*.test.tsx"],
    setupFiles: ["./src/test/setup.ts"],
  },
});
