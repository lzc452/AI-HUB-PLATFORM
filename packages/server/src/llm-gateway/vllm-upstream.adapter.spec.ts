import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createVllmUpstream } from "./vllm-upstream.adapter.js";

interface StubRequest {
  method: string | undefined;
  url: string | undefined;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

interface Stub {
  baseUrl: string;
  requests: StubRequest[];
  close: () => Promise<void>;
}

/**
 * 起一个真实的本地 HTTP 桩作为上游（PRD 16.3：e2e 不依赖真实 GPU 服务）。
 * 通过真实网络栈才能验证「请求头是否被转发」「超时是否生效」这类适配器行为。
 */
async function startStub(
  handler: (
    request: StubRequest,
    response: import("node:http").ServerResponse,
  ) => void,
): Promise<Stub> {
  const requests: StubRequest[] = [];
  const server: Server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const captured: StubRequest = {
        method: request.method,
        url: request.url,
        headers: request.headers,
        body: Buffer.concat(chunks).toString("utf8"),
      };
      requests.push(captured);
      handler(captured, response);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("STUB_ADDRESS_UNKNOWN");
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    requests,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

const running: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (running.length > 0) {
    await running.pop()?.();
  }
});

describe("vLLM 上游适配器", () => {
  it("成功响应透传状态与 JSON 体，且 URL 拼接容忍尾部斜杠", async () => {
    const stub = await startStub((_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ object: "list", data: [] }));
    });
    running.push(stub.close);

    const upstream = createVllmUpstream({
      baseUrl: `${stub.baseUrl}/`,
      timeoutMs: 5_000,
    });
    const result = await upstream.listModels();

    expect(result).toEqual({
      ok: true,
      status: 200,
      body: { object: "list", data: [] },
    });
    // 尾部斜杠归一后不应出现 `//models`
    expect(stub.requests[0]?.url).toBe("/v1/models");
  });

  it("**不向上游转发 Authorization** 等客户端头，只发必要头", async () => {
    const stub = await startStub((_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end("{}");
    });
    running.push(stub.close);

    // 直接构造适配器（适配器不接受客户端头参数，这正是设计意图）
    const upstream = createVllmUpstream({
      baseUrl: stub.baseUrl,
      timeoutMs: 5_000,
    });
    await upstream.chatCompletions({ model: "m", messages: [] });

    const headers = stub.requests[0]?.headers ?? {};
    expect(headers["authorization"]).toBeUndefined();
    expect(headers["cookie"]).toBeUndefined();
    expect(headers["content-type"]).toBe("application/json");
    expect(typeof headers["x-request-id"]).toBe("string");
    // 请求体原样转发
    expect(stub.requests[0]?.body).toBe(
      JSON.stringify({ model: "m", messages: [] }),
    );
  });

  it("非 2xx 返回 http 分类与上游错误体（保留原始 JSON）", async () => {
    const stub = await startStub((_request, response) => {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(
        JSON.stringify({ error: { message: "model `nope` not found" } }),
      );
    });
    running.push(stub.close);

    const upstream = createVllmUpstream({
      baseUrl: stub.baseUrl,
      timeoutMs: 5_000,
    });
    const result = await upstream.chatCompletions({
      model: "nope",
      messages: [],
    });

    expect(result).toMatchObject({ ok: false, kind: "http", status: 404 });
    expect(result.ok === false && result.body).toEqual({
      error: { message: "model `nope` not found" },
    });
  });

  it("非 JSON 响应体保留为文本（便于诊断，不抛错）", async () => {
    const stub = await startStub((_request, response) => {
      response.writeHead(502, { "content-type": "text/html" });
      response.end("<html><body>Bad Gateway</body></html>");
    });
    running.push(stub.close);

    const upstream = createVllmUpstream({
      baseUrl: stub.baseUrl,
      timeoutMs: 5_000,
    });
    const result = await upstream.listModels();

    expect(result.ok).toBe(false);
    expect(result.ok === false && typeof result.body).toBe("string");
  });

  it("超过 timeoutMs 归类为 timeout（而不是 network）", async () => {
    const stub = await startStub((_request, response) => {
      // 永不响应，触发 AbortSignal.timeout
      setTimeout(() => response.end("late"), 3_000).unref();
    });
    running.push(stub.close);

    const upstream = createVllmUpstream({
      baseUrl: stub.baseUrl,
      timeoutMs: 120,
    });
    const result = await upstream.chatCompletions({ model: "m", messages: [] });

    expect(result).toMatchObject({ ok: false, kind: "timeout" });
    expect(result.ok === false && result.reason).toContain("timeoutMs=120");
  });

  it("连接失败归类为 network 分类并带原因", async () => {
    // 先占用再释放端口，拿到一个几乎必然无人监听的地址
    const stub = await startStub((_request, response) => response.end());
    const closedPort = stub.baseUrl;
    await stub.close();

    const upstream = createVllmUpstream({
      baseUrl: closedPort,
      timeoutMs: 2_000,
    });
    const result = await upstream.listModels();

    expect(result).toMatchObject({ ok: false, kind: "network" });
    expect(result.ok === false && typeof result.reason).toBe("string");
  });
});
