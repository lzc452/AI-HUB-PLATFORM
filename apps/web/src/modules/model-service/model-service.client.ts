import { apiFetch } from "../../shared/api/client";

/**
 * 模型服务（本地 vLLM 网关）Console 客户端。
 *
 * 对应后端控制面 `/internal/model-service/*`（Cookie 会话 + ProblemDetails 错误，
 * 由共享 apiFetch 统一处理）：本人视角 `/usage`、`/calls`；管理面 `/admin/*`。
 * 网关面 `/v1`（Bearer API Key）不经过此处——API Key 禁止用于浏览器端直连（PRD 10）。
 */

export type UsageRangeKey = "today" | "7d" | "30d" | "custom";

/** 用量区间查询：三种预设 + 自定义（from/to 为 YYYY-MM-DD，跨度 ≤90 天，由后端校验）。 */
export interface UsageQuery {
  range?: UsageRangeKey;
  from?: string;
  to?: string;
}

export interface UsageTotals {
  /** 调用次数（含失败与拒绝）。 */
  calls: number;
  errorCalls: number;
  promptTokens: number;
  completionTokens: number;
  /** token 合计（配额口径 = prompt + completion）。 */
  totalTokens: number;
}

export interface DailyUsage {
  /** 业务日（Asia/Shanghai，YYYY-MM-DD）。 */
  usageDate: string;
  calls: number;
  errorCalls: number;
  totalTokens: number;
}

export interface ModelUsage {
  model: string;
  calls: number;
  errorCalls: number;
  totalTokens: number;
}

export interface KeyUsage {
  keyId: string;
  keyName: string;
  /** Key 当前存储状态（active/disabled/revoked）。 */
  keyStatus: string;
  calls: number;
  errorCalls: number;
  totalTokens: number;
}

export interface UsageSummary {
  range: UsageRangeKey;
  fromDate: string;
  toDate: string;
  /**
   * true = 当日读数来自事实表实时兜底（聚合 worker 尚未覆盖当日），
   * 页面必须显式提示「当日为实时数据」，避免与聚合口径混淆（PRD 9.4）。
   */
  todayPartial: boolean;
  totals: UsageTotals;
  daily: DailyUsage[];
  byModel: ModelUsage[];
  byKey: KeyUsage[];
}

export interface CallDetail {
  callId: string;
  keyId: string;
  employeeId: string;
  endpoint: string;
  model: string;
  stream: boolean;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  durationMs: number;
  /** HTTP 状态码（499 = 客户端断流）。 */
  statusCode: number;
  errorCode: string | null;
  /** token 是否为本地估算（上游未返回 usage）。 */
  usageEstimated: boolean;
  traceId: string | null;
  /** 请求开始时刻（ISO 8601）。 */
  requestedAt: string;
}

export interface CallPage {
  items: CallDetail[];
  total: number;
  page: number;
  pageSize: number;
}

/** 调用明细查询：区间 + 可选筛选 + 分页。 */
export interface CallListQuery extends UsageQuery {
  keyId?: string | undefined;
  model?: string | undefined;
  errorOnly?: boolean | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
}

/** Key 限额覆盖；null 表示使用平台默认值。 */
export interface ApiKeyLimits {
  rpm: number | null;
  tpm: number | null;
  dailyTokens: number | null;
}

export interface ApiKeySummary {
  keyId: string;
  name: string;
  prefix: string;
  /** 存储状态（active/disabled/revoked）。 */
  status: string;
  /** 派生状态（含服务端时钟判定的 expired），前端不自行实现过期判断。 */
  effectiveStatus: string;
  limits: ApiKeyLimits;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  disabledAt: string | null;
}

/** 管理面 Key 列表项：本人视角字段 + 归属人信息。 */
export interface AdminKeyItem extends ApiKeySummary {
  owner: { employeeId: string; displayName: string; status: string };
}

export interface AdminKeyPage {
  items: AdminKeyItem[];
  total: number;
  page: number;
  pageSize: number;
}

/** 管理面 Key 列表查询。 */
export interface AdminKeyListQuery {
  employeeId?: string | undefined;
  status?: string | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
}

/** 管理面用量查询：可指定员工，不传即全平台。 */
export interface AdminUsageQuery extends UsageQuery {
  employeeId?: string | undefined;
}

function toSearchParams(
  query: Record<string, string | number | boolean | undefined>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    params.set(key, String(value));
  }
  const serialized = params.toString();
  return serialized === "" ? "" : `?${serialized}`;
}

export function getMyUsage(query: UsageQuery = {}): Promise<UsageSummary> {
  return apiFetch<UsageSummary>(
    `/internal/model-service/usage${toSearchParams({
      range: query.range,
      from: query.from,
      to: query.to,
    })}`,
  );
}

export function listMyCalls(query: CallListQuery = {}): Promise<CallPage> {
  return apiFetch<CallPage>(
    `/internal/model-service/calls${toSearchParams({
      range: query.range,
      from: query.from,
      to: query.to,
      keyId: query.keyId,
      model: query.model,
      errorOnly: query.errorOnly,
      page: query.page,
      pageSize: query.pageSize,
    })}`,
  );
}

