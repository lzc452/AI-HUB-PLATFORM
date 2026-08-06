# 阶段 7 执行台账

日期：2026-08-04

## 基线决策

阶段 6 作为输入从 `feature/phase-06-analytics-dashboard-export-assistant` 的提交 `e8255b31949fead551fae4abd3ef94d1979d38c2` 接受。新分支为 `feature/phase-07-production-security-deployment-operations`。

工作树最初只包含现有未跟踪的 `.codex/` 目录。它是用户拥有的工作区状态，被排除在暂存之外。本地阶段 6 远程跟踪分支解析到同一提交。尝试了一次全新 `git ls-remote`，但 GitHub 端点返回空应答；未经验证的远程结果不作为证据。

阶段 3–6 的已接受证据从其计划、台账、ADR、路线图与阶段 6 远程跟踪证据消费。不重复它们的完整门禁。只要求阶段 7 边界回归。

## 范围与非目标

阶段 7 覆盖两台 Ubuntu Server 生产 Compose 主机、内部 DNS 基于健康度的切换、PostgreSQL 流复制/WAL 归档/手动提升、对象存储复制与恢复、Prometheus/Grafana/Alertmanager/集中式日志、TLS/CSP/CSRF/SSRF/防重放控制、不可变镜像 CI、升级/回滚/迁移门禁、备份、演练与运维 runbook。

单企业模型、现有业务语义、ActorContext/RBAC、审计、Outbox、迁移与回滚边界保持不变。Redis、Elasticsearch、消息队列、Kubernetes、微服务、新租户模型与不受限的公开 Open API 仍被禁止。阶段 8 试点、UAT、正式上线与企业签核明确延后。

## 目标证据

| 目标 | 必需证据 | 状态 |
|---|---|---|
| 双主机生产 Compose | 已验证的 Compose 模型、不可变镜像/密钥契约、一次性夹具；真实主机部署仍属外部 | 契约通过 |
| 活动节点切换 | 内部 DNS 健康检查、隔离（fencing）、切换与回滚测量 | 待定 |
| PostgreSQL 恢复 | 流复制/WAL 设置与恢复证据契约通过；真实主备对/恢复待 Docker/主机访问 | 有风险 |
| 对象存储恢复 | 异步复制策略/清单契约通过；真实站点/切换/恢复待定 | 有风险 |
| 可观测性 | Prometheus/Grafana/Alertmanager/Loki/Promtail 配置与脱敏契约通过；已连接接收人/真实健康待定 | 策略通过 |
| 安全 | TLS/CSP/CSRF/SSRF/防重放对抗测试；真实证书/DNS 扫描仍属外部 | 策略通过 |
| 发布安全 | 发布/回滚门禁测试、CI SBOM/供应链证明标志、迁移/前向修复契约通过；签名扫描/摘要捕获待定 | 策略通过 |
| 可靠性目标 | 实测 99.5% 可用性、RPO <= 15 分钟、RTO <= 2 小时 | 待定 |
| 交付 | 分支推送与草稿 PR URL 或确切的外部阻断项 | 待定 |

## 有序执行与证据

1. 基线、计划、台账、ADR 0008、可视化。
2. 生产 Compose、配置分层、密钥、不可变镜像。
3. TLS、代理、安全头、CSRF、SSRF、防重放。
4. PostgreSQL 复制、WAL、备份、恢复、手动提升。
5. 对象存储复制、切换、恢复。
6. 指标、仪表盘、Alertmanager、集中式日志。
7. CI/CD 发布、回滚、迁移与供应链门禁。
8. 故障与恢复演练。
9. 必要的 API/Worker/Web/安全/备份/部署回归。
10. 最终门禁、双轴评审、提交、推送、草稿 PR 或阻断项。

任何步骤都不会凭未执行的命令、缓存结果、仅本地模拟、不完整凭据、不完整网络或未投递的演练标记为通过。

### 步骤 1：基线与规划

- 分支基础：`e8255b31949fead551fae4abd3ef94d1979d38c2`。
- 分支：`feature/phase-07-production-security-deployment-operations`。
- 现有 `.codex/` 已保留并被排除。
- 复用阶段 6 证据；不重复阶段 3–6 完整门禁。
- 在提交 `b64c41e` 中建立计划、台账、ADR 0008 与可视化。
- 验证：`git diff --check` 与 `corepack pnpm format:check` 通过。
- 步骤状态：通过。

### 步骤 2：生产 Compose 与不可变配置

