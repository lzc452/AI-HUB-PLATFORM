import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { sql } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ApplicationService,
  IdentityService,
  KyselyApplicationRepository,
  KyselyPortalRepository,
  PERMISSIVE_WEB_TARGET_POLICY,
  PortalService,
  type IdentityRepository,
} from "@ai-hub/server";
import { createDatabase, runMigrations } from "@ai-hub/database";
import { startPostgresTestContainer } from "@ai-hub/testing";

import { ApiModule } from "../src/api.module.js";
import { resetDatabase } from "./reset-database.js";

const ownerHeaders = {
  "x-employee-id": "E-PORTAL-OWNER",
  "x-session-id": "session-portal-owner",
};
const reviewerHeaders = {
  "x-employee-id": "E-PORTAL-REVIEWER",
  "x-session-id": "session-portal-reviewer",
};

const identityRepository = {
  async findEmployee(employeeId: string) {
    return {
      employeeId,
      displayName: employeeId,
      status: "active" as const,
      primaryDepartmentId: "dept-portal-consistency",
      passwordHash: null,
      passwordResetRequired: false,
    };
  },
  async findSession(sessionId: string) {
    return {
      sessionId,
      employeeId:
        sessionId === "session-portal-owner"
          ? "E-PORTAL-OWNER"
          : "E-PORTAL-REVIEWER",
      deviceLabel: "portal-application-consistency",
      expiresAt: new Date("2099-01-01"),
      revokedAt: null,
    };
  },
  async listEmployeeDepartmentIds() {
    return ["dept-portal-consistency"];
  },
  async listEmployeeRoles() {
    return [{ roleCode: "super_admin", permissions: ["*"] }];
  },
} as unknown as IdentityRepository;

const completeDraft = {
  name: "Portal 编辑后的应用",
  departmentId: "dept-portal-consistency",
  maintainerEmployeeIds: ["E-PORTAL-OWNER"],
  categoryId: "productivity",
  applicationType: "web_app" as const,
  tagIds: [],
  icon: {
    mode: "auto" as const,
    backgroundColor: "#FFFFFF",
    text: "门",
    assetId: null,
  },
  screenshotAssetIds: ["portal-screenshot-asset"],
  summaryHtml: "<p>由 Portal 编辑后的摘要。</p><script>alert('xss')</script>",
  manualHtml: "<p>操作手册</p>",
  manualAssetId: null,
  examplesHtml: "<p>使用示例</p>",
  examplesAssetId: null,
  faq: [{ question: "如何使用？", answer: "打开后按提示操作。" }],
  audience: [
    {
      audienceType: "all" as const,
      departmentId: null,
      employeeId: null,
      includeChildren: false,
    },
  ],
  risk: {
    handlesSensitiveData: false,
    sendsDataExternally: false,
    retainsConversations: false,
    retentionPeriod: null,
    modelProviders: ["local"],
    providerNote: null,
    affectsHighRiskDecisions: false,
    inputRestrictionDisclaimer: "不处理受限输入。",
  },
  deliveries: [
    {
      channel: "web" as const,
      entryUrl: "https://portal.example.internal/app",
      minClientVersion: null,
      enabled: true,
      assetIds: [],
    },
  ],
  version: "1.0.0",
  changelog: "由 Portal 提交审核。",
};

