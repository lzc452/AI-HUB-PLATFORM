import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CatalogService,
  IdentityService,
  type InteractionService,
  type CatalogEntry,
  type CatalogRepository,
  type IdentityRepository,
} from "@ai-hub/server";
import { ApiModule } from "../src/api.module.js";

const entry: CatalogEntry = {
  applicationId: "app-platform",
  name: "平台助手",
  summary: "平台流程自动化",
  departmentId: "dept-platform",
  categoryId: "cat-productivity",
  tagIds: ["tag-ai"],
  trustLabels: ["verified"],
  currentVersionId: "version-platform",
  publishedAt: new Date("2026-08-01T00:00:00.000Z"),
  deliveryChannels: ["web"],
  likeCount: 10,
  ratingAverage: 4.5,
  healthStatus: "healthy",
  deprecatedReason: null,
  replacementApplicationId: null,
};

const identityRepository = {
  async findEmployee(employeeId: string) {
    return {
      employeeId,
      displayName: employeeId,
      status: "active" as const,
      primaryDepartmentId:
        employeeId === "E100" ? "dept-platform" : "dept-finance",
      passwordHash: null,
      passwordResetRequired: false,
    };
  },
  async findSession(sessionId: string) {
    return {
      sessionId,
      employeeId: sessionId.replace("session-", ""),
      deviceLabel: "phase4-e2e",
      expiresAt: new Date("2099-01-01"),
      revokedAt: null,
    };
  },
  async listEmployeeDepartmentIds(employeeId: string) {
    return [employeeId === "E100" ? "dept-platform" : "dept-finance"];
  },
  async listEmployeeRoles() {
    return [
      {
        roleCode: "employee",
        permissions: ["catalog.read", "interaction.interact"],
      },
    ];
  },
} as unknown as IdentityRepository;

class ApiCatalogRepository implements CatalogRepository {
  recordedActions: string[] = [];

  async listVisible(input: { actor: { departmentIds: readonly string[] } }) {
    return input.actor.departmentIds.includes(entry.departmentId)
      ? [entry]
      : [];
  }

  async findVisible(
    actor: { departmentIds: readonly string[] },
    applicationId: string,
  ) {
    return actor.departmentIds.includes(entry.departmentId) &&
      applicationId === entry.applicationId
      ? entry
      : null;
  }

  async recordDeliveryAction(input: { actionType: string }) {
    this.recordedActions.push(input.actionType);
  }

  async listCategories() {
    return [];
  }

  async listTags() {
    return [];
  }

  async findDelivery(): Promise<{ entryUrl: string; enabled: boolean } | null> {
    return { entryUrl: "https://app.company.com", enabled: true };
  }

  async findDeliveryAssetStorageKey(): Promise<string | null> {
    return null;
  }

  async getRiskDescription(): Promise<string | null> {
    return null;
  }

  async upsertRiskDescription(): Promise<void> {
    // 测试替身不持久化目录风险说明。
  }

  async findApplicationOwner(): Promise<{
    ownerEmployeeId: string;
    maintainerEmployeeId: string | null;
  } | null> {
    return { ownerEmployeeId: "E100", maintainerEmployeeId: null };
  }
}

describe("Phase 4 catalog API", () => {
  let app: INestApplication;
  let catalogRepository: ApiCatalogRepository;

  beforeAll(async () => {
    const identity = new IdentityService(identityRepository);
    catalogRepository = new ApiCatalogRepository();
    const catalog = new CatalogService(catalogRepository);
    const interactions = {
      async toggleLike() {
        return { liked: true };
      },
    } as unknown as InteractionService;
    const moduleRef = await Test.createTestingModule({
      imports: [
        ApiModule.forTest({
          databaseCheck: async () => true,
          identity,
          catalog,
          interaction: interactions,
        }),
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it("lists only applications visible to the actor", async () => {
    const response = await request(app.getHttpServer())
      .get("/internal/catalog?sort=latest&page=1&pageSize=20")
      .set("x-employee-id", "E100")
      .set("x-session-id", "session-E100")
      .expect(200);

    expect(response.body).toMatchObject({
      total: 1,
      items: [{ applicationId: "app-platform" }],
    });
  });

  it("does not reveal a detail record outside the actor audience", async () => {
    await request(app.getHttpServer())
      .get("/internal/catalog/app-platform")
      .set("x-employee-id", "E200")
      .set("x-session-id", "session-E200")
      .expect(404);
  });

  it("exposes the protected interaction route", async () => {
    await request(app.getHttpServer())
      .post("/internal/applications/app-platform/interactions/like")
      .set("x-employee-id", "E100")
      .set("x-session-id", "session-E100")
      .expect(201)
      .expect({ liked: true });
  });

  it("records delivery actions only through the visible catalog entry", async () => {
    await request(app.getHttpServer())
      .post("/internal/catalog/app-platform/actions")
      .set("x-employee-id", "E100")
      .set("x-session-id", "session-E100")
      .send({ actionType: "web_redirect", channel: "web" })
      .expect(201)
      .expect({ recorded: true });
    expect(catalogRepository.recordedActions).toEqual(["web_redirect"]);

    await request(app.getHttpServer())
      .post("/internal/catalog/app-platform/actions")
      .set("x-employee-id", "E200")
      .set("x-session-id", "session-E200")
      .send({ actionType: "web_redirect", channel: "web" })
      .expect(404);
  });
});