- RED：`node --test scripts/production/validate-config.test.mjs` 最初以 `ERR_MODULE_NOT_FOUND` 失败，因为校验器不存在；config 包密钥文件测试因忽略 `DATABASE_URL_FILE` 与 `COOKIE_SECRET_FILE` 而失败。
- GREEN：校验器现在拒绝缺失角色/密钥、可变镜像、开发兜底与数据库/存储主机端口。它 5/5 测试通过。config 包在读取挂载密钥文件后 3/3 测试、typecheck、lint 与 build 通过。`docker compose --env-file scripts/production/fixtures/compose.env -f compose.production.yaml config --quiet` 通过，仅有关于本地 Docker 凭据不可访问的 Docker 警告。`corepack pnpm format:check` 与 `git diff --check` 通过。非密钥扫描在生产制品中未发现兜底密钥值；`cookie_secret` 匹配只是 Compose 密钥名。
- 实现：`compose.production.yaml` 是独立的 active/standby 契约，含摘要锁定的镜像变量、宿主机挂载密钥、无数据库/存储主机端口、只读/无新增权限的应用容器，且只暴露代理端口。示例 env 文件与 runbook 明确要求替换，不声称已部署。
- 生产主机/密钥/镜像签名/DNS 证据：待定；任何本地夹具都不被接受为生产证据。
- 提交：`9fc3a44 feat(phase-07): add immutable production compose contract`。

### 步骤 3：安全边界

- RED：在实现前添加了定向 CSRF/SSRF/重放与代理测试；模块/配置文件缺失，产生预期的缺失模块/配置失败。后续严格 typecheck 还发现不可用的 Node `LookupAddress` 类型，并在 green 前修复。
- GREEN：server 以 27 个文件/105 个测试通过，server/database/API 的 typecheck 与 server/API lint 通过，生产代理测试 1/1 通过。安全边界包括 TLS 代理头/重定向、CSRF 双重提交检查、DNS 解析的私有地址拒绝，以及通过迁移 `0012` 的 PostgreSQL 支持哈希 nonce 唯一性。
- 验证：`corepack pnpm --filter @ai-hub/server test`；`corepack pnpm --filter @ai-hub/server typecheck`；`corepack pnpm --filter @ai-hub/server lint`；对应的 database/API typecheck 与 API lint；在 `apps/api` 中运行 `node ../../node_modules/vitest/vitest.mjs run test/proxy-production-config.test.ts`。
- 真实证书/DNS/网络/TLS 扫描与双主机重放证据：待提供。
- 提交：`1f59742 feat(phase-07): enforce production request security boundaries`。

### 步骤 4：PostgreSQL 恢复

- RED：`node --test scripts/production/postgres-ops.test.mjs` 最初以 `ERR_MODULE_NOT_FOUND` 失败，因为运维校验器不存在。
- GREEN：PostgreSQL 运维测试 4/4 通过；`@ai-hub/database` typecheck 通过；生产 Compose 模型在主库设置与显式宿主机挂载配置/WAL 路径下仍可验证。runbook 覆盖 `pg_basebackup`、复制槽、WAL 归档、隔离（fencing）、手动提升、迁移/审计/Outbox/分析的恢复验证、DNS 切换与 RPO/RTO 测量。
- 一次性 PostgreSQL/API 证据尝试：现有 Docker 支持 API 测试返回 `Could not find a working container runtime strategy`；没有双节点对、备份介质、复制凭据或真实恢复可用。这是外部阻断项，演练保持开启。
- 提交：`345133c feat(phase-07): add postgres replication and recovery operations`。

### 步骤 5：对象存储恢复

- RED：`node --test scripts/production/object-storage-ops.test.mjs` 最初以 `ERR_MODULE_NOT_FOUND` 失败，因为存储运维校验器不存在。
- GREEN：对象存储运维测试 4/4 通过；生产 Compose 模型接受显式 primary/secondary Garage 配置路径；新增主/备配置、带版本/私有/加密的桶策略、确定性 SHA-256 清单、隔离（fencing）、冲突检查与手动切换/恢复 Runbook。未引入队列或同步持久化声明。
- 生产存储端点、凭据、独立介质与真实复制/切换/恢复：待定；任何本地清单都不作为生产证据。
- 提交：`2fbb5aa feat(phase-07): add object storage replication and recovery operations`。

### 步骤 6：可观测性与日志

- RED：`node --test scripts/production/observability-ops.test.mjs` 最初以 `ERR_MODULE_NOT_FOUND` 失败，因为可观测性校验器不存在。
- GREEN：可观测性测试 4/4 通过；生产配置校验器 5/5 通过；Compose 模型、格式与空白检查通过。新增生产 Prometheus 目标/规则，覆盖 API、Worker、PostgreSQL exporter、Garage、Loki、99.5% 可用性、15 分钟 RPO、2 小时 RTO、安全、备份与复制告警；Grafana 数据源；Alertmanager 路由；Loki/Promtail 脱敏集中日志。
- 已连接的告警接收人、真实抓取/告警投递、日志保留卷与主机健康证据：待定；未连接的 webhook 或本地配置不构成已投递证据。
- 提交：`665193f feat(phase-07): add production observability and alerting`。

