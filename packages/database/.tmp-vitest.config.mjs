// DSH 沙箱临时 vitest 配置（验证后删除）：
// - esbuild: false —— 沙箱禁止 esbuild 二进制服务 spawn（管道 stdio EPERM），
//   禁用后 vite 不做 TS transform，由 Node 24 原生 type stripping 执行；
// - resolve.preserveSymlinks —— 跳过 vite Windows realpath 的 `net use` exec；
// - test.pool: "threads" —— 避免 tinypool fork 子进程。
import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: false,
  resolve: { preserveSymlinks: true },
  test: { pool: "threads" },
});
