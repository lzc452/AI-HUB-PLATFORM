# AI Hub 模型服务平台：vLLM API Key 管理与统一网关 — 产品需求文档（PRD）

| 文档信息 | |
| --- | --- |
| 版本 | v1.4（**定稿**，自 M1 起作为实现基线） |
| 日期 | 2026-10-13 |
| 作者 | 司南（产品经理 Agent） |
| 状态 | 已定稿；关键假设 A1/A3/A4 已关闭、A2 挂 M2 前置；后续变更走需求变更评估表 |
| 关联分支 | `feature/api-platform` |
| 需求基线 | 已按 `docs/requirements/README.md` 变更规则登记为 REQ-MDL-01~06（见该文件 §3.8） |

**变更记录**：v0.1（2026-10-13）精简版需求梳理 → v1.0（2026-10-13）展开完整 PRD，新增用户场景、功能架构、接口规范、数据模型、安全策略、监控指标、非功能性需求与里程碑 → v1.1（2026-10-13）接口规范与数据模型细化评审后修订（采纳 19 条、部分采纳 1 条，明确 2 条不予采纳及理由）→ v1.2（2026-10-13）流式契约与配额 SQL 落地形态复审后修订（R3 7 条 + R4 5 条全部采纳，其中 4 条 P0 为生产环境阻断项）→ v1.3（2026-10-13）落地形态**实证验证**后修订：配额 SQL 两项验证通过，nginx 结论纠偏（`proxy_read_timeout` 升级为已验证 P0、`proxy_buffering` 降为建议），并更正一处错误表述 → v1.4（2026-10-13）定稿 → **v1.4.4（2026-10-13）M4 后端交付状态回写**（用量聚合、用量/管理面 API、worker 周期任务；前端 Console 待下一步）→ v1.4.3（2026-10-13）M3 交付状态回写（流式 / 配额 / 熔断 / 记账落地；范围调整：调用记录写入前移 M3、日配额去掉进程内修正项、移除临时错误码 streaming_not_enabled）→ v1.4.2（2026-10-13）M2 交付状态回写（网关面落地：错误表新增 5 项实现期契约、M2 里程碑与 RTM 状态更新、A2 关闭）→ v1.4.1（2026-10-13）M1 交付状态回写（仅更新里程碑与 RTM 状态，需求与契约无变更；另修正数据模型一处笔误：`employee_id` 为 `varchar(64)` 而非 uuid，须与 `employees` 主键一致）。

**定稿声明**：本文自 v1.4 起为「本地 vLLM API Key 管理与统一网关」的实现基线。范围、接口契约、数据模型、权限码与部署前置以本文为准；实现阶段的偏差须记录在代码评审或变更评估表中并回写本文。已落地的部署前置项（nginx `/v1/` 路由、`/v1` 中间件豁免）见 8.3 落地状态。

**评审记录**：

| 轮次 | 聚焦区 | 意见数 | 收敛结果 |
| --- | --- | --- | --- |
| R1 | 接口规范（第 8 章） | 10 | 全部采纳（P0 2 条 / P1 7 条 / P2 1 条） |
| R2 | 数据模型（第 9 章） | 10 | 采纳 9、部分采纳 1（P0 2 条） |
| R3 | 流式契约落地形态（8.2） | 7 | 全部采纳（P0 4 条 / P1 2 条 / P2 1 条） |
| R4 | 配额 SQL 落地形态（9.4） | 5 | 全部采纳（P1 3 条 / P2 2 条） |
| V1 | 实证验证（9.4 配额 SQL / 8.3 nginx） | 4 项 | 2 项证实、1 项定性更正、1 项表述更正 |

R1/R2 明细见 `docs/audit/api-platform-prd-review-2026-10-13.md`；R3/R4 明细（含代码证据与行号）见 `docs/audit/api-platform-prd-landform-recheck-2026-10-13.md`；V1 原始输出与纠偏留痕见 `docs/audit/api-platform-landform-verification-2026-10-13.md`。

## 二、背景与目标

### 2.1 背景

平台已在公司 GPU 服务器部署本地大模型（vLLM，OpenAI 兼容）。当前模型能力只能通过服务器本地端口直接访问：无用户鉴权、无配额、无用量统计，谁拿到地址就能无限调用，GPU 资源存在被单个任务吃满的风险，也无法回答「谁用了多少」。平台自身已有完整的登录态、员工体系、审计与 Outbox 设施（见需求基线 REQ-ID/REQ-OPS），具备在其上构建「模型服务统一入口」的条件。

### 2.2 要解决的问题

1. **开放问题**：员工/应用希望以标准 OpenAI SDK 调用本地模型，而非裸端口；
2. **管控问题**：调用无身份、无限流、无配额，GPU 资源不可保护；
3. **可视问题**：无调用记录与用量统计，无法成本核算与滥用追溯。

### 2.3 目标与成功指标

| 编号 | 目标 | 成功指标（设计目标值，非测量承诺） |
| --- | --- | --- |
| G-01 | 登录用户自助开通 OpenAI 兼容 Key | ≤3 次点击完成创建；明文仅在创建响应中返回一次 |
| G-02 | 接口完全兼容 OpenAI 格式 | `/v1/models`、`/v1/chat/completions`、`/v1/embeddings` 可用；官方 OpenAI SDK 仅改 `base_url` 与 `api_key` 即可调用（含 streaming） |
| G-03 | Key 全生命周期可控 | 启用/禁用/轮换/删除全部生效；禁用与越权调用 100% 返回 401/403 |
| G-04 | 配额与限流生效 | 按 Key RPM/TPM 限流、按用户日 token 配额；超限 429 + `Retry-After` |
| G-05 | 调用全量可观测 | 100% 调用落账；控制台展示今日/近 7 日/近 30 日用量，明细可查 |
| G-06 | 不影响平台现有 API | 网关附加延迟 P95 ≤ 50ms（估算，不含模型生成时间）；vLLM 故障时平台其余接口不受影响 |

## 三、名词与术语定义

| 术语 | 定义 |
| --- | --- |
| API Key | 形如 `sk-aihub-<32 位随机字符>` 的调用凭证，绑定一名登录用户 |
| 控制面 | 需登录态（Cookie 会话）的管理接口，前缀 `/internal/model-service` |
| 网关面 | 需 Bearer API Key 的 OpenAI 兼容接口，前缀 `/v1` |
| vLLM | 本地部署的 OpenAI 兼容推理服务（上游），默认地址由配置指定 |
| RPM / TPM | 每分钟请求数 / 每分钟 token 数，按 Key 维度计 |
| 日配额 | 按用户维度每日累计 token 上限，软限额语义 |
| 熔断 | 上游连续失败达到阈值后短暂拒绝新请求，半开探测恢复 |
| HMAC 哈希 | 用服务端密钥对 API Key 计算的单向摘要，用于存储与查找 |

## 四、需求范围

### 4.1 包含（本期）

- 控制面：Key 创建/列表/详情/禁用/启用/轮换/删除；本人用量汇总与调用明细；管理员全平台 Key 与用量视图、代禁用
- 网关面：Bearer 鉴权、`/v1/models`、`/v1/chat/completions`（流式与非流式）、`/v1/embeddings`
- 配额：RPM/TPM 限流、日 token 配额、熔断
- 可观测：100% 调用记录、用量聚合、Prometheus 指标、告警规则
- 前端：Console 新增「模型服务」菜单与页面（Key 管理 + 用量可视化）
- 部署：Compose 增加 vLLM 服务定义、nginx `/v1/` 路由、配置项

### 4.2 不包含（记入后续版本池）

- 计费扣费（资金类；后续引入须先补幂等、对账、资损监控三件套）
- 多租户/组织级数据隔离
- 多模型源混合路由（接入外部厂商模型）
- vLLM 多机调度、模型微调/量化管理
- Key 分域授权（按 Key 限定可用模型/端点）

### 4.3 关键假设（定稿结论）

| 编号 | 假设 | 定稿结论 | 依据 |
| --- | --- | --- | --- |
| A1 | 复用平台现有登录态与员工体系，Key 绑定登录用户 | ✅ **已关闭（成立）** | `authorization/permission.guard.ts`：会话 Cookie（`aihub_eid`/`aihub_sid`）→ `ActorContext` → `@RequiresPermissions` 链路可直接复用，控制面据此挂权限码 |
| A2 | vLLM 部署于 GPU 服务器，暴露 OpenAI 兼容 HTTP 端口 | ✅ **已关闭（2026-10-13 由用户提供）**：基址 `http://10.10.181.82:3040/v1`；模型 `Qwen3.5 35B A3B`；上下文上限 **256k tokens** | 已写入 compose 与 `.env.example`。**开发机不通内网**（实测 `curl` 8s 超时、`http_code=000`），因此 M2 用上游桩完成验证，真实联调待内网环境；模型 id 联调时以 `GET /v1/models` 实际返回为准（名称含空格需核对） |
| A3 | 配额为限流 + 软限额，超额拒绝并提示，不扣费 | ✅ **已关闭（成立）** | 本文 4.2 明确不做计费；后续引入计费须先补资金安全三件套 |
| A4 | API 单实例部署（模块化单体，Compose 无 Redis） | ✅ **已关闭（成立）** | `compose.yaml` 服务清单无 Redis；限流按进程内计数设计（9.4），多实例演进时迁移共享存储 |

