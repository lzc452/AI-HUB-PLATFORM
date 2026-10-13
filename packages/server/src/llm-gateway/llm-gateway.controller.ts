import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  UseFilters,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Public } from "../authorization/authorization.decorator.js";
import { ApiKeyGuard, type GatewayRequest } from "./api-key.guard.js";
import { LlmGatewayExceptionFilter } from "./llm-gateway.exception.filter.js";
import { LLM_GATEWAY_API_SERVICE } from "./llm-gateway.tokens.js";
import { LlmGatewayService } from "./llm-gateway.service.js";

/**
 * 网关面（`/v1`，OpenAI 兼容；PRD 8.2）。
 *
 * 与平台其他控制器的三点不同，都是刻意为之：
 *
 * 1. `@Public()`——网关面不用 Cookie 会话；凭据是 `Authorization: Bearer sk-aihub-…`，
 *    由 `ApiKeyGuard` 独立校验。这也意味着**不要**在这里读 `@CurrentActor()`：
 *    `@Public()` 路径不会设置 `request.actor`。
 * 2. `@UseFilters(LlmGatewayExceptionFilter)`——必须覆盖全局 ProblemDetailsFilter，
 *    否则错误体变成平台格式，OpenAI SDK 解析不了（PRD 8.3 R3-04）。
 * 3. 请求体类型是 `Record<string, unknown>` 而**不是**校验 DTO——全局 ValidationPipe 的
 *    `whitelist: true` 会剔除「未声明校验装饰器」的字段，一旦这里声明 DTO，
 *    `tools`、`response_format`、厂商扩展字段都会被静默删掉（PRD 8.3 R3-03）。
 *    参数类型为 Object 时 ValidationPipe 不做校验，正好满足原样透传。
 *
 * 流式（`stream=true`）在 M3 实现。
 */
@ApiTags("模型网关（OpenAI 兼容）")
@Controller("/v1")
@Public()
@UseGuards(ApiKeyGuard)
@UseFilters(LlmGatewayExceptionFilter)
export class LlmGatewayController {
  public constructor(
    @Inject(LLM_GATEWAY_API_SERVICE)
    private readonly gateway: LlmGatewayService,
  ) {}

  @Get("/models")
  @ApiOperation({ summary: "模型列表（透传上游，需 Bearer API Key）" })
  public async listModels(): Promise<unknown> {
    return this.gateway.listModels();
  }

  @Post("/chat/completions")
  // Nest 对 POST 默认返回 201；OpenAI 契约要求 200，显式覆盖（否则 SDK 语义不符）
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "对话补全（非流式；流式在 M3 开放）",
    description:
      "请求体原样转发至上游 vLLM，成功响应原样返回，保持 OpenAI 兼容。",
  })
  public async chatCompletions(
    @Body() body: Record<string, unknown>,
    @Req() request: GatewayRequest,
  ): Promise<unknown> {
    // ApiKeyGuard 保证此处已挂载 apiKey（未通过则不会进入处理器）
    const apiKey = request.apiKey!;
    return this.gateway.chatCompletions(body, apiKey);
  }
}
