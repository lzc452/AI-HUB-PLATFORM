import type { Insertable } from "kysely";
import type { DatabaseSchema } from "../../schema.js";
import { IDS } from "../ids.js";
import { daysAgo } from "../time-utils.js";
import { DEMO_ACCOUNT_DEFINITIONS } from "../../demo-seed.js";

// ── helpers ──────────────────────────────────────────────────────────────────

const EMP = Object.freeze({
  employee: DEMO_ACCOUNT_DEFINITIONS[0]!.employeeId,
  appAdmin: DEMO_ACCOUNT_DEFINITIONS[1]!.employeeId,
  innovation: DEMO_ACCOUNT_DEFINITIONS[2]!.employeeId,
  orgAdmin: DEMO_ACCOUNT_DEFINITIONS[3]!.employeeId,
  superAdmin: DEMO_ACCOUNT_DEFINITIONS[4]!.employeeId,
});

const DEPT = Object.freeze({
  rnd: "demo-rnd",
  innovation: "demo-innovation",
  admin: "demo-admin",
});

// ── app definitions (20 apps in status-group order) ──────────────────────────

interface AppDef {
  name: string;
  summary: string;
  ownerEmployeeId: string;
  maintainerEmployeeId: string;
  departmentId: string;
}

const APP_DEFS: readonly AppDef[] = Object.freeze([
  // ── 3 drafts (indices 0..2) ────────────────────────────────────────────────
  {
    name: "AI辅助代码审查",
    summary: "基于大模型的智能代码审查工具，支持多语言实时分析与建议",
    ownerEmployeeId: EMP.employee,
    maintainerEmployeeId: EMP.employee,
    departmentId: DEPT.rnd,
  },
  {
    name: "会议纪要生成器",
    summary: "自动识别会议语音并生成结构化纪要，支持多轮对话追踪",
    ownerEmployeeId: EMP.employee,
    maintainerEmployeeId: EMP.employee,
    departmentId: DEPT.rnd,
  },
  {
    name: "智能排班系统v2",
    summary: "面向跨部门项目的智能排班与资源调度工具",
    ownerEmployeeId: EMP.appAdmin,
    maintainerEmployeeId: EMP.appAdmin,
    departmentId: DEPT.rnd,
  },
  // ── 3 in_review (indices 3..5) ─────────────────────────────────────────────
  {
    name: "智能客服机器人",
    summary: "基于知识图谱的对话式客服机器人，支持多轮交互与工单自动创建",
    ownerEmployeeId: EMP.appAdmin,
    maintainerEmployeeId: EMP.appAdmin,
    departmentId: DEPT.rnd,
  },
  {
    name: "数据可视化仪表盘",
    summary: "拖拽式数据可视化决策仪表盘，支持实时与批处理多数据源",
    ownerEmployeeId: EMP.appAdmin,
    maintainerEmployeeId: EMP.employee,
    departmentId: DEPT.innovation,
  },
  {
    name: "自动化测试平台",
    summary: "一站式自动化测试管理平台，支持UI、接口与性能测试编排",
    ownerEmployeeId: EMP.appAdmin,
    maintainerEmployeeId: EMP.appAdmin,
    departmentId: DEPT.rnd,
  },
  // ── 1 approved (index 6) ───────────────────────────────────────────────────
  {
    name: "项目管理工具",
    summary: "敏捷项目管理平台，支持Scrum/Kanban双模式与效能度量",
    ownerEmployeeId: EMP.appAdmin,
    maintainerEmployeeId: EMP.employee,
    departmentId: DEPT.rnd,
  },
  // ── 10 published (indices 7..16) ───────────────────────────────────────────
  {
    name: "智能考勤助手",
    summary: "面向研发团队的智能考勤与排班应用，集成钉钉与企业微信",
    ownerEmployeeId: EMP.appAdmin,
    maintainerEmployeeId: EMP.employee,
    departmentId: DEPT.rnd,
  },
  {
    name: "财务报销系统",
    summary: "企业级智能财务报销审批平台，支持OCR发票识别与预算管控",
    ownerEmployeeId: EMP.appAdmin,
    maintainerEmployeeId: EMP.appAdmin,
    departmentId: DEPT.admin,
  },
  {
    name: "文档协作平台",
    summary: "实时协同文档编辑与管理平台，支持版本历史与标注评论",
    ownerEmployeeId: EMP.appAdmin,
    maintainerEmployeeId: EMP.employee,
    departmentId: DEPT.rnd,
  },
  {
    name: "消息推送中心",
    summary: "多渠道消息统一推送与触达追踪平台，支持钉钉/邮件/短信",
    ownerEmployeeId: EMP.innovation,
    maintainerEmployeeId: EMP.innovation,
    departmentId: DEPT.innovation,
  },
  {
    name: "统一认证网关",
    summary: "企业级统一身份认证与单点登录网关，支持SAML/OIDC/LDAP",
    ownerEmployeeId: EMP.orgAdmin,
    maintainerEmployeeId: EMP.orgAdmin,
    departmentId: DEPT.admin,
  },
  {
    name: "人力资源门户",
    summary: "员工自助HR服务门户，覆盖入离职、薪酬查询与培训管理",
    ownerEmployeeId: EMP.appAdmin,
    maintainerEmployeeId: EMP.employee,
    departmentId: DEPT.admin,
  },
  {
    name: "日志分析平台",
    summary: "多源日志集中采集与分析平台，支持全文检索与自定义告警规则",
    ownerEmployeeId: EMP.appAdmin,
    maintainerEmployeeId: EMP.appAdmin,
    departmentId: DEPT.rnd,
  },
  {
    name: "容器管理控制台",
    summary: "容器化应用编排与监控管理控制台，支持多集群统一管理",
    ownerEmployeeId: EMP.appAdmin,
    maintainerEmployeeId: EMP.appAdmin,
    departmentId: DEPT.rnd,
  },
  {
    name: "API网关管理",
    summary: "统一API网关管理平台，支持流控、鉴权与全链路追踪",
    ownerEmployeeId: EMP.appAdmin,
    maintainerEmployeeId: EMP.employee,
    departmentId: DEPT.rnd,
  },
  {
    name: "数据同步引擎",
    summary: "异构系统数据实时同步与转换引擎，支持多适配器与增量策略",
    ownerEmployeeId: EMP.appAdmin,
    maintainerEmployeeId: EMP.appAdmin,
    departmentId: DEPT.rnd,
  },
  // ── 2 withdrawn (indices 17..18) ───────────────────────────────────────────
  {
    name: "旧版消息通知",
    summary: "已被消息推送中心取代的旧版消息通知系统",
    ownerEmployeeId: EMP.employee,
    maintainerEmployeeId: EMP.employee,
    departmentId: DEPT.rnd,
  },
  {
    name: "历史数据迁移工具",
    summary: "一次性使用的历史数据跨库迁移工具，迁移完成后下线",
    ownerEmployeeId: EMP.appAdmin,
    maintainerEmployeeId: EMP.appAdmin,
    departmentId: DEPT.rnd,
  },
  // ── 1 archived (index 19) ──────────────────────────────────────────────────
  {
    name: "遗留系统监控",
    summary: "已由容器管理控制台取代的旧版VM监控工具",
    ownerEmployeeId: EMP.appAdmin,
    maintainerEmployeeId: EMP.appAdmin,
    departmentId: DEPT.admin,
  },
]);