## 五、方案对比与选型说明

| 维度 | 方案 A：应用层网关（NestJS 模块） | 方案 B：独立 LLM 网关服务 | 方案 C：Nginx/OpenResty + Lua |
| --- | --- | --- | --- |
| 思路 | `packages/server` 新增 `llm-gateway` 模块：Bearer 鉴权 → 限流配额 → 转发 vLLM → 同步记账 | 独立服务专责路由/鉴权/限流/监控；NestJS 只管 Key 管理，状态经缓存同步 | Nginx 鉴权限流转发，Lua 校验 Key |
| 实现成本 | 低：复用现有鉴权、Kysely、Outbox、Prometheus | 高：双服务运维、Key 状态同步、合规审查 | 中：Lua 业务逻辑开发调试成本高 |
| 用户体验 | 中：与业务 API 同进程，高并发 streaming 有争抢 | 好：streaming 友好、可独立扩缩、故障隔离 | 中：迭代受 Lua 限制 |
| 风险 | 中：vLLM 慢响应可能拖累 API 进程，需超时/熔断/连接池隔离 | 中：架构复杂、Key 一致性风险 | 高：用量落库与配额难维护 |
| 上线时间 | 快 | 慢 | 中 |
| 推荐度 | **推荐（本期）** | 备选（演进方向） | 不推荐 |

**推荐结论**：采用方案 A。内部按「网关抽象」设计——转发适配器（`vllm-upstream.adapter`）、配额拦截器（`quota.interceptor`）、用量记录端口（`usage.recorder`）相互独立，控制台与对外契约不感知实现细节。**演进路径**：满足任一触发条件（网关转发 P95 > 500ms 持续 1 周、API 进程 CPU > 70% 持续 1 周、峰值 QPS > 50 或多实例成为硬需求）时，将网关模块平移为方案 B 的独立服务，契约不变。

## 六、用户角色与使用场景

### 6.1 用户角色

| 角色 | 说明 | 画像依据 |
| --- | --- | --- |
| 普通员工（使用者） | 已登录员工，自助开通 Key 并在自有脚本/应用中调用模型 | 基于 A1 假设与平台员工体系推导，待确认 |
| 平台管理员 | `super_admin`，处置异常 Key、查看全平台用量 | 平台既有角色定义 |
| 调用方（间接） | 使用者编写的脚本/应用，通过 OpenAI SDK 访问 | 设计推导 |

### 6.2 用户故事与验收标准（Given/When/Then）

- **US-01 创建 Key**：作为已登录员工，我想要自助创建 API Key，以便在我的脚本中调用模型。
  - Given 已登录且具备 `model_service.key.manage`，When 在「模型服务」页点击新建并提交名称，Then 返回 201 与一次性明文 Key，列表出现前缀为 `sk-aihub-` 开头的记录。
- **US-02 禁用/启用**：作为员工，我想要临时停用可疑 Key，以便阻止继续调用。
  - Given 存在 active Key，When 点击禁用，Then 状态变为 disabled，该 Key 后续调用返回 401/403；再次启用后恢复。
- **US-03 轮换**：作为员工，我想要轮换泄露的 Key，以便在不中断其他 Key 的情况下更换凭证。
  - Given 存在 active Key，When 点击轮换并确认，Then 旧 Key 立即失效（调用返回 401），新 Key 明文一次性展示。
- **US-04 查看用量**：作为员工，我想要查看本人用量，以便掌握消耗。
  - Given 已产生调用，When 打开用量页，Then 展示今日/近 7 日/近 30 日 token 与调用次数，及可翻页的调用明细。
- **US-05 SDK 调用**：作为调用方，我想要用官方 OpenAI SDK 调用，以便零改造接入。
  - Given 持有有效 Key，When 以 `base_url=https://<平台域>/v1`、`api_key=sk-aihub-...` 发起 chat 请求，Then 返回 OpenAI 格式响应；`stream=true` 时按 SSE 逐块返回。
- **US-06 超限拒绝**：作为调用方，我想要在超限时得到明确拒绝，以便按提示退避。
  - Given Key 达到 RPM 上限，When 继续请求，Then 返回 429、`Retry-After` 头与 OpenAI 格式 `rate_limit_exceeded` 错误。
- **US-07 管理员代处置**：作为管理员，我想要查看并禁用任一用户的 Key，以便处置滥用。
  - Given 具备 `model_service.key.manage_all`，When 在管理视图禁用目标 Key，Then 该 Key 立即失效且操作记入审计。
- **US-08 全平台用量**：作为管理员，我想要查看全平台用量，以便评估 GPU 资源与成本。
  - Given 具备 `model_service.usage.read_all`，When 打开平台用量视图，Then 展示全平台汇总与按用户/按模型的 Top 视图。

### 6.3 主流程与分支

```text
主流程：登录 → 模型服务页 → 创建 Key（明文一次性）→ SDK 配置 base_url/api_key → 调用 /v1 → 200/流式返回 → 用量与明细可见
分支：Key 禁用后调用 → 401/403；超 RPM/TPM → 429；超日配额 → 429（daily）；vLLM 故障 → 502/504 + 熔断；轮换 → 旧钥立即失效
```

## 七、功能架构

### 7.1 总体架构

```text
调用方（OpenAI SDK）
   │ Bearer sk-aihub-...
   ▼
nginx /v1/ ──► apps/api（NestJS）
                 ├─ ApiKeyGuard（@Public + Bearer 解析 → HMAC 查库 → 状态/过期/限额预检）
                 ├─ LlmGatewayProxyController（/v1/*，转发适配器 + 熔断 + 超时）
                 └─ ModelServiceKeyController（/internal/model-service/*，登录态 + 权限）
                       │ 同步单行记账
                       ▼
                 PostgreSQL：llm_api_keys / llm_api_call_logs / llm_usage_daily
                       │ Outbox（llm.call.recorded）
                       ▼
                 apps/worker：用量聚合任务（usage_daily upsert）+ 日志保留清理
                 Prometheus：ai_hub_llm_* 指标（复用 ObservabilityMetrics 模式）
                 vLLM（GPU 服务器，OpenAI 兼容上游）
```

### 7.2 模块划分（`packages/server/src/llm-gateway/`）

| 文件/组件 | 职责 |
| --- | --- |
| `llm-gateway.module.ts` | 模块装配（controller/service/repository/guard/adapter） |
| `llm-gateway.controller.ts` | 网关面 `/v1`（`@Public()`，ApiKeyGuard） |
| `llm-gateway.exception.filter.ts` | 控制器级 OpenAI 错误信封过滤器（见 8.3；覆盖全局 ProblemDetailsFilter，含 `headersSent` 分流） |
| `model-service-key.controller.ts` | 控制面 `/internal/model-service`（`@Authenticated()` + `@RequiresPermissions`） |
| `llm-gateway.service.ts` | 转发、流式透传、错误映射、熔断状态 |
| `api-key.guard.ts` | Bearer 解析、HMAC 校验、状态校验、限额预检 |
| `quota.interceptor.ts` | RPM/TPM 进程内计数（复用固定窗口计数器思路）、日配额查询 |
| `vllm-upstream.adapter.ts` | 上游 HTTP 客户端（独立 agent/连接池、超时、取消） |
| `usage.recorder.ts` | 调用记录同步落库 + Outbox 事件发布 |
| `llm-gateway.repository.ts` | Kysely 数据访问 |
| `llm-usage-aggregation.worker.ts`（apps/worker） | `usage_daily` 聚合与保留清理 |

### 7.3 前端结构（apps/web）

| 位置 | 内容 |
| --- | --- |
| `router/routes.ts` | 新增 `modelService: "/model-service"`、`modelServiceKeyDetail: "/model-service/:keyId"` |
| `components/layout/Navigation.tsx` | 新增「模型服务」菜单（权限 `model_service.key.read`） |
| `modules/model-service/` | `model-service.client.ts`（API 客户端）、`useApiKeys.ts`、`useUsage.ts` |
| `pages/model-service/` | Key 列表页（创建弹窗含一次性明文展示与复制）、Key 详情页（echarts 用量图 + 调用明细表）、管理员视图（全平台 Key/用量） |

### 7.4 页面清单

