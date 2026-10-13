# AI Hub 模型服务平台：vLLM API Key 管理与统一网关 — 产品需求文档（PRD）

| 文档信息 | |
| --- | --- |
| 版本 | v1.0（完整版；v0.1 精简版经确认后展开） |
| 日期 | 2026-10-13 |
| 作者 | 司南（产品经理 Agent） |
| 状态 | 待评审 |
| 关联分支 | `feature/api-platform` |
| 需求基线参考 | `docs/requirements/README.md`（本文不修改基线，评审通过后按基线变更规则回填） |

**变更记录**：v0.1（2026-10-13）精简版需求梳理 → v1.0（2026-10-13）展开完整 PRD，新增用户场景、功能架构、接口规范、数据模型、安全策略、监控指标、非功能性需求与里程碑。

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

### 4.3 关键假设（待确认项关闭前以此推进）

| 编号 | 假设 | 不成立时的影响 |
| --- | --- | --- |
| A1 | 复用平台现有登录态与员工体系，Key 绑定登录用户 | 需增加独立开通审批流 |
| A2 | vLLM 部署于 GPU 服务器，暴露 OpenAI 兼容 HTTP 端口（默认 8000） | 上游地址与部署编排调整 |
| A3 | 配额为限流 + 软限额，超额拒绝并提示，不扣费 | 涉及资金须补资金安全三件套 |
| A4 | API 单实例部署（当前为模块化单体，Compose 无 Redis） | 多实例时限流计数器需迁移 Redis 等共享存储 |

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

## 八、接口规范

> 控制面错误统一走平台既有 ProblemDetails（`type/title/status/code/message/detail/traceId`）；网关面错误统一走 OpenAI 错误信封。两者不混用。

### 8.1 控制面（`/internal/model-service`，Cookie 会话鉴权 + 权限）

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| POST | `/keys` | `model_service.key.manage` | 创建 Key；响应含一次性明文 |
| GET | `/keys` | `model_service.key.read` | 本人 Key 列表（分页，不含明文） |
| GET | `/keys/:keyId` | `model_service.key.read` | 详情（含限额与最近用量摘要） |
| POST | `/keys/:keyId/disable` | `model_service.key.manage` | 禁用 |
| POST | `/keys/:keyId/enable` | `model_service.key.manage` | 启用 |
| POST | `/keys/:keyId/rotate` | `model_service.key.manage` | 轮换；响应含新一次性明文 |
| DELETE | `/keys/:keyId` | `model_service.key.manage` | 删除（置 revoked） |
| GET | `/keys/:keyId/calls` | `model_service.usage.read` | 调用明细（分页 + 时间/状态/模型筛选） |
| GET | `/usage` | `model_service.usage.read` | 本人用量汇总（今日/近 7 日/近 30 日序列） |
| GET | `/admin/keys` | `model_service.key.manage_all` | 全平台 Key 列表 |
| POST | `/admin/keys/:keyId/disable` | `model_service.key.manage_all` | 代禁用 |
| GET | `/admin/usage` | `model_service.usage.read_all` | 全平台用量（按用户/按模型 Top） |

创建请求/响应示例：

```json
// POST /internal/model-service/keys
// 请求
{ "name": "notebook-dev", "expiresInDays": 90, "rpmLimit": 60, "tpmLimit": 100000, "dailyTokenLimit": 2000000 }
// 201 响应（apiKey 仅此次返回）
{ "keyId": "…", "name": "notebook-dev", "apiKey": "sk-aihub-….", "prefix": "sk-aihub-ab12cd34", "status": "active", "limits": { "rpm": 60, "tpm": 100000, "dailyTokens": 2000000 }, "expiresAt": "…", "createdAt": "…" }
```

限额字段均可空：为空时用平台默认（配置项 `LLM_DEFAULT_RPM/TPM/DAILY_TOKENS`）。列表/详情响应一律只含 `prefix`，不含明文与哈希。

### 8.2 网关面（`/v1`，Bearer 鉴权，OpenAI 兼容）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/v1/models` | 模型列表（透传上游，附权限过滤后的可用模型） |
| POST | `/v1/chat/completions` | 对话补全；`stream=true` 时 SSE 透传 |
| POST | `/v1/embeddings` | 向量化 |

鉴权链：`Authorization: Bearer sk-aihub-...` → HMAC-SHA256 计算 → 唯一索引查库 → 校验 `status=active` 且未过期 → 限额预检（RPM/TPM 窗口 + 日配额）→ 放行转发。任一步失败即拒绝并记账（`status_code` 为 401/403/429，tokens 记 0）。

网关错误信封（OpenAI 格式）：

