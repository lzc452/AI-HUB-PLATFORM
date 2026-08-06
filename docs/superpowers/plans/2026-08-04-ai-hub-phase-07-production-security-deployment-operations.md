# 阶段 7 生产安全、部署与运维实施计划

> **给智能体工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实施本计划。步骤使用复选框（`- [ ]`）语法跟踪。

**目标：** 产出可部署、可审计的双 Ubuntu 生产 Compose 运行模型，包含安全控制、故障恢复证据，以及 99.5% 可用性、15 分钟 RPO、2 小时 RTO 目标的显式证明，且不进入阶段 8 试点或上线工作。

**架构：** 保持现有单企业模块化单体及其 PostgreSQL、Outbox、审计、授权与 S3 兼容对象存储边界。为两台独立 Ubuntu 主机新增参数化生产 Compose 覆盖层、内部 DNS 基于健康度的活动节点切换、PostgreSQL 主/备流复制加 WAL 归档、异步对象复制，以及使用 Prometheus、Grafana、Alertmanager 与集中日志的可观测性平面。生产配置通过经过验证的环境文件或宿主机挂载密钥注入；不允许密钥兜底。

**技术栈：** Docker Compose、Ubuntu Server、PostgreSQL 18、Nginx、Garage/S3 兼容存储、Prometheus、Grafana、Alertmanager、Loki/Promtail、Node.js 24、pnpm 10.34.5、TypeScript、Vitest、Node test runner、GitHub Actions、GitLab CI、兼容 Trivy/Syft 的供应链检查。

## 全局约束

- 延续单企业、单实例模型；不新增 `tenant_id`。
- 不引入 Redis、Elasticsearch、消息队列、Kubernetes 或微服务。
- 不添加不受限的公开 Open API，也不改变阶段 3–6 业务语义。
- 保留 ActorContext、RBAC、受众过滤、审计、Outbox、迁移与回滚边界。
- 不得凭本地模拟、缓存输出、不完整凭据、不完整网络配置或未投递演练声称生产就绪。
- 将阶段 8 试点、UAT、正式上线与企业签核排除在范围之外。
- 每项生产变更都有失败测试或配置契约测试、最小验证、ADR/台账条目与独立的 Conventional Commit。
- 复用已接受的阶段 3–6 证据，只运行必要的回归检查。

## 阶段 7 基线

- 基础分支：`feature/phase-06-analytics-dashboard-export-assistant`。
- 基础提交：`e8255b31949fead551fae4abd3ef94d1979d38c2`。
- 新分支：`feature/phase-07-production-security-deployment-operations`。
- 本地阶段 6 远程跟踪分支解析到同一提交。尝试了一次全新 `git ls-remote`，被 GitHub 网络端点返回空应答阻断；这记录为外部证据不确定性，而非编造的远程结果。
- 现有未跟踪的 `.codex/` 是用户拥有的工作区状态，仍被排除在暂存之外。
- 已接受的阶段 6 证据从其计划、执行台账、ADR 0007、路线图与远程跟踪分支消费；不重复阶段 3–6 完整门禁。

## 有序任务

### 任务 1：阶段 7 基线、计划、台账、ADR 与可视化

**文件：** 创建本计划、`docs/superpowers/plans/2026-08-04-ai-hub-phase-07-execution-ledger.md`、`docs/adr/0008-phase-07-production-security-deployment-operations.md`；修改 `processing_visualization.html`。

- [x] 记录确切的阶段 6 基础、新分支、状态、远程证据限制、保留的 `.codex/`、已接受证据、范围、非目标与外部前置条件。
- [x] 在 ADR 与可视化中记录有序工作矩阵、目标 SLO/RPO/RTO、证据策略与阶段 8 延后项。
- [x] 运行 `git diff --check` 与 `corepack pnpm format:check`。
- [x] 提交 `docs(phase-07): establish production operations baseline`。

### 任务 2：生产 Compose、配置分层、密钥与不可变镜像

**文件：** 创建 `compose.production.yaml`、`infra/production/*.env.example`、`infra/production/secrets/README.md`、`scripts/production/validate-config.mjs`、`scripts/production/validate-config.test.mjs`、`docs/runbooks/production-deploy.md`；仅在需要时修改 `infra/docker/*.Dockerfile`、CI 配置与 workspace 脚本。