| 页面 | 核心内容 | 主要操作 | 任务流位置 |
| --- | --- | --- | --- |
| 模型服务 / Key 列表 | Key 卡片/表格（名称、前缀、状态、限额、最近使用） | 创建、禁用/启用、轮换、删除、进入详情 | 入口页 |
| Key 详情 / 用量 | 近 30 日 token 与调用趋势图、按模型分布、调用明细表 | 刷新、翻页、筛选、返回 | 用量查看 |
| 平台用量（管理员） | 全平台汇总、Top 用户、Top 模型 | 筛选日期范围、代禁用入口 | 管理视图 |

### 7.5 状态机（API Key）

```text
active ──disable──► disabled ──enable──► active
  │                                        ▲
  └──revoke（删除/轮换）──► revoked（终态，不可恢复）
过期（expires_at < now）在鉴权时按 disabled 处理，状态列不变，详情页标注「已过期」
```

**状态规则（评审 R1-02 / R1-03 补充）**：

- **轮换无宽限期**：`rotate` 在同一事务内创建新 Key 并把旧 Key 置 `revoked`，旧 Key 立即不可用；需要并行过渡时，用户应先创建新 Key、切换完成后再禁用旧 Key。
- **revoked 是终态**：对 revoked Key 调 `enable` 返回 409 `MODEL_KEY_STATE_CONFLICT`；`disable`/`delete` 幂等（重复调用返回 200 与当前状态）。
- **派生状态**：接口统一返回 `effectiveStatus`（`active`/`disabled`/`revoked`/`expired`），由服务端时钟计算，避免前端各自实现过期判断造成时钟口径不一致。
- **员工在职校验**：鉴权时同时校验所属员工为在职（复用平台既有校验），员工停用即其全部 Key 不可用，不新增级联状态列。

## 八、接口规范

> 控制面错误统一走平台既有 ProblemDetails（`type/title/status/code/message/detail/traceId`）；网关面错误统一走 OpenAI 错误信封。两者不混用。

### 8.1 控制面（`/internal/model-service`，Cookie 会话鉴权 + 权限）

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| POST | `/keys` | `model_service.key.manage` | 创建 Key；响应含一次性明文 |
| GET | `/keys` | `model_service.key.read` | 本人 Key 列表（分页，不含明文；默认排除 revoked，`includeRevoked=true` 可查） |
| GET | `/keys/:keyId` | `model_service.key.read` | 详情（含限额与最近用量摘要） |
| PATCH | `/keys/:keyId` | `model_service.key.manage` | 变更名称/限额/过期（评审 R1-01 新增；不承载状态变更） |
| POST | `/keys/:keyId/disable` | `model_service.key.manage` | 禁用 |
| POST | `/keys/:keyId/enable` | `model_service.key.manage` | 启用（revoked 返回 409） |
| POST | `/keys/:keyId/rotate` | `model_service.key.manage` | 轮换（旧钥同事务置 revoked，无宽限期）；响应含新一次性明文 |
| DELETE | `/keys/:keyId` | `model_service.key.manage` | 删除（置 revoked，不物理删除，保留调用明细可查） |
| GET | `/keys/:keyId/calls` | `model_service.usage.read` | 调用明细（分页 + 时间/状态/模型筛选） |
| GET | `/usage` | `model_service.usage.read` | 本人用量汇总（今日/近 7 日/近 30 日序列） |
| GET | `/admin/keys` | `model_service.key.manage_all` | 全平台 Key 列表（项含 `owner`） |
| POST | `/admin/keys/:keyId/disable` | `model_service.key.manage_all` | 代禁用 |
| GET | `/admin/usage` | `model_service.usage.read_all` | 全平台用量（按用户/按模型 Top） |

分页与筛选复用平台既有 `packages/server/src/system/http/pagination.dto.ts` 的口径与响应形状，不新增第二套分页契约。

创建请求/响应示例：

```json
// POST /internal/model-service/keys
// 请求
{ "name": "notebook-dev", "expiresInDays": 90, "rpmLimit": 60, "tpmLimit": 100000, "dailyTokenLimit": 2000000 }
// 201 响应（apiKey 仅此次返回）
{ "keyId": "…", "name": "notebook-dev", "apiKey": "sk-aihub-….", "prefix": "sk-aihub-ab12cd34", "status": "active", "limits": { "rpm": 60, "tpm": 100000, "dailyTokens": 2000000 }, "expiresAt": "…", "createdAt": "…" }
```

限额字段均可空：为空时用平台默认（配置项 `LLM_DEFAULT_RPM/TPM/DAILY_TOKENS`）。列表/详情响应一律只含 `prefix`，不含明文与哈希。

**Key 响应 DTO（列表项与详情同构，详情额外含 `usageSummary`）**（评审 R1-05）：

| 字段 | 类型 | 口径 |
| --- | --- | --- |
| `keyId` | string | 主键 |
| `name` | string | 用户命名 |
| `prefix` | string | 明文前 16 字符（不含明文与哈希） |
| `status` | string | 存储状态：`active`/`disabled`/`revoked` |
| `effectiveStatus` | string | 派生状态，另含 `expired`（服务端时钟计算） |
| `limits` | object | `{ rpm, tpm, dailyTokens }`，`null` 表示使用平台默认 |
| `owner` | object? | 仅管理面返回：`{ employeeId, employeeName }` |
| `lastUsedAt` / `expiresAt` / `createdAt` / `disabledAt` | string? | ISO 8601；`disabledAt` 在启用后为 `null` |

**创建/变更请求校验规则**（越界返回 400 `MODEL_KEY_INVALID_LIMIT`）（评审 R1-05 / R2-06）：

| 字段 | 规则 |
| --- | --- |
| `name` | 必填，1–64 字符；同一用户内未撤销 Key 名称唯一 |
| `rpmLimit` | 可空；1–6000 且不高于平台上限 `LLM_MAX_RPM` |
| `tpmLimit` | 可空；1–10,000,000 且不高于 `LLM_MAX_TPM` |
| `dailyTokenLimit` | 可空；1–1,000,000,000 且不高于 `LLM_MAX_DAILY_TOKENS` |
| `expiresInDays` | 可空；1–365 |
| 活跃 Key 数量 | 每人 `active` + `disabled` 的 Key 数 ≤ `LLM_MAX_KEYS_PER_USER`（默认 10），超限返回 409 `MODEL_KEY_LIMIT_REACHED` |

**幂等与并发语义**（评审 R1-03 / R1-04）：

| 操作 | 重复调用 | 并发保护 |
| --- | --- | --- |
| disable / enable / delete | 幂等：重复调用返回 200 与当前状态；enable 对 revoked 返回 409 | 状态变更按 CAS 执行（`update … where key_id = ? and status = 期望前置状态`），未命中返回 409 `MODEL_KEY_STATE_CONFLICT`（沿用 `system/http/domain-error.ts` 的冲突映射） |
| rotate | 不支持重放：每次调用产生新 Key | 同上，旧钥 CAS 置 revoked |
| create | 同名（未撤销）返回 409 `MODEL_KEY_NAME_DUPLICATED` | 部分唯一索引兜底（见 9.1），不引入独立幂等键 |

**控制面错误码**（ProblemDetails 的 `code`，SCREAMING_SNAKE，与平台既有风格一致）（评审 R1-06）：

| 错误码 | HTTP | 场景 |
| --- | --- | --- |
| `MODEL_KEY_NOT_FOUND` | 404 | Key 不存在；**访问他人 Key 同样返回此码**，不泄露存在性 |
| `MODEL_KEY_STATE_CONFLICT` | 409 | 状态机不允许当前操作 / CAS 未命中 / 并发冲突 |
| `MODEL_KEY_NAME_DUPLICATED` | 409 | 同名未撤销 Key 已存在 |
| `MODEL_KEY_LIMIT_REACHED` | 409 | 活跃 Key 数量达上限 |
| `MODEL_KEY_INVALID_LIMIT` | 400 | 限额或有效期越界 |

### 8.2 网关面（`/v1`，Bearer 鉴权，OpenAI 兼容）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/v1/models` | 模型列表（透传上游）；**同样需 Bearer 鉴权并计入调用记录**（`endpoint=models`，tokens 记 0） |
| POST | `/v1/chat/completions` | 对话补全；`stream=true` 时 SSE 透传 |
| POST | `/v1/embeddings` | 向量化 |

**鉴权链**：`Authorization: Bearer sk-aihub-...` → HMAC-SHA256 计算 → 唯一索引查库 → 校验 `effectiveStatus=active` 且所属员工在职 → 限额预检（RPM/TPM 窗口 + 日配额）→ 放行转发。任一步失败即拒绝并记账（`status_code` 为 401/403/429，tokens 记 0）。

**边界约定（评审 R1-07 / R1-09）**：

