import { Test } from "@nestjs/testing";
import request from "supertest";
import {
  ApplicationService,
  IdentityService,
  type IdentityRepository,
} from "@ai-hub/server";
import { ApiModule } from "../src/api.module.js";

const actor = {
  employeeId: "E100",
  roleCodes: ["application_owner", "application_reviewer"],
  departmentIds: ["dept-rnd"],
  primaryDepartmentId: "dept-rnd",
  sessionId: "session-100",
} as const;

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
          "application.create",
          "application.read",
          "application.update",
          "application.publish",
          "application.review",
        ],
      },
    ];
  },
} as unknown as IdentityRepository;

const applicationService = {
  async createApplication() {
    return {
      applicationId: "app-1",
      ownerEmployeeId: "E100",
      name: "Copilot",
      summary: "Internal",
      status: "draft",
      currentVersionId: null,
    };
  },
  async createVersion() {
    return {
      applicationVersionId: "version-1",
      applicationId: "app-1",
      version: "1.0.0",
      changelog: "Initial",
      artifactKey: "artifact",
      artifactSha256: "a".repeat(64),
      artifactSignature: "sig",
      scanStatus: "passed",
      createdByEmployeeId: "E100",
      createdAt: new Date(),
    };
  },
  async configureDelivery(
    _actor: unknown,
    applicationId: string,
    input: unknown,
  ) {
    return { deliveryId: "delivery-1", applicationId, ...(input as object) };
  },
  async submitForReview() {
    return { applicationId: "app-1", status: "in_review" };
  },
  async review() {
    return { applicationId: "app-1", status: "approved" };
  },
  async publish() {
    return {
      applicationId: "app-1",
      status: "published",
      currentVersionId: "version-1",
    };
  },
  async withdraw() {
    return { applicationId: "app-1", status: "withdrawn" };
  },
  async archive() {
    return { applicationId: "app-1", status: "archived" };
  },
  async getApplication() {
    return {
      applicationId: "app-1",
      ownerEmployeeId: "E100",
      name: "Copilot",
      summary: "Internal",
      status: "published",
      currentVersionId: "version-1",
    };
  },
  async listVersions() {
    return [];
  },
  async listDeliveries() {
    return [];
  },
  async listReviews() {
    return [];
  },
  async getPublishedVersion() {
    return { applicationVersionId: "version-1" };
  },
  async getVersionSnapshot() {
    return {
      createdAt: new Date("2026-08-01T02:30:00.000Z"),
      payload: { name: "Copilot", version: "1.0.0" },
    };
  },
  async getVersionDiff() {
    return {
      changed: [{ field: "name", from: "Copilot", to: "Copilot 2" }],
      added: [],
      removed: [],
    };
  },
} as unknown as ApplicationService;

describe("application endpoints", () => {
  it("exposes protected application lifecycle and all four delivery channels", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ApiModule.forTest({
          databaseCheck: async () => true,
          identity: new IdentityService(identityRepository),
          application: applicationService,
        }),
      ],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();

    const headers = {
      "x-employee-id": actor.employeeId,
      "x-session-id": actor.sessionId,
    };
    await request(app.getHttpServer())
      .post("/internal/applications")
      .set(headers)
      .send({ name: "Copilot", summary: "Internal" })
      .expect(201);
    await request(app.getHttpServer())
      .post("/internal/applications/app-1/versions")
      .set(headers)
      .send({
        version: "1.0.0",
        changelog: "Initial",
        artifactKey: "artifact",
        artifactSha256: "a".repeat(64),
        artifactSignature: "sig",
        scanStatus: "passed",
      })
      .expect(201);
    for (const channel of ["web", "desktop", "mobile", "mini_program"]) {
      await request(app.getHttpServer())
        .put(`/internal/applications/app-1/deliveries/${channel}`)
        .set(headers)
        .send({ entryUrl: `https://${channel}.internal`, enabled: true })
        .expect(200);
    }
    await request(app.getHttpServer())
      .post("/internal/applications/versions/version-1/submit-review")
      .set(headers)
      .expect(200);
    await request(app.getHttpServer())
      .get("/internal/applications/app-1/published-version")
      .set(headers)
      .expect(200);
    await request(app.getHttpServer())
      .get("/internal/applications/app-1/versions/version-1/snapshot")
      .set(headers)
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          payload: { name: "Copilot", version: "1.0.0" },
        });
      });
    await request(app.getHttpServer())
      .get("/internal/applications/app-1/versions/version-1/diff/version-1")
      .set(headers)
      .expect(200)
      .expect((response) => {
        expect(response.body.changed).toEqual([
          { field: "name", from: "Copilot", to: "Copilot 2" },
        ]);
      });
    await app.close();
  });

  it("maps hidden snapshot resources to 404 for snapshot and diff routes", async () => {
    // 规格 §11.2：权限拒绝不暴露受限对象是否存在——不可读应用快照/差异返回 404。
    const hiddenService = {
      async getVersionSnapshot() {
        throw new Error("APPLICATION_NOT_FOUND");
      },
      async getVersionDiff() {
        throw new Error("APPLICATION_NOT_FOUND");
      },
    } as unknown as ApplicationService;
    const moduleRef = await Test.createTestingModule({
      imports: [
        ApiModule.forTest({
          databaseCheck: async () => true,
          identity: new IdentityService(identityRepository),
          application: hiddenService,
        }),
      ],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();

    const headers = {
      "x-employee-id": actor.employeeId,
      "x-session-id": actor.sessionId,
    };
    await request(app.getHttpServer())
      .get("/internal/applications/app-1/versions/version-1/snapshot")
      .set(headers)
      .expect(404);
    await request(app.getHttpServer())
      .get("/internal/applications/app-1/versions/version-1/diff/version-1")
      .set(headers)
      .expect(404);
    await app.close();
  });
});