```json
{ "error": { "message": "API Key 已禁用", "type": "invalid_request_error", "param": null, "code": "key_disabled" } }
```

| HTTP | type | code | 场景 |
| --- | --- | --- | --- |
| 401 | invalid_request_error | `invalid_api_key` | Key 不存在/格式错误 |
| 403 | invalid_request_error | `key_disabled` / `key_expired` / `key_revoked` | 状态不允许 |
| 429 | rate_limit_error | `rate_limit_exceeded` | RPM/TPM/日配额超限（附 `Retry-After` 头） |
| 400 | invalid_request_error | `invalid_request_error` | 请求体非法（含上游返回的上下文超限，message 附中文说明） |
| 404 | invalid_request_error | `model_not_found` | 模型不存在 |
| 502 | upstream_error | `upstream_error` | 上游连接/响应错误 |
| 504 | upstream_error | `upstream_timeout` | 首 token 30s 或整体 120s 超时 |
| 503 | service_unavailable | `circuit_open` | 熔断打开中 |

流式约束：SSE 事件格式与 OpenAI 一致（`data: {...}` / `data: [DONE]`）；客户端断连时取消上游请求并记账为已取消；熔断对流式同样生效。

## 九、数据模型

> 迁移编号 `0056_llm_gateway_foundation.ts`，遵循仓库迁移规范：幂等 DDL（`if not exists`）、文件头注释说明取舍依据。表结构同步登记到 `packages/database/src/schema.ts`。

### 9.1 `llm_api_keys`

| 列 | 类型 | 约束/口径 |
| --- | --- | --- |
| `key_id` | uuid | PK，`gen_random_uuid()` |
| `employee_id` | uuid | NOT NULL，FK → `employees(employee_id)` |
| `name` | varchar(64) | NOT NULL，用户自取名称 |
| `key_prefix` | varchar(24) | NOT NULL，Key 前 16 字符（展示用） |
| `key_hash` | varchar(64) | NOT NULL，UNIQUE；HMAC-SHA256(key, 服务端密钥) hex |
| `status` | varchar(16) | NOT NULL DEFAULT `active`；`active`/`disabled`/`revoked` |
| `rpm_limit` / `tpm_limit` | int | 可空；空=平台默认 |
| `daily_token_limit` | bigint | 可空；空=平台默认 |
| `expires_at` | timestamptz | 可空；过期按禁用处理 |
| `last_used_at` | timestamptz | 可空；最近一次成功调用 |
| `rotated_from_key_id` | uuid | 可空，自引用；轮换谱系 |
| `created_at` / `updated_at` / `disabled_at` | timestamptz | NOT NULL DEFAULT now()（disabled_at 可空） |

索引：`key_hash` 唯一索引（查找主路径）；`(employee_id, status, created_at desc)`（列表）。

### 9.2 `llm_api_call_logs`（100% 调用记录，同步单行写入）

| 列 | 类型 | 口径 |
| --- | --- | --- |
| `call_id` | uuid | PK |
| `key_id` / `employee_id` | uuid | NOT NULL |
| `endpoint` | varchar(32) | `chat_completions`/`embeddings`/`models` |
| `model` | varchar(64) | 请求模型名 |
| `stream` | boolean | NOT NULL DEFAULT false |
| `prompt_tokens` / `completion_tokens` / `total_tokens` | int | 上游返回口径；失败/拒绝记 0 |
| `duration_ms` | int | 网关侧耗时 |
| `status_code` | int | 网关返回给调用方的状态码 |
| `error_code` | varchar(32) | 可空（见 8.2 code 表） |
| `trace_id` | varchar(64) | 关联请求追踪 |
| `requested_at` | timestamptz | NOT NULL DEFAULT now() |

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

- **日配额判定**：`sum(total_tokens)` over 当日 `llm_api_call_logs`（employee 维度）+ 进程内当日放行修正（防重启漂移）；软限额，异步极小窗口内可能少量超额，PRD 明确接受。
- **保留**：`llm_api_call_logs` 保留 180 天（与行为事件一致），`llm_usage_daily` 长期保留；清理任务入 worker（复用现有 retention runner 模式）。
- **幂等**：Key 创建/轮换/禁用均以数据库约束与状态机保证，无资金操作，不涉及对账。

## 十、安全策略

### 10.1 Key 生成与存储

- 生成：`sk-aihub-` + 32 位 base62 随机串（`crypto.randomBytes`，约 190 bit 熵）；
- 存储：仅存 HMAC-SHA256 哈希（服务端密钥经配置注入，不入库）；明文仅在创建/轮换响应体返回一次，不落库、不入日志（logger 脱敏 `sk-aihub-` 前缀）；
- 查找：按哈希唯一索引 O(1) 定位；响应只回前缀。

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

