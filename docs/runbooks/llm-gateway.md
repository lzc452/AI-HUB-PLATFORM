# 模型服务网关 Runbook（M5）

面向运维与值班：指标口径、告警响应、灰度上线、回滚、常见故障。需求与契约见 [模型服务 PRD](../requirements/api-platform-key-management.md)（v1.4 定稿）。

## 一、组件与开关

| 项 | 值 |
| --- | --- |
| 网关入口 | `/v1/*`（nginx → api:3001，Bearer API Key 鉴权） |
| 控制面 | `/internal/model-service/*`（Cookie 会话） |
| 指标端点 | `api:3001/internal/metrics`（含 `ai_hub_llm_*`，与平台指标同一抓取点） |
| 上游 | `LLM_GATEWAY_UPSTREAM_BASE_URL`（本地 vLLM，生产默认 `http://10.10.181.82:3040/v1`） |
| **总开关** | `LLM_GATEWAY_ENABLED`（默认 `true`）——置 `false` 即关停 `/v1` 与新建凭据，用于灰度与回滚 |
| 台账 | `llm_api_call_logs`（100% 记账，含被拒请求）；看板读模型 `llm_usage_daily`（worker 5 分钟聚合） |

**开关语义（重要）**：`LLM_GATEWAY_ENABLED=false` 时

- `/v1/*` 全部返回 `503 gateway_disabled`（OpenAI 信封），不解析凭据、不查库；
- 控制面**拒绝创建与轮换**（`503 MODEL_SERVICE_DISABLED`）；
- 控制面的读、禁用、启用、删除**保持可用**——回滚后仍要能清理与排障，不能把控制台一起锁死。

与 `503 gateway_not_configured` 区分：前者是主动关停，后者是部署缺配置（`upstreamBaseUrl` 或 HMAC 密钥缺失）。

## 二、指标（`ai_hub_llm_` 前缀）

| 指标 | 类型 | 标签 | 埋点位置 |
| --- | --- | --- | --- |
| `ai_hub_llm_gateway_requests_total` | Counter | endpoint, model, status_code | 台账汇聚点（含被拒：401/403/413/429/502/503/504/499） |
| `ai_hub_llm_gateway_duration_seconds` | Histogram | endpoint | 同上（网关自身处理耗时，**不含**流式生成时间） |
| `ai_hub_llm_gateway_tokens_total` | Counter | model, type(prompt/completion) | 同上（失败调用 token 为 0，不计数） |
| `ai_hub_llm_gateway_rate_limited_total` | Counter | reason(rpm/tpm/daily) | 配额服务三个拒绝点 |
| `ai_hub_llm_gateway_upstream_errors_total` | Counter | reason(timeout/http_5xx/network) | 上游故障点（仅上游自身故障；4xx/429 与客户端断流不计） |
| `ai_hub_llm_gateway_circuit_state` | Gauge | state(closed/half_open/open) | 熔断器状态变更回调 |
| `ai_hub_llm_active_streams` | Gauge | — | 流式开始/结束配对 |
| `ai_hub_llm_keys_active` | Gauge | — | 采集时查库（活跃 Key 总数，30s TTL 缓存） |
| `ai_hub_llm_keys_quota_critical` | Gauge | — | 采集时查库（当日用量 ≥90% 日配额的活跃 Key 数，30s TTL 缓存） |

约定：

- `status_code="499"` 是网关内部约定的**客户端断流**（非标准码），不算网关错误；
- `circuit_state` 采用「当前状态 = 1、其余 = 0」表达，告警直接匹配 `{state="open"} == 1`；
- 指标**不含** Key / 员工标签（避免高基数 series）；按 Key / 按员工的明细在 Console 用量看板与台账 SQL 中下钻。

## 三、告警响应（`infra/monitoring/rules/llm-gateway-alerts.yml`）

| 告警 | 级别 | 含义 | 首查 | 处置 |
| --- | --- | --- | --- | --- |
| `AiHubLlmGatewayErrorRateHigh` | P1 | 5 分钟 5xx+429 占比 > 20% | 按 `status_code` 拆分：429 多还是 5xx 多 | 429 → 看 `rate_limited_total{reason}`；5xx → 转「上游不可用」流程 |
| `AiHubLlmGatewayCircuitOpen` | P1 | 熔断打开 ≥5 分钟 | `upstream_errors_total{reason}` 与 vLLM 进程/GPU | 恢复上游；熔断会经半开探测自动闭合，无需重启网关 |
| `AiHubLlmGatewayUpstreamUnavailable` | P1 | 有上游错误且 5 分钟内无任何成功响应 | `curl -sS -o /dev/null -w '%{http_code}' $LLM_GATEWAY_UPSTREAM_BASE_URL/models` | 上游不可达 → 修 vLLM；短时间无法恢复 → 置 `LLM_GATEWAY_ENABLED=false` 止损（见回滚） |
| `AiHubLlmGatewayRateLimitedFrequent` | P3 | 1 小时限流拒绝 > 100 | `rate_limited_total` by reason | daily/rpm → 评估调高限额；tpm → 调用方拆分大请求 |
| `AiHubLlmGatewayQuotaNearlyExhausted` | P3 | ≥3 个活跃 Key 当日用量达 90% 配额 | Console「模型服务 · 平台管理」核对 | 确需提高：调整该 Key 的 `dailyTokenLimit`；否则提醒调用方 |
| `AiHubLlmGatewayMetricsMissing` | P3 | 指标 15 分钟未采集到 | `/internal/metrics` 是否含 `ai_hub_llm_gateway_*`；抓取目标 `ai-hub-api` 健康 | api 容器重启或抓取配置漂移；**指标消失时上面的规则全部静默**，必须先修这个 |

