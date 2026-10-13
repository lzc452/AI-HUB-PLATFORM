import {
  Inject,
  Injectable,
  Optional,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import type { AuthorizedRequest } from "../authorization/authorization.decorator.js";
import type { ApiKeyHasher } from "./api-key.hasher.js";
import {
  API_KEY_CLOCK,
  API_KEY_HASHER,
  INVALID_KEY_THROTTLE,
  LLM_CALL_LOG_REPOSITORY,
  MODEL_SERVICE_KEY_REPOSITORY,
} from "./llm-gateway.tokens.js";
import type {
  LlmCallEndpoint,
  LlmCallLogRepository,
} from "./llm-call-log.repository.js";
import type { InvalidKeyThrottle } from "./llm-quota.js";
import type { ModelServiceKeyRepository } from "./model-service-key.repository.js";
import { gatewayError } from "./llm-gateway.errors.js";
import type { ApiKeyLimits } from "./llm-gateway.types.js";

/** 网关请求上下文：鉴权成功后挂在 request 上（M3 起供配额与记账消费）。 */
export interface ApiKeyContext {
  keyId: string;
  employeeId: string;
  keyPrefix: string;
  limits: ApiKeyLimits;
}

export interface GatewayRequest extends AuthorizedRequest {
  apiKey?: ApiKeyContext;
  /** Express 在 `trust proxy` 下解析出的来源 IP（无效凭据预检用）。 */
  ip?: string;
  /** 原始请求 URL（守卫早于处理器，用它推断端点以写台账）。 */
  url?: string;
}

/**
 * 网关面鉴权（PRD 8.2 鉴权链）。
 *
 * 顺序：解析 `Authorization: Bearer` → 计算候选摘要（双密钥过渡）→ 按摘要查库 →
 * 校验存储状态与过期 → 校验所属员工在职 → 挂载 `request.apiKey`。
 *
 * 设计取舍：
 * - **不做「先查再用明文比对」**：按 HMAC 摘要命中唯一索引即可证明持有凭据，
 *   同时也避免了把明文带进比对路径。
 * - **未配置 HMAC 密钥时返回 503 而非 401**：这是部署配置问题，不是调用方凭据问题，
 *   错误码必须能让人一眼看出该找谁（见 `gateway_not_configured`）。
 * - 失败都抛 `GatewayApiError`，由控制器级过滤器渲染成 OpenAI 信封。
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly now: () => Date;

  /**
   * 已知 Key 的状态类拒绝也写台账（PRD 9.2「100% 记录」）。
   *
   * 边界说明：**无效凭据**（Key 不存在）无法记账——`llm_api_call_logs.key_id`
   * 是 NOT NULL 外键，没有可引用的 Key 行；这类请求由 M5 的无效 Key 计数器观测。
   */
  private async recordRejection(
    record: { keyId: string; employeeId: string; name: string },
    request: GatewayRequest,
    errorCode: string,
    statusCode: number,
  ): Promise<void> {
    const now = this.now();
    try {
      await this.callLogs.insert({
        keyId: record.keyId,
        employeeId: record.employeeId,
        endpoint: endpointOf(request.url),
        model: "unknown",
        stream: false,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        durationMs: 0,
        statusCode,
        errorCode,
        usageEstimated: false,
        traceId: null,
        requestedAt: now,
      });
    } catch {
      // 台账是旁路：写失败不能把 403 变成 500
    }
  }

  /**
   * 无效凭据的 IP 级预检：超限直接 429（而不是继续 401）。
   * 这里**不区分**「Key 不存在」与「Key 正确但状态不对」——只有凭据本身无效才计数，
   * 避免用户轮换/禁用 Key 后自己把自己限流。
   */
  private assertNotFlooding(request: GatewayRequest): void {
    const ip = request.ip ?? "unknown";
    if (!this.invalidKeyThrottle.register(ip)) return;
    throw gatewayError("RATE_LIMITED", {
      detail: "too many invalid API key attempts from this address",
      retryAfterSeconds: this.invalidKeyThrottle.retryAfterSeconds(ip),
    });
  }

  public constructor(
    @Inject(MODEL_SERVICE_KEY_REPOSITORY)
    private readonly repository: ModelServiceKeyRepository,
    /** 未配置密钥时为空——此时一切调用都按未配置处理。 */
    @Inject(API_KEY_HASHER)
    private readonly hasher: ApiKeyHasher | undefined,
    @Inject(INVALID_KEY_THROTTLE)
    private readonly invalidKeyThrottle: InvalidKeyThrottle,
    @Inject(LLM_CALL_LOG_REPOSITORY)
    private readonly callLogs: LlmCallLogRepository,
    @Optional()
    @Inject(API_KEY_CLOCK)
    clock?: () => Date,
  ) {
    this.now = clock ?? (() => new Date());
  }

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<GatewayRequest>();
    const hasher = this.hasher;
    if (hasher === undefined) {
      throw gatewayError("NOT_CONFIGURED");
    }

    const token = parseBearerToken(request.headers?.authorization);
    if (token === undefined) {
      this.assertNotFlooding(request);
      throw gatewayError("INVALID_API_KEY", {
        detail: "缺少或格式错误的 Authorization: Bearer 头",
      });
    }

    const record = await this.repository.findByHashes(
      hasher.candidateHashes(token),
    );
    if (record === null) {
      this.assertNotFlooding(request);
      throw gatewayError("INVALID_API_KEY");
    }

    if (record.status === "revoked") {
      await this.recordRejection(record, request, "key_revoked", 403);
      throw gatewayError("KEY_REVOKED");
    }
    if (record.status === "disabled") {
      await this.recordRejection(record, request, "key_disabled", 403);
      throw gatewayError("KEY_DISABLED");
    }
    if (
      record.expiresAt !== null &&
      record.expiresAt.getTime() <= this.now().getTime()
    ) {
      await this.recordRejection(record, request, "key_expired", 403);
      throw gatewayError("KEY_EXPIRED", {
        detail: `过期于 ${record.expiresAt.toISOString()}`,
      });
    }

    const employeeStatus = await this.repository.findEmployeeStatus(
      record.employeeId,
    );
    if (employeeStatus !== "active") {
      await this.recordRejection(record, request, "employee_inactive", 403);
      throw gatewayError("EMPLOYEE_INACTIVE");
    }

    request.apiKey = {
      keyId: record.keyId,
      employeeId: record.employeeId,
      keyPrefix: record.keyPrefix,
      limits: record.limits,
    };
    return true;
  }
}

/**
 * 解析 Bearer 凭据；大小写不敏感（RFC 7235 的 scheme 不区分大小写），
 * 允许两侧多余空白，但拒绝空 token 与多值头。
 */
export function parseBearerToken(
  header: string | readonly string[] | undefined,
): string | undefined {
  if (typeof header !== "string") return undefined;
  const match = /^\s*Bearer\s+(\S+)\s*$/iu.exec(header);
  return match?.[1] === undefined || match[1] === "" ? undefined : match[1];
}

/** 从 `/v1` 路径推断端点（守卫在处理器之前就要记账，拿不到控制器的路由信息）。 */
function endpointOf(url: string | undefined): LlmCallEndpoint {
  const path = (url ?? "").split("?", 1)[0] ?? "";
  if (path.includes("/embeddings")) return "embeddings";
  if (path.includes("/chat/completions")) return "chat_completions";
  return "models";
}
