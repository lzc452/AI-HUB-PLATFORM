import { HttpException } from "@nestjs/common";

/**
 * 网关面错误契约（PRD 8.2）。
 *
 * **为什么单独一份映射表**：控制面用平台统一的 ProblemDetails（`type/title/status/code/…`），
 * 网关面必须用 OpenAI 信封 `{ error: { message, type, param, code } }`——否则官方 SDK 解析不了
 * 错误体。两套信封来自两套鉴权（Cookie 会话 vs Bearer Key），因此不共用映射，
 * 避免某天有人把控制面的码加进来污染 /v1 契约。
 *
 * 表中每一项的 status/type/code 与 PRD 8.2 的错误表逐条对应；新增项必须同时回写该表。
 */
export const GATEWAY_ERRORS = {
  INVALID_API_KEY: {
    status: 401,
    type: "invalid_request_error",
    code: "invalid_api_key",
    message: "API Key 无效或格式错误",
  },
  KEY_DISABLED: {
    status: 403,
    type: "invalid_request_error",
    code: "key_disabled",
    message: "API Key 已被禁用，请到控制台重新启用或更换",
  },
  KEY_EXPIRED: {
    status: 403,
    type: "invalid_request_error",
    code: "key_expired",
    message: "API Key 已过期，请到控制台轮换",
  },
  KEY_REVOKED: {
    status: 403,
    type: "invalid_request_error",
    code: "key_revoked",
    message: "API Key 已撤销，不可恢复，请新建",
  },
  EMPLOYEE_INACTIVE: {
    status: 403,
    type: "invalid_request_error",
    code: "employee_inactive",
    message: "账号已停用，其名下 API Key 不可用",
  },
  INVALID_REQUEST: {
    status: 400,
    type: "invalid_request_error",
    code: "invalid_request_error",
    message: "请求体不合法",
  },
  MODEL_NOT_FOUND: {
    status: 404,
    type: "invalid_request_error",
    code: "model_not_found",
    message: "请求的模型不存在",
  },
  /** 平台侧配额/限流（RPM/TPM/日配额），附 `Retry-After`。 */
  RATE_LIMITED: {
    status: 429,
    type: "rate_limit_error",
    code: "rate_limit_exceeded",
    message: "超出平台配额限制，请按 Retry-After 稍后重试",
  },
  PAYLOAD_TOO_LARGE: {
    status: 413,
    type: "invalid_request_error",
    code: "payload_too_large",
    message: "请求体超过平台上限",
  },
  UPSTREAM_ERROR: {
    status: 502,
    type: "upstream_error",
    code: "upstream_error",
    message: "模型服务暂时不可用，请稍后重试",
  },
  UPSTREAM_RATE_LIMITED: {
    status: 429,
    type: "rate_limit_error",
    code: "upstream_rate_limited",
    message: "模型服务当前繁忙（上游限流），请稍后重试",
  },
  UPSTREAM_TIMEOUT: {
    status: 504,
    type: "upstream_error",
    code: "upstream_timeout",
    message: "模型服务响应超时（首 token 或整体超时）",
  },
  CIRCUIT_OPEN: {
    status: 503,
    type: "service_unavailable",
    code: "circuit_open",
    message: "模型服务熔断中，请稍后重试",
  },
  NOT_CONFIGURED: {
    status: 503,
    type: "service_unavailable",
    code: "gateway_not_configured",
    message: "模型网关未配置上游地址，请联系平台管理员",
  },
  INTERNAL: {
    status: 500,
    type: "api_error",
    code: "internal_error",
    message: "网关内部错误，请稍后重试",
  },
} as const;

export type GatewayErrorKey = keyof typeof GATEWAY_ERRORS;

export interface GatewayErrorDescriptor {
  status: number;
  type: string;
  code: string;
  message: string;
  /** 仅 429 使用：写入 `Retry-After` 头（秒）。 */
  retryAfterSeconds?: number | undefined;
}

/** 上游错误细节（诊断用）：进入 message 但不凭空编造，带上前缀便于定位。 */
export interface GatewayErrorOptions {
  /** 覆盖默认 message（例如带上上游返回的原因或模型名）。 */
  message?: string | undefined;
  /** 附加到 message 的诊断信息（上游状态码/错误摘要）。 */
  detail?: string | undefined;
  /** 429 时写入响应头 `Retry-After`（秒）。 */
  retryAfterSeconds?: number | undefined;
}

/**
 * 网关面异常：携带 OpenAI 信封所需的四要素。
 *
 * 只有 `LlmGatewayExceptionFilter` 会消费它；抛到控制面是编程错误（信封会串味）。
 * `message` 里保留可读中文 + 可选上游细节，便于用户自助排查。
 */
export class GatewayApiError extends HttpException {
  public readonly descriptor: GatewayErrorDescriptor;

  public constructor(key: GatewayErrorKey, options: GatewayErrorOptions = {}) {
    const base = GATEWAY_ERRORS[key];
    const message =
      options.message === undefined ? base.message : options.message;
    const detail =
      options.detail === undefined || options.detail === ""
        ? ""
        : `（${options.detail}）`;
    const descriptor: GatewayErrorDescriptor = {
      status: base.status,
      type: base.type,
      code: base.code,
      message: `${message}${detail}`,
      ...(options.retryAfterSeconds === undefined
        ? {}
        : { retryAfterSeconds: options.retryAfterSeconds }),
    };
    super(
      {
        error: {
          message: descriptor.message,
          type: descriptor.type,
          param: null,
          code: descriptor.code,
        },
      },
      descriptor.status,
    );
    this.name = "GatewayApiError";
    this.descriptor = descriptor;
  }
}

/** 便捷构造：`new GatewayApiError("MODEL_NOT_FOUND", { detail: model })`。 */
export function gatewayError(
  key: GatewayErrorKey,
  options: GatewayErrorOptions = {},
): GatewayApiError {
  return new GatewayApiError(key, options);
}

/**
 * 上游错误摘要：只取短文本，避免把上游整页 HTML/堆栈塞进用户可见的 message。
 * 截断到 200 字符并压平空白。
 */
export function summarizeUpstreamDetail(body: unknown): string {
  if (body === undefined || body === null) return "";
  let text: string;
  if (typeof body === "string") {
    text = body;
  } else if (typeof body === "object") {
    const candidate = body as {
      error?: { message?: unknown };
      message?: unknown;
    };
    const nested = candidate.error?.message ?? candidate.message;
    text = typeof nested === "string" ? nested : JSON.stringify(body);
  } else {
    text = String(body);
  }
  return text.replace(/\s+/gu, " ").trim().slice(0, 200);
}
