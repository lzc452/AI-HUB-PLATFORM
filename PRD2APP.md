# PRD2APP 差距分析报告 — AI Hub 平台 V1

- **报告日期**：2026-08-18
- **基线**：`docs/superpowers/specs/2026-07-31-ai-application-sharing-platform-design.md`（含工作树中未提交的修订版）+ `docs/superpowers/plans/2026-07-31-ai-hub-v1-program-roadmap.md`
- **对照对象**：`development` 分支当前代码（230 commits，2026-07-31 → 2026-08-18）+ 未提交工作树变更
- **方法**：基于 superpowers `code-review` 技能的双轴审查（规格轴 + 标准轴），5 个并行探索 agent 按领域深挖（身份/组织/授权、应用/发布/交付/制品、市场/互动/通知/分析/需求、Web 前端、基础设施/运维/质量），并辅以 git 时间线与工作树 diff 复核
- **结论速览**：V1 后端业务闭环（Phase 1–7）已基本建成，前端覆盖面广；但存在 **3 类 P0 缺口**（限流缺失、钉钉同步/通知为桩实现、审核 SLA 与提醒不符合规格）、**若干计划文档自相矛盾**（规格 9 个月 vs 1 个月、规格与路线图对 AI 助手和用户量口径不一致）、**一批规格未要求的功能越界实现**（反馈模块、部门级角色、回滚端点等），以及 **Phase 8 试点/上线与生产双机验证尚未开始**。

---

## 目录

