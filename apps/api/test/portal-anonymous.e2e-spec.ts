import {
  createIdentityCookieBridge,
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
  permissions: [],
  departmentIds: ["dept-portal"],
  primaryDepartmentId: "dept-portal",
  sessionId,
});

describe("Portal 公开读端点匿名访问", () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  const identityCalls: Array<{ employeeId: string; sessionId: string }> = [];
  const listActors: Array<TestActor | null> = [];

  beforeAll(async () => {
    app = await createApp(identityCalls, listActors);
  });

  afterAll(async () => {
    await app.close();
  });

  it("无凭据 GET 列表返回 200 且以匿名身份调用服务", async () => {
    await request(app.getHttpServer())
      .get("/internal/portal/apps")
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({
          items: [],
          total: 0,
          page: 1,
          pageSize: 20,
        });
      });

    // 匿名请求不得触发会话解析
    expect(identityCalls).toHaveLength(0);
    expect(listActors).toEqual([null]);
  });

  it("无凭据 GET 首页与详情均可访问", async () => {
    await request(app.getHttpServer()).get("/internal/portal/home").expect(200);
    await request(app.getHttpServer())
      .get("/internal/portal/apps/E-OWNER/my-app")
      .expect(200);
    await request(app.getHttpServer())
      .get("/internal/portal/skill-packages")
      .expect(200);
    await request(app.getHttpServer())
      .get("/internal/portal/docs/about")
      .expect(200);
    expect(identityCalls).toHaveLength(0);
  });

  it("携带有效会话时解析 actor 并返回个性化数据", async () => {
    await request(app.getHttpServer())
      .get("/internal/portal/apps")
      .set("x-employee-id", "E-logged-in")
      .set("x-session-id", "session-ok")
      .expect(200);

    expect(identityCalls).toEqual([
      { employeeId: "E-logged-in", sessionId: "session-ok" },
    ]);
    // 会话用户列表调用带 actor
    expect(listActors).toEqual([
      null,
      createActor("E-logged-in", "session-ok"),
    ]);
  });

  it("携带无效会话返回 401，不降级为匿名", async () => {
    await request(app.getHttpServer())
      .get("/internal/portal/apps")
      .set("x-employee-id", "E-stale")
      .set("x-session-id", "session-stale")
      .expect(401);
    expect(listActors).toHaveLength(2);
  });

  it("匿名响应带 public 缓存头与 Vary: Cookie", async () => {
    await request(app.getHttpServer())
      .get("/internal/portal/apps")
      .expect(200)
      .expect("Cache-Control", "public, max-age=300")
      .expect("Vary", "Cookie");
  });

  it("docs 内容页匿名响应不缓存", async () => {
    await request(app.getHttpServer())
      .get("/internal/portal/docs/about")
      .expect(200)
      .expect("Cache-Control", "no-cache");
  });

  it("已登录响应为 private no-cache", async () => {
    await request(app.getHttpServer())
      .get("/internal/portal/apps")
      .set("x-employee-id", "E-logged-in")
      .set("x-session-id", "session-ok")
      .expect(200)
      .expect("Cache-Control", "private, no-cache");
  });

  it("写端点与个人中心仍要求认证", async () => {
    await request(app.getHttpServer())
      .post("/internal/portal/dashboard/publish")
      .send({ resourceType: "app", slug: "x", name: "X", summary: "摘要" })
      .expect(401);
    await request(app.getHttpServer())
      .get("/internal/portal/dashboard")
      .expect(401);
    await request(app.getHttpServer())
      .get("/internal/portal/dashboard/stars")
      .expect(401);
  });
});

async function createApp(
  identityCalls: Array<{ employeeId: string; sessionId: string }>,
  listActors: Array<TestActor | null>,
) {
  const identity = {
    async getActorContext(employeeId: string, sessionId: string) {
      if (sessionId === "session-stale") {
        throw new Error("SESSION_INVALID");
      }
      identityCalls.push({ employeeId, sessionId });
      return createActor(employeeId, sessionId);
    },
  } as IdentityService;
  const portal = {
    async list(actor: TestActor | null) {
      listActors.push(actor);
      return { items: [], total: 0, page: 1, pageSize: 20 };
    },
    async home() {
      return {
        apps: [],
        skills: [],
        plugins: [],
        mcps: [],
        departments: [],
        skillPackages: [],
        updates: {
          pageKey: "updates",
          title: "更新",
          summary: "暂无更新",
        },
      };
    },
    async detail() {
      return {
        resourceId: "00000000-0000-0000-0000-000000000001",
        resourceType: "app",
        ownerEmployeeId: "E-OWNER",
        ownerName: "负责人",
        slug: "my-app",
        name: "我的应用",
        summary: "摘要",
        status: "published",
        metadata: {},
        favoriteCount: 0,
        isFavorited: false,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      };
    },
    async skillPackages() {
      return [];
    },
    async doc() {
      return {
        pageKey: "about",
        title: "关于",
        summary: "介绍",
        bodyMarkdown: "",
      };
    },
    async departments() {
      return [];
    },
    async hunt() {
      return [];
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
