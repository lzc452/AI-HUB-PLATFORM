import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UseFilters,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { Public } from "../authorization/authorization.decorator.js";
import { ApiKeyGuard, type GatewayRequest } from "./api-key.guard.js";
import { LlmGatewayExceptionFilter } from "./llm-gateway.exception.filter.js";
import {
  createExpressSink,
  type ExpressLikeRequest,
} from "./llm-gateway.sink.js";
import { LLM_GATEWAY_API_SERVICE } from "./llm-gateway.tokens.js";
import { LlmGatewayService } from "./llm-gateway.service.js";

/**
 * 网关面（`/v1`，OpenAI 兼容；PRD 8.2）。
 *
 * 与平台其他控制器的四点不同，都是刻意为之：
 *
 * 1. `@Public()`——网关面不用 Cookie 会话；凭据是 `Authorization: Bearer sk-aihub-…`，
 *    由 `ApiKeyGuard` 独立校验。因此**不要**在这里读 `@CurrentActor()`。
 * 2. `@UseFilters(LlmGatewayExceptionFilter)`——必须覆盖全局 ProblemDetailsFilter，
 *    否则错误体变成平台格式，OpenAI SDK 解析不了（PRD 8.3 R3-04）。
 * 3. 请求体类型是 `Record<string, unknown>` 而**不是**校验 DTO——全局 ValidationPipe 的
 *    `whitelist: true` 会剔除「未声明校验装饰器」的字段，一旦这里声明 DTO，
 *    `tools`、`response_format`、厂商扩展字段都会被静默删掉（PRD 8.3 R3-03）。
 * 4. 对话补全用 `@Res()` 自己写响应——流式必须逐块写，且状态码要严格贴合 OpenAI 契约
 *    （框架对 POST 默认 201，embeddings 上已显式覆盖为 200）。
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

  @Post("/embeddings")
  // POST 默认 201，OpenAI 契约要求 200
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "向量化（透传上游）" })
  public async embeddings(
    @Body() body: Record<string, unknown>,
    @Req() request: GatewayRequest,
  ): Promise<unknown> {
    return this.gateway.embeddings(body, request.apiKey!);
  }

  @Post("/chat/completions")
  // `@Res()` 下框架仍会把 POST 的默认状态设为 201，而 `flushHeaders()` 会把它写出去，
  // 因此这里必须显式覆盖（流式与非流式共用该默认值）
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "对话补全（非流式返回 JSON；`stream=true` 返回 SSE）",
    description:
      "请求体原样转发至上游 vLLM。流式会自动注入 `stream_options.include_usage` 以支撑计量；" +
      "流式中途失败以 SSE `error` 事件收尾且不发送 `[DONE]`。",
  })
  public async chatCompletions(
    @Body() body: Record<string, unknown>,
    @Req() request: GatewayRequest,
    @Res() response: Response,
  ): Promise<void> {
    const apiKey = request.apiKey!; // ApiKeyGuard 保证已挂载
    // Nest 的 request 在运行时就是 Express request（含 `on`）；类型上做一次收窄
    const sink = createExpressSink(
      request as unknown as ExpressLikeRequest,
      response,
    );
    if (body["stream"] === true) {
      await this.gateway.chatCompletionsStream(body, apiKey, sink);
      return;
    }
    // 非流式也走 sink：状态码与信封由网关而非框架决定（POST 默认 201 会破坏契约）
    const result = await this.gateway.chatCompletions(body, apiKey);
    sink.json(HttpStatus.OK, result);
  }
}