describe("AI Hub 与 Portal 应用写入一致性", () => {
  let app: INestApplication;
  let db: ReturnType<typeof createDatabase>;
  let stop: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    const container = await startPostgresTestContainer();
    stop = container.stop;
    db = createDatabase(container.databaseUrl);
    await runMigrations(db);
    await resetDatabase(db);
    await sql`
      insert into departments (department_id, name, parent_department_id, source)
      values ('dept-portal-consistency', 'Portal 一致性测试部门', null, 'local')
    `.execute(db);
    await sql`
      insert into employees (employee_id, display_name, status, primary_department_id)
      values
        ('E-PORTAL-OWNER', 'Portal 负责人', 'active', 'dept-portal-consistency'),
        ('E-PORTAL-REVIEWER', 'Portal 审核人', 'active', 'dept-portal-consistency')
    `.execute(db);
    await sql`
      insert into catalog_categories (category_id, name, sort_order, enabled)
      values ('productivity', '办公效率', 0, true)
    `.execute(db);

    const identity = new IdentityService(identityRepository);
    const application = new ApplicationService(
      new KyselyApplicationRepository(db),
      { authorize: (input) => identity.authorize(input) },
      {
        async verifyArtifact(input) {
          return {
            accepted: true,
            scanStatus: "passed" as const,
            sha256: input.expectedSha256,
          };
        },
      },
      undefined,
      undefined,
      PERMISSIVE_WEB_TARGET_POLICY,
      async () => [{ address: "10.0.0.1", family: 4 }],
    );
    const portal = new PortalService(
      new KyselyPortalRepository(db),
      application,
    );
    const moduleRef = await Test.createTestingModule({
      imports: [
        ApiModule.forTest({
          databaseCheck: async () => true,
          identity,
          application,
          portal,
        }),
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  }, 60_000);

  afterAll(async () => {
    try {
      await app?.close();
    } finally {
      try {
        await db?.destroy();
      } finally {
        await stop?.();
      }
    }
  }, 60_000);

  it("让两套 URL 共享草稿、审核、发布、下架与标准 Outbox", async () => {
    const createdByApplication = await request(app.getHttpServer())
      .post("/internal/applications")
      .set(ownerHeaders)
      .send({ name: "AI Hub 创建的应用", summary: "创建后交给 Portal 编辑" })
      .expect(201);
    const applicationId = createdByApplication.body.applicationId as string;

    await request(app.getHttpServer())
      .put(`/internal/portal/dashboard/publish/app/${applicationId}`)
      .set(ownerHeaders)
      .send({ applicationDraft: completeDraft })
      .expect(200);
    const draftReadFromApplication = await request(app.getHttpServer())
      .get(`/internal/applications/${applicationId}/draft`)
      .set(ownerHeaders)
      .expect(200);
    expect(draftReadFromApplication.body.draft).toMatchObject({
      name: completeDraft.name,
      version: completeDraft.version,
    });
    expect(draftReadFromApplication.body.draft.summaryHtml).not.toContain(
      "script",
    );
    const applicationReadAfterPortalDraft = await request(app.getHttpServer())
      .get(`/internal/applications/${applicationId}`)
      .set(ownerHeaders)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/internal/portal/apps/E-PORTAL-OWNER/${applicationId}`)
      .set(ownerHeaders)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          resourceId: applicationId,
          name: applicationReadAfterPortalDraft.body.name,
          summary: applicationReadAfterPortalDraft.body.summary,
          status: applicationReadAfterPortalDraft.body.status,
          currentVersionId:
            applicationReadAfterPortalDraft.body.currentVersionId,
        });
      });

    await request(app.getHttpServer())
      .post(`/internal/portal/dashboard/publish/app/${applicationId}/submit`)
      .set(ownerHeaders)
      .expect(201)
      .expect(({ body }) => expect(body.status).toBe("in_review"));
    const submittedReadFromApplication = await request(app.getHttpServer())
      .get(`/internal/applications/${applicationId}`)
      .set(ownerHeaders)
      .expect(200);
    expect(submittedReadFromApplication.body).toMatchObject({
      name: completeDraft.name,
      summary: "由 Portal 编辑后的摘要。",
      status: "in_review",
      currentVersionId: null,
    });
    const versions = await request(app.getHttpServer())
      .get(`/internal/applications/${applicationId}/versions`)
      .set(ownerHeaders)
      .expect(200);
    expect(versions.body).toHaveLength(1);

    await request(app.getHttpServer())
      .post(`/internal/portal/dashboard/publish/app/${applicationId}/approve`)
      .set(reviewerHeaders)
      .send({ comment: "审核通过" })
      .expect(201)
      .expect(({ body }) => expect(body.status).toBe("published"));
    const publishedReadFromApplication = await request(app.getHttpServer())
      .get(`/internal/applications/${applicationId}`)
      .set(ownerHeaders)
      .expect(200);
    expect(publishedReadFromApplication.body).toMatchObject({
      status: "published",
      currentVersionId: versions.body[0].applicationVersionId,
    });
    await request(app.getHttpServer())
      .get(`/internal/portal/apps/E-PORTAL-OWNER/${applicationId}`)
      .set(ownerHeaders)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          resourceId: applicationId,
          name: publishedReadFromApplication.body.name,
          summary: publishedReadFromApplication.body.summary,
          status: publishedReadFromApplication.body.status,
          currentVersionId: publishedReadFromApplication.body.currentVersionId,
        });
      });

    await request(app.getHttpServer())
      .post(`/internal/portal/dashboard/publish/app/${applicationId}/withdraw`)
      .set(ownerHeaders)
      .send({ reason: "Portal 验收下架" })
      .expect(201)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          status: "withdrawn",
          currentVersionId: versions.body[0].applicationVersionId,
        });
      });
    await request(app.getHttpServer())
      .get(`/internal/applications/${applicationId}`)
      .set(ownerHeaders)
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe("withdrawn"));

    const events = await db
      .selectFrom("outbox_events")
      .select("event_type")
      .where("aggregate_id", "=", applicationId)
      .execute();
    expect(events.map((event) => event.event_type)).toEqual(
      expect.arrayContaining([
        "application.created",
        "application.submitted",
        "application.review.requested",
        "application.published",
        "application.withdrawn",
      ]),
    );
    expect(
      events.some((event) => event.event_type.startsWith("portal.app.")),
    ).toBe(false);
  });

  it("Portal 创建的应用会被 AI Hub 立即读取到", async () => {
    const createdByPortal = await request(app.getHttpServer())
      .post("/internal/portal/dashboard/publish")
      .set(ownerHeaders)
      .send({
        resourceType: "app",
        slug: "portal-created-application",
        name: "Portal 创建的应用",
        summary: "由 AI Hub 读取该应用事实",
      })
      .expect(201);
    const applicationId = createdByPortal.body.resourceId as string;

    await request(app.getHttpServer())
      .get(`/internal/portal/apps/E-PORTAL-OWNER/${applicationId}`)
      .set(ownerHeaders)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          resourceId: applicationId,
          name: "Portal 创建的应用",
          summary: "由 AI Hub 读取该应用事实",
          status: "draft",
          currentVersionId: null,
        });
      });

    await request(app.getHttpServer())
      .get(`/internal/applications/${applicationId}`)
      .set(ownerHeaders)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          applicationId,
          name: "Portal 创建的应用",
          summary: "由 AI Hub 读取该应用事实",
          status: "draft",
          currentVersionId: null,
        });
      });
  });
});