### 步骤 7：CI/CD 与供应链

- RED：`node --test scripts/production/release-gate.test.mjs` 最初以 `ERR_MODULE_NOT_FOUND` 失败，因为发布门禁不存在。源契约也曾失败一次，因为它期望字面摘要而非所需的摘要变量契约；该断言已修正为要求 `:?` 镜像变量加 CI SBOM/供应链证明标志。
- GREEN：发布测试 4/4 通过；回滚测试 2/2 通过；`node scripts/production/release-gate.mjs --contract` 与 `node scripts/production/rollback-gate.mjs --contract --dry-run --mode=forward-fix` 通过；在 GitHub/GitLab 中要求发布/回滚门禁、SBOM 与供应链证明后，CI 配置测试通过；格式与空白检查通过。CI 现在请求 BuildKit SBOM/供应链证明，并在验证前执行两个源契约。
- 镜像仓库签名、实际推送的镜像摘要、漏洞库扫描输出、针对生产级 PostgreSQL 的迁移执行与外部凭据：待定；任何未签名/本地镜像都不是生产证据。
- 提交：`5cb97b8 ci(phase-07): gate immutable releases and rollback`。

### 步骤 8：演练

- RED：`node --test scripts/production/drills/drill-ops.test.mjs` 最初以 `ERR_MODULE_NOT_FOUND` 失败，因为演练校验器不存在。
- GREEN：演练校验器测试 4/4 通过；`docs/runbooks/failover-drill.md`、`docs/runbooks/incident-response.md` 与证据包模板现在要求隔离（fencing）、有序时间戳、校验和恢复证明与实测 `RPO <= 900` / `RTO <= 7200`。
- 一次性演练证据：校验器契约在本地通过；未声称任何一次性或生产主机演练。
- 真实双主机实测 RPO/RTO 证据：待定，且不得模拟。
- 提交：`81881db test(phase-07): add production failure and recovery drills`。

### 步骤 9：必要回归

- 定向本地证据：server `27 个文件 / 105 个测试通过`；worker `3 个文件 / 7 个测试通过`；web `4 个文件 / 18 个测试通过`；config `1 个文件 / 3 个测试通过`；生产运维/安全/发布/演练契约 `25 个测试通过`；API 生产代理 `1/1`；API 与 database typecheck 通过；Compose 生产模型通过；format 与 diff 检查通过。
- API 包回归还运行了 `11 个文件`：`13 个通过`、`7 个真实测试跳过`，`3 个真实套件`在数据库启动前的既有 `Could not find a working container runtime strategy` 下失败。数据库集成尝试以 `24 个跳过` 遇到相同运行时失败。这些是环境阻断项，不是通过的生产证据。
- 阶段 3–6 完整门禁复用仍明确：继承先前接受的阶段 6 证据；任何完整阶段 3–6 门禁都不会被重新标记为阶段 7 证据。

### 步骤 10：最终门禁与交付

- 精确阶段 7 门禁：format、lint、typecheck、boundaries、build、文档链接、开发 Compose、生产 Compose 与最终阶段 7 契约套件通过（`31/31` 契约测试）；完整 `pnpm verify` 在数据库集成处停止，3 个套件失败 / 24 个测试跳过，因为没有可用的容器运行时策略。真实部署、备份/恢复、故障切换、可观测性与 SLO 证据仍待定。
- 双轴评审：标准轴复审未发现剩余可执行发现项。规格轴复审未发现被禁止的基础设施或阶段 8 范围蔓延，但 SSRF 出站适配器强制、Active/Standby Compose 隔离（fencing）、可执行的 PostgreSQL/对象存储恢复、真实供应链制品与已认证 ActorContext 传播仍不完整；这些不被声称生产就绪。
- 推送：在此收尾记录之前，`feature/phase-07-production-security-deployment-operations` 在提交 `bea0dc9` 推送成功；分支正跟踪 `origin/feature/phase-07-production-security-deployment-operations`。
- 草稿 PR：已通过 GitHub 集成尝试创建，返回 HTTP 403 `Resource not accessible by integration`；不存在草稿 PR URL/编号，也不声称存在。

## 外部阻断项与完整性规则

- 基线期间 GitHub 远程读取被端点空应答阻断；本地远程跟踪提交是当前唯一的远程证据。
- 真实 Ubuntu 主机、内部 DNS、TLS 证书、出站允许列表、备份介质、存储复制端点、告警接收人、镜像仓库签名与生产凭据不在仓库中。
- 这些前置条件可以进行结构性记录与验证，但在以全新证据执行之前，不能被标记为已部署、已恢复或生产就绪。
- 在配置的 GitHub 集成返回 URL 或确切的外部错误之前，草稿 PR 是否存在未知。
