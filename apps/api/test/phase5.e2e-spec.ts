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
          employeeId === "E900"
            ? [
                "demand.review",
                "demand.read",
                "demand.prioritize",
                "demand.progress",
                "demand.merge",
                "demand.associate_application",
              ]
            : [
                "demand.create",
                "demand.submit",
                "demand.claim",
                "demand.collaborate",
              ],
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
      async advanceStatus() {
        return { demandId: "demand-1", status: "in_progress", version: 4 };
      },
      async addProgressUpdate() {
        return {
          progressId: "progress-1",
          demandId: "demand-1",
          status: "in_progress",
        };
      },
      async createPilot() {
        return {
          pilotId: "pilot-1",
          demandId: "demand-1",
          status: "planned",
        };
      },
      async merge() {
        return {
          source: { demandId: "demand-1", status: "merged" },
          target: { demandId: "demand-2", status: "published" },
        };
      },
      async linkApplication() {
        return {
          demandId: "demand-1",
          applicationId: "application-1",
          role: "solution",
          isPrimary: true,
        };
      },
      async listApplicationLinks() {
        return [
          {
            demandId: "demand-1",
            applicationId: "application-1",
            role: "solution",
            isPrimary: true,
          },
        ];
      },
      async createApplicationFromDemand() {
        return {
          demandId: "demand-1",
          applicationId: "application-from-demand",
          role: "solution",
          isPrimary: true,
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
    await request(app.getHttpServer())
      .post("/internal/demands/demand-1/status")
      .set({ "x-employee-id": "E900", "x-session-id": "session-E900" })
      .send({ expectedVersion: 3, nextStatus: "in_progress" })
      .expect(201);
    await request(app.getHttpServer())
      .post("/internal/demands/demand-1/progress")
      .set({ "x-employee-id": "E900", "x-session-id": "session-E900" })
      .send({
        title: "Implementation started",
        body: "The first governed workflow is being tested.",
      })
      .expect(201);
    await request(app.getHttpServer())
      .post("/internal/demands/demand-1/pilots")
      .set({ "x-employee-id": "E900", "x-session-id": "session-E900" })
      .send({
        name: "R&D pilot",
        startsAt: "2026-08-10T00:00:00.000Z",
        endsAt: "2026-08-20T00:00:00.000Z",
      })
      .expect(201);
    await request(app.getHttpServer())
      .post("/internal/demands/demand-1/merge")
      .set({ "x-employee-id": "E900", "x-session-id": "session-E900" })
      .send({
        targetDemandId: "demand-2",
        sourceExpectedVersion: 4,
        targetExpectedVersion: 1,
      })
      .expect(201);
    await request(app.getHttpServer())
      .post("/internal/demands/demand-1/applications")
      .set({ "x-employee-id": "E900", "x-session-id": "session-E900" })
      .send({
        applicationId: "application-1",
        role: "solution",
        isPrimary: true,
        expectedVersion: 5,
      })
      .expect(201);
    await request(app.getHttpServer())
      .get("/internal/demands/demand-1/applications")
      .set({ "x-employee-id": "E900", "x-session-id": "session-E900" })
      .expect(200);
    await request(app.getHttpServer())
      .post("/internal/demands/demand-1/applications/from-demand")
      .set({ "x-employee-id": "E900", "x-session-id": "session-E900" })
      .send({
        name: "Governed assistant",
        summary: "Created through the demand bridge.",
        role: "solution",
        isPrimary: true,
        expectedVersion: 6,
      })
      .expect(201);

    await app.close();
  });
});