| 里程碑 | 内容 | 退出条件（证据） | 估算 |
| --- | --- | --- | --- |
| M0 需求确认 | 本 PRD 评审；关键假设 A1–A4 关闭 | 评审记录；假设逐条确认 | 1 |
| M1 基础骨架 | 迁移 0056、配置项、模块装配、Key CRUD 控制面 + 单测 | 类型检查 + 单测绿；真实 PG 应用迁移 | 5 |
| M2 网关连通 | `/v1/models` + 非流式 chat、Bearer 鉴权、错误映射 + e2e | OpenAI SDK 对真实 vLLM 调通（含 401/404 负向） | 5 |
| M3 流式与配额 | streaming、RPM/TPM/日配额、429 语义、熔断 | 限流与熔断用例绿；断流取消验证 | 5 |
| M4 用量与看板 | call_logs 落库、usage_daily 聚合 worker、Console 页面 | 看板数字与 call_logs 对账一致；页面四态齐全 | 5 |
| M5 监控与上线 | 指标、告警规则、灰度、runbook | 告警演练送达；上线后验证清单执行 | 3 |

**依赖评估**：

| 依赖 | 所属 | 分级 | 说明 |
| --- | --- | --- | --- |
| vLLM 服务部署与网络连通 | 基础设施 | 阻塞 | 未就绪则 M2 无法开始；需确认 GPU 服务器端口与域名 |
| Alertmanager 告警通道 | 运维 | 并行 | 缺位时降级为看板+日志，不阻塞上线 |
| 多模型配置 | 平台配置 | 可绕过 | 单模型也可上线，`/v1/models` 透传当前模型 |

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

**遗留问题**：① Alertmanager 通道是否存在待运维确认；② vLLM 实际模型名与上下文上限需部署后回填配置；③ 基线回填（本文评审通过后按 `docs/requirements/README.md` 变更规则登记 REQ ID）。

## 十六、附录

### 16.1 需求追踪矩阵（RTM）

| 需求 | 描述 | PRD 章节 | 测试用例 | 状态 |
| --- | --- | --- | --- | --- |
| FR-01 | Key 创建（明文一次性、限额、过期） | 7.5/8.1 | TC-01 | 待开发 |
| FR-02 | Key 列表与详情（仅前缀） | 8.1 | TC-02 | 待开发 |
| FR-03 | 禁用/启用（立即生效） | 7.5/8.1/8.2 | TC-03 | 待开发 |
| FR-04 | 轮换（旧钥立即失效） | 7.5/8.1 | TC-04 | 待开发 |
| FR-05 | 删除（revoked 终态） | 7.5/8.1 | TC-05 | 待开发 |
| FR-06 | Bearer 鉴权与 401/403 语义 | 8.2/10.2 | TC-06 | 待开发 |
| FR-07 | `/v1/models` 透传 | 8.2 | TC-07 | 待开发 |
| FR-08 | chat/completions（流式+非流式） | 8.2 | TC-08 | 待开发 |
| FR-09 | embeddings | 8.2 | TC-09 | 待开发 |
| FR-10 | OpenAI 错误信封映射 | 8.2 | TC-10 | 待开发 |
| FR-11 | RPM/TPM 限流 | 8.2/9.4 | TC-11 | 待开发 |
| FR-12 | 日 token 配额 | 8.2/9.4 | TC-12 | 待开发 |
| FR-13 | 熔断与恢复 | 8.2/十三 | TC-13 | 待开发 |
| FR-14 | 100% 调用记录 | 9.2/11.3 | TC-14 | 待开发 |
| FR-15 | 用量汇总与明细 | 8.1/9.3 | TC-15 | 待开发 |
| FR-16 | 管理面（全平台视图与代禁用） | 8.1/10.2 | TC-16 | 待开发 |
| FR-17 | 生命周期审计 | 10.3 | TC-17 | 待开发 |
| FR-18 | 配置化默认值 | 8.1/十三 | TC-18 | 待开发 |

### 16.2 参考材料

- 需求基线：`docs/requirements/README.md`；验收手册：`docs/requirements/acceptance.md`
- 分支与交付规范：`docs/development/git-branching.md`
- 错误与限流现状：`packages/server/src/system/http/`、`packages/server/src/system/security/rate-limit.middleware.ts`
- 指标现状：`packages/server/src/system/observability/metrics.ts`

---

> 合规声明：本方案为产品设计参考，具体实施请结合公司合规与法务要求确认。
