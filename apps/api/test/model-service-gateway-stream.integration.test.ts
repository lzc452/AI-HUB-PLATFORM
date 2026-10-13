import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { ValidationPipe } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test, type TestingModule } from "@nestjs/testing";
import {
  createDatabase,
  runMigrations,
  type DatabaseSchema,
} from "@ai-hub/database";
import {
  businessDayStart,
  LLM_GATEWAY_SERVICE,
  LlmGatewayModule,
  ModelServiceKeyService,
  type LlmGatewayModuleOptions,
} from "@ai-hub/server";
import { startPostgresTestContainer } from "@ai-hub/testing";
import { sql, type Kysely } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { configureApiBodyParsers } from "../src/body-parser.js";

const SECRET = "0123456789abcdef0123456789abcdef";
const FIRST_TOKEN_TIMEOUT_MS = 300;
const UPSTREAM_TIMEOUT_MS = 2_000;

/** 读取 SSE 响应并记录每块到达时间（用于验证「逐块」而非「一次性」）。 */
async function readSse(
  url: string,
  init: RequestInit,
): Promise<{
  status: number;
  headers: Headers;
  chunks: Array<{ at: number; text: string }>;
  body: string;
}> {
  const startedAt = Date.now();
  const response = await fetch(url, init);
  if (response.body === null) {
    return {
      status: response.status,
      headers: response.headers,
      chunks: [],
      body: "",
    };
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks: Array<{ at: number; text: string }> = [];
  let body = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = decoder.decode(value, { stream: true });
    body += text;
    chunks.push({ at: Date.now() - startedAt, text });
  }
  return { status: response.status, headers: response.headers, chunks, body };
}

/**
 * M3 退出条件的端到端证据：**真 Nest 应用 + 真 PostgreSQL + 真 Key + SSE 桩上游**。
 *
 * 覆盖：流式逐块透传与 usage 记账、首 token 超时与中途失败的 SSE 契约、
 * 客户端断流、日配额 429（含 Retry-After）、熔断 503、以及记账落库与业务日口径
 * 与 SQL 表达式的等价性。真实 vLLM 联调仍待内网环境（见 PRD 4.3 A2）。
 */
