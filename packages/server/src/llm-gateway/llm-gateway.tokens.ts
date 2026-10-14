/** 模型服务 Key 生命周期服务（控制面依赖注入令牌）。 */
export const LLM_GATEWAY_SERVICE = Symbol("LLM_GATEWAY_SERVICE");

/** 网关面服务（`/v1` 转发：模型列表与对话补全）。 */
export const LLM_GATEWAY_API_SERVICE = Symbol("LLM_GATEWAY_API_SERVICE");

/**
 * 以下三个令牌供 `ApiKeyGuard` 通过显式 `@Inject()` 注入。
 *
 * **为什么不能只在模块里 `useValue` 注册守卫类本身**：Nest 用类引用（`@UseGuards(ApiKeyGuard)`）
 * 解析增强器时，是在模块 provider 里按 **metatype** 查找实例；而 `useValue` 注册的 provider
 * 没有 metatype，查找失败后会**回退成无参 `new ApiKeyGuard()`**——依赖全空、静默失效
 * （实测表现为所有 `/v1` 请求一律 503）。因此依赖必须拆成显式令牌，让 Nest 能自行构造守卫。
 */
export const MODEL_SERVICE_KEY_REPOSITORY = Symbol(
  "MODEL_SERVICE_KEY_REPOSITORY",
);

/** API Key 摘要器；未配置 HMAC 密钥时为 undefined（守卫据此返回 503）。 */
export const API_KEY_HASHER = Symbol("API_KEY_HASHER");

/** 可注入时钟（测试用；未注册时守卫使用系统时间）。 */
export const API_KEY_CLOCK = Symbol("API_KEY_CLOCK");

/** 无效凭据的 IP 级预检（M3）。 */
export const INVALID_KEY_THROTTLE = Symbol("INVALID_KEY_THROTTLE");

/** 调用台账仓储（M3：配额与用量的事实来源）。 */
export const LLM_CALL_LOG_REPOSITORY = Symbol("LLM_CALL_LOG_REPOSITORY");

/** 配额与限流服务（M3）。 */
export const LLM_QUOTA_SERVICE = Symbol("LLM_QUOTA_SERVICE");

/** 上游熔断器（M3）。 */
export const UPSTREAM_CIRCUIT_BREAKER = Symbol("UPSTREAM_CIRCUIT_BREAKER");

/** 用量读模型仓储（M4：聚合与查询）。 */
export const LLM_USAGE_REPOSITORY = Symbol("LLM_USAGE_REPOSITORY");

/** 用量查询服务（M4：控制台用量视图）。 */
export const LLM_USAGE_SERVICE = Symbol("LLM_USAGE_SERVICE");

/**
 * 网关指标（M5，PRD 11.1）。`/v1` 各组件（守卫/网关服务/配额/熔断）共用同一实例，
 * 由 apps/api 合并进 `/internal/metrics` 输出。
 */
export const LLM_GATEWAY_METRICS = Symbol("LLM_GATEWAY_METRICS");

/**
 * 灰度/回滚总开关（M5，PRD 649 上线计划）：
 * false 时 `/v1` 全部路由经守卫直接 503，且控制面拒绝新建 Key
 * （读操作与既有数据不受影响，回滚不需要动 nginx 与数据库）。
 */
export const GATEWAY_ENABLED = Symbol("GATEWAY_ENABLED");
