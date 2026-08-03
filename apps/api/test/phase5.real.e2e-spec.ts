import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { sql } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  DemandService,
  IdentityService,
  KyselyDemandRepository,
  type IdentityRepository,
} from "@ai-hub/server";
import { createDatabase, runMigrations } from "@ai-hub/database";
import { startPostgresTestContainer } from "@ai-hub/testing";
import { ApiModule } from "../src/api.module.js";

const actorHeaders = (employeeId: string) => ({
  "x-employee-id": employeeId,
  "x-session-id": `session-${employeeId}`,
});

const identityRepository = {
  async findEmployee(employeeId: string) {
    return {
      employeeId,
      displayName: employeeId === "E100" ? "Requester" : "Reviewer",
      status: "active" as const,
      primaryDepartmentId: employeeId === "E200" ? "dept-ops" : "dept-rnd",
      passwordHash: null,
      passwordResetRequired: false,
    };
  },
  async findSession(sessionId: string) {
    return {
      sessionId,
      employeeId: sessionId.replace("session-", ""),
      deviceLabel: "phase5-real-api-e2e",
      expiresAt: new Date("2099-01-01"),
      revokedAt: null,
    };
  },
  async listEmployeeDepartmentIds(employeeId: string) {
    return [employeeId === "E200" ? "dept-ops" : "dept-rnd"];
  },
  async listEmployeeRoles(employeeId: string) {
    return [
      {
        roleCode: employeeId === "E900" ? "demand_operator" : "employee",
        permissions:
          employeeId === "E900"
            ? [
                "demand.read",
                "demand.review",
                "demand.moderate",
                "demand.anonymous_audit",
                "demand.interact",
              ]
            : [
                "demand.create",
                "demand.read",
                "demand.submit",
                "demand.interact",
              ],
      },
    ];
  },
} as unknown as IdentityRepository;

describe("real Phase 5 demand API", () => {
  let stop: (() => Promise<void>) | undefined;
  let db: ReturnType<typeof createDatabase>;
  let app: INestApplication;

  beforeAll(async () => {
    const container = await startPostgresTestContainer();
    stop = container.stop;
    db = createDatabase(container.databaseUrl);
    await runMigrations(db);
    await sql`
      insert into departments (department_id, name, source)
      values ('dept-rnd', 'R&D', 'local'), ('dept-ops', 'Operations', 'local')
    `.execute(db);
    await sql`
      insert into employees (employee_id, display_name, status, primary_department_id)
      values
        ('E100', 'Requester', 'active', 'dept-rnd'),
        ('E200', 'Other department', 'active', 'dept-ops'),
        ('E900', 'Reviewer', 'active', 'dept-rnd')
    `.execute(db);

    const identity = new IdentityService(identityRepository);
    const service = new DemandService(new KyselyDemandRepository(db), {
      authorize: (input) => identity.authorize(input),
    });
    const moduleRef = await Test.createTestingModule({
      imports: [
        ApiModule.forTest({
          databaseCheck: async () => true,
          identity,
          demand: service,
        }),
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await db?.destroy();
    await stop?.();
  }, 60_000);

  it("enforces audience, anonymity, interactions, audit and outbox through PostgreSQL", async () => {
    const requester = actorHeaders("E100");
    const otherDepartment = actorHeaders("E200");
    const reviewer = actorHeaders("E900");
    const createResponse = await request(app.getHttpServer())
      .post("/internal/demands")
      .set(requester)
      .send({
        title: "R&D knowledge assistant",
        problemStatement: "R&D teams cannot find approved guidance quickly.",
        desiredOutcome: "Return cited guidance in under one minute.",
        audienceType: "department",
        departmentId: "dept-rnd",
        displayAnonymously: true,
      })
      .expect(201);
    const demandId = createResponse.body.demandId as string;

    await request(app.getHttpServer())
      .post(`/internal/demands/${demandId}/submit-review`)
      .set(requester)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/internal/demands/${demandId}/review`)
      .set(reviewer)
      .send({ decision: "publish" })
      .expect(201);

    await request(app.getHttpServer())
      .get("/internal/demands")
      .set(requester)
      .expect(200)
      .then((response) => expect(response.body.items).toHaveLength(1));
    await request(app.getHttpServer())
      .get("/internal/demands")
      .set(otherDepartment)
      .expect(200)
      .then((response) => expect(response.body.items).toHaveLength(0));

    await request(app.getHttpServer())
      .get(`/internal/demands/${demandId}`)
      .set(otherDepartment)
      .expect(404);
    const anonymousDetail = await request(app.getHttpServer())
      .get(`/internal/demands/${demandId}`)
      .set(reviewer)
      .expect(200);
    expect(anonymousDetail.body.requesterEmployeeId).toBeNull();

    await request(app.getHttpServer())
      .post(`/internal/demands/${demandId}/like`)
      .set(requester)
      .expect(201, { liked: true });
    await request(app.getHttpServer())
      .post(`/internal/demands/${demandId}/like`)
      .set(requester)
      .expect(201, { liked: false });

    const commentResponse = await request(app.getHttpServer())
      .post(`/internal/demands/${demandId}/comments`)
      .set(requester)
      .send({
        parentCommentId: null,
        body: "Please include source links.",
        displayAnonymously: true,
      })
      .expect(201);
    const commentId = commentResponse.body.commentId as string;
    const reportResponse = await request(app.getHttpServer())
      .post(`/internal/demands/${demandId}/reports`)
      .set(requester)
      .send({ commentId, reason: "Needs moderation review." })
      .expect(201);
    const reportId = reportResponse.body.reportId as string;
    await request(app.getHttpServer())
      .post(`/internal/demands/${demandId}/reports/${reportId}/resolve`)
      .set(reviewer)
      .send({ status: "dismissed" })
      .expect(201);

    const anonymousAuthor = await request(app.getHttpServer())
      .get(
        `/internal/demands/${demandId}/comments/${commentId}/anonymous-author`,
      )
      .set(reviewer)
      .expect(200);
    expect(anonymousAuthor.body).toEqual({ employeeId: "E100" });

    const auditCount = await db
      .selectFrom("ai_demand_audit_events")
      .select(({ fn }) => fn.countAll<number>().as("count"))
      .where("demand_id", "=", demandId)
      .executeTakeFirstOrThrow();
    const outboxCount = await db
      .selectFrom("outbox_events")
      .select(({ fn }) => fn.countAll<number>().as("count"))
      .where("aggregate_type", "=", "ai_demand")
      .where("aggregate_id", "=", demandId)
      .executeTakeFirstOrThrow();
    expect(Number(auditCount.count)).toBeGreaterThanOrEqual(7);
    expect(Number(outboxCount.count)).toBeGreaterThanOrEqual(7);
  });
});
