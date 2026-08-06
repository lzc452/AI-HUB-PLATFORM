# AI Hub 平台

AI Hub Platform 是一个 pnpm monorepo，包含 React Web 应用、NestJS API 和 NestJS outbox worker 三个可部署应用，以模块化单体架构共享多个包。支持的运行环境为 Node.js 18.18 或更高版本；Node.js 24.15.0 是仓库、CI 与容器镜像的基础版本。

## 开发

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm verify
docker pull node:24.15.0-bookworm-slim
docker compose -f compose.yaml -f compose.dev.yaml up -d --build --wait --wait-timeout 600
```

开发应用地址为 `http://127.0.0.1:8080`。
开发环境的 Compose API 会自动执行数据库迁移并初始化五个本地演示账号。如需为已迁移的数据库手动补充种子数据，请运行：

```powershell
corepack pnpm migrate
corepack pnpm seed:demo-accounts
```

以下凭据仅用于本地开发与测试，严禁在生产环境使用：

| 员工 ID            | 角色                 | 密码                    |
| ------------------ | -------------------- | ----------------------- |
| `DEMO-EMPLOYEE`    | `employee`           | `Demo-Employee-2026!`   |
| `DEMO-APP-ADMIN`   | `application_admin`  | `Demo-AppAdmin-2026!`   |
| `DEMO-INNOVATION`  | `demand_operator`    | `Demo-Innovation-2026!` |
| `DEMO-ORG-ADMIN`   | `organization_admin` | `Demo-OrgAdmin-2026!`   |
| `DEMO-SUPER-ADMIN` | `super_admin`        | `Demo-SuperAdmin-2026!` |

使用 Windows VPN HTTP 代理时，请在首次拉取前将 Docker Desktop 的容器代理配置为 `http://host.docker.internal:7897`（而不是 `127.0.0.1:7897`）。原因与完整启动检查请参见 [Windows Docker Compose 指南](docs/development/windows-docker-compose.md)。
同一套 Compose 工作流在 Windows、macOS 与 Linux 上均可通过 Docker Desktop 或基于 Linux 容器的 Docker Engine 运行；完整的初始化与 Codex 配置检查请参见[跨设备开发指南](docs/development/cross-device-development.md)。

## GitHub 交付工作流

开发工作通过 `development` 分支集成，通过 `main` 分支发布。请使用阶段级 `feature/phase-XX-*` 分支，每个任务保持一个 Conventional Commit，并在阶段推进过程中持续更新一个草稿 PR。功能 PR 通过 squash 合并进入 `development`；发布分支通过 release PR 进入 `main`。必要的门禁、评审证据、回滚流程与命名规则请参见[分支与交付指南](docs/development/git-branching.md)和[PR 模板](.github/pull_request_template.md)。

GitHub Actions 是权威的 CI/CD 平台。PR 必须通过 `verify` 与 `container-smoke` 检查。语义化版本标签会将不可变的 SHA 镜像发布到 GHCR，并附带包含镜像摘要、SBOM 与供应链证明的发布清单。生产发布审批由 `production` GitHub Environment 保护。

## 项目文档

- [已批准的设计规格说明](docs/superpowers/specs/2026-07-31-ai-application-sharing-platform-design.md)
- [V1 项目路线图](docs/superpowers/plans/2026-07-31-ai-hub-v1-program-roadmap.md)
- [阶段 1 基础计划](docs/superpowers/plans/2026-07-31-ai-hub-phase-01-foundation.md)
- [Windows Docker Compose 指南](docs/development/windows-docker-compose.md)
- [跨设备开发指南](docs/development/cross-device-development.md)
- [分支迁移与 GitHub 治理记录](docs/development/branch-migration-2026-08-05.md)
- [ADR 0001：React SPA 与 NestJS 模块化单体](docs/adr/0001-modular-monolith.md)
- [ADR 0002：PostgreSQL 事务性 outbox](docs/adr/0002-postgres-outbox.md)
- [ADR 0003：Garage 对象存储](docs/adr/0003-garage-object-storage.md)
