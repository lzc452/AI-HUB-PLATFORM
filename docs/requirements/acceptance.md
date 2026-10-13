# 当前需求统一验收手册

> 收尾核对：2026-10-08；测试证据批次：2026-10-07。范围见[需求基线](README.md)，实现与测试文件见[追踪矩阵](traceability.md)。本手册替代散落需求/测试文档中的当前验收口径；保留历史报告的证据，不继承其笼统 PASS 结论。

## 1. 证据层级与执行边界

| 层级              | 能证明什么                                | 不能替代什么                           |
| ----------------- | ----------------------------------------- | -------------------------------------- |
| L0 源码/契约核对  | 入口、字段、调用、状态及已知差异          | 实际装配、数据库部署和运行成功         |
| L1 单元/组件测试  | 内存仓储/假端口下的规则和 UI 行为         | 真数据库事务、真实收件人授权、外部发送 |
| L2 真库/API 集成  | 迁移、约束、事务、标准模块装配和 API 行为 | 浏览器操作、目标应用运行与外部系统     |
| L3 同域双端浏览器 | Console/Portal 登录、使用与状态持久化     | 生产 DNS/TLS、双机恢复、业务签核       |
| L4 外部/生产/UAT  | 钉钉/Dify、告警送达、恢复目标及业务签核   | 无；按实际范围逐项签核                 |

每次取证记录日期、Git/工作区版本、环境、命令或操作、需求/案例 ID、预期、实际、日志/截图/API/数据库证据、失败原因及复测结果。`跳过`、`环境受限`、`未执行` 与 `通过` 分开，测试存在或 mock queue 断言不能写成真实通知已落库。

测试数据只在隔离开发/测试数据库初始化。真实集成测试会迁移/重置测试数据，不能指向业务库。本文整理过程中未运行迁移、seed、外部发送或生产操作。

## 2. 数据与账号准备

使用至少四个在职账号：部门 A 提交人、部门 B 消费者、与应用负责人/维护人无关的超级管理员审核人、另一审核人用于认领竞争。当前新增分发仅 `employee`、`super_admin`，不能为了让通知测试通过临时分发旧专业角色。演示账号仅两个，不能据此覆盖全部跨人/跨部门情形；测试构造的历史角色单独标注。

准备全部/部门（含子部门）/指定员工受众、Web 与含安装包/二维码的应用、匿名需求、两个竞争认领方案及可回滚版本。模拟失效会话、跨资源 ID、过期上传、错误摘要、恶意文件、URL 白名单拒绝、失败通知和外部不可用。版本号、请求 nonce、幂等键与记录 ID 必须可在证据中关联。

## 3. 验收案例