export function getPlatformUsage(
  query: AdminUsageQuery = {},
): Promise<UsageSummary> {
  return apiFetch<UsageSummary>(
    `/internal/model-service/admin/usage${toSearchParams({
      range: query.range,
      from: query.from,
      to: query.to,
      employeeId: query.employeeId,
    })}`,
  );
}

export function listAdminKeys(
  query: AdminKeyListQuery = {},
): Promise<AdminKeyPage> {
  return apiFetch<AdminKeyPage>(
    `/internal/model-service/admin/keys${toSearchParams({
      employeeId: query.employeeId,
      status: query.status,
      page: query.page,
      pageSize: query.pageSize,
    })}`,
  );
}

/** 代员工禁用 Key（幂等；revoked 返回 409 MODEL_KEY_STATE_CONFLICT）。 */
export function disableAdminKey(keyId: string): Promise<AdminKeyItem> {
  return apiFetch<AdminKeyItem>(
    `/internal/model-service/admin/keys/${encodeURIComponent(keyId)}/disable`,
    { method: "POST" },
  );
}

/** 代员工启用 Key（幂等；revoked 返回 409 MODEL_KEY_STATE_CONFLICT）。 */
export function enableAdminKey(keyId: string): Promise<AdminKeyItem> {
  return apiFetch<AdminKeyItem>(
    `/internal/model-service/admin/keys/${encodeURIComponent(keyId)}/enable`,
    { method: "POST" },
  );
}

// ---------------------------------------------------------------------------
// 本人 Key 生命周期（控制面，PRD 8.1）
// ---------------------------------------------------------------------------

/** 创建 Key 入参（PRD 8.1）。 */
export interface CreateApiKeyInput {
  /** Key 名称，本人内未撤销 Key 唯一（1–64 字符）。 */
  name: string;
  /** 有效期天数（1–365）；不传表示长期有效。 */
  expiresInDays?: number | undefined;
  /** RPM 上限；不传用平台默认。 */
  rpmLimit?: number | undefined;
  /** TPM 上限；不传用平台默认。 */
  tpmLimit?: number | undefined;
  /** 每日 token 配额；不传用平台默认。 */
  dailyTokenLimit?: number | undefined;
}

/**
 * 变更 Key 属性入参（PATCH）。
 * 显式传 `null` 表示回到平台默认；字段省略表示保持原值；不承载状态变更。
 */
export interface UpdateApiKeyInput {
  name?: string | undefined;
  expiresInDays?: number | null | undefined;
  rpmLimit?: number | null | undefined;
  tpmLimit?: number | null | undefined;
  dailyTokenLimit?: number | null | undefined;
}

/** 本人 Key 列表查询。 */
export interface MyKeyListQuery {
  includeRevoked?: boolean | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
}

export interface ApiKeyPage {
  items: ApiKeySummary[];
  total: number;
  page: number;
  pageSize: number;
}

/** 创建/轮换响应：`apiKey` 明文仅这一次返回。 */
export interface CreateApiKeyResult extends ApiKeySummary {
  apiKey: string;
}

export function listMyKeys(query: MyKeyListQuery = {}): Promise<ApiKeyPage> {
  return apiFetch<ApiKeyPage>(
    `/internal/model-service/keys${toSearchParams({
      includeRevoked: query.includeRevoked,
      page: query.page,
      pageSize: query.pageSize,
    })}`,
  );
}

export function getMyKey(keyId: string): Promise<ApiKeySummary> {
  return apiFetch<ApiKeySummary>(
    `/internal/model-service/keys/${encodeURIComponent(keyId)}`,
  );
}

export function createApiKey(input: CreateApiKeyInput): Promise<CreateApiKeyResult> {
  return apiFetch<CreateApiKeyResult>("/internal/model-service/keys", {
    body: JSON.stringify(input),
    method: "POST",
  });
}

export function updateApiKey(
  keyId: string,
  input: UpdateApiKeyInput,
): Promise<ApiKeySummary> {
  return apiFetch<ApiKeySummary>(
    `/internal/model-service/keys/${encodeURIComponent(keyId)}`,
    { body: JSON.stringify(input), method: "PATCH" },
  );
}

export function disableApiKey(keyId: string): Promise<ApiKeySummary> {
  return apiFetch<ApiKeySummary>(
    `/internal/model-service/keys/${encodeURIComponent(keyId)}/disable`,
    { method: "POST" },
  );
}

export function enableApiKey(keyId: string): Promise<ApiKeySummary> {
  return apiFetch<ApiKeySummary>(
    `/internal/model-service/keys/${encodeURIComponent(keyId)}/enable`,
    { method: "POST" },
  );
}

/** 轮换：旧 Key 同事务撤销（无宽限期），返回新 Key 明文。 */
export function rotateApiKey(keyId: string): Promise<CreateApiKeyResult> {
  return apiFetch<CreateApiKeyResult>(
    `/internal/model-service/keys/${encodeURIComponent(keyId)}/rotate`,
    { method: "POST" },
  );
}

/** 删除即撤销（软删，幂等；204）。 */
export function revokeApiKey(keyId: string): Promise<void> {
  return apiFetch<void>(
    `/internal/model-service/keys/${encodeURIComponent(keyId)}`,
    { method: "DELETE" },
  );
}
