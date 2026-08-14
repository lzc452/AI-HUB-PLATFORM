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
import { resetDatabase } from "./reset-database.js";
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
  let pipeline: ArtifactPipeline;

  const registerArtifact = async (
    uploadId: string,
    artifactKey: string,
    signature: string,
  ) => {
    const content = Buffer.from("phase-3-real-artifact");
    await pipeline.putChunk(uploadId, 0, content);
    const artifact = await pipeline.completeUpload({
      uploadId,
      expectedChunks: 1,
      objectKey: `tmp/${uploadId}`,
      finalObjectKey: artifactKey,
      expectedSha256: artifactSha256,
      signature,
    });
    expect(artifact.accepted).toBe(true);
  };

  // createVersion 要求数据库中存在已完成且扫描通过的制品上传记录
  // （findVerifiedArtifact），registerArtifact 只写内存 pipeline，需同步落库。
  const registerVerifiedArtifactRow = async (
    applicationId: string,
    artifactKey: string,
    signature: string,
  ) => {
    await sql`
      insert into application_artifact_uploads
        (application_id, uploaded_by_employee_id, object_key, file_name,
         mime_type, size_bytes, sha256, signature, part_count, upload_status,
         scan_status, error_code, expires_at, completed_at)
      values (
        ${applicationId}, 'E100', ${artifactKey}, 'artifact.zip',
        'application/octet-stream', 22, ${artifactSha256}, ${signature}, 1,
        'completed', 'passed', null, now() + interval '1 hour', now()
      )
    `.execute(db);
  };

  beforeAll(async () => {
    const container = await startPostgresTestContainer();
    stop = container.stop;
    db = createDatabase(container.databaseUrl);
    await runMigrations(db);
    await resetDatabase(db);
    await sql`
      insert into departments (department_id, name, source)
      values ('dept-platform', 'Platform', 'local'), ('dept-review', 'Review', 'local')
    `.execute(db);
    await sql`
      insert into employees (employee_id, display_name, status, primary_department_id)
      values ('E100', 'Owner', 'active', 'dept-platform'), ('E200', 'Reviewer', 'active', 'dept-review')
    `.execute(db);
    // publish 路径的 registerToCatalog 写入 catalog_metadata（category_id FK）
    await sql`
      insert into catalog_categories (category_id, name, sort_order, enabled)
      values ('productivity', '办公效率', 0, true)
    `.execute(db);

    const identity = new IdentityService(identityRepository);
    pipeline = new ArtifactPipeline(new MemoryObjectStorage(), {
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
    await registerArtifact(
      "upload-1",
      "applications/phase-3/artifact.zip",
      "signature-1",
    );

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
    await registerVerifiedArtifactRow(
      applicationId,
      "applications/phase-3/artifact.zip",
      "signature-1",
    );

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

    const secondArtifactKey = "applications/phase-3/artifact-v2.zip";
    await registerArtifact("upload-2", secondArtifactKey, "signature-2");
    await registerVerifiedArtifactRow(
      applicationId,
      secondArtifactKey,
      "signature-2",
    );
    const secondVersionResponse = await request(app.getHttpServer())
      .post(`/internal/applications/${applicationId}/versions`)
      .set(ownerHeaders)
      .send({
        version: "2.0.0",
        changelog: "Second release",
        artifactKey: secondArtifactKey,
        artifactSha256,
        artifactSignature: "signature-2",
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
    const rejectedArtifactKey = "applications/phase-3/rejectable.zip";
    await registerArtifact(
      "upload-rejectable",
      rejectedArtifactKey,
      "signature-rejectable",
    );
    await registerVerifiedArtifactRow(
      applicationId,
      rejectedArtifactKey,
      "signature-rejectable",
    );
    const versionResponse = await request(app.getHttpServer())
      .post(`/internal/applications/${applicationId}/versions`)
      .set(actorHeaders("E100"))
      .send({
        version: "1.0.0",
        changelog: "Reject me",
        artifactKey: rejectedArtifactKey,
        artifactSha256,
        artifactSignature: "signature-rejectable",
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