- [x] 编写失败测试，拒绝开发密钥兜底、`latest` 镜像标签、未锁定的生产镜像引用、缺失节点角色/配置、宿主机发布的数据库/存储端口与缺失镜像摘要证据。
- [x] 为 active 与 standby Ubuntu 主机实现最小参数化覆盖层，将非密钥配置与宿主机挂载密钥分离，把应用镜像引用锁定为摘要引用，并只暴露代理。
- [x] 使用非生产夹具验证独立生产 Compose 模型、生产配置校验器、config 包测试/typecheck/lint/build 与非密钥扫描；没有真实主机凭据时不执行生产部署。
- [x] 提交 `feat(phase-07): add immutable production compose contract`。

### 任务 3：TLS、代理安全、CSRF、SSRF 与防重放边界

**文件：** 创建 `infra/docker/nginx.production.conf`、`packages/server/src/security/csrf.*`、`packages/server/src/security/ssrf-policy.*`、`packages/server/src/security/replay-guard.*` 与定向测试；修改 API 引导/配置与安全文档。

- [x] 编写失败测试，覆盖仅 TLS 代理行为、HSTS/CSP/frame/content/referrer 头、状态变更请求的 Origin/CSRF 令牌强制、带 DNS 复查的私有/链路本地/回环/元数据 SSRF 拒绝，以及不绕过审计/Outbox 的重复/过期请求 ID 拒绝。
- [x] 使用现有会话与授权边界实现中间件/端口；控制项只在显式命名的测试配置中禁用，绝不通过生产兜底。
- [x] 验证定向安全测试、API/server typecheck 与 lint、代理安全配置测试与对抗性请求夹具。真实证书/DNS/TLS 扫描证据仍属外部。
- [x] 提交 `feat(phase-07): enforce production request security boundaries`。

### 任务 4：PostgreSQL 复制、WAL 归档、备份、恢复与手动提升

**文件：** 创建 `infra/postgres/production.Dockerfile`、`infra/postgres/*.conf`、`scripts/production/postgres-*.mjs`、`scripts/production/postgres-*.test.mjs`、`docs/runbooks/postgres-failover.md`、`docs/runbooks/backup-restore.md`；修改生产 Compose 与迁移门禁脚本。

- [x] 编写失败测试，覆盖主/备配置、复制槽/WAL 保留设置、加密归档目标、备份完整性检查、迁移锁/回滚门禁、提升前置条件与恢复点时间戳。
- [x] 实现流复制与 WAL 归档契约、`pg_basebackup` 恢复流程、带隔离（fencing）与 DNS 切换前置条件的手动提升，以及检查迁移、审计、Outbox 与阶段 6 分析数据的恢复验证。
- [x] 尝试一次性 PostgreSQL 证据路径并记录确切的 Docker 运行时失败；保持真实主备对/演练开启，而不是把配置当作恢复证明。
- [x] 提交 `feat(phase-07): add postgres replication and recovery operations`。

### 任务 5：对象存储复制、切换与恢复

**文件：** 创建 `infra/garage/production-primary.toml`、`infra/garage/production-secondary.toml`、`scripts/production/object-storage-*.mjs`、定向测试与 `docs/runbooks/object-storage-failover.md`；修改生产 Compose 与存储配置。

- [x] 编写失败测试，覆盖带版本/加密桶、复制清单、校验和验证、拒绝公开桶访问、切换隔离（fencing）与代表性阶段 3–6 制品的恢复。
- [x] 实现带显式源/目标凭据、清单/校验和验证、手动切换与回滚安全恢复的异步 S3 兼容复制；不添加消息队列，也不声称同步持久化。
- [x] 验证策略/清单测试、Compose 配置、格式与基于校验和的清单路径；将不可用的生产端点记录为不完整证据。
- [x] 提交 `feat(phase-07): add object storage replication and recovery operations`。

### 任务 6：指标、仪表盘、告警与集中日志

**文件：** 创建 `infra/monitoring/prometheus.production.yml`、`infra/monitoring/alertmanager.yml`、`infra/monitoring/grafana/provisioning/*`、`infra/monitoring/loki/*`、`infra/monitoring/promtail/*`、定向配置测试与 `docs/runbooks/observability.md`；仅在需要时修改监控 Compose 服务与应用日志。

- [x] 编写失败测试，覆盖抓取认证、服务/worker/数据库/存储健康、延迟/错误/outbox/复制/WAL/备份延迟指标、告警路由、日志脱敏、保留，以及不泄露员工编号/会话密钥。
- [x] 实现带生产分离凭据的 Prometheus、Grafana、Alertmanager 与集中日志采集，并提供 99.5% 可用性、15 分钟 RPO 与 2 小时 RTO 证据的仪表盘。
- [x] 验证配置模型、脱敏夹具、告警规则契约与 Compose 健康模型；不把未连接的告警接收人当作已投递告警证据。
- [x] 提交 `feat(phase-07): add production observability and alerting`。

