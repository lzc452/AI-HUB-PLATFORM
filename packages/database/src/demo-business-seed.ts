import { sql, type Kysely } from "kysely";
import { DEMO_ACCOUNT_DEFINITIONS } from "./demo-seed.js";
import type { DatabaseSchema } from "./schema.js";

export interface SeedDemoBusinessResult {
  categories: number;
  tags: number;
  applications: number;
  versions: number;
  deliveries: number;
  reviews: number;
  reviewQueueEntries: number;
  demands: number;
  collaborators: number;
  likes: number;
  comments: number;
  reports: number;
  progressUpdates: number;
  pilots: number;
  applicationLinks: number;
  notifications: number;
  behaviorEvents: number;
  aggregates: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const daysAgo = (days: number): Date => new Date(Date.now() - days * DAY_MS);

const today = (): string => new Date().toISOString().slice(0, 10);

const DEMO_ACCOUNT_IDS: readonly string[] = Object.freeze(
  DEMO_ACCOUNT_DEFINITIONS.map((account) => account.employeeId),
);

/** 确定性 UUID，保证重复执行 seed 时按主键幂等。 */
const IDS = Object.freeze({
  appPublished: "10000000-0000-4000-8000-000000000001",
  appInReview: "10000000-0000-4000-8000-000000000002",
  appDraft: "10000000-0000-4000-8000-000000000003",
  appArchived: "10000000-0000-4000-8000-000000000004",
  versionPublished: "10000000-0000-4000-8000-000000000101",
  versionInReview: "10000000-0000-4000-8000-000000000102",
  versionArchived: "10000000-0000-4000-8000-000000000104",
  demandPublished: "20000000-0000-4000-8000-000000000001",
  demandPendingReview: "20000000-0000-4000-8000-000000000002",
  demandDraft: "20000000-0000-4000-8000-000000000003",
  demandMerged: "20000000-0000-4000-8000-000000000004",
  commentPublishedRoot: "30000000-0000-4000-8000-000000000001",
  commentPublishedReply: "30000000-0000-4000-8000-000000000002",
  commentDemand1: "30000000-0000-4000-8000-000000000011",
  commentDemand2: "30000000-0000-4000-8000-000000000012",
  commentDemand3: "30000000-0000-4000-8000-000000000013",
  commentMerged: "30000000-0000-4000-8000-000000000021",
  reportDemandOpen: "40000000-0000-4000-8000-000000000001",
  reportDemandResolved: "40000000-0000-4000-8000-000000000002",
  pilotRunning: "50000000-0000-4000-8000-000000000001",
  progress1: "60000000-0000-4000-8000-000000000001",
  progress2: "60000000-0000-4000-8000-000000000002",
  ratingPublished: "70000000-0000-4000-8000-000000000001",
  reviewPublished: "80000000-0000-4000-8000-000000000001",
  reviewQueueInReview: "90000000-0000-4000-8000-000000000001",
  audiencePublished: "e0000000-0000-4000-8000-000000000001",
  deliveryWeb: "b0000000-0000-4000-8000-000000000001",
  deliveryDesktop: "b0000000-0000-4000-8000-000000000002",
  deliveryMobile: "b0000000-0000-4000-8000-000000000003",
  actionRedirect: "d0000000-0000-4000-8000-000000000001",
  actionDownload: "d0000000-0000-4000-8000-000000000002",
  auditApplication: "c0000000-0000-4000-8000-000000000001",
  auditVersion: "c0000000-0000-4000-8000-000000000002",
  auditSubmitted: "c0000000-0000-4000-8000-000000000003",
  auditReviewed: "c0000000-0000-4000-8000-000000000004",
  auditPublished: "c0000000-0000-4000-8000-000000000005",
  auditDemand: "c0000000-0000-4000-8000-000000000011",
  auditDemandClaimed: "c0000000-0000-4000-8000-000000000012",
  auditDemandMerged: "c0000000-0000-4000-8000-000000000013",
  notificationReviewRequested: "a0000000-0000-4000-8000-000000000001",
  notificationApproved: "a0000000-0000-4000-8000-000000000002",
  notificationPublished: "a0000000-0000-4000-8000-000000000003",
  notificationClaimed: "a0000000-0000-4000-8000-000000000004",
  notificationProgress: "a0000000-0000-4000-8000-000000000005",
  notificationPilot: "a0000000-0000-4000-8000-000000000006",
});

const jsonb = (value: unknown): ReturnType<typeof sql> =>
  sql`${JSON.stringify(value)}::jsonb`;

export async function seedDemoBusinessData(
  db: Kysely<DatabaseSchema>,
): Promise<SeedDemoBusinessResult> {
  await assertDemoAccountsExist(db);

  const startedAt = new Date();
  const publishedAt = daysAgo(7);
  const inReviewAt = daysAgo(1);
  const pilotStartedAt = daysAgo(2);
  const categories = [
    {
      category_id: "productivity",
      name: "效率工具",
      sort_order: 1,
      is_hot: false,
    },
    { category_id: "ai", name: "AI 应用", sort_order: 2, is_hot: false },
    {
      category_id: "reporting",
      name: "数据报表",
      sort_order: 3,
      is_hot: false,
    },
  ] as const;
  const tags = [
    { tag_id: "ai", name: "AI" },
    { tag_id: "attendance", name: "考勤" },
    { tag_id: "productivity", name: "效率" },
    { tag_id: "reporting", name: "报表" },
    { tag_id: "collaboration", name: "协作" },
  ] as const;

  await db.transaction().execute(async (transaction) => {
    // —— 市场分类与标签 ——
    for (const category of categories) {
      await transaction
        .insertInto("catalog_categories")
        .values({ ...category, enabled: true })
        .onConflict((conflict) =>
          conflict
            .column("category_id")
            .doUpdateSet({ name: category.name, enabled: true }),
        )
        .execute();
    }

    for (const tag of tags) {
      await transaction
        .insertInto("catalog_tags")
        .values({ ...tag, enabled: true })
        .onConflict((conflict) =>
          conflict
            .column("tag_id")
            .doUpdateSet({ name: tag.name, enabled: true }),
        )
        .execute();
    }

    // —— 应用与版本 ——
    await transaction
      .insertInto("applications")
      .values({
        application_id: IDS.appPublished,
        owner_employee_id: "DEMO-EMPLOYEE",
        maintainer_employee_id: "DEMO-EMPLOYEE",
        department_id: "demo-rnd",
        name: "智能考勤助手",
        summary: "面向研发团队的智能考勤与排班应用",
        status: "published",
        current_version_id: null,
      })
      .onConflict((conflict) =>
        conflict.column("application_id").doUpdateSet({
          owner_employee_id: "DEMO-EMPLOYEE",
          maintainer_employee_id: "DEMO-EMPLOYEE",
          department_id: "demo-rnd",
          name: "智能考勤助手",
          summary: "面向研发团队的智能考勤与排班应用",
          status: "published",
          current_version_id: null,
          updated_at: startedAt,
        }),
      )
      .execute();

    await transaction
      .insertInto("applications")
      .values({
        application_id: IDS.appInReview,
        owner_employee_id: "DEMO-EMPLOYEE",
        maintainer_employee_id: "DEMO-EMPLOYEE",
        department_id: "demo-rnd",
        name: "需求智能匹配平台",
        summary: "基于语义分析的创新需求自动匹配应用",
        status: "in_review",
        current_version_id: null,
      })
      .onConflict((conflict) =>
        conflict.column("application_id").doUpdateSet({
          owner_employee_id: "DEMO-EMPLOYEE",
          maintainer_employee_id: "DEMO-EMPLOYEE",
          status: "in_review",
          updated_at: startedAt,
        }),
      )
      .execute();

    await transaction
      .insertInto("applications")
      .values({
        application_id: IDS.appDraft,
        owner_employee_id: "DEMO-EMPLOYEE",
        maintainer_employee_id: "DEMO-EMPLOYEE",
        department_id: "demo-rnd",
        name: "员工健康打卡",
        summary: "轻量化的员工健康状态每日打卡工具",
        status: "draft",
        current_version_id: null,
      })
      .onConflict((conflict) =>
        conflict.column("application_id").doUpdateSet({
          status: "draft",
          updated_at: startedAt,
        }),
      )
      .execute();

    await transaction
      .insertInto("applications")
      .values({
        application_id: IDS.appArchived,
        owner_employee_id: "DEMO-SUPER-ADMIN",
        maintainer_employee_id: "DEMO-SUPER-ADMIN",
        department_id: "demo-admin",
        name: "旧版报销助手",
        summary: "已由财务中台取代的报销辅助工具",
        status: "archived",
        current_version_id: null,
      })
      .onConflict((conflict) =>
        conflict.column("application_id").doUpdateSet({
          status: "archived",
          updated_at: startedAt,
        }),
      )
      .execute();

    const versions = [
      {
        application_version_id: IDS.versionPublished,
        application_id: IDS.appPublished,
        version: "1.0.0",
        changelog: "首次发布",
        artifact_key: "apps/10000000-0000-4000-8000-000000000001/1.0.0.zip",
        artifact_sha256: "a".repeat(64),
        artifact_signature: "demo-signature-published",
        scan_status: "passed",
        created_by_employee_id: "DEMO-EMPLOYEE",
      },
      {
        application_version_id: IDS.versionInReview,
        application_id: IDS.appInReview,
        version: "1.0.0",
        changelog: "首次提交评审",
        artifact_key: "apps/10000000-0000-4000-8000-000000000002/1.0.0.zip",
        artifact_sha256: "b".repeat(64),
        artifact_signature: "demo-signature-in-review",
        scan_status: "passed",
        created_by_employee_id: "DEMO-EMPLOYEE",
      },
      {
        application_version_id: IDS.versionArchived,
        application_id: IDS.appArchived,
        version: "0.9.0",
        changelog: "历史版本",
        artifact_key: "apps/10000000-0000-4000-8000-000000000004/0.9.0.zip",
        artifact_sha256: "c".repeat(64),
        artifact_signature: "demo-signature-archived",
        scan_status: "passed",
        created_by_employee_id: "DEMO-SUPER-ADMIN",
      },
    ] as const;
    for (const version of versions) {
      await transaction
        .insertInto("application_versions")
        .values({ ...version, created_at: publishedAt })
        .onConflict((conflict) =>
          conflict.column("application_version_id").doUpdateSet({
            version: version.version,
            changelog: version.changelog,
            artifact_key: version.artifact_key,
            artifact_sha256: version.artifact_sha256,
            artifact_signature: version.artifact_signature,
            scan_status: version.scan_status,
            created_by_employee_id: version.created_by_employee_id,
          }),
        )
        .execute();
    }

    // 版本写入后再回填已发布应用的当前版本，避免外键引用先于行存在。
    await transaction
      .updateTable("applications")
      .set({ current_version_id: IDS.versionPublished, updated_at: startedAt })
      .where("application_id", "=", IDS.appPublished)
      .execute();

    // —— 交付渠道 ——
    const deliveries = [
      {
        delivery_id: IDS.deliveryWeb,
        application_id: IDS.appPublished,
        channel: "web",
        entry_url: "https://apps.example.com/attendance",
        min_client_version: null,
        enabled: true,
      },
      {
        delivery_id: IDS.deliveryDesktop,
        application_id: IDS.appPublished,
        channel: "desktop",
        entry_url: "https://apps.example.com/attendance/desktop",
        min_client_version: "1.0.0",
        enabled: true,
      },
      {
        delivery_id: IDS.deliveryMobile,
        application_id: IDS.appPublished,
        channel: "mobile",
        entry_url: "https://apps.example.com/attendance/mobile",
        min_client_version: null,
        enabled: true,
      },
    ] as const;
    for (const delivery of deliveries) {
      await transaction
        .insertInto("application_deliveries")
        .values({
          ...delivery,
          created_at: publishedAt,
          updated_at: publishedAt,
        })
        .onConflict((conflict) =>
          conflict.column("delivery_id").doUpdateSet({
            application_id: delivery.application_id,
            channel: delivery.channel,
            entry_url: delivery.entry_url,
            min_client_version: delivery.min_client_version,
            enabled: delivery.enabled,
            updated_at: startedAt,
          }),
        )
        .execute();
    }

    // —— 评审与评审队列 ——
    await transaction
      .insertInto("application_reviews")
      .values({
        review_id: IDS.reviewPublished,
        application_id: IDS.appPublished,
        application_version_id: IDS.versionPublished,
        reviewer_employee_id: "DEMO-SUPER-ADMIN",
        application_owner_employee_id: "DEMO-EMPLOYEE",
        decision: "approve",
        comment: "功能完整，扫描通过，准予发布。",
        created_at: daysAgo(6),
      })
      .onConflict((conflict) =>
        conflict.column("review_id").doUpdateSet({
          decision: "approve",
          comment: "功能完整，扫描通过，准予发布。",
        }),
      )
      .execute();

    await transaction
      .insertInto("application_review_queue")
      .values({
        review_queue_id: IDS.reviewQueueInReview,
        application_id: IDS.appInReview,
        application_version_id: IDS.versionInReview,
        status: "available",
        claimed_by_employee_id: null,
        claimed_at: null,
        sla_due_at: new Date(Date.now() + DAY_MS),
        created_at: inReviewAt,
      })
      .onConflict((conflict) =>
        conflict.column("review_queue_id").doUpdateSet({
          status: "available",
          claimed_by_employee_id: null,
          claimed_at: null,
          sla_due_at: new Date(Date.now() + DAY_MS),
        }),
      )
      .execute();

    // —— 目录元数据 ——
    await transaction
      .insertInto("application_audiences")
      .values({
        audience_id: IDS.audiencePublished,
        application_id: IDS.appPublished,
        audience_type: "all",
        department_id: null,
        employee_id: null,
        include_children: false,
      })
      .onConflict((conflict) =>
        conflict.column("audience_id").doUpdateSet({
          audience_type: "all",
          department_id: null,
          employee_id: null,
          include_children: false,
        }),
      )
      .execute();

    await transaction
      .insertInto("application_catalog_metadata")
      .values({
        application_id: IDS.appPublished,
        category_id: "productivity",
        application_type: "web_app",
        search_name: "智能考勤助手",
        search_summary: "面向研发团队的智能考勤与排班应用",
        search_pinyin: "zhinengkaoqinzhushou",
        search_initials: "znkqzs",
        recommendation_rank: 10,
        health_status: "healthy",
        deprecated_reason: null,
        replacement_application_id: null,
      })
      .onConflict((conflict) =>
        conflict.column("application_id").doUpdateSet({
          category_id: "productivity",
          application_type: "web_app",
          search_name: "智能考勤助手",
          search_summary: "面向研发团队的智能考勤与排班应用",
          search_pinyin: "zhinengkaoqinzhushou",
          search_initials: "znkqzs",
          recommendation_rank: 10,
          health_status: "healthy",
          deprecated_reason: null,
          replacement_application_id: null,
        }),
      )
      .execute();

    for (const tagId of ["ai", "attendance"]) {
      await transaction
        .insertInto("application_tag_links")
        .values({ application_id: IDS.appPublished, tag_id: tagId })
        .onConflict((conflict) =>
          conflict.columns(["application_id", "tag_id"]).doNothing(),
        )
        .execute();
    }

    for (const label of ["verified", "recommended"]) {
      await transaction
        .insertInto("application_catalog_labels")
        .values({ application_id: IDS.appPublished, label })
        .onConflict((conflict) =>
          conflict.columns(["application_id", "label"]).doNothing(),
        )
        .execute();
    }

    // —— 互动（点赞/评分/评论/举报）——
    for (const employeeId of ["DEMO-EMPLOYEE", "DEMO-SUPER-ADMIN"]) {
      await transaction
        .insertInto("application_likes")
        .values({ application_id: IDS.appPublished, employee_id: employeeId })
        .onConflict((conflict) =>
          conflict.columns(["application_id", "employee_id"]).doNothing(),
        )
        .execute();
    }

    await transaction
      .insertInto("application_ratings")
      .values({
        rating_id: IDS.ratingPublished,
        application_id: IDS.appPublished,
        application_version_id: IDS.versionPublished,
        employee_id: "DEMO-EMPLOYEE",
        stars: 5,
        body: "体验很好，功能实用。",
        display_anonymously: false,
        created_at: daysAgo(5),
        updated_at: daysAgo(5),
      })
      .onConflict((conflict) =>
        conflict.columns(["application_id", "employee_id"]).doUpdateSet({
          application_version_id: IDS.versionPublished,
          stars: 5,
          body: "体验很好，功能实用。",
          display_anonymously: false,
          updated_at: startedAt,
        }),
      )
      .execute();

    await transaction
      .insertInto("application_comments")
      .values({
        comment_id: IDS.commentPublishedRoot,
        application_id: IDS.appPublished,
        application_version_id: IDS.versionPublished,
        parent_comment_id: null,
        author_employee_id: "DEMO-EMPLOYEE",
        body: "请问支持批量导入排班吗？",
        display_anonymously: false,
        hidden_at: null,
        created_at: daysAgo(4),
        updated_at: daysAgo(4),
      })
      .onConflict((conflict) =>
        conflict.column("comment_id").doUpdateSet({
          body: "请问支持批量导入排班吗？",
          hidden_at: null,
          updated_at: startedAt,
        }),
      )
      .execute();

    await transaction
      .insertInto("application_comments")
      .values({
        comment_id: IDS.commentPublishedReply,
        application_id: IDS.appPublished,
        application_version_id: IDS.versionPublished,
        parent_comment_id: IDS.commentPublishedRoot,
        author_employee_id: "DEMO-SUPER-ADMIN",
        body: "支持，下一版本将提供 Excel 批量导入。",
        display_anonymously: false,
        hidden_at: null,
        created_at: daysAgo(3),
        updated_at: daysAgo(3),
      })
      .onConflict((conflict) =>
        conflict.column("comment_id").doUpdateSet({
          body: "支持，下一版本将提供 Excel 批量导入。",
          hidden_at: null,
          updated_at: startedAt,
        }),
      )
      .execute();

    // —— 需求 ——
    const demands = [
      {
        demand_id: IDS.demandPublished,
        requester_employee_id: "DEMO-EMPLOYEE",
        title: "统一研发效能数据看板",
        problem_statement: "当前研发数据分散在多个系统，缺少统一视图。",
        desired_outcome: "一个可配置的研发效能看板，覆盖交付、质量与协作指标。",
        status: "claimed",
        audience_type: "department",
        audience_department_id: "demo-rnd",
        audience_employee_id: null,
        include_children: true,
        display_anonymously: false,
        review_reason: null,
        business_value: 5,
        implementation_cost: 3,
        risk_level: 2,
        admin_priority: 4,
        priority_score: 4.2,
        priority_explanation: "业务价值高，成本可控，建议优先实施。",
        owner_employee_id: "DEMO-SUPER-ADMIN",
        version: 5,
        merged_into_demand_id: null,
        primary_solution_application_id: IDS.appPublished,
        published_at: daysAgo(6),
        closed_at: null,
      },
      {
        demand_id: IDS.demandPendingReview,
        requester_employee_id: "DEMO-EMPLOYEE",
        title: "智能文档审核助手",
        problem_statement: "合同与方案文档人工审核耗时较长。",
        desired_outcome: "基于规则的自动化初审与人工复核流程。",
        status: "pending_review",
        audience_type: "department",
        audience_department_id: "demo-rnd",
        audience_employee_id: null,
        include_children: false,
        display_anonymously: false,
        review_reason: "需求完整，等待创新运营确认。",
        business_value: null,
        implementation_cost: null,
        risk_level: null,
        admin_priority: null,
        priority_score: null,
        priority_explanation: null,
        owner_employee_id: null,
        version: 2,
        merged_into_demand_id: null,
        primary_solution_application_id: null,
        published_at: null,
        closed_at: null,
      },
      {
        demand_id: IDS.demandDraft,
        requester_employee_id: "DEMO-EMPLOYEE",
        title: "会议纪要自动整理",
        problem_statement: "周会纪要整理耗时，重点内容容易遗漏。",
        desired_outcome: "自动生成结构化会议纪要并同步到协作空间。",
        status: "draft",
        audience_type: "department",
        audience_department_id: "demo-rnd",
        audience_employee_id: null,
        include_children: false,
        display_anonymously: true,
        review_reason: null,
        business_value: null,
        implementation_cost: null,
        risk_level: null,
        admin_priority: null,
        priority_score: null,
        priority_explanation: null,
        owner_employee_id: null,
        version: 1,
        merged_into_demand_id: null,
        primary_solution_application_id: null,
        published_at: null,
        closed_at: null,
      },
      {
        demand_id: IDS.demandMerged,
        requester_employee_id: "DEMO-EMPLOYEE",
        title: "研发数据周报自动生成",
        problem_statement: "周报依赖手工汇总，口径不统一。",
        desired_outcome: "自动生成研发数据周报。",
        status: "merged",
        audience_type: "department",
        audience_department_id: "demo-rnd",
        audience_employee_id: null,
        include_children: false,
        display_anonymously: false,
        review_reason: null,
        business_value: null,
        implementation_cost: null,
        risk_level: null,
        admin_priority: null,
        priority_score: null,
        priority_explanation: null,
        owner_employee_id: null,
        version: 3,
        merged_into_demand_id: IDS.demandPublished,
        primary_solution_application_id: null,
        published_at: daysAgo(9),
        closed_at: daysAgo(4),
      },
    ] as const;
    for (const demand of demands) {
      await transaction
        .insertInto("ai_demands")
        .values({
          ...demand,
          created_at: daysAgo(10),
          updated_at: daysAgo(4),
        })
        .onConflict((conflict) =>
          conflict.column("demand_id").doUpdateSet({
            requester_employee_id: demand.requester_employee_id,
            title: demand.title,
            problem_statement: demand.problem_statement,
            desired_outcome: demand.desired_outcome,
            status: demand.status,
            audience_type: demand.audience_type,
            audience_department_id: demand.audience_department_id,
            audience_employee_id: demand.audience_employee_id,
            include_children: demand.include_children,
            display_anonymously: demand.display_anonymously,
            review_reason: demand.review_reason,
            business_value: demand.business_value,
            implementation_cost: demand.implementation_cost,
            risk_level: demand.risk_level,
            admin_priority: demand.admin_priority,
            priority_score: demand.priority_score,
            priority_explanation: demand.priority_explanation,
            owner_employee_id: demand.owner_employee_id,
            version: demand.version,
            merged_into_demand_id: demand.merged_into_demand_id,
            primary_solution_application_id:
              demand.primary_solution_application_id,
            published_at: demand.published_at,
            closed_at: demand.closed_at,
            updated_at: startedAt,
          }),
        )
        .execute();
    }

    // —— 需求协作、点赞、评论、举报、进度、试点、应用关联 ——
    const collaborators = [
      {
        demand_id: IDS.demandPublished,
        employee_id: "DEMO-SUPER-ADMIN",
        role: "owner",
      },
      {
        demand_id: IDS.demandPublished,
        employee_id: "DEMO-EMPLOYEE",
        role: "collaborator",
      },
    ] as const;
    for (const collaborator of collaborators) {
      await transaction
        .insertInto("ai_demand_collaborators")
        .values({ ...collaborator, created_at: daysAgo(5) })
        .onConflict((conflict) =>
          conflict.columns(["demand_id", "employee_id"]).doUpdateSet({
            role: collaborator.role,
          }),
        )
        .execute();
    }

    for (const employeeId of ["DEMO-EMPLOYEE", "DEMO-SUPER-ADMIN"]) {
      await transaction
        .insertInto("ai_demand_likes")
        .values({ demand_id: IDS.demandPublished, employee_id: employeeId })
        .onConflict((conflict) =>
          conflict.columns(["demand_id", "employee_id"]).doNothing(),
        )
        .execute();
    }

    const comments = [
      {
        comment_id: IDS.commentDemand1,
        demand_id: IDS.demandPublished,
        parent_comment_id: null,
        author_employee_id: "DEMO-EMPLOYEE",
        body: "这个需求很重要，建议优先排期。",
        display_anonymously: false,
        hidden_at: null,
        created_at: daysAgo(5),
        updated_at: daysAgo(5),
      },
      {
        comment_id: IDS.commentDemand2,
        demand_id: IDS.demandPublished,
        parent_comment_id: IDS.commentDemand1,
        author_employee_id: "DEMO-SUPER-ADMIN",
        body: "已列入迭代计划，预计两周内启动。",
        display_anonymously: false,
        hidden_at: null,
        created_at: daysAgo(4),
        updated_at: daysAgo(4),
      },
      {
        comment_id: IDS.commentDemand3,
        demand_id: IDS.demandPublished,
        parent_comment_id: null,
        author_employee_id: "DEMO-SUPER-ADMIN",
        body: "智能考勤助手可以作为试点应用。",
        display_anonymously: false,
        hidden_at: null,
        created_at: daysAgo(3),
        updated_at: daysAgo(3),
      },
      {
        comment_id: IDS.commentMerged,
        demand_id: IDS.demandMerged,
        parent_comment_id: null,
        author_employee_id: "DEMO-EMPLOYEE",
        body: "建议与统一研发效能数据看板合并推进。",
        display_anonymously: false,
        hidden_at: null,
        created_at: daysAgo(6),
        updated_at: daysAgo(6),
      },
    ] as const;
    for (const comment of comments) {
      await transaction
        .insertInto("ai_demand_comments")
        .values(comment)
        .onConflict((conflict) =>
          conflict.column("comment_id").doUpdateSet({
            body: comment.body,
            hidden_at: comment.hidden_at,
            updated_at: startedAt,
          }),
        )
        .execute();
    }

    const reports = [
      {
        report_id: IDS.reportDemandOpen,
        demand_id: IDS.demandPublished,
        comment_id: IDS.commentDemand1,
        reporter_employee_id: "DEMO-EMPLOYEE",
        reason: "请核实需求优先级表述",
        status: "open",
        resolved_by_employee_id: null,
        resolved_at: null,
        created_at: daysAgo(2),
      },
      {
        report_id: IDS.reportDemandResolved,
        demand_id: IDS.demandMerged,
        comment_id: IDS.commentMerged,
        reporter_employee_id: "DEMO-EMPLOYEE",
        reason: "重复需求",
        status: "dismissed",
        resolved_by_employee_id: "DEMO-SUPER-ADMIN",
        resolved_at: daysAgo(5),
        created_at: daysAgo(6),
      },
    ] as const;
    for (const report of reports) {
      await transaction
        .insertInto("ai_demand_reports")
        .values(report)
        .onConflict((conflict) =>
          conflict.column("report_id").doUpdateSet({
            reason: report.reason,
            status: report.status,
            resolved_by_employee_id: report.resolved_by_employee_id,
            resolved_at: report.resolved_at,
          }),
        )
        .execute();
    }

    const progressUpdates = [
      {
        progress_id: IDS.progress1,
        demand_id: IDS.demandPublished,
        author_employee_id: "DEMO-SUPER-ADMIN",
        status: "pending_claim",
        title: "需求完成评审并发布",
        body: "已通过创新运营评审，正式发布并开放协作。",
        created_at: daysAgo(6),
      },
      {
        progress_id: IDS.progress2,
        demand_id: IDS.demandPublished,
        author_employee_id: "DEMO-SUPER-ADMIN",
        status: "claimed",
        title: "试点应用已就绪",
        body: "智能考勤助手已作为试点应用接入。",
        created_at: daysAgo(2),
      },
    ] as const;
    for (const progress of progressUpdates) {
      await transaction
        .insertInto("ai_demand_progress_updates")
        .values(progress)
        .onConflict((conflict) =>
          conflict.column("progress_id").doUpdateSet({
            status: progress.status,
            title: progress.title,
            body: progress.body,
          }),
        )
        .execute();
    }

    await transaction
      .insertInto("ai_demand_pilots")
      .values({
        pilot_id: IDS.pilotRunning,
        demand_id: IDS.demandPublished,
        application_id: IDS.appPublished,
        name: "研发中心试点",
        starts_at: pilotStartedAt,
        ends_at: null,
        outcome: null,
        status: "running",
        created_by_employee_id: "DEMO-SUPER-ADMIN",
        created_at: pilotStartedAt,
        updated_at: pilotStartedAt,
      })
      .onConflict((conflict) =>
        conflict.column("pilot_id").doUpdateSet({
          name: "研发中心试点",
          application_id: IDS.appPublished,
          starts_at: pilotStartedAt,
          status: "running",
          updated_at: startedAt,
        }),
      )
      .execute();

    await transaction
      .insertInto("ai_demand_applications")
      .values({
        demand_id: IDS.demandPublished,
        application_id: IDS.appPublished,
        role: "solution",
        is_primary: true,
        linked_by_employee_id: "DEMO-SUPER-ADMIN",
        created_at: daysAgo(2),
      })
      .onConflict((conflict) =>
        conflict.columns(["demand_id", "application_id"]).doUpdateSet({
          role: "solution",
          is_primary: true,
          linked_by_employee_id: "DEMO-SUPER-ADMIN",
        }),
      )
      .execute();

    // —— 审计事件 ——
    const auditEvents: readonly (
      | {
          audit_event_id: string;
          application_id: string;
          application_version_id: string | null;
          actor_employee_id: string;
          event_type: string;
          details: Record<string, unknown>;
        }
      | {
          audit_event_id: string;
          demand_id: string;
          actor_employee_id: string;
          event_type: string;
          details: Record<string, unknown>;
        }
    )[] = [
      {
        audit_event_id: IDS.auditApplication,
        application_id: IDS.appPublished,
        application_version_id: null,
        actor_employee_id: "DEMO-EMPLOYEE",
        event_type: "application.created",
        details: { source: "demo-seed" },
      },
      {
        audit_event_id: IDS.auditVersion,
        application_id: IDS.appPublished,
        application_version_id: IDS.versionPublished,
        actor_employee_id: "DEMO-EMPLOYEE",
        event_type: "application.version.created",
        details: { version: "1.0.0" },
      },
      {
        audit_event_id: IDS.auditSubmitted,
        application_id: IDS.appPublished,
        application_version_id: IDS.versionPublished,
        actor_employee_id: "DEMO-EMPLOYEE",
        event_type: "application.submitted",
        details: { source: "demo-seed" },
      },
      {
        audit_event_id: IDS.auditReviewed,
        application_id: IDS.appPublished,
        application_version_id: IDS.versionPublished,
        actor_employee_id: "DEMO-SUPER-ADMIN",
        event_type: "application.reviewed",
        details: { decision: "approve" },
      },
      {
        audit_event_id: IDS.auditPublished,
        application_id: IDS.appPublished,
        application_version_id: IDS.versionPublished,
        actor_employee_id: "DEMO-SUPER-ADMIN",
        event_type: "application.published",
        details: { source: "demo-seed" },
      },
      {
        audit_event_id: IDS.auditDemand,
        demand_id: IDS.demandPublished,
        actor_employee_id: "DEMO-EMPLOYEE",
        event_type: "demand.created",
        details: { source: "demo-seed" },
      },
      {
        audit_event_id: IDS.auditDemandClaimed,
        demand_id: IDS.demandPublished,
        actor_employee_id: "DEMO-SUPER-ADMIN",
        event_type: "demand.claimed",
        details: { source: "demo-seed" },
      },
      {
        audit_event_id: IDS.auditDemandMerged,
        demand_id: IDS.demandMerged,
        actor_employee_id: "DEMO-SUPER-ADMIN",
        event_type: "demand.merged",
        details: { targetDemandId: IDS.demandPublished },
      },
    ] as const;
    for (const audit of auditEvents) {
      if ("application_id" in audit) {
        await transaction
          .insertInto("application_audit_events")
          .values({
            audit_event_id: audit.audit_event_id,
            application_id: audit.application_id,
            application_version_id: audit.application_version_id,
            actor_employee_id: audit.actor_employee_id,
            event_type: audit.event_type,
            details: jsonb(audit.details),
          })
          .onConflict((conflict) =>
            conflict.column("audit_event_id").doNothing(),
          )
          .execute();
      } else {
        await transaction
          .insertInto("ai_demand_audit_events")
          .values({
            audit_event_id: audit.audit_event_id,
            demand_id: audit.demand_id,
            actor_employee_id: audit.actor_employee_id,
            event_type: audit.event_type,
            details: jsonb(audit.details),
          })
          .onConflict((conflict) =>
            conflict.column("audit_event_id").doNothing(),
          )
          .execute();
      }
    }

    // —— 通知 ——
    const notifications = [
      {
        notification_id: IDS.notificationReviewRequested,
        recipient_employee_id: "DEMO-SUPER-ADMIN",
        event_type: "application.review.requested",
        aggregate_id: IDS.appInReview,
        idempotency_key:
          "application.review.requested:10000000-0000-4000-8000-000000000002:DEMO-SUPER-ADMIN",
        message: "应用「需求智能匹配平台」已提交评审，请及时处理。",
        read_at: null,
      },
      {
        notification_id: IDS.notificationApproved,
        recipient_employee_id: "DEMO-EMPLOYEE",
        event_type: "application.reviewed",
        aggregate_id: IDS.appPublished,
        idempotency_key:
          "application.reviewed:10000000-0000-4000-8000-000000000001:DEMO-EMPLOYEE",
        message: "应用「智能考勤助手」的评审结论：approve。",
        read_at: daysAgo(6),
      },
      {
        notification_id: IDS.notificationPublished,
        recipient_employee_id: "DEMO-EMPLOYEE",
        event_type: "application.published",
        aggregate_id: IDS.appPublished,
        idempotency_key:
          "application.published:10000000-0000-4000-8000-000000000001:DEMO-EMPLOYEE",
        message: "应用「智能考勤助手」已发布，可在市场目录查看。",
        read_at: null,
      },
      {
        notification_id: IDS.notificationClaimed,
        recipient_employee_id: "DEMO-EMPLOYEE",
        event_type: "demand.claimed",
        aggregate_id: IDS.demandPublished,
        idempotency_key:
          "demand.claimed:20000000-0000-4000-8000-000000000001:DEMO-EMPLOYEE",
        message: "需求「统一研发效能数据看板」已被创新运营认领。",
        read_at: null,
      },
      {
        notification_id: IDS.notificationProgress,
        recipient_employee_id: "DEMO-EMPLOYEE",
        event_type: "demand.progress.updated",
        aggregate_id: IDS.demandPublished,
        idempotency_key:
          "demand.progress.updated:20000000-0000-4000-8000-000000000001:DEMO-EMPLOYEE:progress2",
        message: "需求「统一研发效能数据看板」的进度已更新为 in_progress。",
        read_at: null,
      },
      {
        notification_id: IDS.notificationPilot,
        recipient_employee_id: "DEMO-EMPLOYEE",
        event_type: "demand.pilot.started",
        aggregate_id: IDS.demandPublished,
        idempotency_key:
          "demand.pilot.started:20000000-0000-4000-8000-000000000001:DEMO-EMPLOYEE",
        message: "需求「统一研发效能数据看板」的试点已启动。",
        read_at: null,
      },
    ] as const;
    for (const notification of notifications) {
      await transaction
        .insertInto("notifications")
        .values({
          notification_id: notification.notification_id,
          recipient_employee_id: notification.recipient_employee_id,
          event_type: notification.event_type,
          aggregate_id: notification.aggregate_id,
          idempotency_key: notification.idempotency_key,
          message: notification.message,
          payload: {
            title: notification.event_type,
            body: notification.message,
          },
          read_at: notification.read_at,
          delivery_status: "sent",
          delivery_attempts: 1,
          last_delivery_error: null,
          next_attempt_at: null,
          created_at: daysAgo(1),
        })
        .onConflict((conflict) =>
          conflict.column("idempotency_key").doUpdateSet({
            message: notification.message,
            payload: {
              title: notification.event_type,
              body: notification.message,
            },
            delivery_status: "sent",
            delivery_attempts: 1,
            last_delivery_error: null,
            next_attempt_at: null,
          }),
        )
        .execute();
    }

    // —— 分析行为事件与日聚合 ——
    const behaviorEvents = [
      {
        event_name: "application_viewed",
        aggregate_type: "application",
        aggregate_id: IDS.appPublished,
        actor_employee_id: "DEMO-EMPLOYEE",
        idempotency_key: "demo-behavior:application-viewed-1",
        occurred_at: daysAgo(3),
      },
      {
        event_name: "application_viewed",
        aggregate_type: "application",
        aggregate_id: IDS.appPublished,
        actor_employee_id: "DEMO-SUPER-ADMIN",
        idempotency_key: "demo-behavior:application-viewed-2",
        occurred_at: daysAgo(2),
      },
      {
        event_name: "application_downloaded",
        aggregate_type: "application",
        aggregate_id: IDS.appPublished,
        actor_employee_id: "DEMO-EMPLOYEE",
        idempotency_key: "demo-behavior:application-downloaded-1",
        occurred_at: daysAgo(2),
      },
      {
        event_name: "demand_viewed",
        aggregate_type: "demand",
        aggregate_id: IDS.demandPublished,
        actor_employee_id: "DEMO-EMPLOYEE",
        idempotency_key: "demo-behavior:demand-viewed-1",
        occurred_at: daysAgo(3),
      },
      {
        event_name: "demand_viewed",
        aggregate_type: "demand",
        aggregate_id: IDS.demandPublished,
        actor_employee_id: "DEMO-SUPER-ADMIN",
        idempotency_key: "demo-behavior:demand-viewed-2",
        occurred_at: daysAgo(1),
      },
      {
        event_name: "demand_liked",
        aggregate_type: "demand",
        aggregate_id: IDS.demandPublished,
        actor_employee_id: "DEMO-SUPER-ADMIN",
        idempotency_key: "demo-behavior:demand-liked-1",
        occurred_at: daysAgo(1),
      },
      {
        event_name: "review_decided",
        aggregate_type: "review",
        aggregate_id: IDS.versionPublished,
        actor_employee_id: "DEMO-SUPER-ADMIN",
        idempotency_key: "demo-behavior:review-decided-1",
        occurred_at: daysAgo(6),
      },
    ] as const;
    for (const event of behaviorEvents) {
      await transaction
        .insertInto("analytics_behavior_events")
        .values({
          event_name: event.event_name,
          aggregate_type: event.aggregate_type,
          aggregate_id: event.aggregate_id,
          actor_employee_id: event.actor_employee_id,
          audience_department_id: "demo-rnd",
          audience_employee_id: null,
          metadata: jsonb({ source: "demo-seed" }),
          idempotency_key: event.idempotency_key,
          occurred_at: event.occurred_at,
          expires_at: new Date(event.occurred_at.getTime() + 180 * DAY_MS),
          created_at: event.occurred_at,
        })
        .onConflict((conflict) =>
          conflict.column("idempotency_key").doNothing(),
        )
        .execute();
    }

    const aggregates = [
      {
        metric_key: "platform.application_views",
        day: today(),
        audience_scope_key: "all",
        value: 2,
        source_event_count: 2,
      },
      {
        metric_key: "market.application_deliveries",
        day: today(),
        audience_scope_key: "all",
        value: 1,
        source_event_count: 1,
      },
      {
        metric_key: "application.downloads",
        day: today(),
        audience_scope_key: "all",
        value: 1,
        source_event_count: 1,
      },
      {
        metric_key: "innovation.demand_views",
        day: today(),
        audience_scope_key: "all",
        value: 2,
        source_event_count: 2,
      },
      {
        metric_key: "review.decisions",
        day: today(),
        audience_scope_key: "all",
        value: 1,
        source_event_count: 1,
      },
    ] as const;
    for (const aggregate of aggregates) {
      await transaction
        .insertInto("analytics_daily_aggregates")
        .values({
          metric_key: aggregate.metric_key,
          metric_version: 1,
          day: aggregate.day,
          audience_scope_key: aggregate.audience_scope_key,
          value: aggregate.value,
          source_event_count: aggregate.source_event_count,
          computed_at: startedAt,
        })
        .onConflict((conflict) =>
          conflict
            .columns(["metric_key", "day", "audience_scope_key"])
            .doUpdateSet({
              metric_version: 1,
              value: aggregate.value,
              source_event_count: aggregate.source_event_count,
              computed_at: startedAt,
            }),
        )
        .execute();
    }
  });

  return {
    categories: categories.length,
    tags: tags.length,
    applications: 4,
    versions: 3,
    deliveries: 3,
    reviews: 1,
    reviewQueueEntries: 1,
    demands: 4,
    collaborators: 2,
    likes: 4,
    comments: 6,
    reports: 2,
    progressUpdates: 2,
    pilots: 1,
    applicationLinks: 1,
    notifications: 6,
    behaviorEvents: 7,
    aggregates: 5,
  };
}

async function assertDemoAccountsExist(
  db: Kysely<DatabaseSchema>,
): Promise<void> {
  const rows = await db
    .selectFrom("employees")
    .select("employee_id")
    .where("employee_id", "in", DEMO_ACCOUNT_IDS)
    .execute();
  const existing = new Set(rows.map((row) => row.employee_id));
  const missing = DEMO_ACCOUNT_IDS.filter((id) => !existing.has(id));
  if (missing.length > 0) {
    throw new Error(
      `DEMO_ACCOUNTS_REQUIRED: 缺少演示账号 ${missing.join(", ")}，请先执行 seed:demo-accounts`,
    );
  }
}
