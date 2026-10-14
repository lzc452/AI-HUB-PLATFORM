import {
  Catch,
  HttpException,
  Optional,
  type ArgumentsHost,
  type ExceptionFilter,
} from "@nestjs/common";
import type { Logger } from "pino";
import {
  GATEWAY_ERRORS,
  GatewayApiError,
  type GatewayErrorDescriptor,
} from "./llm-gateway.errors.js";

/**
 * 网关面异常过滤器（**控制器级**，PRD 8.3 R3-04）。
 *
 * ## 为什么必须是控制器级
 *
 * 平台有全局 `ProblemDetailsFilter`（`APP_FILTER`），它会把任何异常渲染成
 * `application/problem+json`。挂在全局就会让 `/v1` 的错误体变成平台格式，
 * 官方 OpenAI SDK 解析不到 `error.message`——错误看起来像「网关挂了」。
 * Nest 的过滤器就近生效（方法级 > 控制器级 > 全局），因此这里覆盖全局，且不影响
 * 控制面（`/internal/*` 仍走 ProblemDetails）。
 *
 * ## 已经发过头的情况（流式）
 *
 * 流式响应下发 200 与部分数据块后再出错时，HTTP 状态码已经不可能改；
 * 此时按 PRD 8.2 的约定以 SSE `error` 事件收尾，并且**不发送 `[DONE]`**，
 * 调用方据此判定「异常结束」，而不是「正常完成」。
 */

interface ResponseLike {
  status(code: number): ResponseLike;
  type(contentType: string): ResponseLike;
  setHeader(name: string, value: string): unknown;
  send(body: unknown): unknown;
  readonly headersSent?: boolean;
  write(chunk: string): unknown;
  end(): unknown;
}

interface UpstreamErrorLike {
  type?: unknown;
  name?: unknown;
  status?: unknown;
  statusCode?: unknown;
}

/** body-parser 的超限错误（Express 中间件层抛出，可能不是 HttpException）。 */
function isPayloadTooLarge(exception: unknown): boolean {
  if (typeof exception !== "object" || exception === null) return false;
  const candidate = exception as UpstreamErrorLike;
  return (
    candidate.type === "entity.too.large" ||
    candidate.name === "PayloadTooLargeError" ||
    candidate.status === 413 ||
    candidate.statusCode === 413
  );
}

/** 异常 → OpenAI 信封四要素。未知异常一律 500，不向外泄露内部细节。 */
export function toGatewayErrorDescriptor(
  exception: unknown,
): GatewayErrorDescriptor {
  if (exception instanceof GatewayApiError) {
    return exception.descriptor;
  }
  if (isPayloadTooLarge(exception)) {
    return GATEWAY_ERRORS.PAYLOAD_TOO_LARGE;
  }
  if (exception instanceof HttpException) {
    // 理论上网关路径不抛 Nest 内置异常；用 400 兜底比 500 更接近事实（例如未来加了校验）
    if (exception.getStatus() === 404) return GATEWAY_ERRORS.MODEL_NOT_FOUND;
    return GATEWAY_ERRORS.INVALID_REQUEST;
  }
  return GATEWAY_ERRORS.INTERNAL;
}

@Catch()
export class LlmGatewayExceptionFilter implements ExceptionFilter {
  /**
   * `logger` 必须标 `@Optional()`，不能只靠 TS 的可选参数。
   *
   * 该过滤器的依赖解析发生在**生产运行时**：`@UseFilters(LlmGatewayExceptionFilter)`
   * 是类引用，Nest 会按 `design:paramtypes` 解析构造依赖。`Logger` 是 pino 的
   * interface，运行时元数据里就是 `Object`，未标 `@Optional()` 会直接抛
   * 「can't resolve dependencies of the LlmGatewayExceptionFilter」而**启动失败**。
   *
   * 测试环境掩盖了这个问题的原因：vitest 走 esbuild，**不产出** `design:paramtypes`，
   * 于是参数不参与注入解析、也不报错；生产的 `@swc-node/register` 会产出元数据。
   * 因此本类的构造依赖必须显式声明注入方式（`@Optional()` / `@Inject(token)`），
   * 由 `llm-gateway.enhancer-metadata.spec.ts` 静态守住。
   */
  public constructor(@Optional() private readonly logger?: Logger) {}

  public catch(exception: unknown, host: ArgumentsHost): void {
    const descriptor = toGatewayErrorDescriptor(exception);
    const envelope = {
      error: {
        message: descriptor.message,
        type: descriptor.type,
        param: null,
        code: descriptor.code,
      },
    };

    const response = host.switchToHttp().getResponse<ResponseLike>();

    if (descriptor.status >= 500) {
      this.logger?.error(
        {
          code: descriptor.code,
          errorName:
            exception instanceof Error ? exception.name : typeof exception,
          errorMessage:
            exception instanceof Error ? exception.message : undefined,
        },
        "模型网关请求失败",
      );
    }

    // 429 必须带 Retry-After，客户端（含官方 SDK）据此退避
    if (descriptor.retryAfterSeconds !== undefined) {
      response.setHeader("Retry-After", String(descriptor.retryAfterSeconds));
    }

    if (response.headersSent === true) {
      // 流式场景：状态码已定，只能以 error 事件收尾（且不发 [DONE]）
      response.write(`data: ${JSON.stringify(envelope)}\n\n`);
      response.end();
      return;
    }

    response.status(descriptor.status).type("application/json").send(envelope);
  }
}