// ── delivery channel definitions (44 deliveries total) ───────────────────────

type Channel = "web" | "desktop" | "mobile" | "mini_program";

/**
 * Delivery distribution:
 *   Published 0-7 (8 apps): 4 channels each = 32
 *   Published 8-9 (2 apps): 3 channels each = 6
 *   Approved (1 app):        2 channels      = 2
 *   In_review 0-1 (2 apps): 1 channel each   = 2
 *   Withdrawn 0-1 (2 apps): 1 channel each   = 2
 *   Total = 44
 */

/** All 4 channels in standard order. */
const ALL_CHANNELS: readonly Channel[] = Object.freeze([
  "web",
  "desktop",
  "mobile",
  "mini_program",
]);

const deliveryPlan: readonly {
  appStatusIndex: number;
  channels: readonly Channel[];
  disabledIndex?: number;
}[] = [
  // published 0-7: all 4 channels
  { appStatusIndex: 7, channels: ALL_CHANNELS },
  { appStatusIndex: 8, channels: ALL_CHANNELS },
  { appStatusIndex: 9, channels: ALL_CHANNELS, disabledIndex: 3 },
  { appStatusIndex: 10, channels: ALL_CHANNELS },
  { appStatusIndex: 11, channels: ALL_CHANNELS },
  { appStatusIndex: 12, channels: ALL_CHANNELS },
  { appStatusIndex: 13, channels: ALL_CHANNELS, disabledIndex: 2 },
  { appStatusIndex: 14, channels: ALL_CHANNELS },
  // published 8-9: 3 channels each
  { appStatusIndex: 15, channels: ["web", "desktop", "mobile"] },
  { appStatusIndex: 16, channels: ["web", "mobile", "mini_program"] },
  // approved: 2 channels
  { appStatusIndex: 6, channels: ["web", "desktop"] },
  // in_review 0-1: 1 channel each
  { appStatusIndex: 3, channels: ["web"] },
  { appStatusIndex: 4, channels: ["web"] },
  // withdrawn 0-1: 1 channel each
  { appStatusIndex: 17, channels: ["desktop"] },
  { appStatusIndex: 18, channels: ["web"] },
];

