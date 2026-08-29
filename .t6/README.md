# 沙箱 vitest 验证设施（临时，验证结束后删除）

DSH Windows 沙箱禁止以管道 stdio spawn 子进程（EPERM），导致 vitest 无法运行：
- esbuild 二进制服务子进程（TS 转换）→ spawn EPERM；
- vite 初始化时的 `exec("net use")` Windows realpath 探测 → spawn EPERM；
- tinypool forks 池 → fork EPERM。

本目录提供两个绕过文件（纯进程内，无任何子进程 spawn）：

- `hooks.mjs`：`node --import` 预加载钩子。
  1. 通过 `module.registerHooks` 把 `esbuild` 解析重定向到 `esbuild-shim.mjs`；
  2. 拦截 `child_process.exec("net use"/"fsutil")` 直接回调错误，避免 spawn。
- `esbuild-shim.mjs`：基于 TypeScript 编译器 API（`ts.transpileModule`）实现 vite
  用到的 `transform`/`transformSync`/`formatMessages` 等；`build`/`context` 抛明确
  错误（vitest node 模式不调用）。js/jsx/css 等 loader 直接透传。

## 用法（等价于 vitest run，但可在沙箱内运行）

```powershell
# 以仓库根目录为工作目录
node --import "file:///D:/workspace/AI-HUB-PLATFORM/.t6/hooks.mjs" node_modules/vitest/vitest.mjs run --root packages/server --config packages/server/vitest.local.config.mjs --configLoader runner --pool=threads --reporter=dot
```

要点：
- `--configLoader runner`：避免 vite 用 esbuild 打包配置文件（仍需 esbuild spawn）；
- `--pool=threads`：避免 tinypool fork 子进程（worker_threads 为进程内，允许）；
- `vitest.local.config.mjs`：`resolve.preserveSymlinks` + `test.pool: "threads"`
  （位于 packages/server/，与 packages/server/vitest.local.config.ts 配套）。

## 已确认结果（portal-engineer，t6 验证）

- packages/server：52 文件 / 476 测试全部通过；
- apps/api：非容器测试 50 通过 + 37 跳过 + 0 失败；仅 10 个 testcontainers
  （Docker）套件因沙箱无 Docker 环境性失败，需在 compose/CI 环境补跑
  （设置 TEST_DATABASE_URL 可复用共享库）。