- **不开放 CORS**：网关面不返回 CORS 响应头，API Key 禁止用于浏览器端直连（避免 Key 暴露在前端），仅限服务端与本地脚本调用；
- **熔断粒度**：本期为上游整体全局熔断（单上游），不做按模型粒度；
- **请求体上限**：沿用平台 body-parser 配置，超限返回 413 + OpenAI 信封；
- **版本兼容**：网关面语义对齐 OpenAI；未来破坏性变更须启用新前缀（如 `/v2`），不得原地破坏 `/v1` 契约。

网关错误信封（OpenAI 格式）：

```json
{ "error": { "message": "API Key 已禁用", "type": "invalid_request_error", "param": null, "code": "key_disabled" } }
```

| HTTP | type | code | 场景 |
| --- | --- | --- | --- |
| 400 | invalid_request_error | `invalid_request_error` | 请求体非法（含上游返回的上下文超限，message 附中文说明） |
| 401 | invalid_request_error | `invalid_api_key` | Key 不存在/格式错误 |
| 403 | invalid_request_error | `key_disabled` / `key_expired` / `key_revoked` | 存储状态不允许 |
| 403 | invalid_request_error | `employee_inactive` | 所属员工已停用（实现期新增，对应 §10.2 在职校验） |
| 404 | invalid_request_error | `model_not_found` | 模型不存在 |
| 413 | invalid_request_error | `payload_too_large` | 请求体超过平台上限（评审 R1-09 新增；上限由 `LLM_JSON_BODY_LIMIT_BYTES` 决定） |
| 429 | rate_limit_error | `rate_limit_exceeded` | 平台侧 RPM/TPM/日配额超限（附 `Retry-After` 头；M3 实现） |
| 429 | rate_limit_error | `upstream_rate_limited` | 上游 vLLM 自身限流（实现期新增，与平台配额区分开） |
| 500 | api_error | `internal_error` | 网关内部错误（不向外泄露内部细节；实现期新增兜底项） |
| 502 | upstream_error | `upstream_error` | 上游连接/响应错误（5xx、网络不可达） |
| 503 | service_unavailable | `circuit_open` | 熔断打开中（M3 实现） |
| 503 | service_unavailable | `gateway_not_configured` | 未配置 `LLM_GATEWAY_HMAC_SECRET` 或上游地址（实现期新增） |
| 504 | upstream_error | `upstream_timeout` | 上游超时（`LLM_UPSTREAM_TIMEOUT_MS`；流式另加首 token 超时） |


> 实现期回写说明：标注「实现期新增」的 5 项是 M1/M2 落地时补充的契约，均已在 `packages/server/src/llm-gateway/llm-gateway.errors.ts` 的 `GATEWAY_ERRORS` 中登记并由单测覆盖。临时项 `streaming_not_enabled` 已随 M3 流式落地**按约删除**。
>
> M3 新增的 429 `rate_limit_exceeded` 同时覆盖三个维度（日配额 / RPM / TPM），并在响应头带 `Retry-After`；诊断信息进入 `message` 而不新增信封字段，保持 OpenAI 形状不变。

`Retry-After` 口径（评审 R1-09）：整数秒；RPM/TPM 超限为当前窗口剩余秒数（1–60）；日配额超限为距次日 00:00（Asia/Shanghai）的剩余秒数，上限 86400。

流式约束（评审 R1-08 / R1-09）：SSE 事件格式与 OpenAI 一致（`data: {...}` / `data: [DONE]`）；**网关在调用方未显式设置时自动注入 `stream_options.include_usage = true`**，保证末块返回 usage 用于计量；上游仍未返回 usage 时按本地估算并置 `usage_estimated = true`（见 9.2）；**流式已下发 200 与部分块后上游失败**时不再改 HTTP 状态码，改为下发 `data: {"error": {...}}` 事件且**不发送 `[DONE]`**，调用方据此判定流异常结束；客户端断连时取消上游请求并记账为已取消；熔断对流式同样生效。

### 8.3 网关面与平台既有中间件的交互（落地形态，复审 R3）

> 本节为 R3 复审结论，对应 FR-23。以下机制**均已存在于代码中**；若实现前不对齐，将出现「本地可用、生产不可用」或「请求体被静默改写」。

| 平台既有机制 | 代码证据 | 不处理的后果 | 网关处置（必须） |
| --- | --- | --- | --- |
| 生产安全中间件：CSRF + 重放 nonce | `system/security/production.middleware.ts`（对所有 `POST/PUT/PATCH/DELETE` 生效，**无路径过滤**）、`csrf.ts`（要求 `Origin` 与 `PUBLIC_ORIGIN` 全等且 cookie/header 双 token 一致） | 服务端 SDK 不带 Origin/Cookie → **403**；补齐后仍 **409** `REPLAY_HEADERS_REQUIRED`（生产环境 `/v1` 全量不可用；开发环境该中间件关闭，本地测不出） | 为 `/v1/*` 增加**显式豁免**。安全依据：Bearer Key 非环境凭据，浏览器不会自动携带，CSRF 威胁模型不成立；该豁免须经安全评审并在代码注释中写明理由 |
| 全局 `ValidationPipe({ whitelist: true })` | `apps/api/src/main.ts` 装配，注释明确「未声明校验装饰器的字段会被剔除」 | 网关若声明校验 DTO，`tools`、`response_format`、厂商扩展等字段被静默剔除 → **兼容性静默破坏** | 网关请求体参数**不定型为 DTO**（`Record<string, unknown>` / 原始 `@Req()`），原样透传；仅提取 `model`、`stream` 用于路由与记账 |
| 全局异常过滤器 `ProblemDetailsFilter` | `system/observability/observability.module.ts` 以 `APP_FILTER` 全局注册，`catch()` 中无条件 `res.status().type().send()` | 网关错误被渲染成 problem+json，破坏 OpenAI 客户端解析；流式已发头后再写响应触发 headers already sent | 新增控制器级 `LlmGatewayExceptionFilter`（Nest 就近生效，覆盖全局）；以 `res.headersSent` 分流：未发头 → OpenAI 信封；已发头 → SSE `data: {"error": …}` 且不发 `[DONE]` |
| 全局守卫 `PermissionGuard` | `authorization/permission.guard.ts`：无鉴权元数据即 403；`public: true` 直接放行且**不设置 `request.actor`** | 漏标元数据的 `/v1` 路由直接 403；网关误读 actor 会抛 `ACTOR_NOT_AVAILABLE` | 网关控制器类级 `@Public()`；Key 上下文由 `ApiKeyGuard` 自建（挂到 `request.apiKey`）；补「漏标元数据 → 403」的断言用例 |
| JSON body 上限 `1mb` | `apps/api/src/body-parser.ts` 的 `JSON_BODY_LIMIT` | 长上下文请求易超限；中间件层超限错误不经全局过滤器，**不产出 OpenAI 信封** | 仿既有 `isRawUploadContentRequest` carve-out 模式，为 `/v1/*` 单独注册解析器（`LLM_JSON_BODY_LIMIT`，默认 10mb），并显式映射 413 + OpenAI 信封 |
| HTTP 时长指标覆盖整个响应 | `request-context.middleware.ts` 在 `finish`/`close` 记录 | 流式请求的 HTTP 时长包含生成时间，不能用于衡量网关自身开销 | 新增专用指标 `ai_hub_llm_gateway_duration_seconds{phase=ttfb\|total}`；HTTP 指标仅作对照 |

**nginx 必配（对应 FR-24；结论已实证，见验证报告）**：`infra/docker/nginx.conf` 与 `infra/docker/nginx.production.conf` 均须增加 `/v1/` 独立 location。

```nginx
location /v1/ {
  proxy_pass http://api:3001;        # dev 配置沿用既有 $api_upstream 变量写法
  proxy_http_version 1.1;
  proxy_read_timeout 300s;           # 必需：默认 60s，上游空闲超 60s 即断流（实测 +60.07s 切断）
  proxy_send_timeout 300s;           # 必需：对称放宽
  proxy_buffering off;               # 建议：响应头提前到首个数据块之前；防御未来压缩/缓存中间层
  proxy_cache off;                   # 建议：同上
  proxy_set_header Connection "";
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}
```

**实证结论（nginx 1.29.4，2026-10-13 实测）**：

- **必需项已复现**：默认 `proxy_read_timeout 60s` 时，上游空闲 70s 的连接在 **+60.07s 被切断**（`UND_ERR_SOCKET`）；改为 300s 后存活并正常收到后续事件。LLM 首 token 等待或思考间隔超 60s 会以「半截回答 + 报错」形式暴露给调用方——这是本项被评为 P0 的真实依据。
- **纠偏**：`proxy_buffering on`（默认）**不会**把小块 SSE 整段缓冲（三组对照实测均按 1s 间隔分块到达；把上游响应类型换成 `text/plain` 结果相同，证明与内容类型无关）。可观测差异仅为**响应头延迟到首个数据块**（+1.05s，对照 `proxy_buffering off` 的 +0.05s），故该项列为建议而非阻断项。
- **等效第二路径**：上游响应带 `X-Accel-Buffering: no` 时表现与 `proxy_buffering off` 一致——网关对 SSE 响应同时带上该头作为纵深防御（主控制点仍在 nginx 配置）。
- **路由缺失属配置级故障**：两份配置当前均无 `/v1/`，缺失时请求会落到 `location /` 的 web 上游（返回前端页面而非 401/404）。