describe("模型网关 M3（流式/配额/熔断/记账）端到端", () => {
  const suffix = randomUUID();
  const employeeId = `STREAM-${suffix}`.toUpperCase();
  const departmentId = `stream-dept-${suffix}`;

  let db: Kysely<DatabaseSchema>;
  let stop: (() => Promise<void>) | undefined;
  let app: NestExpressApplication;
  let moduleRef: TestingModule;
  let keys: ModelServiceKeyService;
  let upstream: { server: Server; baseUrl: string };
  let baseUrl: string;

  const actor = {
    employeeId,
    roleCodes: ["employee"],
    permissions: [],
    departmentIds: [departmentId],
    primaryDepartmentId: departmentId,
    sessionId: `stream-session-${suffix}`,
  };

  beforeAll(async () => {
    // ---- SSE 桩上游：按 model 分流，覆盖各类流式形态 ----
    const server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        const parsed =
          body === "" ? {} : (JSON.parse(body) as Record<string, unknown>);
        const url = (req.url ?? "").split("?")[0];
        const model = String(parsed["model"] ?? "");

        if (url === "/v1/models") {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(
            JSON.stringify({
              object: "list",
              data: [{ id: "Qwen3.5 35B A3B" }],
            }),
          );
          return;
        }

        if (parsed["stream"] === true) {
          res.writeHead(200, {
            "content-type": "text/event-stream",
            "cache-control": "no-cache",
          });
          // 关键：Node 的 writeHead 不会立刻把响应头落盘。若不调用 flushHeaders，
          // 「慢上游」连 200 头都收不到，网关只能按整体超时处理（那测的就不是首 token 超时了）。
          res.flushHeaders();
          const sse = (payload: unknown): string =>
            `data: ${JSON.stringify(payload)}\n\n`;
          if (model === "stream-slow") {
            // 永不产出：触发首 token 超时
            return;
          }
          if (model === "stream-fail") {
            res.write(sse({ choices: [{ delta: { content: "半" } }] }));
            // 直接毁掉连接：模拟上游中途断开
            setTimeout(() => res.destroy(), 20);
            return;
          }
          res.write(sse({ choices: [{ delta: { content: "你" } }] }));
          // 按 40ms 节奏产出，让「逐块透传」在客户端可观测（无限速会被 TCP 合并成一段）
          setTimeout(() => {
            res.write(sse({ choices: [{ delta: { content: "好" } }] }));
            setTimeout(() => {
              if (model !== "stream-nousage") {
                res.write(
                  sse({
                    choices: [],
                    usage: {
                      prompt_tokens: 11,
                      completion_tokens: 3,
                      total_tokens: 14,
                    },
                  }),
                );
              }
              res.write("data: [DONE]\n\n");
              res.end();
            }, 40);
          }, 40);
          return;
        }

        if (model === "boom") {
          res.writeHead(503, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: { message: "engine overloaded" } }));
          return;
        }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            id: "chatcmpl-stub",
            object: "chat.completion",
            model,
            usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
          }),
        );
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address() as AddressInfo;
    upstream = { server, baseUrl: `http://127.0.0.1:${address.port}/v1` };

    // ---- 真库 ----
    const container = await startPostgresTestContainer();
    stop = container.stop;
    db = createDatabase(container.databaseUrl);
    await runMigrations(db);
    await db
      .insertInto("departments")
      .values({
        department_id: departmentId,
        name: "流式测试部门",
        source: "local",
      })
      .execute();
    await db
      .insertInto("employees")
      .values({
        employee_id: employeeId,
        display_name: "流式测试员工",
        status: "active",
        primary_department_id: departmentId,
        password_hash: null,
        password_reset_required: false,
      })
      .execute();

    // ---- 真实 Nest 应用 ----
    const options: LlmGatewayModuleOptions = {
      hmacSecret: SECRET,
      hmacSecretPrevious: undefined,
      maxRpm: 6000,
      maxTpm: 10_000_000,
      maxDailyTokens: 1_000_000_000,
      maxKeysPerUser: 20,
      upstreamBaseUrl: upstream.baseUrl,
      upstreamTimeoutMs: UPSTREAM_TIMEOUT_MS,
      firstTokenTimeoutMs: FIRST_TOKEN_TIMEOUT_MS,
      quotaDefaults: { rpm: 1000, tpm: 10_000_000, dailyTokens: 1_000_000_000 },
      // 阈值取 5：本文件里「首 token 超时」「中途失败」两个用例会各产生一次真实故障，
      // 阈值过低会让它们把熔断器提前打穿，导致后续用例全部 503（测试之间不该互相污染）
      circuit: { failureThreshold: 5, openDurationMs: 30_000 },
    };
    moduleRef = await Test.createTestingModule({
      imports: [LlmGatewayModule.register(db, options)],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bodyParser: false,
    });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: false,
        transformOptions: { enableImplicitConversion: false },
      }),
    );
    configureApiBodyParsers(app, 64 * 1024 * 1024, 10 * 1024 * 1024);
    await app.listen(0);
    const appAddress = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${appAddress.port}`;

    keys = moduleRef.get<ModelServiceKeyService>(LLM_GATEWAY_SERVICE);
  }, 240_000);

  afterAll(async () => {
    try {
      await app?.close();
      await db?.destroy();
    } finally {
      await new Promise<void>((resolve) =>
        upstream?.server.close(() => resolve()),
      );
      await stop?.();
    }
  }, 120_000);

  async function createKey(
    name: string,
    limits: Partial<{ dailyTokenLimit: number }> = {},
  ) {
    const created = await keys.createKey(actor, { name, ...limits });
    return created.apiKey;
  }

  function chatInit(
    apiKey: string,
    model: string,
    stream: boolean,
  ): RequestInit {
    return {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "你好" }],
        stream,
      }),
    };
  }

  /**
   * 等待台账出现满足条件的行。
   *
   * 记账**有意放在响应收尾之后**（不让一次 DB 写入阻塞客户端的流式收尾），
   * 因此这里必须轮询等待落库，而不是读到即断言——否则测出来的是竞态而不是行为。
   */
  async function waitForLedgerRow(
    predicate: (row: Awaited<ReturnType<typeof ledgerRows>>[number]) => boolean,
    label: string,
  ): Promise<Awaited<ReturnType<typeof ledgerRows>>[number]> {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const row = (await ledgerRows()).find(predicate);
      if (row !== undefined) return row;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`等待台账落库超时：${label}`);
  }

  async function ledgerRows(keyId?: string) {
    const query = db
      .selectFrom("llm_api_call_logs")
      .selectAll()
      .where("employee_id", "=", employeeId)
      .orderBy("requested_at", "asc");
    const rows = await (
      keyId === undefined ? query : query.where("key_id", "=", keyId)
    ).execute();
    return rows;
  }

  it("流式成功：逐块透传、含 usage 末块与 [DONE]，并落台账（上游实测用量）", async () => {
    const apiKey = await createKey("m3-stream-ok");
    const result = await readSse(
      `${baseUrl}/v1/chat/completions`,
      chatInit(apiKey, "stream-ok", true),
    );

    expect(result.status).toBe(200);
    expect(result.headers.get("content-type")).toContain("text/event-stream");
    expect(result.headers.get("x-accel-buffering")).toBe("no");
    expect(result.body).toContain('"content":"你"');
    expect(result.body).toContain('"total_tokens":14');
    expect(result.body.trimEnd().endsWith("data: [DONE]")).toBe(true);
    // 逐块到达（不是一次性缓冲）
    expect(result.chunks.length).toBeGreaterThan(1);

    const keyId = (
      await db
        .selectFrom("llm_api_keys")
        .select("key_id")
        .where("employee_id", "=", employeeId)
        .where("name", "=", "m3-stream-ok")
        .executeTakeFirstOrThrow()
    ).key_id;
    const rows = await waitForLedgerRow(
      (item) => item.key_id === keyId,
      "stream-ok",
    ).then(() => ledgerRows(keyId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      stream: true,
      status_code: 200,
      prompt_tokens: 11,
      completion_tokens: 3,
      total_tokens: 14,
      usage_estimated: false,
      error_code: null,
      endpoint: "chat_completions",
      model: "stream-ok",
    });
    expect(rows[0]?.trace_id).not.toBeNull();
  });

  it("上游未返回 usage 时按估算记账并标记 usage_estimated", async () => {
    const apiKey = await createKey("m3-stream-nousage");
    const result = await readSse(
      `${baseUrl}/v1/chat/completions`,
      chatInit(apiKey, "stream-nousage", true),
    );
    expect(result.body).toContain("[DONE]");

    const row = await waitForLedgerRow(
      (item) => item.model === "stream-nousage",
      "stream-nousage",
    );
    expect(row.usage_estimated).toBe(true);
    expect(row.total_tokens).toBeGreaterThan(0);
  });

  it("首 token 超时：已发头后以 SSE error 事件收尾且不发 [DONE]，台账记 504", async () => {
    const apiKey = await createKey("m3-stream-slow");
    const result = await readSse(
      `${baseUrl}/v1/chat/completions`,
      chatInit(apiKey, "stream-slow", true),
    );

    expect(result.status).toBe(200); // 头已发出，状态码不可能再改
    expect(result.body).toContain('"code":"upstream_timeout"');
    expect(result.body).not.toContain("[DONE]");

    const row = await waitForLedgerRow(
      (item) => item.model === "stream-slow" && item.status_code === 504,
      "stream-slow/504",
    );
    expect(row).toMatchObject({
      status_code: 504,
      error_code: "upstream_timeout",
    });
  });

  it("中途失败：保留已发内容、追加 error 事件、不发 [DONE]，台账记 502", async () => {
    const apiKey = await createKey("m3-stream-fail");
    const result = await readSse(
      `${baseUrl}/v1/chat/completions`,
      chatInit(apiKey, "stream-fail", true),
    );

    expect(result.body).toContain('"content":"半"');
    expect(result.body).toContain('"code":"upstream_error"');
    expect(result.body).not.toContain("[DONE]");

    const row = await waitForLedgerRow(
      (item) => item.model === "stream-fail",
      "stream-fail",
    );
    expect(row).toMatchObject({
      status_code: 502,
      error_code: "upstream_error",
    });
  });

  it("客户端断流：台账记为 client_disconnected（499 语义）", async () => {
    const apiKey = await createKey("m3-stream-abort");
    const controller = new AbortController();
    const pending = fetch(`${baseUrl}/v1/chat/completions`, {
      ...chatInit(apiKey, "stream-slow", true),
      signal: controller.signal,
    });
    // 等响应头落地后中断客户端连接
    const response = await pending;
    expect(response.status).toBe(200);
    controller.abort();

    // 给服务端一点时间完成取消与记账
    await new Promise((resolve) => setTimeout(resolve, 400));

    const row = await waitForLedgerRow(
      (item) => item.status_code === 499,
      "client_disconnected",
    );
    expect(row).toMatchObject({
      status_code: 499,
      error_code: "client_disconnected",
      total_tokens: 0,
    });
  });

  it("日配额超限：429 + Retry-After，且被拒调用同样落台账", async () => {
    const apiKey = await createKey("m3-daily-quota", { dailyTokenLimit: 1 });
    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      ...chatInit(apiKey, "stream-ok", false),
    });

    expect(response.status).toBe(429);
    const retryAfter = response.headers.get("retry-after");
    expect(retryAfter).not.toBeNull();
    expect(Number(retryAfter)).toBeGreaterThan(0);
    expect(Number(retryAfter)).toBeLessThanOrEqual(86_400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("rate_limit_exceeded");

    const rows = await ledgerRows();
    const quotaRow = rows.find((item) => item.status_code === 429);
    expect(quotaRow).toMatchObject({
      error_code: "rate_limit_exceeded",
      total_tokens: 0,
    });
  });

  it("非流式对话与 embeddings 也被记账（100% 调用记录）", async () => {
    const apiKey = await createKey("m3-ledger");
    await fetch(`${baseUrl}/v1/chat/completions`, {
      ...chatInit(apiKey, "plain", false),
    }).then((response) => response.json());
    await fetch(`${baseUrl}/v1/embeddings`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ model: "Qwen3.5 35B A3B", input: "hello" }),
    }).then((response) => response.json());

    const rows = await ledgerRows();
    const keyId = (
      await db
        .selectFrom("llm_api_keys")
        .select("key_id")
        .where("employee_id", "=", employeeId)
        .where("name", "=", "m3-ledger")
        .executeTakeFirstOrThrow()
    ).key_id;
    const endpoints = rows
      .filter((row) => row.key_id === keyId)
      .map((row) => row.endpoint);
    expect(endpoints).toEqual(["chat_completions", "embeddings"]);
  });

  it("业务日边界：JS 口径与 PRD 的 SQL 表达式在真库上等价", async () => {
    const instants = [
      "2026-10-12T15:59:59Z",
      "2026-10-12T16:00:00Z",
      "2026-10-12T16:30:00Z",
      "2026-10-13T09:00:00Z",
      "2026-10-13T15:59:59Z",
    ];
    for (const instant of instants) {
      const row = await sql<{ boundary: Date }>`
        select date_trunc('day', ${sql.lit(instant)}::timestamptz at time zone 'Asia/Shanghai')
          at time zone 'Asia/Shanghai' as boundary
      `.execute(db);
      const sqlBoundary = row.rows[0]?.boundary;
      expect(sqlBoundary?.toISOString(), instant).toBe(
        businessDayStart(new Date(instant)).toISOString(),
      );
    }
  });

  // ⚠️ 必须放在最后：该用例会把熔断器打到 open（30s 窗口），后续用例会受其影响
  it("熔断：连续上游故障达到阈值后返回 503 circuit_open 且不再触达上游", async () => {
    const apiKey = await createKey("m3-breaker");
    for (let index = 0; index < 5; index += 1) {
      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        ...chatInit(apiKey, "boom", false),
      });
      expect(response.status).toBe(502);
    }

    const tripped = await fetch(`${baseUrl}/v1/chat/completions`, {
      ...chatInit(apiKey, "boom", false),
    });
    expect(tripped.status).toBe(503);
    expect(tripped.headers.get("retry-after")).not.toBeNull();
    const body = (await tripped.json()) as { error: { code: string } };
    expect(body.error.code).toBe("circuit_open");
  });
});
