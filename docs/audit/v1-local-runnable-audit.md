# AI Hub Platform V1 本地可运行审计台账

> 基准分支：`development`；执行分支：`codex/v1-local-runnable-audit-remediation`。
> 本台账只把已经有代码、测试、截图或运行证据的项目标记为 DONE。

生产静态数据、接口缺口、数据库前向 migration 方案，以及“发布链/消费链”的逐步闭环判定，见 [V1 静态数据、接口、数据库与双流程闭环矩阵](./v1-flow-gap-matrix.md)。

## 状态口径

- **疑点**：证据不足、契约冲突或需要外部条件确认。
- **UNDO**：尚未完成的 V1 能力或验收门禁。
- **TODO**：关闭对应 UNDO 的具体整改动作和验收方法。
- **DONE**：已经通过代码、测试、截图或端到端证据验证的能力。

## 当前基线 RED 证据

| 检查项 | 当前证据 | 状态 |
| --- | --- | --- |
| `pnpm format:check` | 首个门禁失败，报告 111 个格式问题 | UNDO |
| `pnpm lint` | database fixture 存在 11 个未使用导入/变量错误 | UNDO |
| `pnpm typecheck` | database analytics/catalog/identity fixture 存在 `string \| undefined` 与 optional property 错误 | UNDO |
| `pnpm test` | 初始基线：16 个脚本测试通过；2 个 seed 缺少变量测试被仓库 `.env` 的 `DATABASE_URL` 污染，turbo 测试未继续 | 疑点 |
| `pnpm build` | web Vite 可启动；database 被同一批 analytics fixture 类型错误阻断 | UNDO |
| Docker Compose | Docker Desktop Linux engine 未运行，尚未获得真实 PostgreSQL/API/worker 证据 | 疑点 |

## V1 领域台账

| 领域 | 前端/路由 | API/服务/数据库 | 当前状态 | 下一步验收 |
| --- | --- | --- | --- | --- |
| identity | `/login` 已有页面与登录 client | identity controller/service/repository/migration 已存在 | 疑点 | 角色矩阵、401/403、浏览器登录回归 |
| marketplace/catalog | `/marketplace`、详情页已有真实 client | catalog controller/service/repository/migration 已存在 | 疑点 | 真实 seed 后列表、详情、交付动作 |
| application admin | `/applications`、versions/review/delivery 路由存在 | application controller/service/repository 已存在 | UNDO | 清除创建/状态动作 mock，补齐 admin list/KPI contract |
| interaction | 市场详情有点赞/评论入口 | interaction service 使用事务、审计与 Outbox | 疑点 | 真实 API 与受众隔离回归 |
| innovation/demand | `/innovation`、详情页部分真实调用 | demand controller/service/repository/migration 已存在 | 疑点 | 列表、认领、评论、进度、合并全流程 |
| notification | 列表、已读、详情 Modal 路由可用 | notification controller/service/repository 已存在 | 疑点 | 结构化 payload 与详情契约 |
| analytics/export | `/analytics` 路由存在 | analytics API 有 client；页面仍含静态聚合 | UNDO | dashboard/export 前端真实调用与权限 |
| assistant | `/assistant` 路由存在 | assistant 后端降级能力待核对；前端推荐数据静态 | UNDO | 前端请求后端，错误/降级状态可见 |
| organization | users/departments/roles/sync tabs 存在 | 部分管理读模型与 CRUD 缺失/使用 mock | UNDO | 5 角色 CRUD、同步任务、权限矩阵 |
| security/audit | `/security` 路由存在 | 未发现 security/audit controller；前端使用本地 demo | UNDO | 审计查询/导出 API、权限和分页 |
| creator | `/creator/:applicationId` 已有真实 creator hooks | creator controller/service 已存在 | 疑点 | 设计图截图与交互/权限回归 |
| worker/outbox | worker package 与 Outbox 写入路径存在 | Docker worker 尚未真实启动验证 | 疑点 | health、重启、消费幂等 |

## 设计图清单

21 张设计图的路由映射已在 V1 计划中固定；视觉验收视口为普通页面 `1672×941`，应用详情与创作者中心 `2730×1536`。在 Docker/API 可用前，截图证据只能证明静态布局，不能证明真实数据流。

## 2026-08-12 整改后证据

| 门禁/能力 | 证据 | 状态 |
| --- | --- | --- |
| `pnpm format:check` | Prettier 检查全部文件通过 | DONE |
| `pnpm lint` | 9 个 workspace lint 通过 | DONE |
| `pnpm typecheck` | 9 个 workspace typecheck 通过 | DONE |
| `pnpm boundaries` | 458 modules、1131 dependencies，无依赖越界 | DONE |
| `pnpm build` | 9 个 workspace build 通过；Web Vite 仅保留 chunk size warning | DONE |
| seed 缺少 `DATABASE_URL` 测试 | 4/4 通过，`.env` 已可显式跳过 | DONE |
| Web 全量测试 | 17 个测试文件、85 个测试通过；仍有 jsdom `getComputedStyle`、React Router/Ant Design deprecation stderr | DONE（有测试环境告警） |
| Database 单元 fixture | 17 个文件中 12 个通过；28 个 PostgreSQL 集成测试跳过，原因是 Testcontainers 无可用 runtime | DONE（集成疑点） |
| 应用管理 admin-list | Controller → Service → Kysely Repository → 前端真实请求，返回 `currentVersionId` | DONE |
| 应用创建 | 创建按钮调用 `POST /internal/applications`，成功后跳转工作台，失败显示错误 | DONE |
| Analytics platform dashboard | 前端调用 `/internal/analytics/dashboards/platform` 并聚合真实指标 | DONE |
| Assistant | 前端调用 `/internal/analytics/assistant`，保留 provider degraded 状态 | DONE |
| Security audit | 新增受保护 `/internal/security/audit-logs`，读取 `identity_audit_events`，缺少身份头返回 400 | DONE |
| Docker Compose/API/worker/真实 PostgreSQL | Docker Desktop Linux engine 当前不可连接 | 疑点/UNDO |

### 当前 TODO

- 清理 Web 测试环境的 jsdom `getComputedStyle`、Ant Design deprecation 与 React Router future flag 告警，避免把非零 stderr 带入最终浏览器质量门禁。
- 在 Docker/Testcontainers 可用后重新跑 `pnpm test`，当前根测试被 PostgreSQL runtime 阻断。
- 为组织 users/departments/roles/sync 页面补齐后端读模型、CRUD 与同步任务接口，删除业务路径 mock。
- 为 security audit 增加分页、导出接口，并完成 5 角色 401/403 回归。
- 启动 Docker Desktop 后执行空库 migration、重复 migration、demo seed 幂等、API/worker health 与浏览器流程。
- 按 21 张设计图视口逐页截图，完成 2px 布局与状态矩阵验收。

## 外部阻塞

真实 DingTalk/Dify 凭据、双机生产部署、备份恢复演练和真实试点不属于本轮本地 V1 硬完成线，最终单列为外部阻塞，不标记 DONE。

## 变更记录

- 2026-08-12：建立本地 V1 基线台账，记录 format/lint/typecheck/test/build/Docker 的 RED 证据。
- 2026-08-12：增加两条核心业务流程闭环审计，确认两条链均未闭环，并同步静态数据、接口缺口和 0018–0020 migration 建议。
