import { Controller, Get, Inject, Param, StreamableFile } from "@nestjs/common";
import {
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";
import type { ActorContext } from "@ai-hub/contracts";
import {
  Authenticated,
  CurrentActor,
} from "../authorization/authorization.decorator.js";
import {
  ApiIdentityHeaders,
  ApiProblemResponses,
} from "../system/http/api-docs.decorator.js";
import { APPLICATION_UPLOAD_SERVICE } from "./application.tokens.js";
import { ApplicationUploadService } from "./application-upload.service.js";
import { Readable } from "node:stream";

@ApiTags("AI Hub Portal")
@Controller("/internal/portal/apps")
@Authenticated()
export class PortalApplicationAssetController {
  constructor(
    @Inject(APPLICATION_UPLOAD_SERVICE)
    private readonly uploads: ApplicationUploadService,
  ) {}

  @Get(":applicationId/assets/:assetId/content")
  @ApiOperation({ summary: "Portal 应用图标、截图或附件内容" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "applicationId", description: "应用 ID" })
  @ApiParam({ name: "assetId", description: "资产 ID" })
  @ApiOkResponse({ description: "资产内容流" })
  @ApiProblemResponses([400, 401, 403, 404])
  async content(
    @CurrentActor() actor: ActorContext,
    @Param("applicationId") applicationId: string,
    @Param("assetId") assetId: string,
  ) {
    const asset = await this.uploads.getAssetContent(
      actor,
      applicationId,
      assetId,
    );
    const stream =
      asset.stream instanceof Readable
        ? asset.stream
        : Readable.from(asset.stream as AsyncIterable<Uint8Array>);
    const options = { type: asset.mimeType || "application/octet-stream" } as {
      type: string;
      disposition?: string;
    };
    if (asset.assetType === "attachment") {
      options.disposition = contentDisposition(asset.fileName);
    }
    return new StreamableFile(stream, options);
  }
}

/**
 * 构造附件下载的 Content-Disposition。
 *
 * HTTP 头只允许 ASCII，中文文件名直接写进 `filename="…"` 会让 Node 抛
 * `Invalid character in header content ["Content-Disposition"]`，整个下载 500。
 * 按 RFC 6266 / RFC 5987：ASCII `filename` 给旧客户端兜底（非 ASCII 字符
 * 替换为下划线），`filename*=UTF-8''<percent-encoded>` 给现代客户端完整名称。
 */
function contentDisposition(fileName: string): string {
  const fallback = fileName
    .replace(/[^\x20-\x7e]/gu, "_")
    .replace(/["\\]/g, "_");
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
