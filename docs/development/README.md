# AI Hub Platform 开发指南

## 快速开始

### 环境要求

- Node.js ≥ 18.18（推荐 24.15.0）
- pnpm 10.34.5
- Rancher Desktop（dockerd 引擎，运行 Linux 容器）
- Git Bash 或 PowerShell

### 前后端分离开发（推荐）

基础设施跑在 Docker 中，API/前端/Worker 跑在宿主机上。宿主机原生文件监听不受 Docker VM 边界影响，改代码即时生效。

```powershell
# 1. 设置环境变量（三个都必须设置，缺一不可）
$env:NODE_ENV = "development"
$env:DATABASE_URL = "postgres://ai_hub:ai_hub_local_only@127.0.0.1:5432/ai_hub"
$env:COOKIE_SECRET = "ai-hub-local-cookie-secret-change-me"

# 2. 启动公共服务（只需一次，保持运行即可）
pnpm dev:services

# 3. 首次启动：执行数据库迁移和种子数据
pnpm migrate
pnpm seed:demo-accounts

# 4. 终端 A：启动后端
pnpm dev:api
# → http://localhost:3000
# → tsx watch 监听源码变更，自动重启

# 5. 终端 B：启动前端
pnpm dev:web
# → http://localhost:5173
# → Vite HMR 即时热更新，改代码浏览器自动刷新
# → /internal 请求代理到 localhost:3000

# 6. 终端 C（可选）：启动 Worker
pnpm dev:worker
```

访问：打开浏览器 `http://localhost:5173`

**演示账号**（种子数据已导入时可用；V1 仅分发 `employee` 与 `super_admin` 两种角色，其余预置角色保留定义但不实施分发）：

| 账号 | 工号 | 密码 |
|------|------|------|
| 普通员工 | `DEMO-EMPLOYEE` | `Demo-Employee-2026!` |
| 超级管理员 | `DEMO-SUPER-ADMIN` | `Demo-SuperAdmin-2026!` |

### 全 Docker 开发（可选）

```powershell
docker compose -f compose.yaml -f compose.dev.yaml up -d --build --wait --wait-timeout 600
```

访问：`http://127.0.0.1:8080`

> Windows 用户注意：Rancher Desktop 的文件监听不可靠，改代码可能不会自动刷新。建议使用前后端分离模式。

---

## 修改什么需要重启什么

### 前端修改（`apps/web/src/**`）

| 修改内容 | 需要操作 | 说明 |
|---------|---------|------|
| 页面组件、样式、文案 | **无需操作** | Vite HMR 即时热更新，浏览器自动刷新 |
| 路由配置 (`router/`) | **无需操作** | Vite HMR 自动更新 |
| 新增页面文件 | **无需操作** | Vite 自动发现新模块 |
| `vite.config.ts` | 重启前端 `pnpm dev:web` | Vite 配置需要重启 |
| `tailwind` 相关配置 | 重启前端 | CSS 预处理需要重新生成 |
| `index.html` | 重启前端 | HTML 入口文件变更需刷新 |

### 后端修改（`apps/api/src/**`、`apps/worker/src/**`、`packages/server/src/**`）

| 修改内容 | 需要操作 | 说明 |
|---------|---------|------|
| 业务逻辑、路由、控制器 | **无需操作** | `tsx watch` 自动检测变更并重启进程 |
| 数据库查询 | **无需操作** | 自动重启 |
| `packages/config/src/**` | **无需操作** | 自动重启 |
| `packages/contracts/src/**` | **无需操作** | 自动重启 |
| `packages/database/src/schema.ts` | **无需操作** | 自动重启 |
| 新增 Controller/Module | **无需操作** | 自动重启后重新加载 |

### 需要手动重启/操作的情况

| 修改内容 | 需要操作 | 原因 |
|---------|---------|------|
| 新增数据库 migration 文件 | `pnpm migrate` | migration 需要手动执行 |
| `tsconfig.json` 修改 | 重启对应 dev 进程 | tsconfig 不触发 tsx watch |
| 新增 npm 依赖 | `pnpm install` + 重启对应进程 | 新包需要安装到 node_modules |
| `package.json` scripts 修改 | 重启对应进程 | 命令变更需重新执行 |
| `.env` / 环境变量修改 | 重启对应 dev 进程 | 环境变量在进程启动时读取 |
| Docker 相关文件 (`Dockerfile`, `compose*.yaml`) | `docker compose up -d --build` | 镜像需要重建 |
| `packages/server/src/index.ts`（模块导出） | 重启 API 和 Worker | 新增模块导出需要重新加载 |

### 公共服务（Docker 容器）

| 操作 | 命令 |
|------|------|
| 查看状态 | `docker compose -f compose.yaml -f compose.dev.yaml ps` |
| 查看日志 | `docker compose -f compose.yaml -f compose.dev.yaml logs -f postgres` |
| 重启服务 | `docker compose -f compose.yaml -f compose.dev.yaml restart postgres` |
| 完全停止 | `docker compose -f compose.yaml -f compose.dev.yaml down` |
| 清理数据重新开始 | `docker compose -f compose.yaml -f compose.dev.yaml down -v` |

---

## 常用命令

```bash
# 开发
pnpm dev:services    # 启动公共服务（Docker）
pnpm dev:api         # 启动后端 API（宿主机）
pnpm dev:web         # 启动前端（宿主机）
pnpm dev:worker      # 启动 Worker（宿主机）
pnpm migrate         # 执行数据库迁移
pnpm seed:demo-accounts  # 导入演示账号

# 代码质量
pnpm format:check    # 格式检查
pnpm lint            # ESLint 检查
pnpm typecheck       # TypeScript 类型检查
pnpm test            # 运行测试
pnpm build           # 构建生产包
pnpm verify          # 完整质量管道
```

---

## 项目结构

```
apps/
  api/          NestJS API 服务（端口 3000）
  web/          React SPA（端口 5173 开发）
  worker/       NestJS 后台 Worker
packages/
  config/       环境变量和配置验证（Zod）
  contracts/    前后端共享类型
  database/     Kysely schema 和迁移
  server/       业务逻辑：模块、服务、控制器
  testing/      测试工具（PostgreSQL Testcontainers）
  ui/           Ant Design 主题令牌
docs/
  adr/          架构决策记录
  development/  开发文档
  ui-design/    前端 UI 设计文档
  superpowers/  项目规划和执行记录
```

## API 代理说明

前后端分离模式下，Vite 开发服务器自动将 `/internal` 开头的请求代理到 `localhost:3000`（API 服务）。不需要额外配置 nginx。

全 Docker 模式下，nginx 负责路由：
- `/internal/*` → API 容器 `api:3000`
- `/*` → 前端 Web 容器
