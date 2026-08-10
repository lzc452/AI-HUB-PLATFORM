import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { sql } from "kysely";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import {
  ApplicationService,
  ArtifactPipeline,
  IdentityService,
  KyselyApplicationRepository,
  MemoryObjectStorage,
  type IdentityRepository,
} from "@ai-hub/server";
import { startPostgresTestContainer } from "@ai-hub/testing";
import { createDatabase, runMigrations } from "@ai-hub/database";
import { ApiModule } from "../src/api.module.js";

const actorHeaders = (employeeId: string) => ({
  "x-employee-id": employeeId,
  "x-session-id": `session-${employeeId}`,
});

const identityRepository = {
  async findEmployee(employeeId: string) {
    return {
      employeeId,
      displayName: employeeId === "E100" ? "Owner" : "Reviewer",
      status: "active" as const,
      primaryDepartmentId:
        employeeId === "E100" ? "dept-platform" : "dept-review",
      passwordHash: null,
      passwordResetRequired: false,
    };
  },
  async findSession(sessionId: string) {
    const employeeId = sessionId.replace("session-", "");
    return {
      sessionId,
      employeeId,
      deviceLabel: "api-e2e",
      expiresAt: new Date("2099-01-01"),
      revokedAt: null,
    };
  },
  async listEmployeeDepartmentIds(employeeId: string) {
    return [employeeId === "E100" ? "dept-platform" : "dept-review"];
  },
  async listEmployeeRoles(employeeId: string) {
    return [
      {
        roleCode:
          employeeId === "E100" ? "application_owner" : "application_reviewer",
        permissions:
          employeeId === "E100"
            ? [
                "application.create",
                "application.read",
                "application.update",
                "application.publish",
              ]
            : ["application.read", "application.review"],
      },
    ];
  },
} as unknown as IdentityRepository;

