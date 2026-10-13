# AI Hub Platform V1 本地可运行审计台账

> 历史记录：2026-08-12 至 2026-08-16。本文合并初始审计与本地整改执行台账，各节状态只对应记录时点；后续整改见 [PRD2APP 差距分析](./prd2app-gap-analysis-2026-08-18.md) 与 [阶段计划目录](../superpowers/plans/)。
>
> 基准分支：`development`；执行分支：`codex/v1-local-runnable-audit-remediation`。
> 本台账只把已经有代码、测试、截图或运行证据的项目标记为 DONE。

生产静态数据、接口缺口、数据库前向 migration 方案，以及“发布链/消费链”的逐步闭环判定，见 [V1 静态数据、接口、数据库与双流程闭环矩阵](./v1-flow-gap-matrix.md)。

## 状态口径

- **疑点**：证据不足、契约冲突或需要外部条件确认。
- **UNDO**：尚未完成的 V1 能力或验收门禁。
- **TODO**：关闭对应 UNDO 的具体整改动作和验收方法。
- **DONE**：已经通过代码、测试、截图或端到端证据验证的能力。

## 2026-08-12 基线 RED 证据

| 检查项 | 当前证据 | 状态 |
| --- | --- | --- |
| `pnpm format:check` | 首个门禁失败，报告 111 个格式问题 | UNDO |
| `pnpm lint` | database fixture 存在 11 个未使用导入/变量错误 | UNDO |
| `pnpm typecheck` | database analytics/catalog/identity fixture 存在 `string \| undefined` 与 optional property 错误 | UNDO |
| `pnpm test` | 初始基线：16 个脚本测试通过；2 个 seed 缺少变量测试被仓库 `.env` 的 `DATABASE_URL` 污染，turbo 测试未继续 | 疑点 |
| `pnpm build` | web Vite 可启动；database 被同一批 analytics fixture 类型错误阻断 | UNDO |
| Docker Compose | Docker Desktop Linux engine 未运行，尚未获得真实 PostgreSQL/API/worker 证据 | 疑点 |

## 2026-08-12 V1 领域台账

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

### 当时的 TODO

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

## 2026-08-15 至 2026-08-16 整改计划与执行台账

> 记录基线：`development` 工作树与 `codex/v1-local-runnable-remediation`。原台账标注更新时间为 2026-08-15，正文含 2026-08-16 增量；下列早期 UNDO 与后续 DONE 按原记录保留，以较晚时点的证据解释该批次进展。

### 一、执行顺序

1. 深化 Artifact Intake：complete CAS、staging/claim/finalize、失败恢复、Garage、ClamAV。
2. 完成 Audit event catalog、Security export worker、status/download。
3. 为 Notification 增加结构化 payload，并同步 migration、contract、seed、API、Modal。
4. 将 Catalog 列表分页/count 下推 PostgreSQL，消除 tag/label/delivery/attachment N+1。
5. 补 Analytics read model，清除应用详情和审核页剩余生产静态数据。
6. Docker/Rancher 恢复后集中验证 migration 0001–0031、seed 幂等、事务回滚、Compose 8 服务和两条浏览器主流程。
7. 对 21 张设计图逐图执行视觉、交互、响应式和可访问性验收，证据保存到 `.verify/v1/`。

### 二、已完成证据（DONE）

#### 1. Artifact Intake 代码切片

- `complete` 使用数据库 CAS claim，重复 complete 返回确定性冲突；业务行、Audit、Outbox 在同一 transaction。
- worker 已实现 staging object → claim verifying → hash/scan/signature → copy final → finalize；失败转 `failed`，stale `verifying` 可 reconciliation。
- Garage S3 adapter、ClamAV `INSTREAM` adapter、Ed25519 signer/verifier 已接入 API/worker composition root。
- migration `0025_artifact_integrity` 已加入状态、摘要、大小、排序、uploader FK、幂等键约束；中断重跑会先删除本 migration 自有约束再重建。
- 新增 `artifact-verification.worker.test.ts` 覆盖成功、恶意文件、finalize、staging 清理、Audit/Outbox。

