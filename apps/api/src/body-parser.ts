import type { NestExpressApplication } from "@nestjs/platform-express";
import type { IncomingMessage } from "node:http";

export const JSON_BODY_LIMIT = "1mb";

const RAW_UPLOAD_CONTENT_PATH =
  /^\/internal\/(?:applications\/[^/]+\/(?:uploads|artifact-uploads)\/[^/]+|portal\/dashboard\/publish\/app\/[^/]+\/uploads\/[^/]+)\/content(?:\?.*)?$/;

/**
 * 文件 MIME 在浏览器中由 Blob/File 决定，不能只接受 octet-stream。
 * raw parser 只在内容上传 PUT 路由启用；上传会话随后仍校验声明的 MIME、
 * 文件扩展名、大小和魔数，避免把任意业务 JSON 路由扩展为大 body 入口。
 */
function isRawUploadContentRequest(request: IncomingMessage): boolean {
  return (
    request.method === "PUT" && RAW_UPLOAD_CONTENT_PATH.test(request.url ?? "")
  );
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

export function configureApiBodyParsers(
  app: NestExpressApplication,
  artifactMaxSizeBytes: number,
): void {
  app.useBodyParser("json", {
    limit: JSON_BODY_LIMIT,
    type: (request) =>
      !isRawUploadContentRequest(request) && isJsonRequest(request),
  });
  app.useBodyParser("raw", {
    limit: artifactMaxSizeBytes,
    type: isRawUploadContentRequest,
  });
}
