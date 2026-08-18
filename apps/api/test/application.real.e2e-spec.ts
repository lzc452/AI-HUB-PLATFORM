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
    if (employeeId === "E300") {
      return [{ roleCode: "super_admin", permissions: ["*"] }];
    }
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
        (application_id, uploaded_by_employee_id, object_key, staging_object_key, file_name,
         mime_type, size_bytes, sha256, signature, part_count, upload_status,
         scan_status, error_code, expires_at, completed_at)
      values (
        ${applicationId}, 'E100', ${artifactKey}, ${artifactKey}, 'artifact.zip',
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
      values ('E100', 'Owner', 'active', 'dept-platform'),
             ('E200', 'Reviewer', 'active', 'dept-review'),
             ('E300', 'Super Admin', 'active', 'dept-platform')
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
        // 注意：维护人不得自审，因此维护人不能是承担审核角色的 E200。
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
    // 首次发布审核通过即自动上架：应用直接 published，无需手动 publish
    // （自动上架后 publish 端点会因状态非 approved 而返回 400）。
    await expect(
      request(app.getHttpServer())
        .get(`/internal/applications/${applicationId}`)
        .set(ownerHeaders),
    ).resolves.toMatchObject({
      body: { status: "published", currentVersionId: firstVersionId },
    });

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
    // 已发布应用更新审核通过即自动切换为当前版本（保持 published），
    // 此处不再有单独的 publish 步骤——状态机修复后该调用会因状态非 approved 而返回 400。
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

  it("enforces one pending version and allows submitter withdrawal", async () => {
    const ownerHeaders = actorHeaders("E100");
    const reviewerHeaders = actorHeaders("E200");
    const createResponse = await request(app.getHttpServer())
      .post("/internal/applications")
      .set(ownerHeaders)
      .send({
        name: "Withdrawable",
        summary: "Pending review withdrawal",
        // 维护人不得自审，因此维护人不能是承担审核角色的 E200。
        departmentId: "dept-platform",
      })
      .expect(201);
    const applicationId = createResponse.body.applicationId as string;

    const registerVersionArtifact = async (
      version: string,
      uploadId: string,
      artifactKey: string,
      signature: string,
    ) => {
      await registerArtifact(uploadId, artifactKey, signature);
      await registerVerifiedArtifactRow(applicationId, artifactKey, signature);
      const versionResponse = await request(app.getHttpServer())
        .post(`/internal/applications/${applicationId}/versions`)
        .set(ownerHeaders)
        .send({
          version,
          changelog: `Release ${version}`,
          artifactKey,
          artifactSha256,
          artifactSignature: signature,
          scanStatus: "passed",
        })
        .expect(201);
      return versionResponse.body.applicationVersionId as string;
    };

    const firstVersionId = await registerVersionArtifact(
      "1.0.0",
      "upload-withdraw-1",
      "applications/withdraw-flow/artifact.zip",
      "signature-withdraw-1",
    );
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
    await request(app.getHttpServer())
      .post(`/internal/applications/versions/${firstVersionId}/claim-review`)
      .set(reviewerHeaders)
      .expect(200);
    await request(app.getHttpServer())
      .post(`/internal/applications/versions/${firstVersionId}/review`)
      .set(reviewerHeaders)
      .send({ decision: "approve", comment: "approved" })
      .expect(200);
    // 首次发布审核通过即自动上架，无需手动 publish；应用保持 published 供后续提交更新审核。

    const secondVersionId = await registerVersionArtifact(
      "2.0.0",
      "upload-withdraw-2",
      "applications/withdraw-flow/artifact-v2.zip",
      "signature-withdraw-2",
    );
    const thirdVersionId = await registerVersionArtifact(
      "3.0.0",
      "upload-withdraw-3",
      "applications/withdraw-flow/artifact-v3.zip",
      "signature-withdraw-3",
    );
    await request(app.getHttpServer())
      .post(`/internal/applications/versions/${secondVersionId}/submit-review`)
      .set(ownerHeaders)
      .expect(200);
    const rejected = await request(app.getHttpServer())
      .post(`/internal/applications/versions/${thirdVersionId}/submit-review`)
      .set(ownerHeaders)
      .expect(400);
    expect(rejected.body).toMatchObject({
      status: 400,
      code: "REVIEW_ALREADY_PENDING",
    });

    await request(app.getHttpServer())
      .post(
        `/internal/applications/versions/${secondVersionId}/review-withdraw`,
      )
      .set(ownerHeaders)
      .expect(200);
    await expect(
      request(app.getHttpServer())
        .get(`/internal/applications/${applicationId}`)
        .set(ownerHeaders),
    ).resolves.toMatchObject({
      body: { status: "published", pendingVersionId: null },
    });
    // 撤回删除队列行：查询返回 404（而非 completed），
    // 避免 application_version_id 的 UNIQUE 约束阻塞同一版本的重新提交。
    await request(app.getHttpServer())
      .get(`/internal/applications/versions/${secondVersionId}/review-queue`)
      .set(reviewerHeaders)
      .expect(404);
    // 撤回后同一版本（v2）可再次提交审核。
    await request(app.getHttpServer())
      .post(`/internal/applications/versions/${secondVersionId}/submit-review`)
      .set(ownerHeaders)
      .expect(200);
    await expect(
      request(app.getHttpServer())
        .get(`/internal/applications/${applicationId}`)
        .set(ownerHeaders),
    ).resolves.toMatchObject({
      body: { status: "published", pendingVersionId: secondVersionId },
    });
    // 重新提交后又占用 pending 槽位：第三个版本仍被并发上限拒绝。
    const reRejected = await request(app.getHttpServer())
      .post(`/internal/applications/versions/${thirdVersionId}/submit-review`)
      .set(ownerHeaders)
      .expect(400);
    expect(reRejected.body).toMatchObject({
      status: 400,
      code: "REVIEW_ALREADY_PENDING",
    });
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
    // 驳回原因必填：空/纯空白原因被 DTO 校验拒绝（400）。
    await request(app.getHttpServer())
      .post(`/internal/applications/versions/${versionId}/review`)
      .set(actorHeaders("E200"))
      .send({ decision: "reject", comment: "   " })
      .expect(400);
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

  it("bans the maintainer from claiming self-review", async () => {
    const createResponse = await request(app.getHttpServer())
      .post("/internal/applications")
      .set(actorHeaders("E100"))
      .send({
        name: "Maintained",
        summary: "Maintainer ban",
        maintainerEmployeeId: "E200",
        departmentId: "dept-platform",
      })
      .expect(201);
    const applicationId = createResponse.body.applicationId as string;
    const artifactKey = "applications/maintained/artifact.zip";
    await registerArtifact(
      "upload-maintained",
      artifactKey,
      "signature-maintained",
    );
    await registerVerifiedArtifactRow(
      applicationId,
      artifactKey,
      "signature-maintained",
    );
    const versionResponse = await request(app.getHttpServer())
      .post(`/internal/applications/${applicationId}/versions`)
      .set(actorHeaders("E100"))
      .send({
        version: "1.0.0",
        changelog: "Initial",
        artifactKey,
        artifactSha256,
        artifactSignature: "signature-maintained",
        scanStatus: "passed",
      })
      .expect(201);
    const versionId = versionResponse.body.applicationVersionId as string;
    await request(app.getHttpServer())
      .post(`/internal/applications/versions/${versionId}/submit-review`)
      .set(actorHeaders("E100"))
      .expect(200);
    // E200 是该应用的维护人（maintainer_employee_id）→ 认领被拒绝（403）。
    await request(app.getHttpServer())
      .post(`/internal/applications/versions/${versionId}/claim-review`)
      .set(actorHeaders("E200"))
      .expect(403);
  });

  it("lets a super admin transfer a claimed review task", async () => {
    const createResponse = await request(app.getHttpServer())
      .post("/internal/applications")
      .set(actorHeaders("E100"))
      .send({ name: "Transferable", summary: "Transfer flow" })
      .expect(201);
    const applicationId = createResponse.body.applicationId as string;
    const artifactKey = "applications/transferable/artifact.zip";
    await registerArtifact(
      "upload-transferable",
      artifactKey,
      "signature-transferable",
    );
    await registerVerifiedArtifactRow(
      applicationId,
      artifactKey,
      "signature-transferable",
    );
    const versionResponse = await request(app.getHttpServer())
      .post(`/internal/applications/${applicationId}/versions`)
      .set(actorHeaders("E100"))
      .send({
        version: "1.0.0",
        changelog: "Initial",
        artifactKey,
        artifactSha256,
        artifactSignature: "signature-transferable",
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
    // 非超管转交 → 403（APPLICATION_MANAGE 权限不足）；超管转交 → 200 并更新认领人。
    await request(app.getHttpServer())
      .post(`/internal/applications/versions/${versionId}/transfer-review`)
      .set(actorHeaders("E200"))
      .send({ claimedByEmployeeId: "E100" })
      .expect(403);
    const transferred = await request(app.getHttpServer())
      .post(`/internal/applications/versions/${versionId}/transfer-review`)
      .set(actorHeaders("E300"))
      .send({ claimedByEmployeeId: "E100" })
      .expect(200);
    expect(transferred.body).toMatchObject({
      status: "claimed",
      claimedByEmployeeId: "E100",
    });
  });

  it("releases claims held beyond the 24h hold window", async () => {
    const createResponse = await request(app.getHttpServer())
      .post("/internal/applications")
      .set(actorHeaders("E100"))
      .send({ name: "Expirable", summary: "Claim expiry" })
      .expect(201);
    const applicationId = createResponse.body.applicationId as string;
    const artifactKey = "applications/expirable/artifact.zip";
    await registerArtifact(
      "upload-expirable",
      artifactKey,
      "signature-expirable",
    );
    await registerVerifiedArtifactRow(
      applicationId,
      artifactKey,
      "signature-expirable",
    );
    const versionResponse = await request(app.getHttpServer())
      .post(`/internal/applications/${applicationId}/versions`)
      .set(actorHeaders("E100"))
      .send({
        version: "1.0.0",
        changelog: "Initial",
        artifactKey,
        artifactSha256,
        artifactSignature: "signature-expirable",
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
    // 将认领时间拨回 25 小时前，模拟超时认领。
    await sql`
      update application_review_queue
      set claimed_at = now() - interval '25 hours'
      where application_version_id = ${versionId}
    `.execute(db);
    const repository = new KyselyApplicationRepository(db);
    const expired = await repository.listExpiredClaims(new Date());
    expect(expired).toContainEqual({
      applicationVersionId: versionId,
      claimedByEmployeeId: "E200",
    });
    // CAS 释放后队列回到 available，可供再次认领。
    await repository.releaseReviewQueue(versionId, "E200");
    await expect(
      request(app.getHttpServer())
        .get(`/internal/applications/versions/${versionId}/review-queue`)
        .set(actorHeaders("E200")),
    ).resolves.toMatchObject({ body: { status: "available" } });
  });
});
