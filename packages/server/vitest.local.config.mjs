// 本地沙箱专用临时配置（不属于仓库交付物，验证结束后删除）：
// - resolve.preserveSymlinks: 跳过 vite 的 Windows realpath 探测（exec "net use"），
//   该探测在受限沙箱下 spawn 被拒（EPERM）；
// - pool: "threads": 避免 tinypool fork 子进程（同样被沙箱拒绝）。
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { preserveSymlinks: true },
  test: { pool: "threads" },
});
