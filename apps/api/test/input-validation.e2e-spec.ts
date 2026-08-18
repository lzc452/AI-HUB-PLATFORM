import { Test } from "@nestjs/testing";
import request from "supertest";
import { ValidationPipe } from "@nestjs/common";
import {
  CatalogService,
  ApplicationService,
  IdentityService,
  type IdentityRepository,
} from "@ai-hub/server";
import { ApiModule } from "../src/api.module.js";

// 与 apps/api/src/main.ts 一致的全局校验配置（测试默认不挂管道，这里显式挂载以做边界实证）。
const VALIDATION_PIPE = new ValidationPipe({
  whitelist: true,
  transform: true,
  forbidNonWhitelisted: false,
});

const identityRepository = {
  async findEmployee() {
    return {
      employeeId: "E100",
      displayName: "Owner",
      status: "active" as const,
      primaryDepartmentId: "dept-rnd",
      passwordHash: null,
      passwordResetRequired: false,
    };
  },
  async findSession() {
    return {
      sessionId: "session-100",
      employeeId: "E100",
      deviceLabel: "test",
      expiresAt: new Date("2099-01-01"),
      revokedAt: null,
    };
  },
  async listEmployeeDepartmentIds() {
    return ["dept-rnd"];
  },
  async listEmployeeRoles() {
    return [
      {
        roleCode: "application_owner",
        permissions: [
          "catalog.read",
          "application.read",
          "interaction.interact",
          "feedback.read",
        ],
      },
    ];
  },
} as unknown as IdentityRepository;

const catalogService = {
  async list() {
    return { items: [], total: 0, page: 1, pageSize: 20 };
  },
} as unknown as CatalogService;

const applicationService = {
  async getApplication() {
    return { applicationId: "app-1", ownerEmployeeId: "E100" };
  },
  async listAdmin() {
    return { items: [], total: 0, page: 1, pageSize: 10 };
  },
} as unknown as ApplicationService;

const headers = {
  "x-employee-id": "E100",
  "x-session-id": "session-100",
};

describe("API 边界输入校验（高危-1 实证）", () => {
  let app: Awaited<ReturnType<typeof createApp>>;

  function createApp() {
    return Test.createTestingModule({
      imports: [
        ApiModule.forTest({
          databaseCheck: async () => true,
          identity: new IdentityService(identityRepository),
          catalog: catalogService,
          application: applicationService,
        }),
      ],
    })
      .compile()
      .then((m) => m.createNestApplication());
  }

  beforeAll(async () => {
    app = await createApp();
    app.useGlobalPipes(VALIDATION_PIPE);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("目录列表 query 校验", () => {
    it("非法 sort 枚举被拒绝（400，仅管道能拦截）", async () => {
      await request(app.getHttpServer())
        .get("/internal/catalog?sort=INVALID")
        .set(headers)
        .expect(400);
    });

    it("负页码被拒绝（400）", async () => {
      await request(app.getHttpServer())
        .get("/internal/catalog?page=-5")
        .set(headers)
        .expect(400);
    });

    it("超大 pageSize 被拒绝（400，超过 @Max(200)）", async () => {
      await request(app.getHttpServer())
        .get("/internal/catalog?pageSize=999999")
        .set(headers)
        .expect(400);
    });

    it("非数字 page 被拒绝（400）", async () => {
      await request(app.getHttpServer())
        .get("/internal/catalog?page=abc")
        .set(headers)
        .expect(400);
    });

    it("合法参数放行（200）", async () => {
      await request(app.getHttpServer())
        .get("/internal/catalog?sort=latest&page=2&pageSize=20")
        .set(headers)
        .expect(200);
    });

    it("空 query（无参数）放行（200）", async () => {
      await request(app.getHttpServer())
        .get("/internal/catalog")
        .set(headers)
        .expect(200);
    });
  });

  describe("应用管理列表 query 校验（第二个模块实证）", () => {
    it("非法 status 枚举被拒绝（400，控制器自身不兜底，仅管道拦截）", async () => {
      await request(app.getHttpServer())
        .get("/internal/applications/admin-list?status=BOGUS")
        .set(headers)
        .expect(400);
    });

    it("合法 status 放行（200）", async () => {
      await request(app.getHttpServer())
        .get("/internal/applications/admin-list?status=published&page=1")
        .set(headers)
        .expect(200);
    });
  });
});