#### 2. Audit 与 Security Export

- 已建立 `audit.catalog.ts`，统一 login/session、Application、Artifact、Review、Publish、Catalog、Feedback、Organization、Sync、Export 事件类别。
- Audit export job 支持 queued → processing → completed/failed，worker 生成 JSONL 并写入 Object Storage。
- 已增加：
  - `GET /internal/security/audit-exports/:exportId`
  - `GET /internal/security/audit-exports/:exportId/download`
- export job 创建、Audit 和 Outbox 在同一 transaction；download 会检查完成状态、过期和对象存在性。

#### 3. Notification payload

- `NotificationPayload` 已加入 `@ai-hub/contracts`，旧 `message` 仍兼容回退。
- migration `0029_notification_payload`、database schema、repository、service、DTO、client、fixture、demo seed、详情 Modal 已同步。
- Modal 优先展示结构化 `title/body/detail`，无 payload 时回退旧字段。

#### 4. Catalog SQL read model

- `listVisiblePage` 已将 visibility、audience、count、limit、offset 下推 PostgreSQL。
- tags、labels、deliveries、attachments 按当前页 application ids 批量读取并分组，不再逐行查询。
- migration `0030_catalog_read_model_indexes` 已注册必要索引。

#### 5. Analytics 与生产静态数据清理

- Web `AnalyticsDateRange`、dashboard query key、7/30/90 天 from/to 和真实 export API 已接通。
- Analytics export CTA 生成 CSV 下载并显示成功/失败反馈。
- Application detail/review/admin 页面改用 workspace、application、version、asset、risk、owner 等真实 API 字段；无数据时显示空态，不再伪造版本、评分、附件大小、截图、发布历史和推荐标签。
- Application workspace contract 已加入 assets，相关 server/web fixture 已同步。

#### 6. 本地 Compose 与真实数据库

- Rancher `dockerd/moby` 已恢复；`docker version` 同时返回 Client/Server。
- `docker compose -f compose.yaml -f compose.test.yaml config --quiet` 通过。
- 8 个服务均已 healthy：`postgres`、`garage`、`clamav`、`api`、`worker`、`web`、`proxy`、`prometheus`。
- 正式重建 API/worker 镜像后仍 8/8 healthy；API/worker 已包含 Artifact、ClamAV、Audit export 和 0031 兼容 migration。
- 隔离数据库 `ai_hub_v1_audit` 已执行 migration 至 `0030_catalog_read_model_indexes`。
- 默认 Compose 数据库发现历史 0025 漂移，新增并执行 `0031_artifact_runtime_compatibility`，当前迁移版本为 0031。
- 已修复真实 seed 暴露的两个数据库 bug：
  - analytics fixture 事件名不符合 `analytics_behavior_events_name_check`，且过期时间错误使用 90 天；
  - daily aggregate upsert 错把不存在的 `metric_version` 放入冲突键。
- 隔离库连续执行两次 `seed:demo-data`，均成功；`check:demo-data` 返回 `passed: true`，计数为 identity 9、application 84、catalog 23、demand 24、notification 20、analytics 1110。

### 三、当前 UNDO、TODO 与验收命令

#### DONE-1：Artifact 异常分支与并发容器证据（2026-08-16 完成）

已完成：

1. Rancher Desktop WSL 直连恢复 Docker Engine，主栈 8/8 healthy。
2. 隔离环境：`ai_hub_inject` 库（0031）、Garage `ai-hub-inject` 桶、注入 API/worker。
3. 注入 EICAR 恶意样本、伪签名、staging 篡改/删除、Garage 写权限撤销（真实 403
   copy 失败）、ClamAV 停止/冻结（30.07s 超时）、并发 complete CAS、60s 租约
   `verifying` 超时回收，共 10 个场景全部达到预期错误码/状态。
