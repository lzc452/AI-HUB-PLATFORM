import { randomUUID } from "node:crypto";
import { Test, type TestingModule } from "@nestjs/testing";
import { sql } from "kysely";
import { createDatabase, runMigrations } from "@ai-hub/database";
import {
  APPLICATION_SERVICE,
  DEMAND_SERVICE,
  DINGTALK_NOTIFICATION_MATRIX_SERVICE,
  ApplicationModule,
  ApplicationService,
  DemandModule,
  DemandService,
  DingTalkNotificationMatrixService,
  IdentityService,
  KyselyIdentityRepository,
  PERMISSIVE_WEB_TARGET_POLICY,
} from "@ai-hub/server";
import { startPostgresTestContainer } from "@ai-hub/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("真实生产模块的通知权限与收件人门禁", () => {
  const suffix = randomUUID();
  const departmentId = `notification-${suffix}`;
  const categoryId = `category-${suffix}`;
  const employeeId = (name: string) => `NOTICE-${name}-${suffix}`.toUpperCase();
  const ownerId = employeeId("OWNER");
  const adminId = employeeId("ADMIN");
  const reviewerId = employeeId("REVIEWER");
  const disabledRoleId = employeeId("DISABLED-ROLE");
  const disabledEmployeeId = employeeId("DISABLED-EMPLOYEE");
  const outsiderId = employeeId("OUTSIDER");
  const reviewerRole = `notice-reviewer-${suffix}`;
  const disabledRole = `notice-disabled-${suffix}`;
  let db: ReturnType<typeof createDatabase>;
  let stop: (() => Promise<void>) | undefined;
  let moduleRef: TestingModule;
  let identity: IdentityService;
  let applications: ApplicationService;
  let demands: DemandService;
  let matrix: DingTalkNotificationMatrixService;
  let repository: KyselyIdentityRepository;

  async function actor(id: string) {
    const session = await repository.createSession({
      employeeId: id,
      deviceLabel: "通知门禁",
      expiresAt: new Date(Date.now() + 60_000),
    });
    return identity.getActorContext(id, session.sessionId);
  }

  async function notices(aggregateId: string, eventType: string) {
    return db
      .selectFrom("notifications")
      .selectAll()
      .where("aggregate_id", "=", aggregateId)
      .where("event_type", "=", eventType)
      .orderBy("recipient_employee_id")
      .execute();
  }

  async function expectOutbox(aggregateId: string, eventType: string) {
    const rows = await notices(aggregateId, eventType);
    if (rows.length === 0) return rows;
    const outbox = await db
      .selectFrom("outbox_events")
      .selectAll()
      .where(
        "aggregate_id",
        "in",
        rows.map((row) => row.notification_id),
      )
      .where("event_type", "=", "notification.created")
      .execute();
    expect(outbox).toHaveLength(rows.length);
    expect(outbox.map((row) => row.idempotency_key).sort()).toEqual(
      rows.map((row) => row.idempotency_key).sort(),
    );
    return rows;
  }

  beforeAll(async () => {
    const container = await startPostgresTestContainer();
    stop = container.stop;
    db = createDatabase(container.databaseUrl);
    await runMigrations(db);
    repository = new KyselyIdentityRepository(db);
    await repository.createDepartment({
      departmentId,
      name: "通知门禁部门",
      parentDepartmentId: null,
      source: "local",
    });
    for (const id of [
      ownerId,
      adminId,
      reviewerId,
      disabledRoleId,
      disabledEmployeeId,
      outsiderId,
    ]) {
      await repository.createEmployee({
        employeeId: id,
        displayName: "通知门禁员工",
        primaryDepartmentId: departmentId,
        status: id === disabledEmployeeId ? "disabled" : "active",
      });
      await repository.assignRole(id, "employee");
    }
    for (const roleCode of [reviewerRole, disabledRole]) {
      await db
        .insertInto("roles")
        .values({
          role_code: roleCode,
          name: "既有审核权限角色",
          permissions: sql<
            string[]
          >`${JSON.stringify(["application.review", "demand.review"])}::jsonb`,
          is_system: false,
          status: roleCode === disabledRole ? "disabled" : "active",
        })
        .execute();
    }
    await repository.assignRole(adminId, "super_admin");
    await repository.assignRole(disabledEmployeeId, "super_admin");
    await repository.assignRole(reviewerId, reviewerRole);
    // 同一人同时有 * 和显式审核权限，广播仍只生成一条通知。
    await repository.assignRole(adminId, reviewerRole);
    await repository.assignRole(disabledRoleId, disabledRole);
    await db
      .insertInto("catalog_categories")
      .values({
        category_id: categoryId,
        name: "通知门禁分类",
        sort_order: 0,
        enabled: true,
        is_hot: false,
      })
      .execute();
    const applicationModule = ApplicationModule.registerService(
      db,
      undefined,
      PERMISSIVE_WEB_TARGET_POLICY,
    );
    moduleRef = await Test.createTestingModule({
      imports: [
        applicationModule,
        DemandModule.register(db, undefined, applicationModule),
      ],
    }).compile();
    identity = moduleRef.get(IdentityService);
    applications = moduleRef.get(APPLICATION_SERVICE);
    demands = moduleRef.get(DEMAND_SERVICE);
    matrix = moduleRef.get(DINGTALK_NOTIFICATION_MATRIX_SERVICE);
  });

  afterAll(async () => {
    try {
      await moduleRef?.close();
    } finally {
      try {
        await db?.destroy();
      } finally {
        await stop?.();
      }
    }
  });

  it("完整应用草稿按有效审核权限广播，结论通知普通员工负责人并保持幂等", async () => {
    const owner = await actor(ownerId);
    const admin = await actor(adminId);
    const created = await applications.createApplication(owner, {
      name: "通知门禁应用",
      summary: "验证真实通知",
    });
    const draft: Parameters<ApplicationService["saveDraft"]>[2] = {
      name: "通知门禁应用",
      departmentId,
      maintainerEmployeeIds: [ownerId],
      categoryId,
      applicationType: "web_app",
      tagIds: [],
      icon: {
        mode: "auto",
        backgroundColor: "#FFFFFF",
        text: "验",
        assetId: null,
      },
      screenshotAssetIds: ["notification-screenshot"],
      summaryHtml: "<p>通知门禁摘要</p>",
      manualHtml: "<p>操作手册</p>",
      manualAssetId: null,
      examplesHtml: "<p>使用示例</p>",
      examplesAssetId: null,
      faq: [{ question: "如何使用？", answer: "按手册操作。" }],
      audience: [
        {
          audienceType: "all",
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
          channel: "web",
          entryUrl: "https://203.0.113.5/app",
          minClientVersion: null,
          enabled: true,
          assetIds: [],
        },
      ],
      version: "1.0.0",
      changelog: "验证通知权限。",
    };
    await applications.saveDraft(owner, created.applicationId, draft);
    await applications.submitDraft(owner, created.applicationId);
    const requested = await expectOutbox(
      created.applicationId,
      "application.review.requested",
    );
    expect(requested.map((row) => row.recipient_employee_id)).toEqual(
      [adminId, reviewerId].sort(),
    );
    const version = await db
      .selectFrom("application_versions")
      .select("application_version_id")
      .where("application_id", "=", created.applicationId)
      .executeTakeFirstOrThrow();
    await applications.claimReview(admin, version.application_version_id);
    await applications.review(
      admin,
      version.application_version_id,
      "approve",
      "审核通过",
    );
    const decided = await expectOutbox(
      created.applicationId,
      "application.review.decided",
    );
    expect(decided.map((row) => row.recipient_employee_id)).toEqual([ownerId]);
    const repeated = await matrix.queue(admin, "application.review.decided", {
      recipientEmployeeId: ownerId,
      aggregateId: created.applicationId,
      variables: { decision: "approve" },
    });
    expect(repeated.notificationId).toBe(decided[0]?.notification_id);
    expect(
      await expectOutbox(created.applicationId, "application.review.decided"),
    ).toHaveLength(1);
  });

  it.each([
    { collaboratorEmployeeIds: [] },
    { collaboratorEmployeeIds: [outsiderId] },
  ])(
    "需求提交与方案确认写入真实通知及协作者数组 %j",
    async ({ collaboratorEmployeeIds }) => {
      const owner = await actor(ownerId);
      const admin = await actor(adminId);
      const created = await demands.createDraft(owner, {
        title: "真实通知需求",
        problemStatement: "人工整理重复数据耗费很多时间。",
        businessScenario: "每天手工汇总多个部门的业务数据。",
        impact: "影响多个业务团队的日常工作效率。",
        desiredOutcome: "自动生成跨部门业务数据的汇总结果。",
        currentWorkaround: "目前由员工逐个手工整理业务表格。",
        dataSensitivity: "不含敏感数据。",
        audienceType: "all",
      });
      await demands.submitForReview(owner, created.demandId);
      expect(
        (await expectOutbox(created.demandId, "demand.submitted")).map(
          (row) => row.recipient_employee_id,
        ),
      ).toEqual([adminId, reviewerId].sort());
      const reviewed = await demands.review(admin, created.demandId, "publish");
      expect(
        (await expectOutbox(created.demandId, "demand.reviewed")).map(
          (row) => row.recipient_employee_id,
        ),
      ).toEqual([ownerId]);
      const proposal = await demands.submitClaimProposal(
        admin,
        created.demandId,
        {
          ownerEmployeeId: adminId,
          collaboratorEmployeeIds,
          approach: "使用已有数据实现自动汇总。",
          estimatedValidationDuration: "一个试点周期",
          resourceNeeds: "现有业务数据",
        },
      );
      expect(proposal.collaboratorEmployeeIds).toEqual(collaboratorEmployeeIds);
      const claimed = await demands.confirmClaim(
        admin,
        created.demandId,
        proposal.proposalId,
        reviewed.version,
      );
      expect(claimed.status).toBe("claimed");
      expect(
        (await expectOutbox(created.demandId, "demand.claimed")).map(
          (row) => row.recipient_employee_id,
        ),
      ).toEqual([ownerId]);
    },
  );

  it("拒绝无关收件人、停用员工与停用审核权限，拒绝时不生成通知或 Outbox", async () => {
    const admin = await actor(adminId);
    const owner = await actor(ownerId);
    const application = await applications.createApplication(owner, {
      name: "通知越权边界",
      summary: "收件人边界",
    });
    for (const recipientEmployeeId of [outsiderId, disabledEmployeeId]) {
      await expect(
        matrix.queue(admin, "application.review.decided", {
          recipientEmployeeId,
          aggregateId: application.applicationId,
          variables: { decision: "approve" },
        }),
      ).rejects.toThrow("NOTIFICATION_RECIPIENT_NOT_AUTHORIZED");
    }
    // 资源存在也不能使被停用的审核权限重新生效。
    const demand = await demands.createDraft(owner, {
      title: "停用审核通知",
      problemStatement: "检查审核角色停用后的收件人授权。",
      businessScenario: "验证实际业务通知的收件人权限。",
      impact: "确保通知收件人使用当前有效权限。",
      desiredOutcome: "拒绝已停用角色授予的审核权限。",
      currentWorkaround: "目前由员工手工检查各个收件人。",
      dataSensitivity: "无敏感数据。",
      audienceType: "all",
    });
    await expect(
      matrix.queue(admin, "demand.submitted", {
        recipientEmployeeId: disabledRoleId,
        aggregateId: demand.demandId,
      }),
    ).rejects.toThrow("NOTIFICATION_RECIPIENT_NOT_AUTHORIZED");
    expect(
      await notices(application.applicationId, "application.review.decided"),
    ).toEqual([]);
    expect(await notices(demand.demandId, "demand.submitted")).toEqual([]);
  });
});
