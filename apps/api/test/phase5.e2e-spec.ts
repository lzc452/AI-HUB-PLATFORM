import { Test } from "@nestjs/testing";
import request from "supertest";
import {
  DemandService,
  IdentityService,
  type IdentityRepository,
} from "@ai-hub/server";
import { describe, expect, it } from "vitest";
import { ApiModule } from "../src/api.module.js";

const identityRepository = {
  async findEmployee(employeeId: string) {
    return {
      employeeId,
      displayName: employeeId === "E900" ? "Reviewer" : "Requester",
      status: "active" as const,
      primaryDepartmentId: employeeId === "E900" ? "dept-ops" : "dept-rnd",
      passwordHash: null,
      passwordResetRequired: false,
    };
  },
  async findSession(sessionId: string) {
    return {
      sessionId,
      employeeId: sessionId.replace("session-", ""),
      deviceLabel: "phase5-api-test",
      expiresAt: new Date("2099-01-01"),
      revokedAt: null,
    };
  },
  async listEmployeeDepartmentIds(employeeId: string) {
    return [employeeId === "E900" ? "dept-ops" : "dept-rnd"];
  },
  async listEmployeeRoles(employeeId: string) {
    return [
      {
        roleCode: employeeId === "E900" ? "demand_reviewer" : "employee",
        permissions:
          employeeId === "E900" ? ["demand.review"] : ["demand.create"],
      },
    ];
  },
} as unknown as IdentityRepository;

describe("Phase 5 demand endpoints", () => {
  it("exposes protected create, submit and lightweight review routes", async () => {
    const demandService = {
      async createDraft() {
        return { demandId: "demand-1", status: "draft" };
      },
      async submitForReview() {
        return { demandId: "demand-1", status: "pending_review" };
      },
      async review() {
        return { demandId: "demand-1", status: "published" };
      },
      async claim() {
        return {
          demandId: "demand-1",
          status: "published",
          ownerEmployeeId: "E100",
          version: 2,
        };
      },
      async addCollaborator() {
        return {
          demandId: "demand-1",
          employeeId: "E200",
          role: "collaborator",
        };
      },
      async setPriority() {
        return {
          demandId: "demand-1",
          priorityScore: 17,
          priorityExplanation: "businessValue=5*3 + adminPriority=4*2",
          version: 3,
        };
      },
    } as unknown as DemandService;
    const moduleRef = await Test.createTestingModule({
      imports: [
        ApiModule.forTest({
          databaseCheck: async () => true,
          identity: new IdentityService(identityRepository),
          demand: demandService,
        }),
      ],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();

    await request(app.getHttpServer())
      .post("/internal/demands")
      .set({ "x-employee-id": "E100", "x-session-id": "session-E100" })
      .send({
        title: "Internal knowledge assistant",
        problemStatement:
          "Teams cannot find approved internal guidance quickly.",
        desiredOutcome: "Return cited guidance in under one minute.",
        audienceType: "all",
      })
      .expect(201);
    await request(app.getHttpServer())
      .post("/internal/demands/demand-1/submit-review")
      .set({ "x-employee-id": "E100", "x-session-id": "session-E100" })
      .expect(201);
    const review = await request(app.getHttpServer())
      .post("/internal/demands/demand-1/review")
      .set({ "x-employee-id": "E900", "x-session-id": "session-E900" })
      .send({ decision: "publish" })
      .expect(201);
    expect(review.body).toMatchObject({ status: "published" });

    await request(app.getHttpServer())
      .post("/internal/demands/demand-1/claim")
      .set({ "x-employee-id": "E100", "x-session-id": "session-E100" })
      .send({ expectedVersion: 1 })
      .expect(201);
    await request(app.getHttpServer())
      .post("/internal/demands/demand-1/collaborators")
      .set({ "x-employee-id": "E100", "x-session-id": "session-E100" })
      .send({
        employeeId: "E200",
        role: "collaborator",
        expectedVersion: 2,
      })
      .expect(201);
    await request(app.getHttpServer())
      .post("/internal/demands/demand-1/priority")
      .set({ "x-employee-id": "E900", "x-session-id": "session-E900" })
      .send({
        expectedVersion: 2,
        businessValue: 5,
        implementationCost: 2,
        riskLevel: 1,
        adminPriority: 4,
      })
      .expect(201);

    await app.close();
  });
});
