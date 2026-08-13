# Windows Docker Compose 开发

## 环境要求

- Windows 10/11，Rancher Desktop（dockerd 引擎）运行 Linux 容器。Rancher Desktop 可从 [rancherdesktop.io](https://rancherdesktop.io) 免费获取（Apache-2.0）；也可使用 Docker Desktop，但企业需注意其订阅条款。
- Docker Compose v2（`docker compose`）。
- Git 配置为按 `.gitattributes` 的要求保持仓库文本文件为 LF。
- 默认需要的本地端口：`8080`、`5432`、`3900` 与 `3903`。

Garage 以单节点 S3 兼容开发服务运行，没有数据冗余，不属于生产拓扑。ClamAV、PostgreSQL、Garage、API、worker、Web 与反向代理共享同一个私有 Compose 网络。

## VPN 与 Rancher Desktop 代理

如果 Windows 使用本地 HTTP 代理访问 VPN，Rancher Desktop 必须能从其 Linux 虚拟机访问该代理。在 Rancher Desktop 中打开 **Preferences → WSL → Proxy**（实验性功能），为 HTTP/HTTPS 代理使用宿主机网关而不是 `127.0.0.1`：

```text
HTTP proxy:  http://host.rancher-desktop.internal:7897
HTTPS proxy: http://host.rancher-desktop.internal:7897
```

Linux 虚拟机内的 `127.0.0.1` 指向虚拟机本身，而不是 Windows；`host.rancher-desktop.internal` 由虚拟机解析到宿主机。Docker 拉取总是使用 Rancher Desktop 的虚拟机代理，因此只在 PowerShell 中可用的代理仍可能导致 `docker compose build` 无法拉取基础镜像。首次拉取镜像期间请保持 VPN（代理软件需监听 `0.0.0.0` 或开启 allow-lan）开启；镜像缓存后，常规的仅源码重启无需再次下载。

## 首次启动

仓库包含一个被 Git 忽略的本地 `.env`。重新创建它：

```powershell
Copy-Item .env.example .env
```

在与其他机器共享环境前，请检查每个值。然后启动开发环境：

```powershell
docker pull node:24.15.0-bookworm-slim
docker compose -f compose.yaml -f compose.dev.yaml up -d --build --wait --wait-timeout 600
docker compose -f compose.yaml -f compose.dev.yaml ps
Invoke-RestMethod http://127.0.0.1:8080/internal/health/ready
```

Compose 网络仍使用 `postgres:5432` 作为 PostgreSQL 地址；`POSTGRES_PORT` 只改变宿主机侧端口。如果本机 `5432` 被其他程序占用，可在 `.env` 中设置 `POSTGRES_PORT=5433` 并相应调整 `DATABASE_URL`。

打开 `http://127.0.0.1:8080`。Garage 的 S3 API 位于 `http://127.0.0.1:3900`，admin API 位于 `http://127.0.0.1:3903`。本工作区中 PostgreSQL 暴露在 `127.0.0.1:5432`，或使用 `POSTGRES_PORT` 的值。

应用与共享包源码目录通过 bind mount 挂载以支持热重载。修改包清单或 `pnpm-lock.yaml` 后，请重新运行首次启动命令以重建依赖；数据库与对象存储卷会被保留。

> **Windows 用户注意**：Rancher Desktop on Windows 无法将宿主机文件变更事件 (inotify) 可靠传递给 Linux 容器。即使 compose.dev.yaml 已配置 bind mount 和 watch 模式，全 Docker 开发模式下文件变更可能不会触发热更新。建议使用下方的「前后端分离开发」模式。

## 前后端分离开发（推荐 Windows 用户）

将基础设施服务（数据库、对象存储、病毒扫描）留在 Docker 中，API、前端和 Worker 直接在 Windows 宿主机上运行。宿主机原生文件监听不受 Docker VM 边界影响，改代码即时生效。

### 前置条件

- Node.js ≥ 18.18（推荐 24.15.0）已安装
- pnpm 已安装（`corepack enable && corepack prepare pnpm@10.34.5 --activate`）
- Rancher Desktop 运行中

### 环境变量

在终端中设置以下三个环境变量（全部必填，缺一不可）：

```powershell
$env:NODE_ENV = "development"
$env:DATABASE_URL = "postgres://ai_hub:ai_hub_local_only@127.0.0.1:5432/ai_hub"
$env:COOKIE_SECRET = "ai-hub-local-cookie-secret-change-me"
```

| 变量 | 必填 | 说明 |
|------|------|------|
| `NODE_ENV` | 是 | 必须为 `development`，否则安全中间件以生产模式运行 |
| `DATABASE_URL` | 是 | PostgreSQL 连接串，指向宿主机端口（根据 `.env` 中的 `POSTGRES_PORT` 调整） |
| `COOKIE_SECRET` | 是 | 会话 Cookie 签名密钥，至少 32 字符。Docker 模式由 `compose.yaml` 自动注入 |

> 缺少任何一个都会导致 API 启动失败：`ZodError: expected string, received undefined`

### 启动

```powershell
# 1. 启动公共服务（postgres、garage、clamav），只需一次
pnpm dev:services

# 首次启动需手动执行迁移和种子数据：
pnpm migrate
pnpm seed:demo-accounts

# 2. 终端 A：启动后端 API
pnpm dev:api
# API 运行在 http://localhost:3000，tsx watch 监听文件变更自动重启

# 3. 终端 B：启动前端
pnpm dev:web
# Vite 开发服务器运行在 http://localhost:5173
# /internal 请求由 Vite 代理 → localhost:3000（API）
# 修改代码后浏览器即时热更新（HMR）

# 4. 终端 C（可选）：启动 Worker
pnpm dev:worker
```

### 访问

- 前端：`http://localhost:5173`（Vite 开发服务器，支持 HMR）
- API：`http://localhost:3000/internal/health/live`
- 完整栈（含 nginx）：`http://127.0.0.1:8080`（需先启动 proxy 容器）

### 热更新对比

| 操作 | 效果 |
|------|------|
| 修改 `apps/web/src/**` | 浏览器即时 HMR 更新（< 1 秒） |
| 修改 `packages/server/src/**` | `tsx watch` 自动重启 API 进程（2–3 秒） |
| 修改 `packages/database/src/**` | `tsx watch` 自动重启 API 进程 |
| 新增 npm 依赖 | 在根目录执行 `pnpm install`，重新启动对应 dev 进程 |

### 停止

```powershell
# 各终端按 Ctrl+C 停止 dev 进程
# 停止 Docker 服务（保留数据卷）：
docker compose -f compose.yaml -f compose.dev.yaml down
# 完全清理（删除数据库和对象存储数据）：
docker compose -f compose.yaml -f compose.dev.yaml down -v
```

## 迁移

API 在启动前自动应用迁移。如需显式再次运行：

```powershell
docker compose -f compose.yaml -f compose.dev.yaml exec api pnpm migrate
```

迁移是幂等的，并使用容器环境中的 `DATABASE_URL`。

## 测试

隔离的测试项目使用自己的 Compose 项目名与命名卷：

```powershell
docker compose -f compose.yaml -f compose.test.yaml up --build --abort-on-container-exit --exit-code-from test
docker compose -f compose.yaml -f compose.test.yaml down -v
```

测试服务运行 `pnpm verify`（该流水线在阶段 1 任务 10 完成）。其 Docker 网络为内部网络，没有 Docker socket，并通过 `TEST_DATABASE_URL` 使用隔离的 Compose PostgreSQL。测试镜像只包含静态 Compose 校验所需的 Docker CLI 与 Compose 插件。

## 日志与关闭

```powershell
docker compose -f compose.yaml -f compose.dev.yaml logs -f api worker proxy
docker compose -f compose.yaml -f compose.dev.yaml down
```

检查单个日志前请先使用 `docker compose ... ps`。ClamAV 首次启动在初始化其数据库时可能较慢。

## 数据重置

警告：以下命令会永久删除本项目的本地 PostgreSQL 数据库、Garage 对象与元数据以及 ClamAV 定义。

```powershell
docker compose -f compose.yaml -f compose.dev.yaml down -v
```

再次运行首次启动命令即可创建干净的卷。
