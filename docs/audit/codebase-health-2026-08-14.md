# AI Hub Platform V1 本地全闭环整改审计

审计日期：2026-08-14  
分支：`codex/v1-local-runnable-remediation`  
基准：当前 `development` 工作树，保留用户已有 dirty diff，不执行 reset。

## 结论

当前为“代码链路明显改善、运行验收未闭环”，不能标记为 V1 完成或 100%。

已通过的静态反馈环：

- `pnpm format:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm boundaries`
- `pnpm build`
- server 35 个测试文件、155 个测试通过
- Web 最新全量运行 24 个文件/102 个测试通过；此前一次并行运行的 `identity-admin` 10 秒超时已在最新全量和隔离运行中复现为通过。仍有 jsdom `getComputedStyle`、Ant Design deprecation、React Router future warning 和 `NaN` style 警告
- artifact upload API e2e 8/8 通过

尚未通过的硬门禁：

- 根 `pnpm test` 的 Testcontainers 数据库套件因 Docker Server 不可用而阻塞
- Compose、PostgreSQL migration/seed、Garage、ClamAV、worker、API readiness、Outbox 和浏览器五角色流程尚未取得本地运行证据
- 21 张设计图尚未逐图截图验收

当前进度口径：UI `0/21`，领域链 `0/11`，工程命令 `8/9`（根测试受 Docker 阻塞），Compose `配置通过/服务未验收`。

## DONE

1. 修复 API bootstrap 多余参数、artifact SuperTest helper、server unused variable、格式阻断、auth public seam 和 Web 测试 teardown。
2. 建立 `DatabaseRuntime`：API 与 worker 各自拥有一个 Pool，feature module 复用注入的 Kysely，提供 transaction/close 接口。
3. 在 `@ai-hub/contracts` 增加 `PageResult<T>`、`ApiErrorResponse`、ISO UTC、nullable、幂等键和应用 KPI contract；旧数组 wire shape 保持兼容。
4. 注册 `0025_artifact_integrity`、`0026_engagement_integrity`、`0027_security_audit_integrity`、`0028_directory_sync_integrity`，但尚未在真实 PostgreSQL 执行和验证。
5. Organization 角色 list/create/update/disable、organization overview、sync overview/config/run detail/items/retry API 已接线；未配置 provider 的同步触发稳定返回 `INTEGRATION_UNAVAILABLE`，不再伪造 `accepted`。
6. Organization 页面移除 `1286`、`98.6%` 等 KPI 假值，并删除未引用的角色、部门、同步 mock 数组；查询改为 identity API。
7. Catalog detail 增加 `ratingCount`、`maintainers`、`attachments`、`capabilities`；前端移除维护人/附件/评分人数 mock 和固定 `isModerator/isOwner`。
8. 相关应用“立即使用”复用 delivery resolve/download/web 路径；没有渠道或 capability 时禁用并解释原因。
9. 新增 `GET /internal/applications/admin-kpis`，KPI 由后端按 actor 可见范围聚合，不再由前端抓取前 200 条估算。
10. 新增 `GET /internal/notifications/:notificationId` 并按 recipient 校验详情归属。
11. `processing_visualization.html` 已同步上述 checkpoint、证据和风险，未写入 100%。
12. Security KPI/概况改为审计 API 行聚合；无后端契约的活跃会话和扫描趋势显示空态，配置/会话/扫描页签及版本对比、应用管理未完成 CTA 均已禁用并说明原因。
13. AI 助手推荐卡片已改用 Catalog `popular` 查询，示例问题和能力说明仍作为纯说明文案保留。
14. 新增 `CatalogVisibilityPolicy`，Catalog detail/versions/delivery/risk、Interaction 和 Feedback 的 direct-ID 访问统一执行 published/current-version/audience 判定；Catalog detail 按 applicationId 下推 SQL，不再先读取整张可见列表。
15. Feedback create/status 已在同一 Kysely transaction 内写业务行、`application_audit_events` 和 Outbox；终态强制非空 resolution，重新打开时清空 `resolved_at`/resolution。新增 Outbox 失败回滚和非受众写入拒绝测试。
16. Application submit/review/publish/withdraw/rollback/archive 状态写入增加 expected-state CAS；状态、Catalog 注册、Audit、Outbox 保持同 transaction。新增并发 publish 单成功和 Outbox 失败全回滚测试，withdraw reason 写入 Audit/Outbox metadata。

## UNDO

### 业务和架构

- Artifact Intake 尚未深化为可恢复的 staging/claim/finalize 模块；Garage/ClamAV 仍未接入真实 Compose 链路。
- Catalog direct-ID 已统一 policy 且详情按 ID 查询；Catalog 列表仍在 Service 层 JS 分页，并对每个结果分别查询 tag/label/delivery/attachment，尚未完成 SQL count/limit/offset 和批量 read model 优化。
- Feedback、Interaction、Application 生命周期已具备同 transaction 的业务写入/Audit/Outbox 代码；Application 状态使用 expected-state CAS，并有内存事务并发/回滚证据。三者仍缺真实 PostgreSQL 原子性和并发证据。
- Security audit 生产写入入口仍未全面接入；audit export worker、status/download/失败重试尚未闭环。
- DingTalk directory provider、employee import、sync retry 的 deterministic adapter 和生产 fail-closed 集成尚未完成。
- 通知详情仍缺结构化 payload 字段，当前详情页仍主要依据列表记录和事件类型生成展示。

