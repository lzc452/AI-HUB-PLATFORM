import { NotFoundException, type ArgumentsHost } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import {
  LlmGatewayExceptionFilter,
  toGatewayErrorDescriptor,
} from "./llm-gateway.exception.filter.js";
import { gatewayError } from "./llm-gateway.errors.js";

interface Captured {
  status?: number;
  contentType?: string;
  body?: unknown;
  written: string[];
  ended: boolean;
}

function hostFor(options: { headersSent?: boolean } = {}): {
  host: ArgumentsHost;
  captured: Captured;
} {
  const captured: Captured = { written: [], ended: false };
  const response = {
    headersSent: options.headersSent ?? false,
    status(code: number) {
      captured.status = code;
      return response;
    },
    type(contentType: string) {
      captured.contentType = contentType;
      return response;
    },
    send(body: unknown) {
      captured.body = body;
      return response;
    },
    write(chunk: string) {
      captured.written.push(chunk);
      return true;
    },
    end() {
      captured.ended = true;
      return response;
    },
  };
  const host = {
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost;
  return { host, captured };
}

describe("LlmGatewayExceptionFilter（PRD 8.2 / 8.3 R3-04）", () => {
  it("网关错误渲染为 OpenAI 信封并保留状态码", () => {
    const filter = new LlmGatewayExceptionFilter();
    const { host, captured } = hostFor();

    filter.catch(gatewayError("KEY_DISABLED"), host);

    expect(captured.status).toBe(403);
    expect(captured.contentType).toBe("application/json");
    expect(captured.body).toEqual({
      error: {
        message: expect.stringContaining("禁用"),
        type: "invalid_request_error",
        param: null,
        code: "key_disabled",
      },
    });
  });

  it("携带上游细节时进入 message，且不泄露内部堆栈字段", () => {
    const filter = new LlmGatewayExceptionFilter();
    const { host, captured } = hostFor();

    filter.catch(
      gatewayError("MODEL_NOT_FOUND", { detail: "model `nope` not found" }),
      host,
    );

    const body = captured.body as { error: { message: string } };
    expect(body.error.message).toContain("model `nope` not found");
    expect(Object.keys(body.error).sort()).toEqual([
      "code",
      "message",
      "param",
      "type",
    ]);
  });

  it("body 超限错误（中间件层抛出）映射为 413 信封", () => {
    const filter = new LlmGatewayExceptionFilter();
    const { host, captured } = hostFor();

    filter.catch(
      Object.assign(new Error("request entity too large"), {
        type: "entity.too.large",
        status: 413,
      }),
      host,
    );

    expect(captured.status).toBe(413);
    expect(captured.body).toMatchObject({
      error: { code: "payload_too_large", type: "invalid_request_error" },
    });
  });

  it("未知异常兜底 500，且不把内部信息写进响应", () => {
    const filter = new LlmGatewayExceptionFilter();
    const { host, captured } = hostFor();

    filter.catch(new Error("数据库连接串 postgres://user:pass@host/db"), host);

    expect(captured.status).toBe(500);
    expect(JSON.stringify(captured.body)).not.toContain("postgres://");
    expect(captured.body).toMatchObject({ error: { code: "internal_error" } });
  });

  it("Nest 的 404 异常映射为 model_not_found", () => {
    const filter = new LlmGatewayExceptionFilter();
    const { host, captured } = hostFor();

    filter.catch(new NotFoundException(), host);

    expect(captured.status).toBe(404);
    expect(captured.body).toMatchObject({ error: { code: "model_not_found" } });
  });

  it("流式已发头时以 SSE error 事件收尾，且不发送 [DONE]", () => {
    const filter = new LlmGatewayExceptionFilter();
    const { host, captured } = hostFor({ headersSent: true });

    filter.catch(gatewayError("UPSTREAM_TIMEOUT"), host);

    expect(captured.status).toBeUndefined();
    expect(captured.ended).toBe(true);
    expect(captured.written).toHaveLength(1);
    expect(captured.written[0]).toMatch(/^data: \{.*\}\n\n$/u);
    expect(captured.written[0]).toContain("upstream_timeout");
    expect(captured.written.join("")).not.toContain("[DONE]");
  });

  it("5xx 记录错误日志；4xx 不记录（避免日志噪声）", () => {
    const logger = { error: vi.fn() };
    const filter = new LlmGatewayExceptionFilter(logger as never);
    const server = hostFor();
    filter.catch(gatewayError("UPSTREAM_ERROR"), server.host);
    expect(logger.error).toHaveBeenCalledTimes(1);

    const client = hostFor();
    filter.catch(gatewayError("INVALID_API_KEY"), client.host);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });
});

describe("toGatewayErrorDescriptor", () => {
  it("网关错误保留原描述符", () => {
    expect(
      toGatewayErrorDescriptor(gatewayError("CIRCUIT_OPEN")),
    ).toMatchObject({
      status: 503,
      code: "circuit_open",
    });
  });

  it("未知对象不误判为 payload 超限", () => {
    expect(toGatewayErrorDescriptor({ foo: "bar" })).toMatchObject({
      status: 500,
      code: "internal_error",
    });
  });
});