1. [业务边界分析](#1-业务边界分析)
2. [实现功能设计（已建成的能力）](#2-实现功能设计)
3. [技术实现设计（现状架构）](#3-技术实现设计)
4. [实现进度总览](#4-实现进度总览)
5. [计划 vs 已实现差距分析](#5-计划-vs-已实现差距分析)
6. [越界内容（规格外实现）](#6-越界内容规格外实现)
7. [质量标准与代码审查发现](#7-质量标准与代码审查发现)
8. [风险与阻塞](#8-风险与阻塞)
9. [优化与建议（分优先级）](#9-优化与建议分优先级)
10. [项目管理方法论复盘](#10-项目管理方法论复盘)
11. [附录：证据索引](#11-附录证据索引)

---

## 1. 业务边界分析

### 1.1 产品定位

单企业私有化部署的 **AI 应用目录与治理平台**：统一展示内部 AI 应用，管理发布、版本、自动校验、人工审核、上下架和归档，按部门和员工控制可见范围，为 Web/桌面/移动/小程序提供一致交付入口，沉淀评价、需求、使用趋势、风险声明和审计记录，并通过创新广场把业务需求推进为可认领、可试点、可上架的应用。

### 1.2 明确边界（平台不做什么）

按规格 §1、§19，平台**不**：部署或运行上架应用、充当上架应用统一身份提供方、把应用市场隐藏当作目标应用的业务授权；不引入多租户（无 `tenant_id`）、微服务、Kubernetes、Redis、消息队列、Elasticsearch、公共 Open API、个性化推荐、独立收藏、部门级管理员、平台原生桌面/移动端、长期 AI 对话历史、拖拽式 BI、创新积分/徽章/排行榜、AI 自动审核/合并/评分。

### 1.3 边界控制的实际执行

| 边界 | 执行情况 | 证据 |
|---|---|---|
| 单企业无租户 | ✅ 数据库无 `tenant_id` | migrations 全表 |
| 平台不代理/不托管 Web 应用 | ✅ 交付只返回跳转 URL，不代理、不传会话 | `catalog.service.ts:136-138` |
| 不引入 Redis/MQ/ES/K8s | ✅ 未引入 | compose、package.json |
| 无个性化推荐/收藏 | ✅ 未实现 | — |
| 受众隔离（列表/搜索/详情/交付） | ✅ 统一可见性门 `catalog-visibility.policy.ts:39-71` | 应用侧可用 |
| 受众隔离（导出/下载） | ⚠️ 导出有角色与匿名过滤，但下载走文件直读（见 §5.17） | — |
| 部门级管理员（V1 排除） | ⚠️ **越界**：新增 `department_lead` 角色与部门级看板 | `system-roles.ts`、`dashboard.service.ts:45` |
| AI 助手（规格 §5.12 标注 V1 暂不实现） | ⚠️ **越界**：全栈已实现（但路线图 Phase 6 明确包含——文档自身矛盾，见 §6） | `analytics/assistant.service.ts`、`pages/assistant/AssistantPage.tsx` |

### 1.4 规格自身的范围漂移（未提交修订）

工作树中规格被直接修订（`git diff docs/superpowers/specs/...`），关键变更：

- 计划周期 **9 个月 → 1 个月**；交付模式改为"单人通过 AI coding 兼任全部角色"；冻结时点改为第 3 周末。
- 员工规模 **5,000/500 → 600/600**；成功指标从 90 天 30 个应用/60% 月活改为 30 天 10 个应用/50% 月活。
- **钉钉企业入口、SSO、组织同步、工作通知 → "预留入口，暂不实现，退避为账密登录"**；Dify → Qwen模型 也标注预留。
- 移除"推荐位"、钉钉同步/Dify 配置管理项；新增"应用源代码的上传下载"。

⚠️ **治理问题**：该修订未同步到 `ai-hub-v1-program-roadmap.md`（仍写 9 个月、5,000 人、Phase 6 交付 Dify 助手、第 8 月末冻结），违反路线图 §6 变更控制条款（"更改稳定 interface / 任何新增 V1 功能都必须更新本路线、当前计划和受影响 ADR"）。本报告的差距分析以**修订后规格**为准，并标注与路线图的冲突。

---

## 2. 实现功能设计

### 2.1 员工工作空间（§4.1）

| 能力 | 状态 | 说明 |
|---|---|---|
| 应用市场（列表/搜索/筛选/排序） | ✅ | 推荐/热门/最新排序 + 分类/标签/类型筛选，受众过滤 |
| 应用详情与交付入口 | ✅ | 描述/历史/评价/风险 4 个 Tab，四类交付入口 |
| 点赞/评分/评价/举报 | ✅ | 可取消点赞、1–5 星评分（可改、可匿名）、官方回复、举报治理 |
| 创新广场（需求 + 认领方案） | ✅ | 全生命周期 + 认领方案 + 治理抽屉 |
| 我的应用管理 | ✅ | 创作者中心 KPI + 应用表 + 下架操作 |
| 站内通知 | ✅ | 列表 + 已读，事件矩阵 |
| 账号安全与设备会话 | ❌ | 无页面，安全页会话管理 Tab 为"建设中"占位 |
| AI 助手 | ⚠️ | 已实现（规格外，见 §6） |

### 2.2 创作者中心（§4.2）

| 能力 | 状态 | 说明 |
|---|---|---|
| 草稿与发布向导 | ⚠️ | 向导为 **4 步**（规格 5 步：类型/交付与归属/受众被合并进"基本信息"；预览步无自动校验报告）；已加提交状态门 |
| 自动校验报告 | ⚠️ | 卡片位存在但 `application_validation_checks` 从未写入，**报告恒为空**；审核页标注"后续并入" |
| 新旧版本差异 | ✅ | 版本时间线 + diff 展示 |
| 审核状态与 SLA | ⚠️ | 有 SLA 倒计时组件；但 SLA 实现为 +24h（规格 2 个工作日） |
| 详情页 / 责任人与维护团队 | ✅ | |
| 单应用聚合数据 | ⚠️ | 聚合指标存在，但无单应用筛选入口 |
| 评价与反馈处理 | ⚠️ | 评价只读展示；反馈处理功能在（越界）feedback 模块，无创作者入口 |
| 操作手册/使用示例/FAQ | ✅ | 富文本字段 |

### 2.3 应用治理工作空间（§4.3）

| 能力 | 状态 | 说明 |
|---|---|---|
| 公共审核池与任务领取 | ✅ | 领取/释放带 CAS；**但无超时自动释放、无超级管理员转交** |
| 上下架和归档 | ⚠️ | 下架仅责任人/应用管理员；维护人申请下架、归档后恢复（新版本+审核）均缺失 |
| 版本历史 | ✅ | 时间线 + 历史版本只读 |
| 分类和标签 | ⚠️ | 无 CRUD 治理页（仅发布向导可选用） |
| 评价举报治理 | ⚠️ | 举报处理仅创新需求侧有治理抽屉；**市场评价举报治理缺失** |
| 审核与市场运营数据 | ❌ | 无运营看板 Tab |
| 应用源代码上传下载 | ✅ | 附件能力（规格修订版新增） |

### 2.4 创新运营工作空间（§4.4）

| 能力 | 状态 | 说明 |
|---|---|---|
| 需求轻量审核 | ✅ | 发布/驳回，**无 1 个工作日 SLA 与提醒** |
| 重复需求合并 | ✅ | |
| 认领方案选择 | ✅ | 多方案 + 运营确认 |
| 价值/成本/风险评估 | ✅ | 加权建议分 + 管理员确认高中低并记录原因 |
| 需求状态推进 | ✅ | 8 状态 + 驳回/合并终止 |
| 试点记录 | ✅ |（越界试点子系统） |
| 需求与应用关联 | ✅ | M:N + 主要解决方案 + 从需求创建应用；**但"已转化"缺上架校验** |
| 创新数据看板 | ⚠️ | **需求价值看板缺失** |

### 2.5 组织与系统管理（§4.5）

| 能力 | 状态 | 说明 |
|---|---|---|
| 用户和部门 | ✅ | 列表 + CSV 导入（规格外）+ 角色管理 |
| 角色与权限 | ✅ | 角色 CRUD/复制/停用，自定义角色 |
| 钉钉同步 | ❌ | 桩实现（见 §5.2） |
| 文件扫描与通知状态 | ⚠️ | 扫描链路存在；页面 Tab 为"建设中"占位 |
| 审计与导出 | ✅ | 审计日志页 + 导出（后台任务） |
| 监控、备份和系统健康 | ❌ | 无接线页面（HealthSnapshotCard 未接入路由） |

---

## 3. 技术实现设计

### 3.1 总体架构（§8）

**React SPA + NestJS 模块化单体 + outbox worker**，与 ADR 0001/0002/0003 一致。落地的结构：

```
apps/     web (React 19 + Vite 6 + AntD 6 + Tailwind 4 + TanStack Query 5 + RHF/Zod + ECharts)
          api (NestJS HTTP 入口, /internal/*, ProblemDetails 错误模型)
          worker (NestJS outbox 轮询)
packages/ contracts / config / database (Kysely + 39 migrations + outbox) / server (业务深模块)
          ui / testing (Testcontainers)
```

**与规格 §8.4 深模块目录结构（interface/application/domain/implementation/adapters）的偏差**：实际采用 `module.ts / service.ts / controller.ts / repository.ts / types.ts / tokens.ts` 平面结构（CLAUDE.md 所述模式）。服务层隔离 NestJS/HTTP，遵守了"领域代码不依赖框架"的核心要求；差异主要在目录细分粒度，属于可接受的实现选择，但 `adapters/` 缺失导致部分外部 seam（如钉钉）直接位于服务内。

### 3.2 后端深模块覆盖

| 规格模块 | 实际模块 | 备注 |
|---|---|---|
| Identity / Organization / Authorization | `identity`、`authorization`、`system/security` | 组织并入 identity；授权独立模块 |
| Application / Publishing / Delivery / ArtifactSecurity | `application`、`creator` | 交付/制品合并入 application |
| Catalog / Interaction / Analytics / Notification | `catalog`、`interaction`、`analytics`、`notification` | — |
| Innovation / Audit / Assistant | `demand`、`feedback`、`analytics/assistant` | 审计在 `system/security`；**feedback 模块规格外** |

### 3.3 事务性 Outbox（§8.5）

✅ 核心机制完整：`FOR UPDATE SKIP LOCKED` 领取（`outbox-store.ts:85-134`）、幂等键 `onConflict doNothing`、10 次尝试上限、租约到期回收、失败队列与隔离（migrations 0022/0024）。
❌ 但 worker 仅注册 5 类处理器：`system.probe`（空操作）、`artifact.verification.*`、`security.audit.export`、`notification.created`。规格 §8.5 要求的**组织同步、健康检查、聚合、导出、存储复制、清理、SLA 提醒、备份检查**处理器全部缺席；固定 1s 重试（无指数退避）、批大小 1；钉钉发送器为 `unavailableDingTalk` 桩。

### 3.4 存储与下载（§10.3）

❌ 与规格偏差最大的一处：**单 bucket**（Garage），没有 quarantine/published/temporary/exports/backup 分区；**无短期授权下载 URL**（无登录/受众/发布状态重检）；**无引用计数与延迟清理**。上传经 ArtifactPipeline 完成分片、SHA-256、ClamAV 扫描与 Ed25519 签名，但失败上传内容不清除（仅 24h TTL 字段）。

### 3.5 搜索（§10.2）

❌ 无 PostgreSQL 全文/模糊检索：`catalog.repository.ts:119-129` 为 OR 连接的 `ILIKE %term%` + btree 索引；拼音全拼/首字母列存在（migration 0004）但 `%` 中缀匹配使其索引失效；规格要求的 exact→prefix→tag/category→fuzzy 排序不存在。

### 3.6 前端架构（§9）

✅ 分层结构（pages/components/modules/shared/router）、17 条路由（懒加载 + 权限守卫）、模块化 + AntD/Tailwind/Query/RHF/Zod/ECharts、zh_CN、skip-link、`prefers-reduced-motion`、系统中文字体、无大型全局状态树。
❌ 偏差：无 `src/app` 层；模块命名与规格不同（无 review/organization/dashboard/account 模块）；存在跨模块深导入（`publishing/steps.tsx:21-22`）；通用组件越权取数并判断权限（`components/common/ApplicationAdminPage.tsx:19-22,133`，且含硬编码 `applicationId = "app-001"` 兜底）；API 客户端为手写 fetch 而非契约生成；主题覆盖 `#0060f0` 与 `!important` 违反 §9.2；登录页玻璃拟态（`bg-white/60` + 视频背景）违反 §9.3；紫色 `#7a5af8` 用于创作者侧栏（规格仅允许 AI 助手少量紫）；`motion` 依赖从未被引入。

### 3.7 安全（§11）

✅ CSRF（origin + double-submit）、请求防重放（migration 0012 + guard）、SSRF 策略、CSP/HSTS/nosniff、同源 CORS 关闭、scrypt 强哈希、富文本白名单清洗（`content-security.ts`）、ClamAV 扫描、Ed25519 签名、审核事件 append-only。
❌ **全站无任何速率限制**（规格 §5.1 明确要求"正式上线前实现最低限度的账号与 IP 固定频率限制"）；会话 Cookie 缺 `Secure`（`identity.controller.ts:968-972` 注释自认）；Web 内网 URL 无白名单/SSRF 校验（`entryUrl` 原样存储）；二维码仅按 PNG/SVG 图像校验、不解析目标格式；图片元数据剥离/重编码未见实现；无威胁模型文档。

### 3.8 运维（§13）

✅ compose.dev/test/production 齐全；production 含 digest 固定镜像、TLS 代理、WAL 归档配置、Prometheus + postgres-exporter + Alertmanager + Grafana + Loki/promtail；CI 含 verify（format/lint/typecheck/boundaries/test/build/doc-links/governance/compose-config）与 container-smoke、release 不可变发布清单；8 个 runbook、8 个 ADR；故障演练校验器（`drill-ops.mjs`）。
❌ production compose **没有 standby PostgreSQL 与第二台 Garage 节点**（仅 `standby.conf`/`production-secondary.toml` 配置文件存在）；无 keepalived（仅 DNS 手工切换）；Grafana **无任何看板**（只有 datasource）；Alertmanager 收件地址为占位 URL `https://alerts.internal.example/ai-hub` 而非钉钉；独立备份介质未确认（runbook 自认阻塞）；RPO/RTO/99.5% 无实证；CI 无镜像漏洞扫描（trivy/grype）、无密钥扫描步骤、container-smoke 实际只构建不启动容器、无 Playwright e2e。

---

## 4. 实现进度总览

### 4.1 时间线与阶段

| 日期 | 事件 |
|---|---|
| 2026-07-31 | 规格 + 路线图 + Phase 1 计划；bootstrap monorepo |
| 08-01 | Phase 2 计划（身份/组织/授权） |
| 08-03 | Phase 3–6 计划与执行台账；Phase 3 收尾 |
| 08-04 | Phase 7 计划与执行（生产安全/部署/运维），故障演练证据 |
| 08-05 | 后端 Phase 1–7 交接文档（`docs/handoff/frontend-handoff-2026-08-05.md`），前端交 Kimi K3 重建 |
| 08-05 → 08-18 | 前端重建、UI 重构、市场/创新/组织/分析页面、向导与修复（13 天 100+ commits） |
| 08-18（工作树） | 规格修订（1 个月基线）、identity cookie 迁移中间件、向导提交门、migration 0038/0039 重编号 |

**阶段对应**：路线图 Phase 1–7 已交付；**Phase 8（试点与正式上线）未开始**。里程碑：M1–M6 达成（基础/认证/发布审核/市场+创新闭环），M7（看板+集成）大体达成，M8（候选发布）部分达成（生产 compose 存在但未验证），M9（试点上线）未开始。

### 4.2 当前工作树（未提交）状态

| 变更 | 性质 |
|---|---|
| 规格修订（1 个月基线、钉钉/Qwen 预留） | ⚠️ 范围变更，未过变更控制（§1.4） |
| `identity-cookie.middleware.ts` + 测试 | 身份 Cookie 化迁移的过渡桥接；`PermissionGuard` 已优先读 Cookie，控制器仍读 header |
| 向导提交门（`submittable` + `submitDisabled`）+ 测试 | 修复 in_review 重复提交，与后端 `INVALID_APPLICATION_TRANSITION` 对齐 |
| **migration 0038/0039 重编号** | ⚠️ **风险**：若旧编号迁移已在任何数据库应用过，重命名导致 Kysely 记录不匹配（见 §8） |

### 4.3 数字概览

| 指标 | 数值 |
|---|---|
| 总 commits | 230 |
| 数据库迁移 | 39 |
| 测试文件（packages/apps） | ~70 单元 + apps/api 8 组 e2e（含 .real 变体）+ 6 个 Testcontainers 集成 + web 31 个组件/页面测试 |
| 预置角色 | 9 个（规格 5 个） |
| 看板 | 9 个固定看板（web 渲染 6 个 Tab） |
| ADR / runbook | 8 / 8 |

---

## 5. 计划 vs 已实现差距分析

按修订后规格逐节（✅ 达成 / ⚠️ 部分 / ❌ 缺失或严重偏差）。

### §5.1 认证与账号

| 项 | 状态 | 证据/说明 |
|---|---|---|
| 工号+密码登录 | ✅ | 加密信封 + 防重放挑战（规格外加固）`identity.service.ts:1297-1324` |
| 钉钉 OAuth 2.0 SSO | ✅ | state + 浏览器绑定 Cookie + 移交令牌 `dingtalk-sso.service.ts` |
| OAuth 首次登录自动注册未预创建员工 | ❌ | 抛 `DINGTALK_SSO_USER_NOT_FOUND` `dingtalk-sso.service.ts:143-145` |
| OAuth 首次注册后强制设密 | ❌ | `password_reset_required` 恒为 false `identity.repository.ts:75,856` |
| 按工号预创建待绑定账号 | ⚠️ | `pending_binding` 存在，但管理端创建强制带密码 `identity.controller.ts:150`，预创建不可达 |
| 待绑定员工不能账密登录 | ✅ | `identity.service.ts:79-86` |
| 部署时受控应急超管 | ❌ | 仅 demo seed `DEMO-SUPER-ADMIN` |
| 多设备并行登录 / 会话恢复 | ✅ | 14 天 TTL、无设备数上限；`GET /actor` 恢复 |
| 退出当前/其他设备 | ⚠️ | 退出当前 ✅；**员工自撤其他设备无接口**（仅管理端） |
| 禁用/重置/高风险角色变更撤销会话 | ⚠️ | 禁用/重置 ✅；**角色变更不撤销** `identity.service.ts:288-302` |
| 钉钉再认证后重设密码 | ❌ | 自设流程存在但**无 HTTP 端点**，且未以钉钉再认证为门 |
| 管理员重置语义（清旧密+标记待设） | ❌ | 管理员直接设置新密码 `identity.service.ts:525-541`，与规格相悖 |
| 密码规则（8 位/ASCII） | ✅ | `password.service.ts:14-48` scrypt |
| **账号与 IP 限流** | ❌ | 全仓无 rate limiting |
| 工号唯一不可变 | ✅ | 唯一索引 + 标准化查找（但创建端写入未标准化 `identity.repository.ts:70`） |

### §5.2 组织架构

| 项 | 状态 | 说明 |
|---|---|---|
| 部门树/双来源/多部门+主部门 | ✅ | migrations 0002/0021 |
| 钉钉事件同步/每日校准/手工补偿 | ❌ | `runLocalSync` 仅标记不同步 `identity.service.ts:621-686`；无调度器/Webhook |
| 删除部门前迁移子部门/成员/应用 | ❌ | 仅 `DEPARTMENT_NOT_EMPTY` 拦截 `identity.service.ts:269-286` |
| 归档/停用替代删除 | ✅ | 禁用保留业务关系 |
| 误建本地账号物理清理 | ⚠️ | 未见明确实现路径 |

### §5.3 应用类型与交付

| 项 | 状态 | 说明 |
|---|---|---|
| 四类应用类型 + 通道 | ✅ | `contracts/application.ts:83-87`；无 `.ipa` ✅ |
| 桌面多 OS / 移动多平台元数据 | ❌ | 仅通道多附件，无 OS/平台字段 |
| 小程序多渠道（微信/钉钉/支付宝）状态 + 二维码可解析校验 | ❌ | 每通道状态缺失；二维码仅图像格式校验 |
| Web 内网域名/网段/端口/协议白名单 + 重定向校验 | ❌ | `entryUrl` 原样存储 `application.service.ts:693-723` |
| 上传限制（5MB/10MB×6/2GB/版本合计5GB） | ⚠️ | 图标/截图/2GB ✅（`upload-policy.ts:27-91`）；**版本合计 5GB ❌**；**超管可配置+审计 ❌**（硬编码） |

### §5.4 应用发布

✅ 基本完整：名称/部门/责任人/维护人/分类/标签/图标（含首字）/≤6 截图/简介+富文本/手册/FAQ/受众/强制风险声明（6 项，`application.service.ts:1139-1164`）/完整度门禁/富文本白名单。唯一缺口：无独立"风险描述"编辑审计（`risk_description` 原地修改绕过版本不可变，见 §7）。

### §5.5 应用版本与审核

| 项 | 状态 | 说明 |
|---|---|---|
| 已上架内容不可变 | ✅ | DB 触发器 + 版本快照 `0003:206-224`、`0017:32-38` |
| 编辑上架应用创建新草稿、旧版本持续展示、通过后原子替换 | ✅ | `pending_version_id` 机制 `application.service.ts:260-268,377-395` |
| 同一应用最多一个草稿/待审核版本 | ⚠️ | 草稿单行 ✅（0033）；**已上架应用可并发提交无限版本**（submitForReview 无 pendingVersionId 检查） |
| 历史版本永久保留 | ✅ | 无版本删除路径 |
| 责任人移交不创建版本 | ✅ | `application.service.ts:902-940` |
| 自动校验 → 人工审核池 → 领取 | ✅ | 领取/释放 CAS `application.repository.ts:1067-1101` |
| 领取超时自动释放、超管转交 | ❌ | 未实现 |
| 审核通过自动上架 | ⚠️ | 更新路径 ✅；**首次发布需责任人再点"发布"** `application.service.ts:563-616` |
| 驳回必须填写原因 | ❌ | 空字符串可过 `application.dto.ts:130-131` |
| 待审核可撤回 | ❌ | 无提交前撤回；下架仅限 published |
| 禁止自审 | ⚠️ | 责任人在应用层 + DB 双重检查 ✅；**维护人未禁** |
| 审核 SLA 2 个工作日 + 24h/48h 提醒 | ⚠️ | `sla_due_at` 为 +24h；**提醒完全缺失** |
| 自动校验策略（扩展名/MIME/文件头/大小/压缩炸弹/恶意/哈希/签名） | ⚠️ | 扩展名+MIME+魔数+SHA-256+ClamAV+Ed25519 ✅；**压缩炸弹检测 ❌**；**未签名制品被自动签名**（应标记人工确认）`artifact-verification.worker.ts:73-80`；**校验报告从不落库**（`application_validation_checks` 无写入） |
| 草稿/撤回/驳回物理删除 | ⚠️ | 仅 draft 可删 `application.service.ts:876-899` |
| 审核通过后永久删除保护 | ✅ | 非 draft 一律不可删 |
| 责任人/应用管理员立即下架+原因 | ⚠️ | 下架有原因；**维护人申请下架 ❌** |
| 下架/归档后恢复须新版本+审核 | ❌ | 恢复路径缺失 |
| 归档 | ✅ | 需先下架 |

### §5.6 应用市场

| 项 | 状态 | 说明 |
|---|---|---|
| 管理员推荐 | ❌ | `recommendation_rank` 恒 0（`application.repository.ts:321,1194`），无推荐端点 |
| 最新/热门 | ✅ | likeCount/updated_at 排序 |
| 分类/标签/类型筛选 | ✅ | |
| 权限过滤搜索 | ✅ | 列表/详情/交付统一可见性门 |
| **搜索排序（exact→prefix→tag→fuzzy）** | ❌ | 无 FTS/trgm，纯 ILIKE |
| 受众含子部门（include_children） | ❌ | 字段存在但 catalog 读取忽略 `catalog.repository.ts:104-110` |
| 骨架屏/空/错误状态 | ⚠️ | 有基础空态；热门/最近更新侧栏标注"api 待实现" |

### §5.7 互动与内容治理

✅ 点赞取消、单条评分（1–5 星可改可匿名）、跨版本记录、官方回复实名一层、举报不自动隐藏、隐藏/恢复、匿名追溯受审计。缺口：禁用员工内容**未显示为已停用**（`interaction.types.ts:26` 无身份解析）；举报处理被"应用必须可见"阻塞 `interaction.service.ts:239`（应用废弃后无法治理）；匿名身份未从普通图表排除。

### §5.8 站内通知与钉钉通知

| 项 | 状态 | 说明 |
|---|---|---|
| 站内通知 + 幂等/重试/失败队列 | ✅ | outbox + 幂等键 + 隔离 |
| 事件矩阵（待审/通过驳回/下架/待移交/检测失败/举报处理/需求事件/告警） | ❌ | 缺：待移交、安装包检测失败、举报处理、需求审核决定、认领确认、安全告警；`demand.submitted` 通知对象错误（发给需求人而非审核人）`dingtalk-matrix.service.ts:23-26` |
| 钉钉工作通知真实投递 | ❌ | 发送器为 `unavailableDingTalk` 桩；且矩阵键与事件键不匹配（`review_requested` vs `review.requested`），**审核通知实际全灭** |
| 外部失败不回滚 | ✅ | |

### §5.9 创新广场

✅ 大部分完整：全状态机、轻量审核、认领方案（负责人/协作者/思路/时长/资源）、优先级建议分+管理员确认、点赞/讨论/举报、匿名、需求↔应用 M:N、从需求创建应用。缺口：**需求审核无 SLA/提醒**；**"已转化"无"应用已上架+管理员确认"校验** `demand.service.ts:624-660`；重复需求合并的实现路径为人工操作（规格本就允许手动合并，✅）。

### §5.10 数据看板

| 项 | 状态 | 说明 |
|---|---|---|
| 9 个固定看板 | ⚠️ | **需求价值看板缺失**；单应用看板无应用筛选 |
| 首屏 KPI | ⚠️ | 缺"已转化需求数/转化率"、"高风险应用数" `dashboard-metrics.ts:25-29` |
| 按角色权限 | ✅ | 9 角色分权 + 部门范围 |
| 小样本部门隐藏/合并 | ❌ | 未实现 |
| 匿名身份不入图表/导出 | ⚠️ | 导出 ✅；**图表 ❌** |
| 日聚合 + 近实时待办 | ✅ | `aggregation.service.ts` 日聚合 |
| 看板可重算一致 | ⚠️ | 有重建脚本，未形成 CI 校验 |

### §5.11 数据导出

⚠️ 角色导出、审计 ✅（`export.service.ts:39-166`）；**大批量导出为同步请求内生成** `export.service.ts:94-145`，无后台任务、无短期有效文件；匿名标注 ✅。

### §5.12 AI 助手

⚠️ **越界实现**（规格标注 V1 暂不实现；路线图 Phase 6 又要求交付——文档矛盾）。实现含最小化上下文、脱敏边界、授权复核、审计与失败通知；符合规格的只读与不发送清单约束。

### §5.13 基础生命周期治理

| 项 | 状态 | 说明 |
|---|---|---|
| 内网 Web 地址健康检查 | ❌ | `health_status` 恒 "unknown" `application.repository.ts:322,1195` |
| 责任人离职/禁用后待移交 | ❌ | 仅即时移交 `application.controller.ts:450-470`，无待移交状态 |
| 可信标签（实验/已验证/推荐/即将废弃） | ⚠️ | 仅种子数据，**无写接口** |
| 废弃说明与替代应用 | ⚠️ | 字段存在，无治理入口 |

### §6 角色与权限

✅ RBAC（resourceType.action）、对象关系、受众、禁止自审、自定义角色、无用户级零散权限、平台级作用域、授权全部后端执行。偏差：**9 个预置角色**（规格 5 个）：新增 `demand_reviewer`/`department_lead`/`risk_operator`/`analytics_*`；`department_lead` 与部门级看板逼近规格排除的"部门级管理员"。

### §12 错误、可靠性与降级

✅ ProblemDetails（type/title/status/code/detail/traceId/fieldErrors）、关联 ID、白名单/超时/重试设计。❌ 降级表多数无运行时支撑：钉钉通知桩、组织同步缺失、备份/存储切换未演练。

### §13 部署

见 §3.8。核心缺口：**双机未实际存在**（runbook 自认）、无 keepalived、standby 服务不在 compose、Grafana 无看板、Alertmanager 非钉钉、备份介质未确认（规格 §13.4 明确为**上线阻塞项**）、CI 缺镜像漏洞扫描与真实冒烟。

### §14 测试与质量

| 层 | 状态 | 说明 |
|---|---|---|
| 领域规则测试 | ✅ | service 层覆盖良好（如 demand 30 文件/126 用例，server 总体 5 组域） |
| 真实 PostgreSQL 集成 | ✅ | Testcontainers 6 个集成文件 |
| 外部 adapter 契约测试 | ⚠️ | 钉钉/ClamAV/Garage 无契约测试（桩/模拟为主） |
| 前端 UI 测试 | ✅ | 31 个文件（页面/组件/权限守卫） |
| **Playwright e2e** | ❌ | 依赖未启用，无配置文件；规格 §14.2 的关键流程（钉钉首次登录、禁止自审、受众隔离、文件隔离下载、故障降级）无端到端覆盖 |
| 安全测试 | ✅ | csrf/replay/ssrf/middleware 单测；e2e 无越权矩阵 |
| **性能测试** | ❌ | 无（规格 §14.3 全部目标无证据） |
| 备份恢复/故障切换测试 | ⚠️ | 有 drill 校验器与 phase-07 证据，但无真实双机环境 |
| 关键 e2e 缺口 | ⚠️ | 删除保护、移交、SLA、统一上传限额、授权拒绝不泄露存在性 无 e2e |

### §15/§17/§18 项目治理产物

| 产物 | 状态 |
|---|---|
| 领域术语表 | ❌ |
| 权限矩阵 | ✅ `docs/access-control-matrix.md` |
| ADR | ✅ 8 个 |
| 数据字典和状态说明 | ⚠️ 部分（migrations 注释） |
| 外部集成契约 | ⚠️ 无独立契约文档（代码内类型） |
| 威胁模型 | ❌ |
| 测试计划与报告 | ⚠️ 无统一报告；evidence 仅 phase-07 |
| 部署/升级/回退/灾备手册 | ✅ 8 个 runbook |
| 用户/运营/管理员手册 | ❌ |
| 已知问题与 V1.1 待办 | ❌ |
| 外部干系人（钉钉管理员/服务器/备份/试点代表/批准人） | ❌ 未见确认记录 |

---

## 6. 越界内容（规格外实现）

### 6.1 功能越界（规格明确不进入 V1 或未要求）

| 越界项 | 规格依据 | 证据 | 建议 |
|---|---|---|---|
| **AI 助手全栈实现** | §5.12 "V1 暂不实现"（但路线图 Phase 6 又交付） | `analytics/assistant.*`、`pages/assistant/` | 二选一：保留并修订规格（补 §5.12 到 V1），或标记 beta 入口 |
| **应用反馈模块**（bug/建议/内容问题 + 指派解决） | 规格无此模块 | `feedback.service.ts` | 归入 V1.1，或补充规格修订记录 |
| **需求试点记录子系统 + 遗留直接认领** | 规格仅"试点记录"字段级 | `demand.service.ts:175-203` | 保留试点，删直接认领（绕过方案流程） |
| **回滚端点** | 规格无回滚 | `application.service.ts:638-672` | 有运维价值，建议补 ADR 记录 |
| **`request_changes` 审核结论** | 规格仅通过/驳回 | `application.dto.ts:123` | 与驳回语义重复，移除或明确定义 |
| **部门级角色与看板**（`department_lead` 等 9 角色） | §6 "不支持部门级管理员" | `system-roles.ts:82-166`、`dashboard.service.ts:45` | 与规格冲突，需书面修订或收编进 V1.1 |
| **CSV 导入用户/部门** | 规格未要求 | `identity.controller.ts:157-183,512-537` | 有用但需补审计与校验，记入 ADR |
| **未签名制品自动签名** | §5.5 "未签名进入人工审核并显著标记" | `artifact-verification.worker.ts:73-80` | **行为与规格相反**，应改为标记而非签名 |

### 6.2 加固型越界（合理，但需记录）

加密登录信封 + 防重放挑战（`login_challenges`）、请求防重放 middleware、Ed25519 制品签名、审计导出后台任务、依赖规则/发布回滚门禁、Loki 日志栈、SSRF 策略、demo 种子数据与初始化脚本。这些超出规格但方向正确——建议以 ADR 形式固化，防止未来误删。

### 6.3 越界风险提示

- **移动端/桌面端 OS 元数据、小程序渠道状态**属于规格 §5.3 必做项，当前以"附件"近似实现——这不是越界，而是**降级实现**，验收时可能被判定不达标准。
- 首次上架"审核通过≠自动上架"、维护人未禁自审，是**规格要求的缺口**，不能靠越界功能抵消。

---

## 7. 质量标准与代码审查发现

（code-review 双轴：规格轴见 §5，本节约为标准轴 + 质量。均为判断性发现，非工具强制。）

### 7.1 正确性/隐患

| 发现 | 严重度 | 位置 |
|---|---|---|
| 互动幂等键嵌入 `Date.now()`，重试必重复 | **P0** | `interaction.service.ts:45,135` |
| 钉钉通知矩阵键与事件键不匹配 + 发送桩 → **审核等通知全灭** | **P0** | `dingtalk-matrix.service.ts:5-12` vs `application.service.ts:288,540` |
| `AuditService.recordEvent` 从未被调用（双审计通道并行，安全审计写路径死代码） | P1 | `audit.repository.ts`、`system/security` |
| `risk_description` 原地更新绕过版本不可变 | P1 | `catalog.repository.ts:406` |
| 已上架应用并发版本无上限（违反"最多一个待审核"） | P1 | `submitForReview` 无 `pendingVersionId` 检查 |
| 角色变更不撤销会话（规格 §5.1/§11.1） | P1 | `identity.service.ts:288-302` |
| replay guard 硬编码 `actorEmployeeId: "authenticated-request"` | P1 | `production.middleware.ts:73` |
| `resolveReport` 在需求侧自动隐藏、应用侧不隐藏，语义不一致 | P2 | `demand.service.ts:1235-1243` vs `interaction.service.ts` |
| `createEmployee` 未标准化工号，与查找端不一致 | P2 | `identity.repository.ts:70` vs `:1006` |
| 举报治理被"应用可见"阻塞（废弃后无法治理） | P2 | `interaction.service.ts:239` |
| outbox 批大小 1、固定 1s、无退避、无心跳 | P2 | `outbox-worker.ts:7-9` |
| likeCount/ratingAvg 逐行相关子查询（N+1） | P2 | `catalog.repository.ts:76-90` |
| 遗留 64MB 上传 token 与统一 2GB 限额并存 | P2 | `application.module.ts:33` vs `upload-policy.ts:86` |
| 迁移 0038/0039 重编号 | ✅ 已核查（低风险） | 见 §8；实跑 `pnpm migrate` 验证通过 |

### 7.2 代码气味（Fowler 基线）

- **神秘命名/重复代码**：`retryDelivery` 复制 outbox handler 逻辑（`notification.service.ts:90-135`）；双审核通道（service audit + security audit）职责不清。
- **投机性一般化**：`syncDingTalkDirectory` 端口仅测试使用、无生产调用；`getLoginOptions` 恒返回 `["password"]` 而钉钉分支被注释（`identity.controller.ts:829-835`）。
- **数据泥团**：受众（部门+员工+include_children）在多处手工拼装，无统一类型。
- **职责分离**：通用组件取数 + 判权（`ApplicationAdminPage`）；`risk_description` 落在 catalog 而非 application 域。

### 7.3 测试质量

✅ 优点：服务层规则测试密度高；关键安全中间件有单测；web 有 31 个组件/页面测试；e2e 有 mock 与真实（`.real`）双轨。
❌ 缺点：identity/application 的 e2e 主套件用 mock 仓库（不覆盖真实登录/会话/DB 路径）；删除保护/移交/SLA/上传限额/越权矩阵无 e2e；无 Playwright 端到端；无性能测试；adapter 无契约测试。

---

## 8. 风险与阻塞

| 风险 | 等级 | 处置建议 |
|---|---|---|
| **限流缺失**：账密登录无限流，违反规格明确要求，上线即暴露于爆破 | P0 | 上线前必须实现最低限度的账号/IP 固定频率限制（规格原话） |
| **钉钉链路整体为桩**：OAuth 有流程但同步/通知/再认证均桩化；规格已将其降级为"预留"——需企业明确接受"账密登录退避"并签字 | P0 | 修订规格已降级；**需确认企业验收口径**；若需钉钉入口则排期 |
| **迁移 0038/0039 重编号**（工作树未提交）：初始评估为 P0，**已实核降级为低风险**——主库 `ai_hub` 与 4 个辅助库的 `kysely_migration` 记录均为**新编号**（无任何环境应用过旧编号），`pnpm migrate` 实跑通过、无待应用迁移 | 低 | 前提：重命名必须与 migrate.ts 同步提交（否则 HEAD 旧编号在已迁移主库上会 `ADD COLUMN` 重复列报错）；流程教训：迁移先在未提交工作树跑过，属"先跑后提交"，以后跑迁移前先提交 |
| 已上架应用并发版本无上限 → 审核竞争、旧版本替换语义破坏 | P1 | submitForReview 增加 pendingVersionId 唯一约束 |
| 审核 SLA 24h≠2 工作日、提醒缺失 → 成功指标"80% 审核 2 日内完成"不可测 | P1 | 修正 SLA 口径 + 24h/48h 提醒事件入 outbox |
| 首次发布"审核通过≠自动上架"→ 流程与规格不一致 | P1 | 对齐自动上架或书面修订 |
| 未签名制品自动签名 → 供应链信任语义被破坏 | P1 | 改为"标记 + 人工确认" |
| 生产双机、keepalived、standby PG、第二存储、备份介质、Grafana/钉钉告警 | P1（上线阻塞） | 规格 §13.4 备份介质是**上线阻塞项**；双机环境需企业提供 |
| 搜索无 FTS 与排序 → 转化率指标（≥50%）可能不达标 | P1 | 补 trgm + 排序规则 |
| 无 Playwright e2e/性能测试 → 99.5% 与 P95 目标无证据 | P1 | Phase 8 前补关键链路 |
| 规格修订未同步路线图 → 基线漂移，后续计划引用过时数据（9 个月/5,000 人/Dify） | P1 | 变更控制：同步路线图与受影响 ADR |
| 前端占位（安全配置/会话管理/文件扫描/分类标签治理/举报治理/单应用筛选/运营看板） | P2 | 按 V1.1 排期，明确哪些进 V1 |
| 匿名身份未从图表排除、小样本部门不隐藏 → 合规反推风险 | P1 | 聚合层加口径 |
| `Date.now()` 幂等键 → 重试重复计数污染指标与审计 | P0 | 改业务键（如 requestId/事件唯一键） |

---

## 9. 优化与建议（分优先级）

### P0 — 上线前必须（阻塞项）

1. **限流**：登录/OTP/导出等入口加最低限流（固定窗口 + 账号/IP 维度），并写审计。
2. **修复幂等键**：interaction 的 like/comment 幂等键去掉 `Date.now()`，使用稳定业务键。
3. **钉钉通知矩阵对齐**：统一事件键（`application.review.requested/reviewed` 等），修复矩阵映射，至少让站内通知完全覆盖规格事件清单（§5.8）；钉钉发送按"预留"口径由企业确认。
4. **迁移重编号风险处置**：核对各环境 migrations 表；必要时新建迁移而非改名。
5. **备份介质与双机环境确认**：规格 §13.4 上线阻塞项，需要书面确认或降级批准。

### P1 — V1 范围内补齐（规格已要求）

6. **审核闭环**：SLA 改 2 个工作日；24h/48h 提醒入 outbox；领取超时自动释放 + 超管转交；驳回原因必填；提交前撤回；维护人禁自审；已上架应用"最多一个待审核"约束；首次发布审核通过自动上架。
7. **自动校验报告落库**：`application_validation_checks` 写入（扩展名/魔数/哈希/签名/扫描结果），创作者与审核页真实展示。
8. **未签名制品标记人工确认**，取消自动签名。
9. **删除/归档闭环**：撤回/已驳回可物理删除；维护人申请下架；归档后恢复=新版本+审核。
10. **Web URL 白名单 + SSRF 校验**（协议/域名/IP/端口 + 重定向目标），对齐 §11.3。
11. **小程序渠道元数据 + 二维码解析校验**；桌面/移动 OS 平台元数据（§5.3）。
12. **搜索升级**：pg_trgm + 排序（exact→prefix→tag→fuzzy）+ 受众条件进 SQL（已如此），拼音索引改为可用的 B-tree（前缀/规范化）。
13. **通知事件补齐**：待移交、检测失败、举报处理、需求审核决定、认领确认、安全告警。
14. **看板补齐**：需求价值看板、单应用筛选、首屏 KPI 补全、小样本部门隐藏/合并、匿名身份排除（图表+导出）。
15. **导出后台化**：大批量导出走 outbox + 短期文件 + 下载前重检。
16. **需求"已转化"校验**：应用上架 + 运营确认后才可转化；需求审核 SLA 1 个工作日。
17. **禁用员工内容展示**：显示"已停用用户"。
18. **部门删除迁移**：迁移子部门/成员/应用再删。
19. **角色变更撤销会话 + Cookie Secure**（生产环境强制）。
20. **DingTalk 组织同步**：按"预留"口径，与企业确认是否 V1 必需；若必需，实现事件/全量/手工三通道之一。
21. **生命周期治理**：健康检查任务、待移交状态、可信标签/废弃说明写接口。

### P2 — 质量与技术债（可进 V1.1 或持续优化）

22. **worker 增强**：指数退避、批处理 >1、处理器超时/心跳；聚合/清理/备份检查等处理器按需注册。
23. **存储对齐规格**：quarantine/published/exports 分区 + 短期授权下载 URL + 引用计数延迟清理（至少先做隔离区与下载重检）。
24. **性能**：likeCount/ratingAvg 改物化/汇总列；为搜索加索引；引入性能测试（P95 基线）。
25. **前端对齐**：向导改 5 步（含交付配置与归属步骤 + 校验报告预览）；移除玻璃拟态登录页、`!important`、非助手紫色；`ApplicationAdminPage` 的硬编码 `app-001` 兜底必须移除；motion 依赖按需启用或移除。
26. **契约生成客户端**：手写 fetch 客户端 → 从 contracts 生成（或至少生成类型安全包装）。
27. **审计统一**：合并双审计通道，`AuditService.recordEvent` 接线；补 3 年保留策略与清理任务。
28. **治理产物**：威胁模型、术语表、数据字典、测试计划报告、用户/运营手册、已知问题清单；规格修订同步路线图与 ADR。
29. **CI 补齐**：镜像漏洞扫描（trivy）、密钥扫描、container-smoke 真正启动容器、迁移回退验证。
30. **Playwright e2e**：覆盖 §14.2 关键流程（登录/四类发布/禁止自审/受众隔离/文件安全/降级）。

### 建议的短期执行顺序（两周冲刺）

- **冲刺 A（本周）**：P0 1–4（限流、幂等键、通知矩阵、迁移核对）+ 审核闭环 6 + 校验报告 7–8。
- **冲刺 B（下周）**：P1 10–16（URL 白名单、小程序/OS 元数据、搜索、通知补齐、看板、导出、需求校验）+ 生命周期 21。
- **冲刺 C（V1 收尾）**：前端占位补齐（安全页、分类标签治理、举报治理、单应用筛选）、P2 25/26、治理产物 28；随后进入 Phase 8（试点/UAT/上线演练）。

---

## 10. 项目管理方法论复盘

### 10.1 范围管理

- **做得好的**：规格 → 路线图 → 阶段计划 → 执行台账的层级清晰；"计划门禁 → 执行 → 收尾台账"的流程被严格执行（8 个阶段计划 + 5 份执行台账均在库）；新增功能以 ADR（0004–0008）记录阶段决策。
- **问题**：① 规格在工作树被直接改写（9 个月→1 个月、钉钉降级）而未走变更控制——路线图、ADR、后续计划全部失同步；② 越界功能（反馈模块、部门角色、回滚、AI 助手）没有等量范围削减（§20 要求"必须进入 V1 的新增功能需要明确移除等量现有范围"）；③ "1 个月完成试点+上线"（修订规格）vs 当前 19 天已消耗 + Phase 8 未动，**时间基线显著不现实**，需要重新排期。

### 10.2 时间与进度

- 19 天完成 Phase 1–7（规划 8 个月）——AI 编码产能远超常规，但也意味着：测试以单元为主、e2e/性能/演练缺位；**压缩的进度把风险后置到了 Phase 8**。
- 里程碑 M1–M6 达成，M7 大体达成，M8 部分，M9 未开始。按修订后"1 个月"基线，当前已在第 3 周（功能冻结线），但冻结清单（P0/P1）尚未关闭。

### 10.3 质量管理

- 门禁齐全（verify 9 项 + container-smoke + release 不可变发布）；`pnpm verify` 管线真实有效。
- 缺口：无 Playwright、无性能测试、adapter 无契约测试、镜像无漏洞扫描、container-smoke 名不副实（不启动容器）；DoD（§14.5）部分满足（验收条件/权限异常路径/自动化测试/migration 有；审计指标/响应式键盘/运行文档/安全无高漏洞部分覆盖）。

### 10.4 风险管理

- 规格 §18 已列风险大部分仍然成立：单人全角色（缓解：模块化+测试+手册——手册缺位）、备份介质（未确认=阻塞）、钉钉权限回调（已降级）、Qwen 数据风险（已实现最小化边界，但"预留"状态与企业审批未定）。
- 新增风险：迁移重编号、通知全灭、幂等键失效、生产双机无实证。

### 10.5 干系人与沟通

- 外部干系人（钉钉管理员、双机/网络负责人、备份负责人、试点代表、上线批准人）的确认记录缺失；handoff 文档（Kimi K3 前端交接）是好的跨 agent 协作产物。
- **上线前必须**：书面确认钉钉降级口径、备份介质、双机环境、试点范围（3–5 部门/30–50 人/5–10 应用，§16）。

### 10.6 变更控制建议

1. 将工作树中的规格修订正式提交，并同步更新：路线图（周期、用户量、Phase 6 助手、冻结时点）、受影响 ADR、权限矩阵。
2. 新增 V1 范围一律登记"删除等量范围"记录（§20 要求）。
3. 第 3 周末（修订后）功能冻结，P0/P1 清单作为冻结基线。

### 10.7 下一步（Phase 8 试点上线清单）

1. 关闭 P0（§9 前 5 项）并重新验证。
2. 与企业确认：钉钉口径、备份介质、双机环境与网络、试点范围与批准人。
3. 补关键 e2e（登录/发布/禁自审/受众/文件安全）+ Playwright 冒烟。
4. 生产候选发布：Ubuntu 备用节点验证、PostgreSQL 手工切换、存储切换、镜像回退演练（runbook 已备，需真机执行）。
5. 初始化：生产 `init:production`（仅迁移）、角色授予、种子数据隔离确认。
6. 90 天运营指标基线（§2 成功指标）与看板口径核对。

---

## 11. 附录：证据索引

| 证据 | 位置 |
|---|---|
| 设计规格（含未提交修订） | `docs/superpowers/specs/2026-07-31-ai-application-sharing-platform-design.md` |
| V1 路线图（未同步修订） | `docs/superpowers/plans/2026-07-31-ai-hub-v1-program-roadmap.md` |
| 阶段计划 1–7 + 执行台账 | `docs/superpowers/plans/2026-07-31-ai-hub-phase-0*` |
| 前端交接（后端 1–7 完成声明） | `docs/handoff/frontend-handoff-2026-08-05.md` |
| ADR（8） | `docs/adr/0001–0008-*.md` |
| 运行手册（8） | `docs/runbooks/*.md` |
| 权限矩阵 | `docs/access-control-matrix.md` |
| 架构重设计与流程图 | `docs/architecture-redesign.md`、`docs/flowchart/` |
| 迁移清单（39） | `packages/database/src/migrations/0001–0039` |
| 工作树未提交变更 | `git status`（spec 修订、identity-cookie 中间件、向导提交门、0038/0039 重命名） |

---

*本报告由 code-review（规格轴 + 标准轴）双轴方法生成；规格轴结论见 §5–§6，标准轴结论见 §7。所有标注 ⚠️/❌ 项均附文件:行号证据，可按 §9 优先级直接转工作项。*
