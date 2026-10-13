import type { LlmApiKeyStatus } from "@ai-hub/database";

/**
 * 模型服务领域类型（PRD 8.1/9.1）。
 *
 * 这里只放服务层与仓储层之间流动的形状；HTTP 层用 `llm-gateway.dto.ts` 的 DTO
 * 承担校验与 OpenAPI 描述，二者不混用。
 */

/** Key 的限额覆盖；`null` 表示使用平台默认值（配置项 LLM_DEFAULT_*）。 */
export interface ApiKeyLimits {
  rpm: number | null;
  tpm: number | null;
  dailyTokens: number | null;
}

/**
 * 派生状态：在存储状态之外，按**服务端时钟**判定是否过期。
 * 过期不落库（否则要跑定时任务改状态），而是在读路径计算，避免前后端各自判定。
 */
export type ApiKeyEffectiveStatus = LlmApiKeyStatus | "expired";

export interface ApiKeyRecord {
  keyId: string;
  employeeId: string;
  name: string;
  keyPrefix: string;
  keyHash: string;
  status: LlmApiKeyStatus;
  limits: ApiKeyLimits;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  rotatedFromKeyId: string | null;
  createdAt: Date;
  updatedAt: Date;
  disabledAt: Date | null;
}

/** 对外响应形状（列表项与详情同构，仅详情额外带用量摘要）。 */
export interface ApiKeySummary {
  keyId: string;
  name: string;
  prefix: string;
  status: LlmApiKeyStatus;
  effectiveStatus: ApiKeyEffectiveStatus;
  limits: ApiKeyLimits;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  disabledAt: string | null;
}

export interface CreateApiKeyInput {
  name: string;
  expiresInDays?: number | null;
  rpmLimit?: number | null;
  tpmLimit?: number | null;
  dailyTokenLimit?: number | null;
}

export interface UpdateApiKeyInput {
  name?: string;
  expiresInDays?: number | null;
  rpmLimit?: number | null;
  tpmLimit?: number | null;
  dailyTokenLimit?: number | null;
}

export interface ListApiKeysQuery {
  includeRevoked?: boolean;
  page?: number;
  pageSize?: number;
}

export interface ApiKeyPage {
  items: readonly ApiKeySummary[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * 领域错误码：与 PRD 8.1「控制面错误码」表逐条对应。
 * 其中三个冲突语义的码已登记到 `system/http/domain-error.ts`，由控制器统一映射为 409。
 */
export const MODEL_SERVICE_ERROR_CODES = {
  NOT_FOUND: "MODEL_KEY_NOT_FOUND",
  STATE_CONFLICT: "MODEL_KEY_STATE_CONFLICT",
  NAME_DUPLICATED: "MODEL_KEY_NAME_DUPLICATED",
  LIMIT_REACHED: "MODEL_KEY_LIMIT_REACHED",
  INVALID_LIMIT: "MODEL_KEY_INVALID_LIMIT",
  NOT_CONFIGURED: "MODEL_SERVICE_NOT_CONFIGURED",
} as const;

export type ModelServiceErrorCode =
  (typeof MODEL_SERVICE_ERROR_CODES)[keyof typeof MODEL_SERVICE_ERROR_CODES];

/** 服务层抛出的领域错误：控制器据此选择 HTTP 语义，不在这里依赖 Nest。 */
export class ModelServiceError extends Error {
  public constructor(
    public readonly code: ModelServiceErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "ModelServiceError";
  }
}