| 案例                        | 需求 ID                            | 操作与预期                                                                                                                                                                      | 必需证据 / 当前门禁                                                                                                 |
| --------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| AC-01 身份会话              | REQ-ID-01/02                       | 挑战登录、刷新 actor、退出/撤销、停职、过期/伪造挑战及跨员工会话；有效会话可用，失效拒绝并清理前端缓存                                                                          | L1+L2+L3；GAP-01 配置 PEM 的定向 L2 通过；完整浏览器与生产另验                                                      |
| AC-02 权限与菜单            | REQ-ID-02、REQ-OPS-01              | employee/super_admin 分别核对 7 个菜单及直接 URL/API；检查 owner/所有维护人/外人/受众外；角色停用或撤权后复读接口                                                               | L1+L2+L3；GAP-03 HTTP 撤权 L2 通过；菜单与 GAP-05 仍待验收                                                          |
| AC-03 内容向导              | REQ-APP-01/02/03                   | 仅打开/离开无草稿；有效下一步或上传惰性创建；并发保存不重复；编辑回显完整字段；切部门、人员、渠道、自定义分类；不完整提交显示 issues                                            | L1+L2+L3；提交前后回读同一 applicationId，上传触发创建单独核对                                                      |
| AC-04 交付与制品            | REQ-APP-03/04/05、REQ-CAT-03       | 分别走 Web、桌面、移动、小程序与组合渠道；通过 raw 上传/complete/Worker 后版本绑定；错误 MIME/魔数/大小/摘要/扫描/签名均拒绝；未签名需明确确认；目录能下载原文件/显示真实二维码 | L1+L2+L3；安装包向导与旧版本页必须分别走通，GAP-04 阻断                                                             |
| AC-05 审核与生效            | REQ-APP-05/06/07                   | 提交→其他人认领→批准/驳回/退回；负责人与所有维护人自审失败；他人不能裁决已认领项；首次批准自动上架，更新审核期间旧版本可用，批准后切版本；新分类标签只在通过后公共可见          | L1+L2+L3；取审核队列、快照、current/pendingVersionId、目录及审计，分别核对 SLA，GAP-05                              |
| AC-06 生命周期/创作者       | REQ-APP-08/09                      | 负责人移交、仅 draft 删除、发布态禁止删除、下架、归档、恢复、同应用回滚；拒绝跨应用/当前版本及未经审核目标；创作者只读本人聚合/反馈                                             | L1+L2+L3；GAP-05 中恢复入口/回滚资格/多维护人差异待关闭                                                             |
| AC-07 使用与反馈            | REQ-CAT-01/02/03、REQ-INT-01/02/03 | 授权市场搜索/过滤/分页→详情/截图/渠道→点赞/评分/评论→举报治理→问题反馈→负责人填写处理结果；受众外、下架、隐藏和跨应用反馈均拒绝                                                 | L1+L2+L3；保留总数/404、下载摘要、互动计数、反馈状态/说明和行为事件；跳转不算目标运行成功                           |
| AC-08 需求提交与匿名        | REQ-DEM-01/02/07/08                | 结构化草稿及附件→提交→审核发布/驳回重提；跨部门/指定员工过滤及分页；匿名需求/评论对普通读者无真实身份；授权查询留审计，跨 ID 拒绝                                               | L1+L2+L3；附件扫描需要独立恶意样本证据，GAP-06 阻断                                                                 |
| AC-09 认领与优先级          | REQ-DEM-03/04/08                   | 多人提交/撤回方案→管理员确认→团队/负责人→释放；两审核人用同 expectedVersion 竞争只一方成功；七维 1–5 分边界/公式/解释、确认优先级；无权评分/确认拒绝                            | L1+L2+L3；需新 claim-proposals/confirm/release 真库覆盖，旧 claim 用例不能替代；通知 GAP-02                         |
| AC-10 试点与转化            | REQ-DEM-05/06/07                   | claimed/validating/pilot 分别推进并创建试点/结果；关闭需原因；关联候选/试点/主方案→创建应用草稿→标准应用审核→需求转换；合并保留源目标和并发保护                                 | L1+L2+L3；分开记录试点记录、需求状态、应用状态，不把关联即认定转化完成                                              |
| AC-11 分析与导出            | REQ-ANA-01/02/03                   | 注入可追溯行为→聚合/重建/180 天边界→十看板权限及数字对账→返回导出 rows/脱敏/下载登记；前端文件保存单独取证；普通负责人用真实 HTTP 读取本人聚合，越权及员工明细泄露拒绝          | L1+L2+L3；分别验证创作者摘要、单应用 Dashboard 的 HTTP Guard、聚合/快照/需求价值；负责人 API 和失败任务/通知 GAP-07 |
| AC-12 站内通知              | REQ-NOT-01/02                      | 21 场景逐项触发真实动作，核对实际收件人行、payload、幂等、summary、点击/全部已读、刷新；通知异常业务保持已提交                                                                  | L1+L2+L3；新 submitDraft/confirmClaim 与旧 submitForReview/claim 分别验收；GAP-02/07 阻断“全场景完成”               |
| AC-13 外部能力              | REQ-ID-03、REQ-ANA-04、REQ-NOT-03  | 未配置时隐藏 SSO/安全降级；配置后真实 OAuth/state/handoff/回跳、脱敏问答、通知成功/重试/失败；验证敏感数据不出站                                                                | L1+L4；UnavailableDifyAssistantPort 和钉钉 stub 只能证明降级，不能签收真实集成                                      |
| AC-14 Portal/Console 一致性 | REQ-POR-01/02/03/04、REQ-NOT-02    | 同域匿名/登录/失效会话与缓存隔离；app 两端草稿/版本/审核/状态一致；native 资源仍 approved→publish；收藏/一层评论/个人中心/周期投票/通知持久                                     | L1+L2+L3；受限 app 在 Portal 的匿名/跨部门读取单独测试，GAP-08 阻断权限一致结论；跨仓 UI 本次未重跑                 |
| AC-15 安全与事务            | REQ-OPS-01/02                      | DTO/XSS/CSRF/nonce/限流/URL-DNS/SSRF/文件/日志脱敏拒绝；状态、审计、Outbox 故障回滚一致；Worker 重试不重复副作用                                                                | L1+L2；验证双实例及实际 actor，不把 nonce 重复用例等同 actor 绑定，GAP-09                                           |
| AC-16 构建/迁移/发布        | REQ-OPS-03                         | 正常环境 frozen-lockfile 安装、verify、真实 API/迁移、container smoke；生产初始化无 demo；记录 immutable image/digest、迁移兼容和回滚                                           | L2+CI；不能忽略 unhandled errors、禁止将脚本存在写成构建已通过                                                      |
| AC-17 生产恢复与 UAT        | REQ-OPS-04                         | TLS/DNS/fencing、双机切换、PG 与对象恢复、告警实际送达、权限业务 UAT；实测 RPO/RTO 与可用性/业务目标                                                                            | L4；依各 runbook 取证、企业签核，模板/本地实验不能代替                                                              |

### 通知案例的逐项记录