### 任务 7：CI/CD、不可变发布、升级、回滚、迁移与供应链门禁

**文件：** 创建 `scripts/production/release-gate.mjs`、`scripts/production/release-gate.test.mjs`、`scripts/production/rollback-gate.mjs`、`docs/runbooks/release-rollback.md`、SBOM/扫描配置；修改 `.github/workflows/verify.yml`、`.gitlab-ci.yml`、Dockerfiles 与 `scripts/verify.mjs`。

- [x] 编写失败测试，覆盖仅 SHA/摘要部署引用、锁文件/frozen 安装、SBOM 与漏洞阈值、先迁移后服务、向后兼容回滚检查、签名制品元数据与禁止可变仓库标签推广。
- [x] 实现构建一次、请求镜像摘要/SBOM/供应链证明、运行迁移兼容性检查、要求可逆升级标记并提供 dry-run 回滚计划（不自动改数据库）的 CI 门禁。
- [x] 验证本地发布/回滚门禁、CI YAML 测试与源发布契约；外部仓库签名、实际摘要捕获、漏洞服务扫描与部署凭据属于独立证据。
- [x] 提交 `ci(phase-07): gate immutable releases and rollback`。

### 任务 8：故障与恢复演练

**文件：** 创建 `scripts/production/drills/*.mjs`、`scripts/production/drills/*.test.mjs`、`docs/runbooks/failover-drill.md`、`docs/runbooks/incident-response.md` 与 `docs/evidence/phase-07/` 模板。

- [x] 为 DNS 活动节点切换、API/worker 隔离（fencing）、PostgreSQL 主库故障与提升、对象存储源故障、告警创建、备份恢复与证据时间戳编写失败的演练断言。
- [x] 实现可重复的运维指引，含显式前置条件、停止条件、回滚/隔离（fencing）步骤、证据捕获，以及一个让模拟证据与生产证据分离的校验器。
- [x] 在本地验证校验器与 runbook 契约；真实双主机演练需要提供服务器/网络/凭据并保持待定，且必须实测 RPO/RTO 而不只是给出目标。
- [x] 提交 `test(phase-07): add production failure and recovery drills`。

### 任务 9：必要回归与集成验证

**文件：** 修改阶段 7 台账/可视化，仅在阶段 7 边界需要时，在 `apps/api/test`、`apps/worker/test`、`apps/web/src`、`packages/server/src` 与 `packages/database/src` 下添加定向回归夹具/测试。

- [x] 运行必要的 API、Worker、Web、权限、审计、Outbox、迁移、备份/恢复、Compose、安全与部署测试；复用阶段 6 已接受的完整门禁证据，不把它重新标记为阶段 7 证据。
- [x] 验证阶段 3–6 业务语义、租户模型与被禁止的基础设施没有变化。
- [x] 记录确切的命令、计数、失败、环境与未解决的外部依赖。

### 任务 10：阶段 7 最终门禁、双轴评审、提交、推送与草稿 PR 状态

**文件：** 阶段 7 计划/台账/ADR、`processing_visualization.html`、评审证据，不涉及无关文件。

- [x] 运行精确最终门禁加生产 Compose/配置/安全/供应链/备份/恢复证据；拒绝把缓存或模拟输出当作生产证明。本地门禁通过，而真实生产证据仍被阻断并已记录。
- [ ] 对照路线图、ADR 0008、安全/可靠性轴与所有用户约束评审完整阶段 7 diff；标准轴已清晰，但规格轴复审在 SSRF 适配器强制、角色/隔离（fencing）强制、可执行恢复、真实供应链制品与已认证 ActorContext 传播方面仍有仓库范围缺口。
- [ ] 验证分支祖先/状态，提交文档收尾，无强推推送，并只通过可用集成尝试创建草稿 PR；记录真实 PR URL 或确切的 HTTP/网络阻断项。
- [ ] 只有所有必需的生产、恢复、SLO/RPO/RTO、回归、评审、推送与草稿 PR/阻断项条件都有证据时，才宣布阶段 7 完成；否则以有界的阻断项列表将阶段 7 报告为未完成。

## 完成门禁

只有满足以下条件，阶段 7 才算完成：双主机生产 Compose 可部署；安全与供应链门禁通过；PostgreSQL 与对象存储恢复/故障切换演练通过；可观测性与 runbook 可验证；99.5%/RPO 15 分钟/RTO 2 小时有实测证据；升级/回滚/迁移门禁通过；真实 API/Worker/Web 回归通过；两个评审轴均无可执行发现项；分支已推送；存在草稿 PR 或外部阻断项被明确记录。阶段 8 试点、UAT、正式上线与企业签核仍被排除。
