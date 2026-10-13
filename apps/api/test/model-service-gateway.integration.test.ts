import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { Test, type TestingModule } from "@nestjs/testing";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { ValidationPipe } from "@nestjs/common";
import {
  createDatabase,
  runMigrations,
  type DatabaseSchema,
} from "@ai-hub/database";
import {
  LLM_GATEWAY_SERVICE,
  LlmGatewayModule,
  ModelServiceKeyService,
  type LlmGatewayModuleOptions,
} from "@ai-hub/server";
import { startPostgresTestContainer } from "@ai-hub/testing";
import type { Kysely } from "kysely";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { configureApiBodyParsers } from "../src/body-parser.js";

const SECRET = "0123456789abcdef0123456789abcdef";
const UPSTREAM_TIMEOUT_MS = 150;
const GATEWAY_BODY_LIMIT_BYTES = 1024;

/**
 * M2 退出条件的端到端证据：**真实 Nest 应用 + 真实 PostgreSQL + 真实 Key**，
 * 上游用本地桩（PRD 16.3 要求 e2e 不依赖真实 GPU 服务）。
 *
 * 真实 vLLM（10.10.181.82:3040）在开发机不可达，联调待内网环境；本用例覆盖的是
 * 网关自身的全部契约：鉴权链、透传不改写、错误信封、超时分类与 body 上限。
 */
