import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, runMigrations } from "@ai-hub/database";
import { startPostgresTestContainer } from "@ai-hub/testing";
import { ApiModule } from "../src/api.module.js";
import { configureSwagger } from "../src/swagger.js";

const EXPECTED_TAGS = [
  "身份与组织",
  "应用",
  "市场目录",
  "互动",
  "通知",
  "创作者",
  "需求",
  "分析",
  "健康检查",
  "指标",
] as const;

describe("swagger API docs", () => {
  let db: ReturnType<typeof createDatabase>;
  let stop: (() => Promise<void>) | undefined;
  let app: INestApplication;

  beforeAll(async () => {
    const container = await startPostgresTestContainer();
    stop = container.stop;
    db = createDatabase(container.databaseUrl);
    await runMigrations(db);

    const moduleRef = await Test.createTestingModule({
      imports: [ApiModule.register(container.databaseUrl)],
    }).compile();
    app = moduleRef.createNestApplication();
    configureSwagger(app, { enabled: true });
    await app.init();
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await db?.destroy();
    await stop?.();
  }, 60_000);

  it("serves the Swagger UI at /internal/docs", async () => {
    await request(app.getHttpServer()).get("/internal/docs").expect(200);
  });

  it("serves OpenAPI JSON with all module tags and full endpoint coverage", async () => {
    const response = await request(app.getHttpServer())
      .get("/internal/docs-json")
      .expect(200);

    const document = response.body as {
      info: { title: string };
      tags: readonly { name: string }[];
      paths: Readonly<Record<string, unknown>>;
    };

    expect(document.info.title).toBe("AI Hub 平台 API");
    expect(document.tags.map((tag) => tag.name)).toEqual(
      expect.arrayContaining([...EXPECTED_TAGS]),
    );
    expect(Object.keys(document.paths).length).toBeGreaterThanOrEqual(60);
  });
});