REQ-NOT-01 沿用[21 场景矩阵](../specs/notification-system.md)。每个 eventType 一行记录业务入口、aggregateId、触发 actor、预期 recipient、真实 notificationId、Outbox/投递状态、payload、重复触发结果、两端消费及失败原因。审核广播使用当前权限持有人；负责人/需求提交人按真实资源关系校验，不能用旧角色 fixture 证明当前分发角色能收信。

特别覆盖：首次上架、已发布更新、下架恢复；旧直接认领与新方案确认；多收件人广播（某一收件人失败不阻断其他人）；导出生成失败与下载拒绝；SLA Worker 直接通知与矩阵 queue 两种授权入口。站内落库和钉钉送达分别签核。

## 4. 可复现命令

完整工程门禁使用仓库原命令，不引入临时垫片：

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm verify
```

真库回归在隔离环境配置好 `TEST_DATABASE_URL` 后使用[API 测试配置](../../apps/api/vitest.config.ts)、[数据测试配置](../../apps/api/vitest.api-data.config.ts)串行执行；逐文件核对是否确实使用测试库，以及是否有 skip。`test:api-data` 仅选择 `.real.e2e-spec.ts`，不能替代所有 `.integration.test.ts`：

```powershell
corepack pnpm test:api-data
corepack pnpm --filter @ai-hub/api test
corepack pnpm --filter @ai-hub/api test:input-validation
```

Portal 客户端在 `D:\workspace\AI-HUB-PORTAL` 另执行其 `npm run typecheck`、`npm run lint`、`npm test`、`npm run build`，再与当前服务端同域联调。历史沙箱 esbuild 垫片、忽略未处理错误和模拟构建复制不作为当前标准门禁。

## 5. 文档整理批次执行结果与限制（2026-10-07）

本轮修改文档和清理临时产物，未修改业务代码。除下面的定向自动化，其他案例的本次 L2–L4 状态均为**未执行**。

| 本次核对/命令                                                                      | 结果         | 适用范围                                                                                                           |
| ---------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------ |
| CodeGraph、契约、迁移源码、历史文档核对                                            | 已完成       | L0；已识别 GAP-01–10，不证明部署数据库已同步                                                                       |
| server 定向 6 文件：application、demand、catalog、portal、dashboard-matrix、export | 200/200 通过 | L1；普通 vitest threads，无忽略异常参数                                                                            |
| 身份/安全/通知补充 12 文件                                                         | 237/237 通过 | L1；具体命令与文件见[证据记录](../audit/requirements-evidence-2026-10-07.md)；与上行部分重叠，不能相加当作独立总量 |
| Web 向导/需求/分析/表单/路由定向 10 文件                                           | 92/92 通过   | L1；未忽略 unhandled errors；有既有 NaN height、antd Drawer 和 React Router 提示，不等同视觉或浏览器验收           |
| 生产私钥加载内存探针                                                               | 复现失败     | GAP-01；仅内存测试密钥，无生产凭据或外部发送                                                                       |

server 6 文件实际命令（在 `packages/server` 执行）：

```powershell
pnpm exec vitest run --pool=threads --reporter=dot src/application/application.service.test.ts src/demand/demand.service.test.ts src/catalog/catalog.service.test.ts src/portal/portal.service.test.ts src/analytics/dashboard-matrix.test.ts src/analytics/export.service.test.ts
```

Web 定向命令（在 `apps/web` 执行）：

```powershell
pnpm exec vitest run --pool=threads --reporter=dot src/pages/creator/ApplicationCreateWizardPage.echo.test.tsx src/pages/creator/ApplicationCreateWizardPage.split.test.tsx src/pages/creator/ApplicationCreateWizardPage.submit-failure.test.tsx src/pages/creator/ApplicationCreateWizardPage.submit-gate.test.tsx src/pages/innovation/InnovationPages.test.tsx src/pages/analytics/AnalyticsDashboardPage.test.tsx src/modules/publishing/audience.test.tsx src/modules/publishing/schema.test.tsx src/modules/publishing/steps.test.tsx src/router/base.test.ts
```

历史[通知验收](../audit/notification-verification-2026-08-29.md)及[浏览器验收](../../.verify/v1/browser/browser-acceptance.md)仍可追溯，但需要按当前两种分发角色、多渠道、十状态及共享 Portal 应用模型重新验证。完整流水线、真实数据库、浏览器、外部集成和生产门禁不得从上述单测结果自动标为通过。

## 6. 发布判定

先关闭基线中的 P0 差异，并取得 AC-01–12/14/15 的必需 L2/L3 证据；通过 AC-16 工程门禁，再按实际启用范围完成 AC-13 外部联调与 AC-17 生产/UAT。任何“部分/未执行/环境受限”都需保留范围和原因，禁止统写“最终全部通过”。

2026-10-08 起进入业务修复，当前单项状态、命令和真库结果见[实施门禁](gates.md)。GAP-01/03 定向门禁通过，完整 AC-01/02 的浏览器及生产范围仍需验收；通知新入口仅服务回归通过，尚不能签核 21 场景。