// ── URL generators ────────────────────────────────────────────────────────────

const appSlug = (name: string): string =>
  name.replace(/[^a-zA-Z0-9一-鿿]/g, "-").toLowerCase();

const baseUrl = (channel: Channel): string => {
  switch (channel) {
    case "web":
      return "https://apps.example.com";
    case "desktop":
      return "https://desktop.example.com";
    case "mobile":
      return "https://m.example.com";
    case "mini_program":
      return "/pages/app/detail";
  }
};

// ── fixture data type ────────────────────────────────────────────────────────

export interface ApplicationFixtureData {
  applications: Array<Insertable<DatabaseSchema["applications"]>>;
  applicationVersions: Array<
    Insertable<DatabaseSchema["application_versions"]>
  >;
  applicationDeliveries: Array<
    Insertable<DatabaseSchema["application_deliveries"]>
  >;
  applicationReviews: Array<Insertable<DatabaseSchema["application_reviews"]>>;
  applicationReviewQueue: Array<
    Insertable<DatabaseSchema["application_review_queue"]>
  >;
  applicationAuditEvents: Array<
    Insertable<DatabaseSchema["application_audit_events"]>
  >;
}

// ── implementation ──────────────────────────────────────────────────────────

export function buildApplicationFixture(anchor: Date): ApplicationFixtureData {
  // ── applications (20) ──────────────────────────────────────────────────────

  const statuses: readonly Insertable<
    DatabaseSchema["applications"]
  >["status"][] = [
    "draft",
    "draft",
    "draft",
    "in_review",
    "in_review",
    "in_review",
    "approved",
    "published",
    "published",
    "published",
    "published",
    "published",
    "published",
    "published",
    "published",
    "published",
    "published",
    "withdrawn",
    "withdrawn",
    "archived",
  ];

  const applications: Array<Insertable<DatabaseSchema["applications"]>> =
    Array.from({ length: 20 }, (_, i) => ({
      application_id: IDS.application.all[i]!,
      owner_employee_id: APP_DEFS[i]!.ownerEmployeeId,
      maintainer_employee_id: APP_DEFS[i]!.maintainerEmployeeId,
      department_id: APP_DEFS[i]!.departmentId,
      name: APP_DEFS[i]!.name,
      summary: APP_DEFS[i]!.summary,
      status: statuses[i]!,
      current_version_id: null,
      created_at: daysAgo(anchor, 80 - i * 2),
      updated_at: daysAgo(anchor, 80 - i * 2),
    }));

  // ── versions (20) — one per application ────────────────────────────────────

  const versionNumbers = [
    "1.0.0",
    "0.1.0",
    "2.0.0-alpha",
    "1.0.0",
    "0.2.0",
    "1.0.0",
    "1.0.0",
    "2.1.0",
    "3.0.0",
    "1.5.0",
    "1.0.0",
    "2.3.1",
    "1.2.0",
    "1.0.0",
    "4.0.0",
    "2.0.0",
    "1.0.0",
    "1.0.0",
    "2.0.0",
    "0.9.0",
  ] as const;

  const scanStatuses: readonly Insertable<
    DatabaseSchema["application_versions"]
  >["scan_status"][] = [
    "pending",
    "pending",
    "pending",
    "passed",
    "passed",
    "pending",
    "passed",
    "passed",
    "passed",
    "passed",
    "passed",
    "passed",
    "pending",
    "passed",
    "passed",
    "passed",
    "passed",
    "passed",
    "passed",
    "passed",
  ];

  const applicationVersions: Array<
    Insertable<DatabaseSchema["application_versions"]>
  > = Array.from({ length: 20 }, (_, i) => ({
    application_version_id: IDS.version[i]!,
    application_id: IDS.application.all[i]!,
    version: versionNumbers[i]!,
    changelog: `${APP_DEFS[i]!.name} ${versionNumbers[i]} 版本发布`,
    artifact_key: `apps/${IDS.application.all[i]}/${versionNumbers[i]}.zip`,
    artifact_sha256: String.fromCharCode(97 + i).repeat(64),
    artifact_signature: `demo-signature-${i}`,
    scan_status: scanStatuses[i]!,
    created_by_employee_id: APP_DEFS[i]!.ownerEmployeeId,
    created_at: daysAgo(anchor, 75 - i * 2),
  }));

  // ── deliveries (44) ────────────────────────────────────────────────────────

  const applicationDeliveries: Array<
    Insertable<DatabaseSchema["application_deliveries"]>
  > = [];

  let deliveryIdx = 0;
  for (const plan of deliveryPlan) {
    const appId = IDS.application.all[plan.appStatusIndex]!;
    const appName = APP_DEFS[plan.appStatusIndex]!.name;
    const slug = appSlug(appName);

    for (let ci = 0; ci < plan.channels.length; ci++) {
      const channel = plan.channels[ci]!;
      const enabled = plan.disabledIndex !== ci;
      applicationDeliveries.push({
        delivery_id: IDS.delivery[deliveryIdx]!,
        application_id: appId,
        channel,
        entry_url:
          channel === "mini_program"
            ? baseUrl(channel)
            : `${baseUrl(channel)}/${slug}`,
        min_client_version: channel === "desktop" ? "1.0.0" : null,
        enabled,
        created_at: daysAgo(anchor, 60 - deliveryIdx),
        updated_at: daysAgo(anchor, 60 - deliveryIdx),
      });
      deliveryIdx++;
    }
  }

  // ── reviews (5) ────────────────────────────────────────────────────────────

  // 3 reviews for published apps (indices 7, 8, 14), 1 for approved (index 6),
  // 1 request_changes for in_review app 0 (index 3)
  const reviewPlan = [
    { appIdx: 7, decision: "approve" as const },
    { appIdx: 8, decision: "approve" as const },
    { appIdx: 14, decision: "approve" as const },
    { appIdx: 6, decision: "approve" as const },
    { appIdx: 3, decision: "request_changes" as const },
  ];

  const applicationReviews: Array<
    Insertable<DatabaseSchema["application_reviews"]>
  > = reviewPlan.map((plan, i) => ({
    review_id: IDS.review[i]!,
    application_id: IDS.application.all[plan.appIdx]!,
    application_version_id: IDS.version[plan.appIdx]!,
    reviewer_employee_id: EMP.innovation,
    application_owner_employee_id: APP_DEFS[plan.appIdx]!.ownerEmployeeId,
    decision: plan.decision,
    comment:
      plan.decision === "approve"
        ? "功能完整，安全扫描通过，准予发布。"
        : "部分功能需调整，请补充错误处理逻辑后重新提交。",
    created_at: daysAgo(anchor, 30 - i * 5),
  }));

  // ── review queue (5) ───────────────────────────────────────────────────────

  const reviewQueuePlan = [
    { appIdx: 3, status: "available" as const, claimedBy: null },
    { appIdx: 4, status: "claimed" as const, claimedBy: EMP.innovation },
    { appIdx: 5, status: "available" as const, claimedBy: null },
    { appIdx: 7, status: "claimed" as const, claimedBy: EMP.innovation },
    { appIdx: 6, status: "claimed" as const, claimedBy: EMP.innovation },
  ];

  const applicationReviewQueue: Array<
    Insertable<DatabaseSchema["application_review_queue"]>
  > = reviewQueuePlan.map((plan, i) => ({
    review_queue_id: IDS.reviewQueue[i]!,
    application_id: IDS.application.all[plan.appIdx]!,
    application_version_id: IDS.version[plan.appIdx]!,
    status: plan.status,
    claimed_by_employee_id: plan.claimedBy,
    claimed_at: plan.claimedBy ? daysAgo(anchor, 5 - i) : null,
    sla_due_at: new Date(anchor.getTime() + (10 - i) * 24 * 60 * 60 * 1000),
    created_at: daysAgo(anchor, 10 - i),
  }));

  // ── audit events (10) ──────────────────────────────────────────────────────

  // Spread across key state transitions: application created, submitted, reviewed, published
  const auditPlan: readonly {
    appIdx: number;
    eventType: string;
    actorEmployeeId: string;
    details: Record<string, unknown>;
  }[] = [
    {
      appIdx: 0,
      eventType: "application.created",
      actorEmployeeId: EMP.employee,
      details: { source: "demo-seed" },
    },
    {
      appIdx: 1,
      eventType: "application.created",
      actorEmployeeId: EMP.employee,
      details: { source: "demo-seed" },
    },
    {
      appIdx: 3,
      eventType: "application.created",
      actorEmployeeId: EMP.appAdmin,
      details: { source: "demo-seed" },
    },
    {
      appIdx: 3,
      eventType: "application.submitted",
      actorEmployeeId: EMP.appAdmin,
      details: { status: "in_review" },
    },
    {
      appIdx: 4,
      eventType: "application.created",
      actorEmployeeId: EMP.appAdmin,
      details: { source: "demo-seed" },
    },
    {
      appIdx: 6,
      eventType: "application.created",
      actorEmployeeId: EMP.appAdmin,
      details: { source: "demo-seed" },
    },
    {
      appIdx: 7,
      eventType: "application.created",
      actorEmployeeId: EMP.appAdmin,
      details: { source: "demo-seed" },
    },
    {
      appIdx: 7,
      eventType: "application.submitted",
      actorEmployeeId: EMP.appAdmin,
      details: { status: "in_review" },
    },
    {
      appIdx: 7,
      eventType: "application.reviewed",
      actorEmployeeId: EMP.innovation,
      details: { decision: "approve" },
    },
    {
      appIdx: 7,
      eventType: "application.published",
      actorEmployeeId: EMP.appAdmin,
      details: { source: "demo-seed" },
    },
  ];

  const applicationAuditEvents: Array<
    Insertable<DatabaseSchema["application_audit_events"]>
  > = auditPlan.map((plan, i) => ({
    audit_event_id: IDS.appAuditEvent[i]!,
    application_id: IDS.application.all[plan.appIdx]!,
    application_version_id:
      plan.eventType !== "application.created"
        ? IDS.version[plan.appIdx]!
        : null,
    actor_employee_id: plan.actorEmployeeId,
    event_type: plan.eventType,
    details: plan.details,
    created_at: daysAgo(anchor, 50 - i * 5),
  }));

  // ── assemble ───────────────────────────────────────────────────────────────

  return {
    applications,
    applicationVersions,
    applicationDeliveries,
    applicationReviews,
    applicationReviewQueue,
    applicationAuditEvents,
  };
}