4. 7 个失败分支均无最终对象，Audit/Outbox 同事务成对落库；3 个成功分支 staging
   清理；并发 CAS 仅一次 claim（`verification_attempts` 总和 11 闭环）。

验收：`.verify/v1/artifact/` 已保存驱动器、10 个场景 JSON、数据库快照、API/worker
日志、对象清单与 README。

#### DONE-7：Audit export 运行时链路

已完成：

1. Compose API 已创建 export job，worker 已完成 queued → processing → completed。
2. status API 返回 completed，download HTTP 200。
3. 下载返回 UTF-8 NDJSON、`Content-Disposition` 和结构化 Audit 行。
4. failed、expired、storage failure 分支仍需专项运行时注入。

验收：`.verify/v1/runtime-smoke-20260815.md` 已保存 job、Audit/Outbox、Garage、ClamAV 和下载响应证据；`.verify/v1/artifact-exception-tests-20260815.md` 已保存 worker 异常分支与 API 并发 CAS 测试证据。

#### UNDO-3：Analytics 指标 read model 不完整

TODO：

1. 明确平台、应用、部门、审核 SLA、下载、互动、反馈的 metric key 与权限矩阵。
2. 为缺失指标增加 repository/service 查询和 contract；SQL 负责日期范围、scope、count、排序。
3. Analytics 页面补 loading、empty、error、403 和导出 job 状态。
4. 用真实 seed 数据验证 7/30/90 天结果和 CSV 行数一致。

验收：database/API/worker tests + 浏览器截图，禁止使用 `likeCount` 推导评分人数或前端前 200 条聚合。

#### UNDO-4：两条核心业务流程未完成浏览器证据

流程 A：登录 → 创建应用 → 上传 artifact → 校验/扫描/签名 → 创建版本 → 四渠道 → 提交审核 → 非本人认领 → 通过 → 发布 → 市场可见。

流程 B：普通员工登录 → 市场发现 → resolve/download → 评论 → 点赞 → 1–5 整数评分 → 反馈 → 所有者处理 → 用户查看结果。

TODO：补 Playwright Chromium E2E、五角色 401/403、禁止自审、非受众 direct-ID、点赞幂等、评论/官方回复、反馈事务回滚，并保存 trace/screenshot。

#### UNDO-5：21 张设计图尚未逐图验收

TODO：

- 依次验证 `/login`、`/marketplace`、详情、应用管理四工作台、创新广场、analytics、organization 五页、安全、通知列表/详情、creator、assistant。
- 视口使用普通页面 `1672×941`，应用详情/creator `2730×1536`，并补验 `768×1024`、`390×844`。
- 每页覆盖 loading、empty、error、403、hover、focus、selected、disabled、键盘访问和 console/network 错误。
- 原始设计图与实际截图并置，误差目标：布局 ≤2px，图标 ≤1px；字体抗锯齿差异单独注明。

### 四、统一门禁

按以下顺序执行并记录退出码：

```text
pnpm format:check
pnpm lint
pnpm typecheck
pnpm boundaries
pnpm test
pnpm build
node scripts/verify-doc-links.mjs
node scripts/repository-governance.mjs
docker compose -f compose.yaml -f compose.test.yaml config --quiet
```

额外命令：

```text
pnpm compat:node
pnpm --filter @ai-hub/api test -- --pool=threads --poolOptions.threads.singleThread=true
docker compose ps
docker compose logs --tail=100 api worker garage clamav
```

### 五、数据库与兼容规则

- 不修改 migration `0001–0024`；`0025`–`0031` 串行、可重复执行，新增约束遵守 expand → backfill → validate → 收紧。0031 仅用于修复已执行旧版 0025 的数据库漂移。
- 新列表使用 `PageResult<T>`，已有数组响应保持 wire shape；错误使用 `ApiErrorResponse`。
- 时间统一 ISO UTC，nullable 字段显式 `T | null`。
- API/worker 各自只持有一个 Database Pool；业务写入、Audit、Outbox 共用 transaction。
- development/test 可使用 deterministic DingTalk/Dify adapter；production 缺外部凭据必须 fail closed。

