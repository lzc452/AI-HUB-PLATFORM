import {
  createIdentityCookieBridge,
  DraftValidationError,
  type IdentityService,
  type PortalService,
} from "@ai-hub/server";
import { ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ApiModule } from "../src/api.module.js";

interface TestActor {
  employeeId: string;
  displayName: string;
  roleCodes: readonly string[];
  permissions: readonly string[];
  departmentIds: readonly string[];
  primaryDepartmentId: string;
  sessionId: string;
}

const createActor = (employeeId: string, sessionId: string): TestActor => ({
  employeeId,
  displayName: employeeId,
  roleCodes: ["employee"],
  permissions: ["application.create"],
  departmentIds: ["dept-portal"],
  primaryDepartmentId: "dept-portal",
  sessionId,
});

const legacyApplicationDraft = {
  name: "旧版草稿应用",
  departmentId: "dept-portal",
  maintainerEmployeeIds: ["E-header"],
  categoryId: "productivity",
  applicationType: "web_app",
  tagIds: [],
  icon: { mode: "auto", backgroundColor: "#FFFFFF", text: "旧", assetId: null },
  screenshotAssetIds: [],
  summaryHtml: "<p>兼容旧 metadata 草稿</p>",
  manualHtml: null,
  manualAssetId: null,
  examplesHtml: null,
  examplesAssetId: null,
  faq: [],
  audience: [
    {
      audienceType: "all",
      departmentId: null,
      employeeId: null,
      includeChildren: false,
    },
  ],
  risk: {
    handlesSensitiveData: false,
    sendsDataExternally: false,
    retainsConversations: false,
    retentionPeriod: null,
    modelProviders: ["local"],
    providerNote: null,
    affectsHighRiskDecisions: false,
    inputRestrictionDisclaimer: "不处理受限输入。",
  },
  deliveries: [],
  version: "1.0.0",
  changelog: "初始版本",
};

describe("Portal 发布接口认证兼容", () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  const identityCalls: Array<{ employeeId: string; sessionId: string }> = [];
  const portalCalls: Array<{
    actor: TestActor;
    name: string;
    slug: string;
    metadata?: unknown;
  }> = [];

  beforeAll(async () => {
    app = await createApp(identityCalls, portalCalls);
  });

  afterAll(async () => {
    await app.close();
  });

  it("兼容身份请求头", async () => {
    await request(app.getHttpServer())
      .post("/internal/portal/dashboard/publish")
      .set("x-employee-id", "E-header")
      .set("x-session-id", "session-header")
      .send({
        resourceType: "app",
        slug: "header-app",
        name: "Header App",
        summary: "摘要",
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body).toEqual({
          resourceId: "app-E-header",
          resourceType: "app",
        });
      });

    expect(identityCalls).toContainEqual({
      employeeId: "E-header",
      sessionId: "session-header",
    });
    expect(portalCalls).toContainEqual({
      actor: createActor("E-header", "session-header"),
      name: "Header App",
      slug: "header-app",
    });
  });

  it("优先使用 HttpOnly Cookie，并保持原有 URL 与响应结构", async () => {
    await request(app.getHttpServer())
      .post("/internal/portal/dashboard/publish")
      .set("Cookie", ["aihub_eid=E-cookie", "aihub_sid=session-cookie"])
      .set("x-employee-id", "E-header-ignored")
      .set("x-session-id", "session-header-ignored")
      .send({
        resourceType: "app",
        slug: "cookie-app",
        name: "Cookie App",
        summary: "摘要",
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body).toEqual({
          resourceId: "app-E-cookie",
          resourceType: "app",
        });
      });

    expect(identityCalls).toContainEqual({
      employeeId: "E-cookie",
      sessionId: "session-cookie",
    });
    expect(portalCalls).toContainEqual({
      actor: createActor("E-cookie", "session-cookie"),
      name: "Cookie App",
      slug: "cookie-app",
    });
  });

  it("接受完整旧 metadata 草稿输入", async () => {
    await request(app.getHttpServer())
      .post("/internal/portal/dashboard/publish")
      .set("x-employee-id", "E-header")
      .set("x-session-id", "session-header")
      .send({
        resourceType: "app",
        slug: "legacy-metadata-app",
        name: "旧版草稿应用",
        summary: "兼容旧 metadata 草稿",
        metadata: legacyApplicationDraft,
      })
      .expect(201);

    expect(portalCalls).toContainEqual({
      actor: createActor("E-header", "session-header"),
      name: "旧版草稿应用",
      slug: "legacy-metadata-app",
      metadata: legacyApplicationDraft,
    });
  });

  it("透传标准草稿字段级校验问题", async () => {
    await request(app.getHttpServer())
      .put("/internal/portal/dashboard/publish/app/app-invalid")
      .set("x-employee-id", "E-header")
      .set("x-session-id", "session-header")
      .send({
        slug: "invalid-app",
        name: "无效应用",
        summary: "用于验证字段级错误透传",
        applicationDraft: legacyApplicationDraft,
      })
      .expect(400)
      .expect(({ body }) => {
        expect(body.code).toBe("DRAFT_VALIDATION_FAILED");
        expect(body.issues).toEqual([
          { code: "DELIVERY_REQUIRED", message: "至少配置一个交付方式" },
        ]);
      });
  });
});

async function createApp(
  identityCalls: Array<{ employeeId: string; sessionId: string }>,
  portalCalls: Array<{
    actor: TestActor;
    name: string;
    slug: string;
    metadata?: unknown;
  }>,
) {
  const identity = {
    async getActorContext(employeeId: string, sessionId: string) {
      identityCalls.push({ employeeId, sessionId });
      return createActor(employeeId, sessionId);
    },
  } as IdentityService;
  const portal = {
    async createDraft(
      actor: TestActor,
      input: { name: string; slug: string; metadata?: unknown },
    ) {
      portalCalls.push({
        actor,
        name: input.name,
        slug: input.slug,
        ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
      });
      return { resourceId: `app-${actor.employeeId}`, resourceType: "app" };
    },
    async updateDraft() {
      throw new DraftValidationError([
        { code: "DELIVERY_REQUIRED", message: "至少配置一个交付方式" },
      ]);
    },
  } as unknown as PortalService;
  const moduleRef = await Test.createTestingModule({
    imports: [
      ApiModule.forTest({
        databaseCheck: async () => true,
        identity,
        portal,
      }),
    ],
  }).compile();
  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.use(createIdentityCookieBridge());
  await app.init();
  return app;
}
