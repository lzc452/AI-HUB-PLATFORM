import basicSsl from "@vitejs/plugin-basic-ssl";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// 局域网设备访问时以 HTTPS 提供安全上下文（crypto.subtle 仅在该上下文中可用）。
// 仅在显式设置 VITE_DEV_HTTPS=1 时启用，避免影响 docker 开发流（nginx 以 HTTP 反代 web）。
const enableHttps = process.env.VITE_DEV_HTTPS === "1";

export default defineConfig({
  plugins: [react(), tailwindcss(), ...(enableHttps ? [basicSsl()] : [])],
  server: {
    host: true,
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