### 六、完成口径

只有同时满足以下条件才可将 V1 标记为完成：

- verify 9/9；
- 11 条领域链通过；
- 21 张设计图有截图、交互和可访问性证据；
- Compose 8/8 healthy，migration、seed、重启和数据保持通过；
- 两条浏览器主流程和五角色权限矩阵全绿；
- Artifact Garage/ClamAV、Audit export、Notification payload、Catalog SQL、Analytics read model 有真实 PostgreSQL/worker 证据；
- 核心生产代码无未批准 mock、伪成功延时和权限常量。

外部 DingTalk/Dify 凭据、企业签名、双机生产、备份恢复和真实试点仍单列为外部阻塞，不得写入 DONE。

### 七、2026-08-15 浏览器验收增量记录

#### 本 checkpoint 已完成（DONE）

- 已通过代理 `http://localhost:8080` 进入本地 Web；`proxy` 增加可配置 host port，Compose 仍为 8/8 healthy。
- 流程 A 已在真实浏览器完成：`DEMO-APP-ADMIN` 登录 → 创建应用 → 上传文本 artifact → Garage staging/final → ClamAV clean → 轮询 completed/passed → 创建版本 `1.0.1` → 四渠道全部启用 → 提交审核 → `DEMO-SUPER-ADMIN` 非本人领取并通过 → 应用管理员发布 → 应用管理列表显示“已上架”。证据：`.verify/v1/browser/flow-a-published.png`。
- 修复两个前端闭环缺陷：Upload Drawer 轮询 artifact status；创建版本传递 worker 返回的真实 `signature`，不再发送空签名。
- 修复一个真实后端缺陷：互动列表的 `count(*)` 不再与 `selectAll()` 混合，评分/评论分页查询恢复 200；流程 B 已回显 4 星评分、1 次点赞、1 条评论和待处理反馈。证据：`.verify/v1/browser/flow-b-engagement.png`。
- 已保存 21 张设计图对应的运行时截图（另含审核/通知详情状态截图）至 `.verify/v1/design/`，并逐项确认截图非空、非登录墙、非加载残片；审计记录见 `.verify/v1/design-audit-20260815.md`。

#### 当前仍为 UNDO / TODO

- 流程 B「所有者处理反馈后用户查看结果」：已完成（2026-08-16），见 `flow-b/flow-b-evidence.json`。
- 五角色 401/403、受众隔离、禁止自审矩阵：已完成（2026-08-16），见 `matrix/matrix.json`。
- Analytics 完整 read model：已完成（2026-08-16），见 `.verify/v1/artifact/analytics-runtime-evidence.md`。
- Artifact/Audit 异常注入：已完成（2026-08-16），见 `.verify/v1/artifact/README.md` 与场景 JSON。
- 21 张设计图：四视口/状态/键盘/console 与并置配对已完成；壳层几何已校准（Header 56、Sidebar 220，偏差 0px）并生成程序化像素矩阵。仍留人工项：原图 vs 实现的正文/图标字形逐像素 2px/1px 比对与原图 Modal 宽度基准（本会话无图像输入），见 `.verify/v1/browser/browser-acceptance.md` 与 `design-pixel-matrix.json`。

#### 发现并修复的回归缺陷

1. `archived` 应用状态未进入前端 `statusMeta`，应用管理页读取归档行时崩溃；已补齐状态样式与只读操作分支。
2. 应用管理员列表只读取 `applications.current_version_id`，审核通过但未发布的应用没有可发布版本 ID；已回退到该应用最新创建版本，发布闭环已验证。
3. 互动 `listRatings/listComments` 计数查询保留 `selectAll()`，PostgreSQL 聚合报错并被映射为 400；已拆分 count query，浏览器回归通过。