### 前端和体验

- Security 页面保留 `PLACEHOLDER_TABS` 作为设计范围说明，但安全配置、会话、扫描等没有 V1 contract 的区域已保持明确禁用态；真实 overview、导出状态/下载仍未完成。
- `ApplicationDetailsPage`、`ApplicationReviewPage` 仍有设计稿示例描述、截图预览、时间线、评分/使用数和附件示例数据；附件下载、版本对比已改为禁用说明，但真实附件 read/download 和 comparison contract 尚缺。
- Analytics platform overview 的告警、排行、转化、部门热力、需求漏斗和 SLA 子模型仍返回空数组，需补后端 read model；HealthSnapshot 仍显示未接入的健康项。
- 版本对比、风险说明、Related Applications 的更多动作、通知结构化详情和 creator 部分入口仍未完成真实数据闭环。
- 21 张设计图的原始视口、响应式、键盘焦点、空/错/403/hover/disabled 截图证据尚未生成。

## TODO（执行顺序）

1. 恢复 Rancher Desktop `dockerd/moby`，验证 `docker version` Server、Compose 8 服务 readiness；保存 `.verify/v1/` 日志。
2. 空库执行 migration `0001–0028`，重复执行、demo seed 幂等、FK/unique/check、通知和 Outbox 回滚测试；发现历史孤儿数据时先清理并记录。
3. 完成 Artifact Intake：Garage put/get/copy/delete/stream、ClamAV clean/infected/unavailable/timeout、签名 fail-closed、并发 complete 和 stale verifying reconciliation。
4. 将 Catalog 列表改为数据库内 count/limit/offset，并批量加载 tag/label/delivery/attachment，保留现有 audience-before-pagination 与 direct-ID policy 语义；用真实 PostgreSQL 验证五角色隔离。
5. 在真实 PostgreSQL 验证 Feedback/Interaction/Application 的业务、Audit、Outbox 回滚以及 Application expected-state CAS；再补五角色 401/403、禁止自审、受众隔离和并发 API 测试。
6. 建立 Audit event catalog，接入登录、应用、审核、发布、目录治理、反馈、组织、同步、导出写路径；实现 export queued → processing → completed/failed/download。
7. 为通知增加结构化 `payload jsonb`（前向兼容 migration、schema、contract、seed、repository、详情 Modal），避免从列表行猜详情。
8. Security 页面接入 overview、risk filter、audit export status/download；无 contract 的安全配置保持不可交互说明态。
9. 清理应用详情/审核页所有生产示例数据，补真实 description/features/attachments/version comparison API；保留纯说明和测试 fixture 的静态内容。
10. Analytics 补齐 platform overview 的 alerts/ranking/conversion/department/demand/SLA read model，并为 HealthSnapshot 提供真实 readiness contract。
11. 完成 21 张设计图的截图、可访问性和响应式验收，并将 console/network 未解释错误降为 0。
12. 清理 jsdom/Ant Design/React Router/NaN style 警告，并将 Web 全量测试纳入稳定的并行资源配置。
13. 最后运行 `pnpm verify` 9 项命令、两条 Playwright 主流程和五角色 API 矩阵；未全部通过前不得提高进度为 100%。

## 疑点与外部阻塞

- Docker Desktop/Rancher Desktop 当前不可用，数据库 migration、seed、Compose、Garage、ClamAV 和 worker 只能标记“未验证”。
- 真实 DingTalk、Dify、企业签名凭据、双机部署、备份恢复演练和真实试点不属于代码单独可完成范围，不能伪装为 DONE。
- `roles.created_by_employee_id`、sync config updater 和 employee 软删除策略需要产品/ADR 明确 `restrict` 或 `set null` 后再收紧约束。
- 四个 delivery channel 全部 enabled 才允许发布的 ADR 0004 规则必须在数据库、Service、API 和浏览器流程中再次用真实数据确认。

## 闭环判定

发布链（登录 → 创建 → 上传 → 扫描/签名 → 版本 → 四渠道 → 提审 → 非本人审核 → 发布 → 市场可见）：代码入口、禁止自审、四渠道门禁、生命周期 CAS 和业务/Audit/Outbox 单元回滚证据已存在；Docker、真实对象存储/扫描、PostgreSQL 和五角色浏览器证据缺失，因此运行验收仍为 `UNDO`。

消费链（登录 → 发现 → resolve/download → 评论 → 点赞 → 1–5 评分 → 反馈 → 所有者处理 → 用户查看结果）：前端 client/hook、主要 API、统一 visibility policy 和 Feedback transaction 单元回滚证据已具备；通知结果、真实 PostgreSQL、五角色和浏览器证据仍缺失，因此运行验收仍为 `UNDO`。