**验收要求（M2 退出条件之一）**：以「curl 逐块到达时间戳」与「OpenAI SDK 流式回调间隔」双证据确认链路可用，**并补一条空闲哨兵用例**（上游空闲 > 60s 后仍能收到后续事件）；仅本地直连 API 端口通过不算验收（本地不经 nginx，测不出该类问题）。

**落地状态（2026-10-13）**：

- ✅ **已落地**：① 两份 nginx 配置的 `/v1/` location（含 `proxy_read_timeout 300s` / `proxy_send_timeout 300s` / `proxy_buffering off`）；② 生产安全中间件对 `/v1` 的 CSRF/重放豁免（`API_KEY_AUTH_PATH_PREFIXES`，含前缀边界匹配，`/v1-evil` 不放过；配套 9 个单测）；③ `/v1` **刻意不套** nginx `limit_req`（其 503 + HTML 会破坏 OpenAI 错误信封，配额统一由网关按 Key 维度执行并返回 429 + OpenAI 信封）。
- ✅ **M2 已落地**：控制器级 `LlmGatewayExceptionFilter`（覆盖全局 ProblemDetails，含 `headersSent` 分流）、`/v1` 的 JSON body 上限 carve-out（`LLM_JSON_BODY_LIMIT_BYTES`）、上游适配器不转发任何客户端头（含 `Authorization`）。
- ✅ **M3 已落地**：无效 Key 的 IP 级预检（只统计「凭据无效」，不牵连合法 Key 的状态问题）；`/v1` 的错误码表新增 429 `rate_limit_exceeded`（含 `Retry-After`）。
- **已取证**：`nginx -t` 两份配置语法通过；活体 HTTP 验证 `/v1/*` 正常放行、`/v1-evil/*` 与 `/internal/*` 仍返回 403、豁免路径不触达重放存储。

## 九、数据模型

> 迁移编号 `0056_llm_gateway_foundation.ts`，遵循仓库迁移规范：幂等 DDL（`if not exists`）、文件头注释说明取舍依据。表结构同步登记到 `packages/database/src/schema.ts`。

### 9.1 `llm_api_keys`

| 列 | 类型 | 约束/口径 |
| --- | --- | --- |
| `key_id` | uuid | PK，`gen_random_uuid()` |
| `employee_id` | varchar(64) | NOT NULL，FK → `employees(employee_id)`；**必须与平台员工主键类型一致**（`employees.employee_id` 是 varchar(64)，写成 uuid 建不出外键） |
| `name` | varchar(64) | NOT NULL，用户自取名称 |
| `key_prefix` | varchar(24) | NOT NULL，Key 前 16 字符（展示用） |
| `key_hash` | varchar(64) | NOT NULL，UNIQUE；HMAC-SHA256(key, 服务端密钥) hex |
| `status` | varchar(16) | NOT NULL DEFAULT `active`；`active`/`disabled`/`revoked` |
| `rpm_limit` / `tpm_limit` | int | 可空；空=平台默认 |
| `daily_token_limit` | bigint | 可空；空=平台默认 |
| `expires_at` | timestamptz | 可空；过期按禁用处理 |
| `last_used_at` | timestamptz | 可空；最近一次成功调用 |
| `rotated_from_key_id` | uuid | 可空，自引用；轮换谱系 |
| `created_at` / `updated_at` / `disabled_at` | timestamptz | NOT NULL DEFAULT now()（`disabled_at` 可空：仅记录最近一次禁用时刻，**启用时清空为 NULL**，评审 R2-08） |

索引：`key_hash` 唯一索引（查找主路径）；`(employee_id, status, created_at desc)`（列表）；**部分唯一索引 `(employee_id, name) where status <> 'revoked'`**（同名防重，允许撤销后复用名称，评审 R2-05；由数据库约束兜底，不依赖 check-then-insert）。

### 9.2 `llm_api_call_logs`（100% 调用记录，同步单行写入）

| 列 | 类型 | 口径 |
| --- | --- | --- |
| `call_id` | uuid | PK |
| `key_id` / `employee_id` | uuid | NOT NULL |
| `endpoint` | varchar(32) | `chat_completions`/`embeddings`/`models` |
| `model` | varchar(64) | 归一化模型名：取上游响应 `model`，缺省回退请求值并截断至 64（评审 R2-03；防止调用方伪造任意模型字符串撑爆聚合表主键） |
| `stream` | boolean | NOT NULL DEFAULT false |
| `prompt_tokens` / `completion_tokens` / `total_tokens` | int | 上游返回口径；失败/拒绝记 0 |
| `duration_ms` | int | 网关侧耗时 |
| `status_code` | int | 网关返回给调用方的状态码 |
| `error_code` | varchar(32) | 可空（见 8.2 code 表） |
| `usage_estimated` | boolean | NOT NULL DEFAULT false；上游未返回 usage 时按本地估算并置 true（评审 R2-04）；看板与对账须能区分估算值与上游实测值 |
| `trace_id` | varchar(64) | 关联请求追踪 |
| `requested_at` | timestamptz | 请求**开始时刻**（记账时显式传入 `startedAt`，非记账时刻），用于业务日归属（评审 R2-09） |

索引：`(employee_id, requested_at desc)`、`(key_id, requested_at desc)`、`(requested_at)`（保留清理）。

### 9.3 `llm_usage_daily`（看板聚合，worker 维护）

| 列 | 类型 | 口径 |
| --- | --- | --- |
| `usage_date` | date | 统计日（UTC+8 业务日） |
| `employee_id` / `key_id` | uuid | NOT NULL |
| `model` | varchar(64) | NOT NULL |
| `calls` / `error_calls` | bigint | 调用数/失败数 |
| `prompt_tokens` / `completion_tokens` / `total_tokens` | bigint | token 累加 |

PK `(usage_date, employee_id, key_id, model)`；worker 每 5 分钟从 `llm_api_call_logs` upsert 聚合；看板查询优先读本表，缺失日期回查日志表。

### 9.4 口径与保留策略

- **业务日定义**（评审 R2-02）：业务日 = `Asia/Shanghai` 自然日；服务器与数据库可能运行于 UTC，必须显式换算，**禁止依赖数据库会话时区隐式切分**。
- **日配额判定**：按员工维度累计当日 token：

```sql
select coalesce(sum(total_tokens), 0)
from llm_api_call_logs
where employee_id = $1
  and requested_at >= date_trunc('day', now() at time zone 'Asia/Shanghai') at time zone 'Asia/Shanghai'
```

  叠加进程内当日已放行修正（防重启漂移）；软限额，并发窗口内可能少量超额，PRD 明确接受。
- **性能与演进**（评审 R2-01，部分采纳）：该查询走 `(employee_id, requested_at)` 索引，估算 P95 < 10ms（每日 10 万行以内）；超过该量级时改为读 `llm_usage_daily` + 进程内修正，把「鉴权口径」与「看板口径」分离。不改为纯异步聚合，理由是配额判定需可对账、口径唯一。
- **归属日**：以请求开始时刻（`startedAt`）归属业务日，跨零点长请求不重复计入次日。
- **保留**：`llm_api_call_logs` 保留 180 天（与行为事件一致），`llm_usage_daily` 长期保留；清理任务入 worker（复用现有 retention runner 模式）。
- **幂等**：Key 创建/轮换/禁用均以数据库约束与状态机保证，无资金操作，不涉及对账。
- **落地形态（复审 R4；2026-10-13 已实证）**：
  - 时区表达式在仓储层封装为**单一常量**，禁止各调用点各写一份；业务日切换点 = UTC 16:00 已实测确认（四项边界断言全部通过）；
  - `(employee_id, requested_at)` 索引命中已实测确认（参数化查询走 Bitmap Index Scan，2.19ms；无索引退化为 Parallel Seq Scan，41.78ms，约 19 倍差距；两次结果对账一致）——集成测试仍须断言计划形态，防后续迁移或统计信息变化导致退化；
  - **配额口径纠偏**：若误用 UTC 日切分，配额窗口重置发生在北京时间 **08:00**（非零点），并漏算当日 00:00–08:00 的用量（实测该窗口命中 0 行）；
  - **日配额去掉了进程内修正项**（范围调整）：该修正原本是为「记账异步」准备的，而 M3 采用同步单行记账（PRD 9.2 的决定），调用一结束就已入库，修正项反而成为第二个不一致来源。口径因此唯一：**DB 即事实**；
  - 预检语义：**只比对已用量，不做预留**；并发窗口内的少量超额由下一次请求被拒自愈，禁止引入预留导致复杂度与死锁风险；
  - 看板口径：`llm_usage_daily` 聚合延迟上界 5 分钟，页面须标注「非实时配额余量」，避免与鉴权口径混淆。

