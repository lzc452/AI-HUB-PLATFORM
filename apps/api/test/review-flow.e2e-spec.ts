import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { sql, type Kysely } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DatabaseSchema } from "@ai-hub/database";
import { createDatabase, runMigrations } from "@ai-hub/database";
import { startPostgresTestContainer } from "@ai-hub/testing";
import { PERMISSIVE_WEB_TARGET_POLICY } from "@ai-hub/server";
import { ApiModule } from "../src/api.module.js";
import { resetDatabase } from "./reset-database.js";

const completeDraft = {
  name: "复现审核应用",
  departmentId: "dept-demo",
  maintainerEmployeeIds: ["E-OWNER"],
  categoryId: "productivity",
  applicationType: "web_app" as const,
  tagIds: [],
  icon: {
    mode: "auto" as const,
    backgroundColor: "#FFFFFF",
    text: "复",
    assetId: null,
  },
  screenshotAssetIds: ["repro-screenshot-asset"],
  summaryHtml: "<p>复现审核流程。</p>",
  manualHtml: "<p>手册</p>",
  manualAssetId: null,
  examplesHtml: "<p>使用示例</p>",
  examplesAssetId: null,
  faq: [{ question: "如何使用？", answer: "按提示操作。" }],
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
      entryUrl: "https://127.0.0.1/app",
      minClientVersion: null,
      enabled: true,
      assetIds: [],
    },
  ],
  version: "1.0.0",
  changelog: "复现",
};

const OWNER_SESSION = "00000000-0000-4000-8000-000000000001";
const REVIEWER_SESSION = "00000000-0000-4000-8000-000000000002";

describe("repro: claim → review 真实链路（HTTP）", () => {
  let db: Kysely<DatabaseSchema>;
  let stop: (() => Promise<void>) | undefined;
  let app: INestApplication;
  let ownerSessionId: string;
  let reviewerSessionId: string;

  const ownerHeaders = () => ({
    "x-employee-id": "E-OWNER",
    "x-session-id": ownerSessionId,
  });
  const reviewerHeaders = () => ({
    "x-employee-id": "E-REVIEWER",
    "x-session-id": reviewerSessionId,
  });

  beforeAll(async () => {
    const container = await startPostgresTestContainer();
    stop = container.stop;
    db = createDatabase(container.databaseUrl);
    await runMigrations(db);
    await resetDatabase(db);

    await db
      .insertInto("departments")
      .values({
        department_id: "dept-demo",
        name: "演示部",
        parent_department_id: null,
        source: "local",
      })
      .execute();
    await db
      .insertInto("catalog_categories")
      .values({
        category_id: "productivity",
        name: "效率办公",
        sort_order: 1,
        enabled: true,
        is_hot: false,
      })
      .execute();
    await db
      .insertInto("employees")
      .values([
        {
          employee_id: "E-OWNER",
          display_name: "负责人",
          status: "active",
          primary_department_id: "dept-demo",
          password_hash: null,
          password_reset_required: false,
          employee_number: null,
        },
        {
          employee_id: "E-REVIEWER",
          display_name: "审核员",
          status: "active",
          primary_department_id: "dept-demo",
          password_hash: null,
          password_reset_required: false,
          employee_number: null,
        },
      ])
      .execute();
    await db
      .insertInto("department_memberships")
      .values([
        {
          employee_id: "E-OWNER",
          department_id: "dept-demo",
          is_primary: true,
        },
        {
          employee_id: "E-REVIEWER",
          department_id: "dept-demo",
          is_primary: true,
        },
      ])
      .execute();
    await db
      .insertInto("roles")
      .values([
        {
          role_code: "employee",
          name: "普通员工",
          permissions: sql`'["application.create","application.read","application.update","application.publish","application.review","catalog.read","notification.create","notification.read"]'::jsonb`,
          is_system: true,
          status: "active",
          created_by_employee_id: null,
        },
        {
          role_code: "application_reviewer",
          name: "应用审核员",
          permissions: sql`'["application.review","application.read","catalog.read","notification.create","notification.read"]'::jsonb`,
          is_system: true,
          status: "active",
          created_by_employee_id: null,
        },
        {
          role_code: "super_admin",
          name: "超级管理员",
          permissions: sql`'["*"]'::jsonb`,
          is_system: true,
          status: "active",
          created_by_employee_id: null,
        },
      ])
      .execute();
    await db
      .insertInto("employee_roles")
      .values([
        { employee_id: "E-OWNER", role_code: "employee" },
        { employee_id: "E-REVIEWER", role_code: "application_reviewer" },
      ])
      .execute();
    await db
      .insertInto("user_sessions")
      .values([
        {
          employee_id: "E-OWNER",
          device_label: "repro",
          expires_at: new Date("2099-01-01"),
          revoked_at: null,
          revocation_reason: null,
        },
        {
          employee_id: "E-REVIEWER",
          device_label: "repro",
          expires_at: new Date("2099-01-01"),
          revoked_at: null,
          revocation_reason: null,
        },
      ])
      .execute();
    const ownerSession = await db
      .selectFrom("user_sessions")
      .select("session_id")
      .where("employee_id", "=", "E-OWNER")
      .executeTakeFirst();
    const reviewerSession = await db
      .selectFrom("user_sessions")
      .select("session_id")
      .where("employee_id", "=", "E-REVIEWER")
      .executeTakeFirst();
    ownerSessionId = String(ownerSession?.session_id ?? OWNER_SESSION);
    reviewerSessionId = String(reviewerSession?.session_id ?? REVIEWER_SESSION);

    const moduleRef = await Test.createTestingModule({
      imports: [
        ApiModule.register(
          container.databaseUrl,
          {},
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          PERMISSIVE_WEB_TARGET_POLICY,
        ),
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await db?.destroy();
    await stop?.();
  }, 60_000);

  it("完整链路（HTTP）：创建 → 提交 → 认领 → 审核", async () => {
    const http = request(app.getHttpServer());

    // 1. 创建应用
    const created = await http
      .post("/internal/applications")
      .set(ownerHeaders())
      .send({ name: "复现应用", summary: "复现" })
      .expect(201);
    const applicationId = created.body.applicationId as string;
    expect(applicationId).toBeDefined();

    // 2. 保存草稿
    await http
      .put(`/internal/applications/${applicationId}/draft`)
      .set(ownerHeaders())
      .send(completeDraft)
      .expect(200);

    // 3. 提交审核（自动创建版本与审核队列）
    const submitted = await http
      .post(`/internal/applications/${applicationId}/submit-draft`)
      .set(ownerHeaders())
      .send({})
      .expect(200);
    expect(submitted.body.status).toBe("in_review");

    const versions = await http
      .get(`/internal/applications/${applicationId}/versions`)
      .set(ownerHeaders())
      .expect(200);
    const versionId = (
      versions.body as Array<{ applicationVersionId: string }>
    )[0]?.applicationVersionId;
    expect(versionId).toBeDefined();

    // 4. 审核员认领
    const claimed = await http
      .post(`/internal/applications/versions/${versionId}/claim-review`)
      .set(reviewerHeaders())
      .expect(200);
    expect(claimed.body.status).toBe("claimed");

    // 5. 审核通过
    const reviewed = await http
      .post(`/internal/applications/versions/${versionId}/review`)
      .set(reviewerHeaders())
      .send({ decision: "approve", comment: "ok" })
      .expect(200);
    expect(reviewed.body.status).toBe("published");
  });
});