describe("real application lifecycle API", () => {
  let stop: (() => Promise<void>) | undefined;
  let db: ReturnType<typeof createDatabase>;
  let app: INestApplication;
  let artifactSha256: string;

  beforeAll(async () => {
    const container = await startPostgresTestContainer();
    stop = container.stop;
    db = createDatabase(container.databaseUrl);
    await runMigrations(db);
    await sql`
      insert into departments (department_id, name, source)
      values ('dept-platform', 'Platform', 'local'), ('dept-review', 'Review', 'local')
    `.execute(db);
    await sql`
      insert into employees (employee_id, display_name, status, primary_department_id)
      values ('E100', 'Owner', 'active', 'dept-platform'), ('E200', 'Reviewer', 'active', 'dept-review')
    `.execute(db);

    const identity = new IdentityService(identityRepository);
    const pipeline = new ArtifactPipeline(new MemoryObjectStorage(), {
      async scan() {
        return "clean";
      },
      async verify() {
        return true;
      },
    });
    const content = Buffer.from("phase-3-real-artifact");
    artifactSha256 = (await import("node:crypto"))
      .createHash("sha256")
      .update(content)
      .digest("hex");
    await pipeline.putChunk("upload-1", 0, content);
    const artifact = await pipeline.completeUpload({
      uploadId: "upload-1",
      expectedChunks: 1,
      objectKey: "tmp/upload-1",
      finalObjectKey: "applications/phase-3/artifact.zip",
      expectedSha256: artifactSha256,
      signature: "signature-1",
    });
    expect(artifact.accepted).toBe(true);

    const service = new ApplicationService(
      new KyselyApplicationRepository(db),
      { authorize: (request) => identity.authorize(request) },
      pipeline,
    );
    const moduleRef = await Test.createTestingModule({
      imports: [
        ApiModule.forTest({
          databaseCheck: async () => true,
          identity,
          application: service,
          artifactVerification: pipeline,
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

  it("runs the protected four-channel lifecycle through rollback and archive", async () => {
    const ownerHeaders = actorHeaders("E100");
    const reviewerHeaders = actorHeaders("E200");
    const createResponse = await request(app.getHttpServer())
      .post("/internal/applications")
      .set(ownerHeaders)
      .send({
        name: "Real Copilot",
        summary: "PostgreSQL-backed e2e",
        maintainerEmployeeId: "E200",
        departmentId: "dept-platform",
      })
      .expect(201);
    const applicationId = createResponse.body.applicationId as string;

    const versionResponse = await request(app.getHttpServer())
      .post(`/internal/applications/${applicationId}/versions`)
      .set(ownerHeaders)
      .send({
        version: "1.0.0",
        changelog: "Initial",
        artifactKey: "applications/phase-3/artifact.zip",
        artifactSha256,
        artifactSignature: "signature-1",
        scanStatus: "passed",
      })
      .expect(201);
    const firstVersionId = versionResponse.body.applicationVersionId as string;

    for (const channel of ["web", "desktop", "mobile", "mini_program"]) {
      await request(app.getHttpServer())
        .put(`/internal/applications/${applicationId}/deliveries/${channel}`)
        .set(ownerHeaders)
        .send({
          entryUrl: `https://${channel}.internal/apps/${applicationId}`,
          enabled: true,
        })
        .expect(200);
    }

    await request(app.getHttpServer())
      .post(`/internal/applications/versions/${firstVersionId}/submit-review`)
      .set(ownerHeaders)
      .expect(200);
    const reviewQueue = await request(app.getHttpServer())
      .get(`/internal/applications/versions/${firstVersionId}/review-queue`)
      .set(reviewerHeaders)
      .expect(200);
    expect(reviewQueue.body).toMatchObject({
      status: "available",
      slaStatus: "on_time",
    });
    await request(app.getHttpServer())
      .post(`/internal/applications/versions/${firstVersionId}/review`)
      .set(ownerHeaders)
      .send({ decision: "approve", comment: "self review" })
      .expect(403);
    await request(app.getHttpServer())
      .post(`/internal/applications/versions/${firstVersionId}/claim-review`)
      .set(reviewerHeaders)
      .expect(200);
    await request(app.getHttpServer())
      .post(`/internal/applications/versions/${firstVersionId}/review`)
      .set(reviewerHeaders)
      .send({ decision: "approve", comment: "approved" })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/internal/applications/${applicationId}/publish`)
      .set(ownerHeaders)
      .send({ applicationVersionId: firstVersionId })
      .expect(200);

    const secondVersionResponse = await request(app.getHttpServer())
      .post(`/internal/applications/${applicationId}/versions`)
      .set(ownerHeaders)
      .send({
        version: "2.0.0",
        changelog: "Second release",
        artifactKey: "applications/phase-3/artifact.zip",
        artifactSha256,
        artifactSignature: "signature-1",
        scanStatus: "passed",
      })
      .expect(201);
    const secondVersionId = secondVersionResponse.body
      .applicationVersionId as string;
    await request(app.getHttpServer())
      .post(`/internal/applications/versions/${secondVersionId}/submit-review`)
      .set(ownerHeaders)
      .expect(200);
    await request(app.getHttpServer())
      .post(`/internal/applications/versions/${secondVersionId}/claim-review`)
      .set(reviewerHeaders)
      .expect(200);
    await request(app.getHttpServer())
      .post(`/internal/applications/versions/${secondVersionId}/review`)
      .set(reviewerHeaders)
      .send({ decision: "approve", comment: "second approved" })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/internal/applications/${applicationId}/publish`)
      .set(ownerHeaders)
      .send({ applicationVersionId: secondVersionId })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/internal/applications/${applicationId}/rollback`)
      .set(ownerHeaders)
      .send({ applicationVersionId: firstVersionId })
      .expect(200);
    await expect(
      request(app.getHttpServer())
        .get(`/internal/applications/${applicationId}/published-version`)
        .set(ownerHeaders),
    ).resolves.toMatchObject({
      body: { applicationVersionId: firstVersionId },
    });

    const deliveries = await request(app.getHttpServer())
      .get(`/internal/applications/${applicationId}/deliveries`)
      .set(ownerHeaders)
      .expect(200);
    expect(deliveries.body).toHaveLength(4);

    await request(app.getHttpServer())
      .post(`/internal/applications/${applicationId}/withdraw`)
      .set(ownerHeaders)
      .send({ reason: "rollback test" })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/internal/applications/${applicationId}/archive`)
      .set(ownerHeaders)
      .expect(200);
  });

  it("rejects unauthorized application creation", async () => {
    await request(app.getHttpServer())
      .post("/internal/applications")
      .set(actorHeaders("E200"))
      .send({ name: "Denied", summary: "Denied" })
      .expect(403);
  });

  it("returns a rejected version to draft after a claimed review", async () => {
    const createResponse = await request(app.getHttpServer())
      .post("/internal/applications")
      .set(actorHeaders("E100"))
      .send({ name: "Rejectable", summary: "Reject path" })
      .expect(201);
    const applicationId = createResponse.body.applicationId as string;
    const versionResponse = await request(app.getHttpServer())
      .post(`/internal/applications/${applicationId}/versions`)
      .set(actorHeaders("E100"))
      .send({
        version: "1.0.0",
        changelog: "Reject me",
        artifactKey: "applications/phase-3/artifact.zip",
        artifactSha256,
        artifactSignature: "signature-1",
        scanStatus: "passed",
      })
      .expect(201);
    const versionId = versionResponse.body.applicationVersionId as string;
    await request(app.getHttpServer())
      .post(`/internal/applications/versions/${versionId}/submit-review`)
      .set(actorHeaders("E100"))
      .expect(200);
    await request(app.getHttpServer())
      .post(`/internal/applications/versions/${versionId}/claim-review`)
      .set(actorHeaders("E200"))
      .expect(200);
    await request(app.getHttpServer())
      .post(`/internal/applications/versions/${versionId}/release-review`)
      .set(actorHeaders("E200"))
      .expect(200);
    await request(app.getHttpServer())
      .post(`/internal/applications/versions/${versionId}/claim-review`)
      .set(actorHeaders("E200"))
      .expect(200);
    await request(app.getHttpServer())
      .post(`/internal/applications/versions/${versionId}/review`)
      .set(actorHeaders("E200"))
      .send({ decision: "reject", comment: "Needs changes" })
      .expect(200);
    await expect(
      request(app.getHttpServer())
        .get(`/internal/applications/${applicationId}`)
        .set(actorHeaders("E100")),
    ).resolves.toMatchObject({ body: { status: "draft" } });
  });
});
