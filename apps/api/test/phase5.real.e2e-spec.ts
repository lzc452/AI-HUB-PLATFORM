import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { sql } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ApplicationService,
  DemandService,
  IdentityService,
  KyselyApplicationRepository,
  KyselyDemandRepository,
  type IdentityRepository,
} from "@ai-hub/server";
import { createDatabase, runMigrations } from "@ai-hub/database";
import { resetDatabase } from "./reset-database.js";
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
      primaryDepartmentId:
        employeeId === "E200"
          ? "dept-ops"
          : employeeId === "E300"
            ? "dept-rnd-child"
            : "dept-rnd",
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
    return [
      employeeId === "E200"
        ? "dept-ops"
        : employeeId === "E300"
          ? "dept-rnd-child"
          : "dept-rnd",
    ];
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
                "demand.prioritize",
                "demand.progress",
                "demand.merge",
                "demand.associate_application",
                "application.create",
                "application.read",
                "application.update",
                "application.publish",
              ]
            : [
                "demand.create",
                "demand.read",
                "demand.submit",
                "demand.interact",
                "demand.claim",
                "demand.collaborate",
                "application.read",
                "application.review",
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
    await resetDatabase(db);
    await sql`
      insert into departments (department_id, name, parent_department_id, source)
      values
        ('dept-rnd', 'R&D', null, 'local'),
        ('dept-rnd-child', 'R&D Child', 'dept-rnd', 'local'),
        ('dept-ops', 'Operations', null, 'local')
    `.execute(db);
    await sql`
      insert into employees (employee_id, display_name, status, primary_department_id)
      values
        ('E100', 'Requester', 'active', 'dept-rnd'),
        ('E200', 'Other department', 'active', 'dept-ops'),
        ('E300', 'Child department', 'active', 'dept-rnd-child'),
        ('E900', 'Reviewer', 'active', 'dept-rnd')
    `.execute(db);
    // publish 路径的 registerToCatalog 写入 catalog_metadata（category_id FK）
    await sql`
      insert into catalog_categories (category_id, name, sort_order, enabled)
      values ('productivity', '办公效率', 0, true)
    `.execute(db);

    const identity = new IdentityService(identityRepository);
    const artifactVerification = {
      async verifyArtifact(input: {
        artifactKey: string;
        expectedSha256: string;
        signature: string;
      }) {
        return {
          accepted: true,
          scanStatus: "passed" as const,
          sha256: input.expectedSha256,
        };
      },
    };
    const application = new ApplicationService(
      new KyselyApplicationRepository(db),
      { authorize: (input) => identity.authorize(input) },
      artifactVerification,
    );
    const service = new DemandService(
      new KyselyDemandRepository(db),
      {
        authorize: (input) => identity.authorize(input),
      },
      application,
    );
    const moduleRef = await Test.createTestingModule({
      imports: [
        ApiModule.forTest({
          databaseCheck: async () => true,
          identity,
          demand: service,
          application,
          artifactVerification,
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
    const childDepartment = actorHeaders("E300");
    const reviewer = actorHeaders("E900");
    const createResponse = await request(app.getHttpServer())
      .post("/internal/demands")
      .set(requester)
      .send({
        title: "R&D knowledge assistant",
        problemStatement: "R&D teams cannot find approved guidance quickly.",
        businessScenario: "R&D teams search for guidance during development.",
        impact: "Slow guidance lookup delays weekly delivery.",
        desiredOutcome: "Return cited guidance in under one minute.",
        currentWorkaround: "Manual searches across shared drives.",
        dataSensitivity: "Internal, medium sensitivity.",
        audienceType: "department",
        departmentId: "dept-rnd",
        includeChildren: true,
        displayAnonymously: true,
      })
      .expect(201);
    const demandId = createResponse.body.demandId as string;

    await request(app.getHttpServer())
      .post(`/internal/demands/${demandId}/submit-review`)
      .set(requester)
      .expect(201);
    const published = await request(app.getHttpServer())
      .post(`/internal/demands/${demandId}/review`)
      .set(reviewer)
      .send({ decision: "publish" })
      .expect(201);

    const priority = await request(app.getHttpServer())
      .post(`/internal/demands/${demandId}/priority`)
      .set(reviewer)
      .send({
        expectedVersion: published.body.version,
        businessValue: 5,
        impactedHeadcount: 4,
        usageFrequency: 5,
        strategicFit: 5,
        technicalFeasibility: 4,
        dataComplianceRisk: 1,
        implementationCost: 2,
      })
      .expect(201);
    expect(priority.body).toMatchObject({ priorityScore: 4.6 });
    const claimed = await request(app.getHttpServer())
      .post(`/internal/demands/${demandId}/claim`)
      .set(requester)
      .send({ expectedVersion: priority.body.version })
      .expect(201);
    const statusClaimed = await request(app.getHttpServer())
      .post(`/internal/demands/${demandId}/status`)
      .set(reviewer)
      .send({
        expectedVersion: claimed.body.version,
        nextStatus: "claimed",
      })
      .expect(201);
    const progress = await request(app.getHttpServer())
      .post(`/internal/demands/${demandId}/progress`)
      .set(reviewer)
      .send({
        title: "Implementation started",
        body: "The first governed workflow is being tested.",
      })
      .expect(201);
    expect(progress.body.status).toBe("claimed");
    const pilot = await request(app.getHttpServer())
      .post(`/internal/demands/${demandId}/pilots`)
      .set(reviewer)
      .send({
        name: "R&D pilot",
        startsAt: "2026-08-10T00:00:00.000Z",
        endsAt: "2026-08-20T00:00:00.000Z",
      })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/internal/demands/${demandId}/pilots/${pilot.body.pilotId}`)
      .set(reviewer)
      .send({ status: "running" })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/internal/demands/${demandId}/status`)
      .set(reviewer)
      .send({
        expectedVersion: statusClaimed.body.version,
        nextStatus: "closed",
        reason: "Pilot workflow completed for this demand.",
      })
      .expect(201);
    await request(app.getHttpServer())
      .get("/internal/demands?sort=priority")
      .set(reviewer)
      .expect(200)
      .then((response) =>
        expect(response.body.items[0]).toMatchObject({
          demandId,
          priorityScore: 4.6,
        }),
      );

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
      .get("/internal/demands")
      .set(childDepartment)
      .expect(200)
      .then((response) => expect(response.body.items).toHaveLength(1));

    await request(app.getHttpServer())
      .get(`/internal/demands/${demandId}`)
      .set(otherDepartment)
      .expect(404);
    const anonymousDetail = await request(app.getHttpServer())
      .get(`/internal/demands/${demandId}`)
      .set(childDepartment)
      .expect(200);
    expect(anonymousDetail.body.requesterEmployeeId).toBeNull();
    const auditedDetail = await request(app.getHttpServer())
      .get(`/internal/demands/${demandId}`)
      .set(reviewer)
      .expect(200);
    expect(auditedDetail.body.requesterEmployeeId).toBe("E100");

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

  it("protects concurrent claim and collaborator assignment with version and uniqueness", async () => {
    const requester = actorHeaders("E100");
    const otherEmployee = actorHeaders("E200");
    const reviewer = actorHeaders("E900");
    const createResponse = await request(app.getHttpServer())
      .post("/internal/demands")
      .set(requester)
      .send({
        title: "Concurrent ownership demand",
        problemStatement: "Multiple teams may claim the same governed request.",
        businessScenario: "Multiple teams compete to own a request.",
        impact: "Duplicate ownership causes delivery conflicts.",
        desiredOutcome: "Exactly one owner coordinates the implementation.",
        currentWorkaround: "Manual coordination meetings.",
        dataSensitivity: "Internal, low sensitivity.",
        audienceType: "all",
      })
      .expect(201);
    const demandId = createResponse.body.demandId as string;
    await request(app.getHttpServer())
      .post(`/internal/demands/${demandId}/submit-review`)
      .set(requester)
      .expect(201);
    const published = await request(app.getHttpServer())
      .post(`/internal/demands/${demandId}/review`)
      .set(reviewer)
      .send({ decision: "publish" })
      .expect(201);

    const claimResponses = await Promise.all(
      [requester, otherEmployee].map((headers) =>
        request(app.getHttpServer())
          .post(`/internal/demands/${demandId}/claim`)
          .set(headers)
          .send({ expectedVersion: published.body.version }),
      ),
    );
    expect(claimResponses.map((response) => response.status).sort()).toEqual([
      201, 400,
    ]);
    const claimed = claimResponses.find((response) => response.status === 201);
    expect(claimed?.body.ownerEmployeeId).toBeTruthy();
    const ownerEmployeeId = claimed?.body.ownerEmployeeId as string;
    const ownerHeaders = actorHeaders(ownerEmployeeId);
    const collaboratorTargets =
      ownerEmployeeId === "E100" ? ["E900", "E200"] : ["E900", "E100"];
    const collaboratorResponses = await Promise.all(
      collaboratorTargets.map((targetEmployeeId) =>
        request(app.getHttpServer())
          .post(`/internal/demands/${demandId}/collaborators`)
          .set(ownerHeaders)
          .send({
            employeeId: targetEmployeeId,
            role: "operator",
            expectedVersion: claimed?.body.version,
          }),
      ),
    );
    expect(
      collaboratorResponses.map((response) => response.status).sort(),
    ).toEqual([201, 400]);
    const operators = await db
      .selectFrom("ai_demand_collaborators")
      .select(["employee_id"])
      .where("demand_id", "=", demandId)
      .where("role", "=", "operator")
      .execute();
    expect(operators).toHaveLength(1);
  });

  it("bridges a demand into the governed application lifecycle without bypassing publication gates", async () => {
    const requester = actorHeaders("E100");
    const operator = actorHeaders("E900");
    const createResponse = await request(app.getHttpServer())
      .post("/internal/demands")
      .set(requester)
      .send({
        title: "Demand-backed assistant",
        problemStatement: "The accepted demand needs a formal application.",
        businessScenario: "A governed demand graduates into an application.",
        impact: "Unmanaged bridges skip publication gates.",
        desiredOutcome: "The application must pass the standard review gates.",
        currentWorkaround: "Manual re-entry of demand data.",
        dataSensitivity: "Internal, medium sensitivity.",
        audienceType: "all",
      })
      .expect(201);
    const demandId = createResponse.body.demandId as string;
    await request(app.getHttpServer())
      .post(`/internal/demands/${demandId}/submit-review`)
      .set(requester)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/internal/demands/${demandId}/review`)
      .set(operator)
      .send({ decision: "publish" })
      .expect(201);
    const claimed = await request(app.getHttpServer())
      .post(`/internal/demands/${demandId}/claim`)
      .set(requester)
      .send({ expectedVersion: 3 })
      .expect(201);
    const statusClaimed = await request(app.getHttpServer())
      .post(`/internal/demands/${demandId}/status`)
      .set(operator)
      .send({
        expectedVersion: claimed.body.version,
        nextStatus: "claimed",
      })
      .expect(201);

    const bridge = await request(app.getHttpServer())
      .post(`/internal/demands/${demandId}/applications/from-demand`)
      .set(operator)
      .send({
        name: "Demand-backed assistant",
        summary: "Application created from a structured demand.",
        role: "solution",
        isPrimary: false,
        expectedVersion: statusClaimed.body.version,
      })
      .expect(201);
    const applicationId = bridge.body.applicationId as string;
    await request(app.getHttpServer())
      .post(`/internal/demands/${demandId}/applications`)
      .set(operator)
      .send({
        applicationId,
        role: "solution",
        isPrimary: true,
        expectedVersion: statusClaimed.body.version + 1,
      })
      .expect(400);

    // createVersion 要求数据库中存在已完成且扫描通过的制品上传记录
    await sql`
      insert into application_artifact_uploads
        (application_id, uploaded_by_employee_id, object_key, staging_object_key, file_name,
         mime_type, size_bytes, sha256, signature, part_count, upload_status,
         scan_status, error_code, expires_at, completed_at)
      values (
        ${applicationId}, 'E100', 'applications/phase-5/demand-backed.zip', 'applications/phase-5/demand-backed.zip',
        'demand-backed.zip', 'application/octet-stream', 20,
        'phase-5-sha256', 'phase-5-signature', 1,
        'completed', 'passed', null, now() + interval '1 hour', now()
      )
    `.execute(db);

    const version = await request(app.getHttpServer())
      .post(`/internal/applications/${applicationId}/versions`)
      .set(operator)
      .send({
        version: "1.0.0",
        changelog: "Initial demand-backed release",
        artifactKey: "applications/phase-5/demand-backed.zip",
        artifactSha256: "phase-5-sha256",
        artifactSignature: "phase-5-signature",
        scanStatus: "passed",
      })
      .expect(201);
    const versionId = version.body.applicationVersionId as string;
    for (const channel of ["web", "desktop", "mobile", "mini_program"]) {
      await request(app.getHttpServer())
        .put(`/internal/applications/${applicationId}/deliveries/${channel}`)
        .set(operator)
        .send({
          entryUrl: `https://${channel}.internal/apps/${applicationId}`,
          enabled: true,
        })
        .expect(200);
    }
    await request(app.getHttpServer())
      .post(`/internal/applications/versions/${versionId}/submit-review`)
      .set(operator)
      .expect(200);
    await request(app.getHttpServer())
      .post(`/internal/applications/versions/${versionId}/claim-review`)
      .set(requester)
      .expect(200);
    await request(app.getHttpServer())
      .post(`/internal/applications/versions/${versionId}/review`)
      .set(requester)
      .send({ decision: "approve", comment: "Demand-backed review approved." })
      .expect(200);
    const published = await request(app.getHttpServer())
      .post(`/internal/applications/${applicationId}/publish`)
      .set(operator)
      .send({ applicationVersionId: versionId })
      .expect(200);
    expect(published.body.status).toBe("published");

    await request(app.getHttpServer())
      .post(`/internal/demands/${demandId}/applications`)
      .set(operator)
      .send({
        applicationId,
        role: "solution",
        isPrimary: true,
        expectedVersion: statusClaimed.body.version + 1,
      })
      .expect(201);

    const links = await request(app.getHttpServer())
      .get(`/internal/demands/${demandId}/applications`)
      .set(operator)
      .expect(200);
    expect(links.body).toEqual([
      expect.objectContaining({
        applicationId,
        role: "solution",
        isPrimary: true,
      }),
    ]);
  });
});
