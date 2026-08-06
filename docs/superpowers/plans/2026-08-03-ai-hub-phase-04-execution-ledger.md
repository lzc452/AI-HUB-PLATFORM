# 阶段 4 执行台账

日期：2026-08-03


## 基线决策

根据 Codex 会话 `019fc537-5ae6-7f42-bb49-ff0fc969afac` 中已完成的门禁证据，阶段 3 被接受为可进入阶段 4。本阶段在实施前不重跑阶段 3 完整门禁。阶段 4 分支从注解标签 `phase-03-complete` 开始，该标签指向提交 `d3b99e9bfdb0e6d2447054608ee9a3c6584984e2`（标签对象 `978612d5ae8f125f4e328186d59257ff6dd7011e`）。


## 范围

阶段 4 覆盖权限过滤的应用市场、PostgreSQL 中文搜索、详情与交付动作、互动与内容治理、带钉钉重试状态的应用内通知、创作者中心聚合读取，以及健康度/信任/废弃标签。AI 需求与创新广场工作流仍属于阶段 5。


## 有序执行

1. 契约、目录 schema、受众权限、分类、标签与搜索字段。
2. 目录列表/搜索/推荐/详情查询路径，在分页前应用授权。
3. 交付动作事件、健康检查、信任/废弃标签与聚合指标。
4. 点赞、评分、评审、回复、举报、隐藏/恢复与匿名身份审计。
5. 应用内通知中心、幂等 outbox 事件与钉钉重试适配器。
6. 创作者中心版本差异、校验报告、聚合应用数据、API 与 Web 路由。
7. 全新的阶段 4 测试、仓库门禁、双轴评审、提交、推送与 GitHub 交接。


## 证据日志

| 门禁 | 证据 | 状态 |
|---|---|---|
| 阶段 3 基线 | 上文引用的 Codex 会话 | 作为输入接受 |
| 阶段 4 定向测试 | 目录 5、互动 4、通知 4、创作者 2、API 4、Web 16 个测试通过 | 通过 |
| 阶段 4 仓库门禁 | `format:check`、`lint`、`typecheck`、`boundaries`、`test`、`build`、文档链接、Compose config；PostgreSQL 集成 15/15（Docker Desktop desktop-linux） | 通过 |
| 双轴评审 | `phase-03-complete...HEAD`；标准与规格评审未发现未解决的可执行发现项 | 通过 |
| GitHub 发布 | 本地分支已完成，但 GitHub 仓库元数据报告 `push: false`；远程无阶段 4 分支，此账号无法创建草稿 PR | 被外部权限阻断 |


## 实施证据

- 基线提交：`2ca2942`（`docs(phase-04): establish market and interaction plan`）。
- 目录契约/schema 与权限过滤的 PostgreSQL 查询路径：提交 `b68ce75`。
- 交付动作记录在评审后补充，使 Web 跳转、包下载与二维码展示计数拥有与可见已发布版本关联的受保护写入路径。
- 互动模块覆盖幂等点赞、每个员工/应用一条评分、官方单层回复、非破坏性举报、内容治理状态与匿名作者审计查询。
- 通知模块覆盖幂等应用内记录、仅收件人可读、已读状态与确定性钉钉重试状态。
- 创作者模块返回版本差异、校验报告与聚合指标；刻意不提供访客/访问列表。
- Web 路由覆盖市场搜索/详情、通知与创作者中心的可访问固定状态。阶段 5 创新路由保持不变。


## 验证说明

- 实施期间的定向 server/API/Web 测试通过。
- 交付动作与目录标签变更后 `corepack pnpm typecheck` 通过。
- 通过 `DOCKER_HOST=npipe:////./pipe/dockerDesktopLinuxEngine` 选择 Docker Desktop `desktop-linux` 后，`corepack pnpm test` 以 15/15 的 PostgreSQL 集成测试通过。
- `corepack pnpm format:check`、`corepack pnpm lint`、`corepack pnpm boundaries`、`corepack pnpm build`、`node scripts/verify-doc-links.mjs` 与 Compose config 全部通过。首次沙箱测试尝试仅因无法访问 Docker 引擎而失败；该结果通过启动/使用本地引擎解决。
- GitHub 交接仍受外部阻断：`github_get_repo` 报告 `push: false`，仓库只暴露 `main` 与 `codex/phase-01-continuation`，本地 `git push`/远程验证无法发布 `feature/phase-04-market-search-interaction`。


## 显式延后项

- 真实钉钉凭据与外部投递属于适配器/部署关注点；确定性的重试行为已在本地测试。
- 阶段 5 的创新需求与创新广场工作流不在范围内。
- V1 不实现个性化推荐、收藏、Elasticsearch、Redis 与个体访问列表分析。