#### 运行证据索引

- 运行时主 smoke：`.verify/v1/runtime-smoke-20260815.md`
- Artifact 异常/CAS：`.verify/v1/artifact-exception-tests-20260815.md`
- 浏览器流程截图：`.verify/v1/browser/`
- 21 屏运行时截图：`.verify/v1/design/`
- 视觉/交互审计：`.verify/v1/design-audit-20260815.md`

### 八、2026-08-15 收口复核与下一步执行队列

#### 本次复核结果

以下命令在当前工作树重新执行并退出码为 0：

```text
pnpm format:check
pnpm lint
pnpm typecheck
pnpm boundaries
```

此前同一整改批次的全量 `pnpm verify` 已覆盖 `test`、`build`、文档链接、仓库治理和 Compose config；最新互动计数查询修复已通过 server/API 测试和浏览器回归。Windows `docker` CLI 仍无法连接 `docker_engine`（命名管道 ACL 未修复），本轮经 Rancher Desktop WSL 侧 `docker` 重建 web 镜像并复跑验收：主栈 8/8 healthy、migration 0032；web 镜像已含 Sidebar 220/64 修复；database 集成测试经共享测试库 `ai_hub_test`（需先重置 schema）383/383 全绿；历史 Compose/seed 证据继续引用 `.verify/v1/runtime-smoke-20260815.md`。

#### 严格按用户指定顺序的剩余执行队列

1. **Artifact Intake 异常注入（P0）— DONE（2026-08-16）**
   - Garage copy failure、ClamAV timeout/unavailable、错误摘要、错误签名、恶意样本
     全部在真实 Garage/ClamAV 上注入通过；staging 清理、`verifying` 超时回收、
     并发 CAS、Audit/Outbox 原子性均已验证。
   - 证据：`.verify/v1/artifact/README.md` 及同目录场景 JSON/日志/快照。

2. **Audit export 失败态和 Security 页面（P0）— DONE（2026-08-16）**
   - 隔离环境注入未就绪/生成失败/存储 403/过期/文件缺失与失败后重试 CAS，
     覆盖 `queued → processing → failed/completed`，失败任务无存储键且下载全 404。
   - 前端补风险等级筛选、导出 2s 轮询状态机与 completed 专属下载按钮，
     failed/expired 仅提示不提供下载；新测试 3/3、全量 web 105/105、typecheck/lint 通过。
   - 证据：`.verify/v1/artifact/README.md` 及同目录 `export-*`、`download-*` JSON。

3. **Notification payload 数据库回放（P0）— DONE（2026-08-16）**
   - 空库 `ai_hub_replay` 全量 migration 后 0029 与 payload 列/object 约束均落地；
     重复 migration 31 → 31，重复 demo seed 两次计数一致且 `check:demo-data` passed。
   - 详情优先读取 payload、旧 `message` 回退；收件人越权改为 404
     （修复 call() 全量 400 映射：403/404/400 分派），server 通知模块 14/14。
   - 证据：`.verify/v1/artifact/README.md` 与 `notification-replay-*`、`notification-seed-*`。

4. **Catalog PostgreSQL 性能与隔离（P1）— DONE（2026-08-16）**
   - 303 应用 fixture：EXPLAIN 显示 audience-before-pagination、索引命中；新增
     `application_id` tiebreaker 后跨页无重无漏（250/250）。
   - log_statement=all 实测单请求 6 条目录 SQL（1 count + 1 page + 4 条批量 IN），
     无逐行 N+1；五角色列表 250/280/240/220/220 与受众期望一致，direct-ID 未发布/
     撤回/归档/非受众均 404 不泄露。
   - 证据：`.verify/v1/artifact/catalog-runtime-evidence.md`、`catalog-explain.txt`、
     `catalog-query-log.txt`、`catalog-fixture-result.txt`。