## 十、安全策略

### 10.1 Key 生成与存储

- 生成：`sk-aihub-` + 32 位 base62 随机串（`crypto.randomBytes`，约 190 bit 熵）；
- 存储：仅存 HMAC-SHA256 哈希（服务端密钥经配置注入，不入库）；明文仅在创建/轮换响应体返回一次，不落库、不入日志（logger 脱敏 `sk-aihub-` 前缀）；
- 查找：按哈希唯一索引 O(1) 定位；响应只回前缀。
- **密钥管理**（评审 R2-07）：HMAC 密钥来自配置 `LLM_GATEWAY_HMAC_SECRET`（不入库）；支持 `LLM_GATEWAY_HMAC_SECRET_PREVIOUS` 双密钥过渡——校验时先新后旧，过渡期结束后移除旧密钥，避免密钥轮换导致全部 Key 一次性失效（应急 runbook 同步更新）。
- **响应缓存**（评审 R1-10）：含一次性明文的响应必须携带 `Cache-Control: no-store`；前端不得把明文写入 localStorage 或任何持久化缓存（沿用平台「不持久化会话凭据」的既有约定），明文仅存在于当前页面内存，离开页面即清除。

### 10.2 鉴权与权限模型

- 网关面：`@Public()` 绕过会话鉴权，由 `ApiKeyGuard` 独立校验 Bearer；失败拒绝均记账；
- 控制面：沿用平台 Cookie 会话 + `@RequiresPermissions`；新增权限码（迁移 0056 授予 `employee` 前三项，全平台项仅 `super_admin`）：

| 权限码 | 说明 | 默认授予 |
| --- | --- | --- |
| `model_service.key.read` | 查看本人 Key | employee |
| `model_service.key.manage` | 管理本人 Key | employee |
| `model_service.usage.read` | 查看本人用量 | employee |
| `model_service.key.manage_all` | 管理全部 Key | super_admin |
| `model_service.usage.read_all` | 查看全平台用量 | super_admin |
| `model_service.gateway.config.manage` | 网关配置管理 | super_admin |

- 数据权限：所有查询强制 `employee_id = 当前actor`，管理面显式切换全平台条件；越权访问按 404 处理（不泄露存在性，沿用平台口径）。
- 在职校验（评审 R2-09 连带）：网关鉴权与控制面访问均校验员工在职状态，停用员工全部 Key 立即不可用；不引入额外的 Key 状态列。

### 10.3 传输、审计与应急

- 传输：生产经 nginx TLS；Key 不出现在 URL query；
- 审计：Key 创建/禁用/启用/轮换/删除、管理员代操作全部写入平台安全审计（复用 `AuditService`），含 actor、对象、结果；
- 应急：疑似泄露 → 用户轮换或管理员批量禁用；HMAC 密钥泄露 → 轮换服务端密钥将使全部 Key 失效，需提前公告（记入 runbook）。

## 十一、监控指标与埋点

### 11.1 Prometheus 指标（`ai_hub_llm_` 前缀，prom-client，沿用 ObservabilityMetrics 模式）

| 指标 | 类型 | 标签 |
| --- | --- | --- |
| `ai_hub_llm_gateway_requests_total` | Counter | endpoint, model, status_code |
| `ai_hub_llm_gateway_duration_seconds` | Histogram | endpoint |
| `ai_hub_llm_gateway_tokens_total` | Counter | model, type(prompt/completion) |
| `ai_hub_llm_gateway_rate_limited_total` | Counter | reason(rpm/tpm/daily) |
| `ai_hub_llm_gateway_upstream_errors_total` | Counter | reason(timeout/http_5xx/network) |
| `ai_hub_llm_gateway_circuit_state` | Gauge | state(closed/half_open/open) |
| `ai_hub_llm_active_streams` | Gauge | — |
| `ai_hub_llm_keys_active` | Gauge | —（采集时查库） |

### 11.2 告警规则（Prometheus 规则；Alertmanager 通道待确认，缺位时先看板+日志）

| 告警 | 条件 | 级别 |
| --- | --- | --- |
| 网关错误率升高 | 5 分钟 5xx+429 占比 > 20% | P1 |
| 熔断打开 | `circuit_state=open` 持续 5 分钟 | P1 |
| 上游不可用 | `upstream_errors_total` 速率 > 0 且 requests≈0 | P1 |
| 限流频繁 | 单 Key 1 小时内 `rate_limited_total` > 100 | P3 |
| 配额临近耗尽 | 当日用量 > 90% 配额的活跃用户数环比突增 | P3 |

### 11.3 埋点与看板

- 网关调用以 `llm_api_call_logs` 为事实来源（不做第二套埋点）；控制面操作走安全审计，不重复埋点；
- Grafana/看板：调用量与 token 趋势、延迟分位、错误与限流分布、Top 用户/模型、熔断状态（指标口径与 9.4 一致）。

## 十二、异常处理清单

| 场景 | 处理 |
| --- | --- |
| 请求体非法/缺字段 | 400 + OpenAI 信封，`param` 指出字段 |
| 上下文超限（上游 400） | 映射 400，message 附中文说明与上限提示 |
| 模型不存在 | 404 `model_not_found` |
| Key 不存在/格式错 | 401 `invalid_api_key` |
| Key 禁用/撤销/过期 | 403 对应 code，提示去控制面处理 |
| RPM/TPM 超限 | 429 + `Retry-After`（窗口剩余秒数） |
| 日配额超限 | 429，message 说明重置时间（次日 00:00 UTC+8） |
| 上游 5xx/网络错误 | 502 `upstream_error`，计入熔断 |
| 上游超时 | 504（首 token 30s / 整体 120s），流式已下发部分保持断流 |
| 熔断打开 | 503 `circuit_open` + `Retry-After` |
| 客户端断流 | 取消上游，记账 status=499 语义（`client_disconnected`） |
| 进程重启 | 限流窗口清零（V1 接受）；日配额以 DB 为准恢复 |
| 并发轮换/禁用 | 状态机 + 行版本保证，后者覆盖前者均有明确结果 |

## 十三、非功能性需求

| 类别 | 需求 |
| --- | --- |
| 性能 | 网关附加延迟 P95 ≤ 50ms（估算，不含生成）；流式首 token 透传不缓冲；单实例 50 QPS 非流式（估算，达阈值启动方案 B 演进） |
| 可用性 | vLLM 故障经熔断隔离，平台其余接口不受影响；API 重启后 Key 与配额状态不丢失 |
| 兼容 | OpenAI 官方 Python/Node SDK 近两个大版本；SSE 事件与 OpenAI 一致 |
| 安全 | Key 不明文存储/日志；TLS 传输；审计全覆盖；脱敏规则沿用平台 |
| 可访问性 | Console 页面键盘可达、对比度满足平台规范 |
| 容量 | `llm_api_call_logs` 按 180 天保留设计；单 Key 默认 RPM 60/TPM 100k/日 2M tokens（默认值，可配） |

## 十四、里程碑与上线计划

> 按仓库治理：以证据为退出条件，不承诺日历日期；工作量为人日估算。

| 里程碑 | 内容 | 退出条件（证据） | 状态 | 估算 |
| --- | --- | --- | --- | --- |
| M0 需求确认 | 本 PRD 评审；关键假设 A1–A4 关闭 | 评审记录；假设逐条确认 | ✅ 完成（v1.4 定稿；A1/A3/A4 关闭，A2 挂 M2） | 1 |
| M1 基础骨架 | 迁移 0056、配置项、模块装配、Key CRUD 控制面 + 单测 | 类型检查 + 单测绿；真实 PG 应用迁移 | ✅ **完成**（2026-10-13，证据见下） | 5 |
| M2 网关连通 | `/v1/models` + 非流式 chat、Bearer 鉴权、错误映射 + e2e | OpenAI SDK 对真实 vLLM 调通（含 401/404 负向） | ✅ **代码与桩验证完成**（2026-10-13）；**真实 vLLM 联调待内网环境**（开发机不可达 10.10.181.82:3040） | 5 |
| M3 流式与配额 | streaming、RPM/TPM/日配额、429 语义、熔断、无效 Key 的 IP 级预检、**调用记录写入** | 限流与熔断用例绿；断流取消验证 | ✅ **完成**（2026-10-13，证据见下） | 5 |
| M4 用量与看板 | `usage_daily` 聚合 worker、Console 页面、`/admin/*` 管理面 | 看板数字与 call_logs 对账一致；页面四态齐全 | 🔧 **后端完成**（聚合 + 用量/管理面 API + worker 周期任务）；**前端 Console 页面待下一步** | 5 |
| M5 监控与上线 | 指标、告警规则、灰度、runbook | 告警演练送达；上线后验证清单执行 | 未开始 | 3 |