describe("模型网关 /v1 端到端（桩上游 + 真库真 Key）", () => {
  const suffix = randomUUID();
  const employeeId = `GW-${suffix}`.toUpperCase();
  const departmentId = `gw-dept-${suffix}`;

  let db: Kysely<DatabaseSchema>;
  let stop: (() => Promise<void>) | undefined;
  let app: NestExpressApplication;
  let moduleRef: TestingModule;
  let keys: ModelServiceKeyService;
  let upstream: { server: Server; baseUrl: string; received: unknown[] };

  const actor = {
    employeeId,
    roleCodes: ["employee"],
    permissions: [],
    departmentIds: [departmentId],
    primaryDepartmentId: departmentId,
    sessionId: `gw-session-${suffix}`,
  };

  beforeAll(async () => {
    // ---- 上游桩：按 model 字段分流，便于覆盖各类上游失败 ----
    const received: unknown[] = [];
    const server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        const parsed =
          body === "" ? {} : (JSON.parse(body) as { model?: string });
        const url = (req.url ?? "").split("?")[0];
        if (url === "/v1/models") {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(
            JSON.stringify({
              object: "list",
              data: [
                { id: "Qwen3.5 35B A3B", object: "model", owned_by: "vllm" },
              ],
            }),
          );
          return;
        }
        received.push(parsed);
        switch (parsed.model) {
          case "nope":
            res.writeHead(404, { "content-type": "application/json" });
            res.end(JSON.stringify({ error: { message: "model not found" } }));
            return;
          case "boom":
            res.writeHead(503, { "content-type": "application/json" });
            res.end(
              JSON.stringify({ error: { message: "engine overloaded" } }),
            );
            return;
          case "slow":
            return; // 不应答，触发适配器超时
          default:
            res.writeHead(200, { "content-type": "application/json" });
            res.end(
              JSON.stringify({
                id: "chatcmpl-stub",
                object: "chat.completion",
                model: parsed.model,
                // 回显收到的请求体，用于断言网关没有改写字段
                echo: parsed,
                choices: [
                  { index: 0, message: { role: "assistant", content: "hi" } },
                ],
                usage: {
                  prompt_tokens: 5,
                  completion_tokens: 2,
                  total_tokens: 7,
                },
              }),
            );
        }
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("STUB_ADDRESS_UNKNOWN");
    }
    upstream = {
      server,
      baseUrl: `http://127.0.0.1:${address.port}/v1`,
      received,
    };

    // ---- 真库 ----
    const container = await startPostgresTestContainer();
    stop = container.stop;
    db = createDatabase(container.databaseUrl);
    await runMigrations(db);
    await db
      .insertInto("departments")
      .values({
        department_id: departmentId,
        name: "网关测试部门",
        source: "local",
      })
      .execute();
    await db
      .insertInto("employees")
      .values({
        employee_id: employeeId,
        display_name: "网关测试员工",
        status: "active",
        primary_department_id: departmentId,
        password_hash: null,
        password_reset_required: false,
      })
      .execute();

    // ---- 真实 Nest 应用：装配与 main.ts 一致的关键件（全局校验管道 + body parser）----
    const options: LlmGatewayModuleOptions = {
      hmacSecret: SECRET,
      hmacSecretPrevious: undefined,
      maxRpm: 6000,
      maxTpm: 10_000_000,
      maxDailyTokens: 1_000_000_000,
      maxKeysPerUser: 10,
      upstreamBaseUrl: upstream.baseUrl,
      upstreamTimeoutMs: UPSTREAM_TIMEOUT_MS,
      firstTokenTimeoutMs: 30_000,
      quotaDefaults: { rpm: 60, tpm: 100_000, dailyTokens: 2_000_000 },
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
    configureApiBodyParsers(app, 64 * 1024 * 1024, GATEWAY_BODY_LIMIT_BYTES);
    await app.init();

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

  async function createKey(name: string): Promise<string> {
    const created = await keys.createKey(actor, { name });
    return created.apiKey;
  }

  it("携带有效 Key 的对话补全：200、原样透传、且请求体字段未被全局 whitelist 剔除", async () => {
    const apiKey = await createKey("e2e-ok");
    const payload = {
      model: "Qwen3.5 35B A3B",
      messages: [{ role: "user", content: "你好" }],
      temperature: 0.2,
      // 这两个字段没有对应的校验 DTO 声明，正是 whitelist 会误删的典型
      tools: [{ type: "function", function: { name: "lookup" } }],
      response_format: { type: "json_object" },
      extra_vendor_field: "must-survive",
    };

    const response = await request(app.getHttpServer())
      .post("/v1/chat/completions")
      .set("authorization", `Bearer ${apiKey}`)
      .send(payload)
      .expect(200);

    expect(response.body).toMatchObject({
      id: "chatcmpl-stub",
      object: "chat.completion",
      usage: { total_tokens: 7 },
    });
    const echoed = (response.body as { echo: Record<string, unknown> }).echo;
    expect(echoed["tools"]).toEqual(payload.tools);
    expect(echoed["response_format"]).toEqual({ type: "json_object" });
    expect(echoed["extra_vendor_field"]).toBe("must-survive");
    expect(echoed["temperature"]).toBe(0.2);

    // 成功调用后 last_used_at 被写入
    const stored = await db
      .selectFrom("llm_api_keys")
      .select("last_used_at")
      .where("employee_id", "=", employeeId)
      .where("name", "=", "e2e-ok")
      .executeTakeFirstOrThrow();
    expect(stored.last_used_at).not.toBeNull();
  });

  it("模型列表透传上游响应", async () => {
    const apiKey = await createKey("e2e-models");
    const response = await request(app.getHttpServer())
      .get("/v1/models")
      .set("authorization", `Bearer ${apiKey}`)
      .expect(200);

    expect(response.body).toMatchObject({
      object: "list",
      data: [{ id: "Qwen3.5 35B A3B", object: "model" }],
    });
  });

  it("缺少 Authorization 返回 401 OpenAI 信封（不是平台 ProblemDetails）", async () => {
    const response = await request(app.getHttpServer())
      .post("/v1/chat/completions")
      .send({ model: "m", messages: [{ role: "user", content: "x" }] })
      .expect(401);
    expect(response.headers["content-type"]).toContain("application/json");
    expect(response.body).toEqual({
      error: {
        message: expect.any(String),
        type: "invalid_request_error",
        param: null,
        code: "invalid_api_key",
      },
    });
    // 平台信封字段不得出现在 /v1 响应里
    expect(response.body).not.toHaveProperty("traceId");
    expect(response.body).not.toHaveProperty("title");
  });

  it("未知 Key 返回 401；禁用后返回 403 key_disabled", async () => {
    await request(app.getHttpServer())
      .post("/v1/chat/completions")
      .set("authorization", "Bearer sk-aihub-unknownunknownunknownunknown")
      .send({ model: "m", messages: [{ role: "user", content: "x" }] })
      .expect(401);

    const created = await keys.createKey(actor, { name: "e2e-disabled" });
    await keys.disableKey(actor, created.summary.keyId);
    const response = await request(app.getHttpServer())
      .post("/v1/chat/completions")
      .set("authorization", `Bearer ${created.apiKey}`)
      .send({ model: "m", messages: [{ role: "user", content: "x" }] })
      .expect(403);

    expect(response.body).toMatchObject({ error: { code: "key_disabled" } });
  });

  it("轮换后旧 Key 立即失效（403 key_revoked），新 Key 可用", async () => {
    const created = await keys.createKey(actor, { name: "e2e-rotate" });
    const rotated = await keys.rotateKey(actor, created.summary.keyId);

    await request(app.getHttpServer())
      .post("/v1/chat/completions")
      .set("authorization", `Bearer ${created.apiKey}`)
      .send({ model: "m", messages: [{ role: "user", content: "x" }] })
      .expect(403)
      .expect((response) => {
        expect(response.body).toMatchObject({ error: { code: "key_revoked" } });
      });

    await request(app.getHttpServer())
      .post("/v1/chat/completions")
      .set("authorization", `Bearer ${rotated.apiKey}`)
      .send({ model: "m", messages: [{ role: "user", content: "x" }] })
      .expect(200);
  });

  it("上游 404 → model_not_found；上游 5xx → upstream_error（附带上游原因）", async () => {
    const apiKey = await createKey("e2e-upstream-errors");

    const notFound = await request(app.getHttpServer())
      .post("/v1/chat/completions")
      .set("authorization", `Bearer ${apiKey}`)
      .send({ model: "nope", messages: [{ role: "user", content: "x" }] })
      .expect(404);
    expect(notFound.body).toMatchObject({ error: { code: "model_not_found" } });

    const failed = await request(app.getHttpServer())
      .post("/v1/chat/completions")
      .set("authorization", `Bearer ${apiKey}`)
      .send({ model: "boom", messages: [{ role: "user", content: "x" }] })
      .expect(502);
    expect(failed.body).toMatchObject({ error: { code: "upstream_error" } });
    expect(
      (failed.body as { error: { message: string } }).error.message,
    ).toContain("engine overloaded");
  });

  it("上游不应答时按配置超时返回 504 upstream_timeout", async () => {
    const apiKey = await createKey("e2e-timeout");
    const response = await request(app.getHttpServer())
      .post("/v1/chat/completions")
      .set("authorization", `Bearer ${apiKey}`)
      .send({ model: "slow", messages: [{ role: "user", content: "x" }] })
      .expect(504);

    expect(response.body).toMatchObject({
      error: { code: "upstream_timeout" },
    });
  });

  it("请求体超过 /v1 上限返回 413 且信封为 OpenAI 格式（body carve-out）", async () => {
    const apiKey = await createKey("e2e-too-large");
    const response = await request(app.getHttpServer())
      .post("/v1/chat/completions")
      .set("authorization", `Bearer ${apiKey}`)
      .send({
        model: "m",
        messages: [{ role: "user", content: "x".repeat(4096) }],
      })
      .expect(413);

    expect(response.body).toMatchObject({
      error: { code: "payload_too_large", type: "invalid_request_error" },
    });
  });

  it("缺少 model 或 messages 返回 400 invalid_request_error", async () => {
    const apiKey = await createKey("e2e-invalid");
    const response = await request(app.getHttpServer())
      .post("/v1/chat/completions")
      .set("authorization", `Bearer ${apiKey}`)
      .send({ messages: [{ role: "user", content: "x" }] })
      .expect(400);

    expect(response.body).toMatchObject({
      error: { code: "invalid_request_error" },
    });
  });
});
