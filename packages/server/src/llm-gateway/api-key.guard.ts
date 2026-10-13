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
  MODEL_SERVICE_KEY_REPOSITORY,
} from "./llm-gateway.tokens.js";
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

  public constructor(
    @Inject(MODEL_SERVICE_KEY_REPOSITORY)
    private readonly repository: ModelServiceKeyRepository,
    /** 未配置密钥时为空——此时一切调用都按未配置处理。 */
    @Inject(API_KEY_HASHER)
    private readonly hasher: ApiKeyHasher | undefined,
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
      throw gatewayError("INVALID_API_KEY", {
        detail: "缺少或格式错误的 Authorization: Bearer 头",
      });
    }

    const record = await this.repository.findByHashes(
      hasher.candidateHashes(token),
    );
    if (record === null) {
      throw gatewayError("INVALID_API_KEY");
    }

    if (record.status === "revoked") throw gatewayError("KEY_REVOKED");
    if (record.status === "disabled") throw gatewayError("KEY_DISABLED");
    if (
      record.expiresAt !== null &&
      record.expiresAt.getTime() <= this.now().getTime()
    ) {
      throw gatewayError("KEY_EXPIRED", {
        detail: `过期于 ${record.expiresAt.toISOString()}`,
      });
    }

    const employeeStatus = await this.repository.findEmployeeStatus(
      record.employeeId,
    );
    if (employeeStatus !== "active") {
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