**M1 交付记录（2026-10-13）**：

| 交付物 | 落点 | 证据 |
| --- | --- | --- |
| 迁移 0056（三表 + 6 索引 + employee 权限对齐，含完整回退） | `packages/database/src/migrations/0056_llm_gateway_foundation.ts`、`schema.ts`、`migrate.ts`、`authorization/system-roles.ts` | 真库集成 13 项通过（表/索引/权限/唯一索引/CAS/事务/FK 均验证） |
| 配置项（HMAC 双密钥、配额上限、每人 Key 上限、body 上限、上游超时） | `packages/config/src/runtime-config.ts`、`.env.example` | `@ai-hub/config` 20 tests 通过 |
| 权限码与契约 | `packages/contracts/src/identity.ts`（6 个 `model_service.*`） | contracts 类型检查通过 |
| 控制面 CRUD（创建/列表/详情/改属性/禁用/启用/轮换/删除） | `packages/server/src/llm-gateway/*`、`apps/api/src/api.module.ts`、`main.ts` | 单测 25 项（hasher 7 + service 18）通过；装配断言防止漏接线 |
| 错误码映射 | `system/http/domain-error.ts`（三个冲突码登记为 409） | `domain-error.spec.ts` 7 项通过 |
| 质量闸口 | — | `typecheck`（server/api/config/contracts/database）通过；`pnpm boundaries` 691 模块 0 违规；`lint` 通过 |

**M1 未含（按范围显式推迟）**：`/admin/*` 全平台管理面（M4）、`/v1` 转发与配额执行（M2/M3）、Console 页面（M4）。

**M2 交付记录（2026-10-13）**：

| 交付物 | 落点 | 证据 |
| --- | --- | --- |
| 网关面控制器与路由（`GET /v1/models`、`POST /v1/chat/completions`） | `packages/server/src/llm-gateway/llm-gateway.controller.ts` | 端到端 10 项通过；**发现并修复真实缺陷**：Nest 对 POST 默认 201，已显式覆盖为 OpenAI 要求的 200 |
| Bearer 鉴权守卫（双密钥候选、状态/在职校验、`last_used_at`） | `api-key.guard.ts` | 守卫单测 11 项；端到端覆盖 401/403（disabled/revoked） |
| 上游适配器（不转发客户端头、超时/网络/HTTP 分类） | `vllm-upstream.adapter.ts` | 适配器单测 6 项（含真实本地 HTTP 桩断言「不转发 Authorization」） |
| 服务层错误映射与透传 | `llm-gateway.service.ts`、`llm-gateway.errors.ts` | 服务单测 10 项；端到端覆盖 400/404/429/502/504 |
| 控制器级 OpenAI 错误信封过滤器 | `llm-gateway.exception.filter.ts` | 过滤器单测 9 项（含 `headersSent` 分流） |
| `/v1` body 上限 carve-out 与 413 信封 | `apps/api/src/body-parser.ts` | 端到端断言 413 为 OpenAI 信封 |
| 配置与编排 | `compose.yaml`、`.env.example`、`main.ts`、`api.module.ts` | 上游基址/超时/限额全部可配 |
| 质量闸口 | — | typecheck 5 包通过；llm-gateway 单测 61；控制面集成 13；网关集成 10；boundaries 702 模块 0 违规；lint 干净 |

**M4 后端交付记录（2026-10-13）**：

| 交付物 | 落点 | 证据 |
| --- | --- | --- |
| 用量聚合（按业务日 delete-then-insert 幂等重算，含 `calls`/`error_calls`/三段 token） | `llm-usage.repository.ts`、`llm-usage-aggregator.ts` | 真库集成 11 项（幂等不翻倍、重算非累加、业务日边界、三类查询、缺口扫描、与日配额口径一致） |
| worker 周期聚合（启动即跑 + 5 分钟 + 30 天缺口自愈） | `apps/worker/src/main.ts` | 启动/间隔/关闭清理接线；聚合器单测 6 项 |
| 用量查询服务（今日/7 日/30 日 + 自定义区间、当日实时兜底） | `model-service-usage.service.ts` | 服务单测 12 项（含区间校验与 `todayPartial` 兜底） |
| 用量/管理面 API（本人 + 全平台；Key 代禁用/启用写审计） | `model-service-usage.controller.ts`、`model-service-key.service.ts` | 权限码 `model_service.usage.read(_all)` / `key.manage_all`；共享错误映射器（两个控制面控制器复用） |
| 质量闸口 | — | typecheck 7 包通过；llm-gateway 单测 **126**；模型服务集成 **42**；boundaries 722 模块 0 违规；lint 干净 |

**M4 后端设计要点**：聚合采用「按业务日先删后插」而非 upsert 累加——upsert 在重跑时会把当日数字翻倍，而 worker 会周期重算当天，幂等是硬要求；日配额判定直接读事实表、**不依赖聚合**，因此聚合间隔只影响看板新鲜度；当日读模型未就绪且事实表已有数据时，看板实时兜底并显式标注 `todayPartial`，避免显示成假的 0。

**M4 待做（前端）**：Console 用量看板（今日/7/30 日 + 日趋势 + 按模型/Key 构成 + 明细表，四态齐全）、管理面页面（全平台 Key 列表与代禁用）。

**M3 交付记录（2026-10-13）**：

| 交付物 | 落点 | 证据 |
| --- | --- | --- |
| 流式 SSE 透传（注入 `stream_options.include_usage`、首 token/整体超时、中途失败与断流契约） | `llm-gateway.service.ts`、`vllm-upstream.adapter.ts`、`llm-gateway.sink.ts` | 服务单测 10 项 + 端到端 9 项（逐块到达、usage 末块、超时/中途失败/断流的 SSE 形态） |
| 配额与限流（加权固定窗口 RPM/TPM + 日配额 + 无效 Key 的 IP 预检） | `llm-quota.ts`、`api-key.guard.ts` | 配额单测 9 项；端到端 429 + `Retry-After` |
| 熔断（阈值/打开时长/半开单探测） | `upstream-circuit-breaker.ts` | 状态机单测 7 项；端到端 503 `circuit_open` |
| 调用记录（100% 落账，含拒绝与断流） | `llm-call-log.repository.ts`、服务与守卫 | 端到端逐类核对台账（200/429/502/504/499 与 `usage_estimated`） |
| 业务日口径（上海无 DST，固定 +08 算术） | `llm-business-day.ts` | 单测 6 项 + **真库断言与 PRD 的 SQL 表达式逐点等价** |
| 质量闸口 | — | typecheck 5 包通过；llm-gateway 单测 **98**；集成 **31**（22 + 9）；boundaries 712 模块 0 违规；lint 干净 |

**M3 实现期发现并修复的缺陷（均由测试暴露）**：① `@Res()` 下框架仍会给 POST 默认 201，`flushHeaders()` 会把它写出去 → 显式 `@HttpCode(200)`；② 断流检测原先挂在**请求**的 `close` 上（请求体读完后不再反映客户端中断）→ 改挂**响应**的 `close` 并用 `writableFinished` 区分正常收尾。

**M2 遗留（如实记录）**：真实 vLLM 联调未做（开发机不通内网 10.10.181.82:3040，实测 8s 超时）；模型 id 与 256k 上下文上限需在联调时以 `GET /v1/models` 核对（名称含空格）。

**依赖评估**：

| 依赖 | 所属 | 分级 | 说明 |
| --- | --- | --- | --- |
| vLLM 服务部署与网络连通 | 基础设施 | **联调阻塞（非开发阻塞）** | 地址/模型/上下文上限已提供（见 4.3 A2）；**开发机不通内网**，故 M2 用上游桩验证，真实联调与 256k 上限核对待内网环境 |
| Alertmanager 告警通道 | 运维 | 并行 | 缺位时降级为看板+日志，不阻塞上线 |
| 多模型配置 | 平台配置 | 可绕过 | 单模型也可上线，`/v1/models` 透传当前模型 |

**部署前置（复审 R3）**：① ✅ 两份 nginx 配置的 `/v1/` location —— 已落地；② ✅ 生产安全中间件对 `/v1` 的 CSRF/重放豁免 —— 已落地，含单测与活体 HTTP 验证；③ ⏳ 网关控制器级异常过滤器与 `/v1` body parser carve-out —— 随 M2 网关模块落地，**上线前缺一不可**。