**演练与投递**（PRD M5 退出条件）：规则语法用 `promtool check config` 验证（已验证：6 条规则通过）；**真实投递依赖 Alertmanager 通道**——仓库当前 `infra/monitoring/alertmanager.yml` 的接收人仍是占位地址（`https://alerts.internal.example/ai-hub`），**未接通生产通道前，告警只在 Prometheus/Alertmanager 界面可见，不构成已投递证据**。接通道后按上表逐条演练一次并记录时间戳、确认人、恢复时间。

演练记录模板：告警名 / 触发时间 / 首次确认 / 恢复时间 / 根因 / 是否误报。

## 四、灰度上线（PRD 14 上线计划）

前提：`LLM_GATEWAY_HMAC_SECRET` 与 `LLM_GATEWAY_UPSTREAM_BASE_URL` 已配置；nginx `/v1/` location 已就位（`proxy_read_timeout 300s`）。

1. **内部验证**：用管理员账号在 Console 创建 1 个 Key，用官方 SDK 各跑一次非流式与流式调用，确认 200 与逐块到达；
2. **小范围灰度**：先只在内部沟通群发放 Key（管理员与试点同事），观察 30 分钟：`requests_total` 有量、`upstream_errors_total` 为 0、`circuit_state{state="closed"}=1`；
3. **全员开放**：确认无异常后通知全员可自助创建 Key；同时把 Grafana 看板与告警链接发到值班群；
4. **每步的证据**：SDK 调用日志（含 traceId）、看板截图时间戳、`/internal/metrics` 抓取片段。

## 五、回滚

**一键回滚（不碰数据库、不碰 nginx）**：

```bash
# 在部署机上：api 服务加环境变量后重启
LLM_GATEWAY_ENABLED=false docker compose -f compose.production.yaml up -d api
```

效果：`/v1` 立刻 503（`gateway_disabled`）、无法新建凭据；既有 Key、台账、看板全部保留可查。

**完整回滚（彻底摘除入口）**：先做上面一步，再移除 nginx 的 `/v1/` location 并 `nginx -s reload`。两步都做才叫回滚完成——只关开关时 nginx 仍会把 `/v1` 转到 api，返回的是 503 而不是 404，对外表现是「服务不可用」而非「不存在」。

**回滚后**：记录触发原因、时间戳、影响范围；恢复上线前先确认根因已修复，并按第四节重新灰度。

## 六、常见故障排查

| 现象 | 定位 | 处置 |
| --- | --- | --- |
| 全部 `/v1` 请求 503 `gateway_not_configured` | `LLM_GATEWAY_UPSTREAM_BASE_URL` 或 HMAC 密钥未配 | 补配置并重启 api；控制面此时仍可用 |
| 全部 `/v1` 请求 503 `gateway_disabled` | 总开关被置 false | 确认是否人为回滚；恢复时置 true 并重启 |
| 单个 Key 401 | Key 不存在/格式错（明文抄错、被删除） | 让用户核对；控制面「我的 Key」前缀可比对 |
| 单个 Key 403 | disabled/revoked/expired 或员工停用 | Console 启用或轮换；员工停用需人资流程 |
| 429 `rate_limit_exceeded` | 撞日配额/RPM/TPM | message 里带具体维度与 `Retry-After`；日配额在次日 00:00（UTC+8）重置 |
| 429 `upstream_rate_limited` | vLLM 自身繁忙 | 上游扩容或调用方退避；不计入熔断 |
| 502 `upstream_error` / 504 `upstream_timeout` | 上游故障或超时（首 token 30s / 整体 120s） | 检查 vLLM 与网络；连续 5 次触发熔断 |
| 流式调用中途断开且无 `[DONE]` | 上游中断、首 token 超时或客户端断流 | 台账 `status_code`：499=客户端断流，504=超时，502=上游中断 |
| 看板数字与台账对不上 | 聚合延迟（≤5 分钟）或当日为实时兜底 | 当日读数若带 `todayPartial` 即实时口径；历史日差异要查 worker 与 `findUnaggregatedDays` |
| worker 停机一段时间 | 缺口自愈只覆盖 30 天、单轮最多 10 天 | 重启 worker；超过自愈范围按需手动补算 |

## 七、对账（PRD TC-15）

每日一次，看板读模型 vs 事实表：

```sql
-- 按业务日对账（Asia/Shanghai）：读模型 vs 事实表，差异必须为 0
select d.usage_date,
       d.calls   as model_calls,
       f.calls   as fact_calls,
       d.total_tokens as model_tokens,
       f.total_tokens as fact_tokens
from (select usage_date, sum(calls) calls, sum(total_tokens) total_tokens
      from llm_usage_daily group by usage_date) d
full join (
  select (requested_at at time zone 'Asia/Shanghai')::date as usage_date,
         count(*) calls, coalesce(sum(total_tokens),0) total_tokens
  from llm_api_call_logs group by 1) f using (usage_date)
where d.calls is distinct from f.calls
   or d.total_tokens is distinct from f.total_tokens;
```

`usage_estimated = true` 的行是上游未返回 usage 时的本地估算，对账时单独统计，不计入差异判定。