5. **Analytics 完整 read model（P1）— DONE（2026-08-16）**
   - 指标字典扩展为 23 项并支持 count/distinct_actor/distinct_aggregate/snapshot；
     互动与反馈服务真实写入 5 类新行为事件，migration 0032 放宽事件名约束并固化定义。
   - 平台/应用/风险看板 7/30/90 天、快照指标、403 与 CSV（7d×3 scope=21 行）均验证；
     demo seed 更新为 40 事件 + 1800 聚合（analytics=1840）。
   - 证据：`.verify/v1/artifact/analytics-runtime-evidence.md`、`analytics-reseed.txt`。

6. **两条浏览器流程与五角色矩阵（P0）— DONE（2026-08-16）**
   - 五角色菜单/路由 403/受众 direct-ID 404/禁止自审/401 重定向矩阵完成；
     流程 A 补 EICAR 恶意上传失败与四渠道门禁；流程 B 补点赞 toggle、受控评分、
     官方回复、所有者反馈管理、员工回看「已解决」、隐藏/恢复。
   - 证据：`.verify/v1/browser/browser-acceptance.md`、`matrix/matrix.json`、
     `flow-a/flow-a-evidence.json`、`flow-b/flow-b-evidence.json` 与截图。

7. **21 张设计图最终验收（P1）— 壳层已收敛，内容像素比对留待人工（2026-08-16）**
   - 21/21 页四视口截图（`1672×941`×19、`2730×1536`×2、`768×1024`、`390×844`），
     全部 `overflowX=0`、无 console 错误、无未解释 4xx；hover/focus/activeTab/
     键盘焦点与 21 张原图并置配对均落盘 `design-pass/`。
   - 组织用户详情 Modal 已接通；角色/最近登录已改为真实后端数据（migration 与
     seed 回填修复一并完成）。
   - Sidebar 8px 偏差已修复：`AppShell.tsx` 改为 `width=220`、`collapsedWidth=64`，
     web 镜像重建后 20 个登录态页面 DOM 实测 Header 56、Sidebar 220、内容区 (220,56)，
     与权威规范一致（偏差 0px）。
   - 程序化偏差矩阵已生成 `.verify/v1/browser/design-pixel-matrix.json`：逐像素
     测量 21 张原 PNG 的 Header 底边/Sidebar 右边框/图标字形带/Modal 面板，与 DOM
     实测对照；原图边框读数 220–261（干净页 220–221），Header 读数 61–71，属
     mockup 渲染噪声。实现侧图标 14×14 恒定、Modal 宽度 520/640 由代码显式指定。
   - 保留说明：正文/图标字形的「原图 vs 实现」逐像素 2px/1px 比对与原图 Modal
     宽度基准，因本会话无图像输入能力，留待图像可见会话/人工复核后关闭
     （见 `browser-acceptance.md`）。

#### 当前完成度口径

- 工程：format/lint/typecheck/boundaries/scripts 全绿；server 169、database 383、
  API 43、web 112（2026-08-16 复跑全绿；database 需先重置共享测试库 ai_hub_test
  的 schema 以消除残留行）；doc-links/governance/compose config 通过。
- 运行时：主栈 8/8 healthy、migration 0032；Artifact 异常注入 10 场景、Audit
  export 6 分支、Notification 回放、Catalog 303 应用、Analytics 23 指标均完成。
- 业务：五角色浏览器矩阵（菜单/403/404/401/禁止自审）、流程 A EICAR+四渠道、
  流程 B 互动→官方回复→反馈处理→回看→隐藏/恢复全部完成。
- 视觉：21 页四视口/状态/键盘/console/network 与并置配对完成；Sidebar 已修复为
  220（与规范 0px 偏差）；壳层几何矩阵已程序化落地；仅「原图 vs 实现」的正文/图标
  字形逐像素 2px/1px 比对与原图 Modal 宽度基准留待图像可见会话或人工复核。