**上线与回滚**：nginx `/v1/` 路由与 vLLM 服务配置化开启；灰度按「先管理员 Key → 后全员」；回滚=关闭网关路由 + 禁用新 Key 创建（数据保留，不清库）。

**上线后验证**：真实 SDK 抽检（流式/非流式）、429 行为复测、看板与日志对账、熔断与告警演练、密钥泄露应急流程走查。

## 十五、风险与遗留问题

| 编号 | 风险 | 等级 | 应对 | 状态 |
| --- | --- | --- | --- | --- |
| RK-01 | Key 明文一次性展示，用户丢失需轮换；存储泄露批量失效 | 高 | HMAC 存储 + 轮换 + 管理员批量禁用 + 应急 runbook | 跟踪中 |
| RK-02 | 网关同进程被 vLLM 慢响应拖累 | 高 | 独立连接池、30s/120s 超时、熔断、演进方案 B 触发条件 | 跟踪中 |
| RK-03 | 上游原生错误透传难懂 | 中 | 统一 OpenAI 信封 + 中文 message | 已设计 |
| RK-04 | 配额口径不清致误杀/超卖 | 中 | 口径见 9.4；默认值可配 | 已设计 |
| RK-05 | 记账影响转发延迟 | 中 | 同步单行 insert（P95 影响 <5ms 估算）；聚合异步 | 已设计 |
| RK-06 | 范围蔓延（计费/多租户/多模型源） | 中 | 本期显式不做；变更走评估表 | 跟踪中 |
| RK-07 | 限流窗口重启清零 | 低 | V1 接受；多实例演进时迁移共享存储 | 已记录 |

**遗留问题**：① Alertmanager 通道是否存在待运维确认；② ✅ 已回填：`Qwen3.5 35B A3B`、256k tokens、基址 `http://10.10.181.82:3040/v1`（见 4.3 A2）；联调时仍需以 `GET /v1/models` 核对模型 id；③ ✅ 基线回填已完成（登记为 REQ-MDL-01~06，见 `docs/requirements/README.md` §3.8）；④ **多 Key 放大**：RPM/TPM 按 Key 维度计算，用户可通过创建多个 Key 放大并发（每人活跃上限 10 已缓解）；用户级 RPM 兜底列入后续版本（评审 R1-10 连带，本轮未纳入范围）；⑤ `char(64)` 定长哈希列与 `trace_id` 索引两条低优意见不予采纳，理由见评审记录。

## 十六、附录

### 16.1 需求追踪矩阵（RTM）

| 需求 | 描述 | PRD 章节 | 测试用例 | 状态 |
| --- | --- | --- | --- | --- |
| FR-01 | Key 创建（明文一次性、限额、过期） | 7.5/8.1 | TC-01 | ✅ M1 已实现（真库集成已验） |
| FR-02 | Key 列表与详情（仅前缀） | 8.1 | TC-02 | ✅ M1 已实现（真库集成已验） |
| FR-03 | 禁用/启用（立即生效） | 7.5/8.1/8.2 | TC-03 | ✅ M1 已实现（控制面；网关侧生效待 M2） |
| FR-04 | 轮换（旧钥立即失效） | 7.5/8.1 | TC-04 | ✅ M1 已实现（同事务撤销，真库已验） |
| FR-05 | 删除（revoked 终态） | 7.5/8.1 | TC-05 | ✅ M1 已实现（软删幂等） |
| FR-06 | Bearer 鉴权与 401/403 语义 | 8.2/10.2 | TC-06 | ✅ M2 已实现（六类负向 + 双密钥过渡，端到端已验） |
| FR-07 | `/v1/models` 透传 | 8.2 | TC-07 | ✅ M2 已实现（端到端已验） |
| FR-08 | chat/completions（流式+非流式） | 8.2 | TC-08 | ✅ M3 已实现（SSE 逐块透传 + 中途失败/断流契约，端到端已验） |
| FR-09 | embeddings | 8.2 | TC-09 | ✅ M3 已实现（含记账，端到端已验） |
| FR-10 | OpenAI 错误信封映射 | 8.2 | TC-10 | ✅ M2 已实现（14 项错误表 + headersSent 分流，端到端已验） |
| FR-11 | RPM/TPM 限流 | 8.2/9.4 | TC-11 | ✅ M3 已实现（加权固定窗口，单测已验） |
| FR-12 | 日 token 配额 | 8.2/9.4 | TC-12 | ✅ M3 已实现（按员工读调用记录，端到端 429 已验） |
| FR-13 | 熔断与恢复 | 8.2/十三 | TC-13 | ✅ M3 已实现（状态机单测 + 端到端 503 已验） |
| FR-14 | 100% 调用记录 | 9.2/11.3 | TC-14 | ✅ 已实现（写入 M3 + 聚合 M4）；看板页面待 M4 前端 |
| FR-15 | 用量汇总与明细 | 8.1/9.3 | TC-15 | 🔧 后端已实现（今日/7/30 日汇总、日趋势、按模型/Key 构成、明细分页）；Console 页面待 M4 前端 |
| FR-16 | 管理面（全平台视图与代禁用） | 8.1/10.2 | TC-16 | 🔧 后端已实现（全平台 Key 列表含归属人、代禁用/启用、全平台用量；权限码 `*_all`） |
| FR-17 | 生命周期审计 | 10.3 | TC-17 | ✅ 已实现（本人 + 管理面代操作，审计含归属人与操作人） |
| FR-18 | 配置化默认值 | 8.1/十三 | TC-18 | ✅ 已实现（Key 未设限额时由配额层消费平台默认值） |
| FR-19 | Key 属性变更（名称/限额/过期） | 8.1 | TC-19 | ✅ M1 已实现 |
| FR-20 | 幂等与并发语义（CAS、同名防重、活跃上限） | 7.5/8.1/9.1 | TC-20 | ✅ M1 已实现（真库 CAS/部分唯一索引已验） |
| FR-21 | 流式 usage 保障（`stream_options` 注入与估算标记） | 8.2/9.2 | TC-21 | ✅ M3 已实现（自动注入 + 估算兜底 + `usage_estimated` 标记，端到端已验） |
| FR-22 | 网关面边界（无 CORS、413、`Retry-After` 口径、版本兼容） | 8.2 | TC-22 | 待开发 |
| FR-23 | 网关与平台既有中间件交互（CSRF 豁免、请求体透传、控制器级错误过滤器、`@Public()` 约束、body 上限、指标口径） | 8.3 | TC-23 | 部分落地（豁免已落地；过滤器与 body carve-out 待 M2） |
| FR-24 | SSE 端到端链路（nginx 关缓冲与放宽超时，逐块到达验收） | 8.3/十四 | TC-24 | 部分落地（路由与超时已落地并语法校验；端到端验收待 M2） |
| FR-25 | 配额 SQL 落地断言（业务日边界 = UTC 16:00、索引命中、修正生命周期） | 9.4/16.3 | TC-25 | 待开发 |

### 16.2 参考材料

- 需求基线：`docs/requirements/README.md`；验收手册：`docs/requirements/acceptance.md`
- 分支与交付规范：`docs/development/git-branching.md`
- 错误与限流现状：`packages/server/src/system/http/`、`packages/server/src/system/security/rate-limit.middleware.ts`
- 指标现状：`packages/server/src/system/observability/metrics.ts`
- 本轮评审记录：`docs/audit/api-platform-prd-review-2026-10-13.md`
- 落地形态复审记录（含代码证据与行号）：`docs/audit/api-platform-prd-landform-recheck-2026-10-13.md`
- 落地形态实证验证报告（含原始输出与纠偏留痕）：`docs/audit/api-platform-landform-verification-2026-10-13.md`

### 16.3 可测性要求（评审 R2-10）

- **时钟与上游可注入**：沿用 `rate-limit.middleware.ts` 的 `now()` 注入模式，限流窗口、配额重置、过期判定、熔断计时均可在单测中确定性验证，不依赖真实等待；
- **上游桩**：提供可配置的 vLLM 桩（固定 usage 返回、可注入延迟与 5xx/超时），e2e 不依赖真实 GPU 服务；
- **必测边界用例**：流式中途失败（TC-13）、客户端断流（TC-08）、跨零点归属日（TC-12）、上游不返回 usage 的估算路径（TC-21）、HMAC 双密钥过渡校验（TC-17）；
- **对账用例**：看板聚合数字与 `llm_api_call_logs` 逐日对账（TC-15），差异必须为 0（除 `usage_estimated=true` 的估算行单独标注）；
- **落地形态用例（复审 R3/R4）**：生产模式中间件下 `POST /v1/*` 可通（TC-23）、SSE 经 nginx 逐块到达（TC-24）、配额 SQL 业务日边界与索引命中（TC-25）。

---

> 合规声明：本方案为产品设计参考，具体实施请结合公司合规与法务要求确认。
