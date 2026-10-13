import type { NestExpressApplication } from "@nestjs/platform-express";
import type { IncomingMessage } from "node:http";
import { GATEWAY_ERRORS } from "@ai-hub/server";

export const JSON_BODY_LIMIT = "1mb";

const RAW_UPLOAD_CONTENT_PATH =
  /^\/internal\/(?:applications\/[^/]+\/(?:uploads|artifact-uploads)\/[^/]+|portal\/dashboard\/publish\/app\/[^/]+\/uploads\/[^/]+)\/content(?:\?.*)?$/;

/** 模型网关路径前缀（PRD 8.3）：单独一套 body 上限与错误信封。 */
const GATEWAY_PATH_PREFIX = "/v1";

/**
 * 文件 MIME 在浏览器中由 Blob/File 决定，不能只接受 octet-stream。
 * raw parser 只在内容上传 PUT 与需求附件 POST 路由启用；随后仍校验声明的 MIME、
 * 文件扩展名、大小和魔数，避免把任意业务 JSON 路由扩展为大 body 入口。
 */
function isRawUploadContentRequest(request: IncomingMessage): boolean {
  return (
    (request.method === "PUT" &&
      RAW_UPLOAD_CONTENT_PATH.test(request.url ?? "")) ||
    (request.method === "POST" &&
      /^\/internal\/demands\/uploads(?:\?.*)?$/.test(request.url ?? ""))
  );
}

function pathOf(request: IncomingMessage): string {
  return (request.url ?? "/").split("?", 1)[0]!;
}

function isJsonRequest(request: IncomingMessage): boolean {
  const header = request.headers["content-type"];
  const contentType = (Array.isArray(header) ? header[0] : header)
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  return (
    contentType === "application/json" ||
    contentType?.endsWith("+json") === true
  );
}

/**
 * 模型网关请求（`/v1`，含无尾斜杠的精确匹配）。
 *
 * 用前缀边界而不是 `startsWith("/v1")`：否则 `/v1-evil` 这类路径会误享网关的宽松上限。
 */
function isGatewayRequest(request: IncomingMessage): boolean {
  const path = pathOf(request);
  return (
    path === GATEWAY_PATH_PREFIX || path.startsWith(`${GATEWAY_PATH_PREFIX}/`)
  );
}

function isPayloadTooLargeError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as {
    type?: unknown;
    name?: unknown;
    status?: unknown;
    statusCode?: unknown;
  };
  return (
    candidate.type === "entity.too.large" ||
    candidate.name === "PayloadTooLargeError" ||
    candidate.status === 413 ||
    candidate.statusCode === 413
  );
}

interface GatewayErrorResponse {
  status(code: number): GatewayErrorResponse;
  json(body: unknown): unknown;
}

/**
 * 配置 body parser（PRD 8.3 R3-05）。
 *
 * `/v1` 需要比全局 1MB 更宽的上限（长上下文请求），因此：
 * 1. 全局 JSON parser **排除** `/v1`，避免宽松上限被业务路由共享；
 * 2. 为 `/v1` 单独注册 parser，上限由 `LLM_JSON_BODY_LIMIT_BYTES` 决定；
 * 3. 再挂一个 Express 错误中间件：超限错误发生在中间件层，**不会**经过 Nest 的
 *    异常过滤器，若不单独映射就会返回 Express 默认响应（非 OpenAI 信封）。
 */
export function configureApiBodyParsers(
  app: NestExpressApplication,
  artifactMaxSizeBytes: number,
  gatewayJsonBodyLimitBytes: number,
): void {
  app.useBodyParser("json", {
    limit: JSON_BODY_LIMIT,
    type: (request) =>
      !isRawUploadContentRequest(request) &&
      !isGatewayRequest(request) &&
      isJsonRequest(request),
  });
  app.useBodyParser("json", {
    limit: gatewayJsonBodyLimitBytes,
    type: (request) => isGatewayRequest(request) && isJsonRequest(request),
  });
  app.useBodyParser("raw", {
    limit: artifactMaxSizeBytes,
    type: isRawUploadContentRequest,
  });

  app.use(
    (
      error: unknown,
      request: IncomingMessage,
      response: GatewayErrorResponse,
      next: (error?: unknown) => void,
    ): void => {
      if (isGatewayRequest(request) && isPayloadTooLargeError(error)) {
        const descriptor = GATEWAY_ERRORS.PAYLOAD_TOO_LARGE;
        response.status(descriptor.status).json({
          error: {
            message: descriptor.message,
            type: descriptor.type,
            param: null,
            code: descriptor.code,
          },
        });
        return;
      }
      next(error);
    },
  );
}
