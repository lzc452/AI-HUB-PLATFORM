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

/** Demand indices in IDS.demand.all */
const D = Object.freeze({
  inProgress0: 9,  // AI辅助项目风险评估
  inProgress1: 10, // 多语言文档翻译与校对系统
  inProgress2: 11, // 研发效能度量仪表盘
  pilot0: 12,      // 企业级API全生命周期管理平台
  completed0: 13,  // 智能客服工单自动分配系统
  completed1: 14,  // 统一数据血缘追踪工具
  published0: 7,   // 智能排班与资源调度系统
  published1: 8,   // 自动化合规审计工具
});

// ── comments plan (8: 5 root + 3 replies) ───────────────────────────────────

interface CommentPlan {
  /** Index into IDS.demandComment */
  commentIdx: number;
  /** Demand index into IDS.demand.all */
  demandIdx: number;
  /** Index into IDS.demandComment for parent, or null for root */
  parentCommentIdx: number | null;
  authorEmployeeId: string;
  body: string;
  displayAnonymously: boolean;
}

const COMMENTS_PLAN: readonly CommentPlan[] = Object.freeze([
  {
    commentIdx: 0,
    demandIdx: D.inProgress0,
    parentCommentIdx: null,
    authorEmployeeId: EMP.employee,
    body: "能否增加自定义风险因子功能？我们业务场景比较特殊",
    displayAnonymously: false,
  },
  {
    commentIdx: 1,
    demandIdx: D.inProgress0,
    parentCommentIdx: null,
    authorEmployeeId: EMP.appAdmin,
    body: "已经开始原型设计了，预计下周可以看到初版",
    displayAnonymously: false,
  },
  {
    commentIdx: 2,
    demandIdx: D.inProgress0,
    parentCommentIdx: 0,
    authorEmployeeId: EMP.appAdmin,
    body: "自定义风险因子功能计划在v2版本支持，敬请期待",
    displayAnonymously: false,
  },
  {
    commentIdx: 3,
    demandIdx: D.pilot0,
    parentCommentIdx: null,
    authorEmployeeId: EMP.innovation,
    body: "API mock功能什么时候上线？团队这边等着用",
    displayAnonymously: false,
  },
  {
    commentIdx: 4,
    demandIdx: D.inProgress1,
    parentCommentIdx: null,
    authorEmployeeId: EMP.employee,
    body: "支持哪些语种的翻译？中日韩语言覆盖了吗？",
    displayAnonymously: false,
  },
  {
    commentIdx: 5,
    demandIdx: D.pilot0,
    parentCommentIdx: 3,
    authorEmployeeId: EMP.appAdmin,
    body: "Mock功能已在开发中，预计本月底完成集成测试",
    displayAnonymously: false,
  },
  {
    commentIdx: 6,
    demandIdx: D.pilot0,
    parentCommentIdx: null,
    authorEmployeeId: EMP.orgAdmin,
    body: "API监控面板的设计很直观，赞一个！",
    displayAnonymously: false,
  },
  {
    commentIdx: 7,
    demandIdx: D.pilot0,
    parentCommentIdx: 6,
    authorEmployeeId: EMP.appAdmin,
    body: "谢谢反馈，我们会持续优化监控体验",
    displayAnonymously: false,
  },
]);

// ── likes plan (10) ─────────────────────────────────────────────────────────

interface LikePlan {
  /** Index into IDS.demand.all */
  demandIdx: number;
  employeeId: string;
}

const LIKES_PLAN: readonly LikePlan[] = Object.freeze([
  { demandIdx: D.inProgress0, employeeId: EMP.employee },
  { demandIdx: D.inProgress0, employeeId: EMP.appAdmin },
  { demandIdx: D.inProgress1, employeeId: EMP.innovation },
  { demandIdx: D.inProgress2, employeeId: EMP.orgAdmin },
  { demandIdx: D.pilot0, employeeId: EMP.superAdmin },
  { demandIdx: D.pilot0, employeeId: EMP.employee },
  { demandIdx: D.published0, employeeId: EMP.appAdmin },
  { demandIdx: D.published1, employeeId: EMP.innovation },
  { demandIdx: D.completed0, employeeId: EMP.orgAdmin },
  { demandIdx: D.completed1, employeeId: EMP.employee },
]);

// ── comment-likes plan (4) ──────────────────────────────────────────────────

interface CommentLikePlan {
  /** Index into IDS.demandComment */
  commentIdx: number;
  employeeId: string;
}

const COMMENT_LIKES_PLAN: readonly CommentLikePlan[] = Object.freeze([
  { commentIdx: 0, employeeId: EMP.innovation },
  { commentIdx: 3, employeeId: EMP.employee },
  { commentIdx: 6, employeeId: EMP.appAdmin },
  { commentIdx: 4, employeeId: EMP.innovation },
]);

// ── reports plan (3: open, dismissed, hidden) ───────────────────────────────

interface ReportPlan {
  /** Index into IDS.demandReport */
  reportIdx: number;
  /** Index into IDS.demand.all */
  demandIdx: number;
  /** Index into IDS.demandComment for the reported comment, or null */
  commentIdx: number | null;
  reporterEmployeeId: string;
  reason: string;
  status: "open" | "dismissed" | "hidden";
  resolvedByEmployeeId: string | null;
}

const REPORTS_PLAN: readonly ReportPlan[] = Object.freeze([
  {
    reportIdx: 0,
    demandIdx: D.inProgress0,
    commentIdx: 1,
    reporterEmployeeId: EMP.superAdmin,
    reason: "评论包含内部项目敏感信息，建议脱敏后发布",
    status: "open",
    resolvedByEmployeeId: null,
  },
  {
    reportIdx: 1,
    demandIdx: D.pilot0,
    commentIdx: 3,
    reporterEmployeeId: EMP.employee,
    reason: "评论内容与主题不符，属于无关讨论",
    status: "dismissed",
    resolvedByEmployeeId: EMP.appAdmin,
  },
  {
    reportIdx: 2,
    demandIdx: D.inProgress1,
    commentIdx: 4,
    reporterEmployeeId: EMP.orgAdmin,
    reason: "重复提问，已有相似问题在FAQ中回答",
    status: "hidden",
    resolvedByEmployeeId: EMP.superAdmin,
  },
]);

// ── progress-updates plan (6) ───────────────────────────────────────────────

type DemandStatus = Insertable<DatabaseSchema["ai_demand_progress_updates"]>["status"];

interface ProgressUpdatePlan {
  /** Index into IDS.demandProgress */
  progressIdx: number;
  /** Index into IDS.demand.all */
  demandIdx: number;
  authorEmployeeId: string;
  status: DemandStatus;
  title: string;
  body: string;
}

const PROGRESS_UPDATES_PLAN: readonly ProgressUpdatePlan[] = Object.freeze([
  {
    progressIdx: 0,
    demandIdx: D.inProgress0,
    authorEmployeeId: EMP.appAdmin,
    status: "in_progress",
    title: "项目启动",
    body: "完成需求评审，确定技术方案采用XGBoost+规则引擎混合模型。团队2人已到位。",
  },
  {
    progressIdx: 1,
    demandIdx: D.inProgress0,
    authorEmployeeId: EMP.appAdmin,
    status: "in_progress",
    title: "原型开发完成",
    body: "已完成核心风险识别功能的原型开发，正在进行内部测试，识别准确率达85%。",
  },
  {
    progressIdx: 2,
    demandIdx: D.inProgress1,
    authorEmployeeId: EMP.superAdmin,
    status: "in_progress",
    title: "术语库搭建完成",
    body: "已完成50个行业术语库的搭建，覆盖IT、金融、法律三大领域。",
  },
  {
    progressIdx: 3,
    demandIdx: D.inProgress1,
    authorEmployeeId: EMP.superAdmin,
    status: "in_progress",
    title: "翻译引擎集成",
    body: "已集成3个主流翻译引擎，开始精度测试。中日韩语种覆盖率98%。",
  },
  {
    progressIdx: 4,
    demandIdx: D.inProgress2,
    authorEmployeeId: EMP.innovation,
    status: "in_progress",
    title: "度量指标体系确认",
    body: "与各团队对齐了5个核心效能指标：需求吞吐量、缺陷密度、部署频率、变更失败率、恢复时间。",
  },
  {
    progressIdx: 5,
    demandIdx: D.inProgress2,
    authorEmployeeId: EMP.innovation,
    status: "pilot",
    title: "试点运行",
    body: "已在2个研发团队进行试点运行，收集了15条优化反馈，整体满意度4.2/5。",
  },
]);

// ── pilots plan (4: planned, running, completed, cancelled) ─────────────────

type PilotStatus = Insertable<DatabaseSchema["ai_demand_pilots"]>["status"];

interface PilotPlan {
  /** Index into IDS.demandPilot */
  pilotIdx: number;
  /** Index into IDS.demand.all */
  demandIdx: number;
  /** Index into IDS.application.published, or null */
  applicationPubIdx: number | null;
  name: string;
  status: PilotStatus;
  createdByEmployeeId: string;
  outcome: string | null;
}

const PILOTS_PLAN: readonly PilotPlan[] = Object.freeze([
  {
    pilotIdx: 0,
    demandIdx: D.pilot0,
    applicationPubIdx: 6,
    name: "API管理平台试点-研发一部",
    status: "planned",
    createdByEmployeeId: EMP.appAdmin,
    outcome: null,
  },
  {
    pilotIdx: 1,
    demandIdx: D.pilot0,
    applicationPubIdx: 6,
    name: "API管理平台试点-研发二部",
    status: "running",
    createdByEmployeeId: EMP.appAdmin,
    outcome: null,
  },
  {
    pilotIdx: 2,
    demandIdx: D.completed0,
    applicationPubIdx: 7,
    name: "智能客服试点-客服部",
    status: "completed",
    createdByEmployeeId: EMP.appAdmin,
    outcome: "试点效果显著，工单分配效率提升40%，客服满意度提升15%",
  },
  {
    pilotIdx: 3,
    demandIdx: D.pilot0,
    applicationPubIdx: 6,
    name: "API管理平台试点-测试部",
    status: "cancelled",
    createdByEmployeeId: EMP.innovation,
    outcome: "因测试环境资源不足，试点暂时取消，待环境就绪后重新启动",
  },
]);

// ── demand-application links plan (4: candidate, pilot, solution) ───────────

type AppRole = Insertable<DatabaseSchema["ai_demand_applications"]>["role"];

interface DemandAppLinkPlan {
  /** Index into IDS.demand.all */
  demandIdx: number;
  /** Index into IDS.application.published */
  appPubIdx: number;
  role: AppRole;
  isPrimary: boolean;
  linkedByEmployeeId: string;
}

const DEMAND_APP_LINKS_PLAN: readonly DemandAppLinkPlan[] = Object.freeze([
  {
    demandIdx: D.inProgress0,
    appPubIdx: 0,
    role: "candidate",
    isPrimary: false,
    linkedByEmployeeId: EMP.employee,
  },
  {
    demandIdx: D.pilot0,
    appPubIdx: 6,
    role: "pilot",
    isPrimary: true,
    linkedByEmployeeId: EMP.appAdmin,
  },
  {
    demandIdx: D.completed0,
    appPubIdx: 7,
    role: "solution",
    isPrimary: true,
    linkedByEmployeeId: EMP.appAdmin,
  },
  {
    demandIdx: D.completed1,
    appPubIdx: 8,
    role: "solution",
    isPrimary: false,
    linkedByEmployeeId: EMP.employee,
  },
]);

// ── fixture data type ────────────────────────────────────────────────────────

export interface DemandInteractionFixtureData {
  demandComments: Array<Insertable<DatabaseSchema["ai_demand_comments"]>>;
  demandLikes: Array<Insertable<DatabaseSchema["ai_demand_likes"]>>;
  demandCommentLikes: Array<Insertable<DatabaseSchema["ai_demand_comment_likes"]>>;
  demandReports: Array<Insertable<DatabaseSchema["ai_demand_reports"]>>;
  demandProgressUpdates: Array<Insertable<DatabaseSchema["ai_demand_progress_updates"]>>;
  demandPilots: Array<Insertable<DatabaseSchema["ai_demand_pilots"]>>;
  demandApplications: Array<Insertable<DatabaseSchema["ai_demand_applications"]>>;
}

// ── implementation ──────────────────────────────────────────────────────────

/**
 * Build the demand-interaction fixture.
 *
 * Produces:
 * - 8 comments (5 root + 3 replies across in_progress and pilot demands)
 * - 10 likes across published, in_progress, pilot, and completed demands
 * - 4 comment-likes on various comments
 * - 3 reports (1 open + 1 dismissed + 1 hidden)
 * - 6 progress updates across in_progress demands
 * - 4 pilots (planned / running / completed / cancelled)
 * - 4 demand-application links (candidate / pilot / solution)
 */
export function buildDemandInteractionFixture(
  anchor: Date,
): DemandInteractionFixtureData {
  // ── comments (8: 5 root + 3 replies) ──────────────────────────────────────

  // Build a lookup from comment plan index to the resulting comment_id UUID
  // so replies can reference their parent's ID.
  const commentIdByPlanIdx = new Map<number, string>();
  for (const plan of COMMENTS_PLAN) {
    commentIdByPlanIdx.set(plan.commentIdx, IDS.demandComment[plan.commentIdx]!);
  }

  const demandComments: Array<
    Insertable<DatabaseSchema["ai_demand_comments"]>
  > = COMMENTS_PLAN.map((plan, i) => ({
    comment_id: IDS.demandComment[plan.commentIdx]!,
    demand_id: IDS.demand.all[plan.demandIdx]!,
    parent_comment_id:
      plan.parentCommentIdx !== null
        ? commentIdByPlanIdx.get(plan.parentCommentIdx)!
        : null,
    author_employee_id: plan.authorEmployeeId,
    body: plan.body,
    display_anonymously: plan.displayAnonymously,
    hidden_at: null,
    created_at: daysAgo(anchor, 15 - i),
    updated_at: daysAgo(anchor, 15 - i),
  }));

  // ── likes (10) ────────────────────────────────────────────────────────────

  const demandLikes: Array<Insertable<DatabaseSchema["ai_demand_likes"]>> =
    LIKES_PLAN.map((plan, i) => ({
      demand_id: IDS.demand.all[plan.demandIdx]!,
      employee_id: plan.employeeId,
      created_at: daysAgo(anchor, 20 - i),
    }));

  // ── comment-likes (4) ─────────────────────────────────────────────────────

  const demandCommentLikes: Array<
    Insertable<DatabaseSchema["ai_demand_comment_likes"]>
  > = COMMENT_LIKES_PLAN.map((plan, i) => ({
    comment_id: IDS.demandComment[plan.commentIdx]!,
    employee_id: plan.employeeId,
    created_at: daysAgo(anchor, 10 - i),
  }));

  // ── reports (3) ───────────────────────────────────────────────────────────

  const demandReports: Array<
    Insertable<DatabaseSchema["ai_demand_reports"]>
  > = REPORTS_PLAN.map((plan, i) => ({
    report_id: IDS.demandReport[plan.reportIdx]!,
    demand_id: IDS.demand.all[plan.demandIdx]!,
    comment_id:
      plan.commentIdx !== null
        ? IDS.demandComment[plan.commentIdx]!
        : null,
    reporter_employee_id: plan.reporterEmployeeId,
    reason: plan.reason,
    status: plan.status,
    resolved_by_employee_id: plan.resolvedByEmployeeId,
    resolved_at:
      plan.status !== "open" ? daysAgo(anchor, 5 - i) : null,
    created_at: daysAgo(anchor, 8 - i),
  }));

  // ── progress updates (6) ──────────────────────────────────────────────────

  const demandProgressUpdates: Array<
    Insertable<DatabaseSchema["ai_demand_progress_updates"]>
  > = PROGRESS_UPDATES_PLAN.map((plan, i) => ({
    progress_id: IDS.demandProgress[plan.progressIdx]!,
    demand_id: IDS.demand.all[plan.demandIdx]!,
    author_employee_id: plan.authorEmployeeId,
    status: plan.status,
    title: plan.title,
    body: plan.body,
    created_at: daysAgo(anchor, 14 - i * 2),
  }));

  // ── pilots (4) ────────────────────────────────────────────────────────────

  const demandPilots: Array<
    Insertable<DatabaseSchema["ai_demand_pilots"]>
  > = PILOTS_PLAN.map((plan, i) => ({
    pilot_id: IDS.demandPilot[plan.pilotIdx]!,
    demand_id: IDS.demand.all[plan.demandIdx]!,
    application_id:
      plan.applicationPubIdx !== null
        ? IDS.application.published[plan.applicationPubIdx]!
        : null,
    name: plan.name,
    starts_at: daysAgo(anchor, 18 - i * 3),
    ends_at:
      plan.status === "completed" || plan.status === "cancelled"
        ? daysAgo(anchor, 10 - i * 2)
        : null,
    outcome: plan.outcome,
    status: plan.status,
    created_by_employee_id: plan.createdByEmployeeId,
    created_at: daysAgo(anchor, 20 - i * 2),
    updated_at: daysAgo(anchor, 12 - i * 2),
  }));

  // ── demand-application links (4) ──────────────────────────────────────────

  const demandApplications: Array<
    Insertable<DatabaseSchema["ai_demand_applications"]>
  > = DEMAND_APP_LINKS_PLAN.map((plan, i) => ({
    demand_id: IDS.demand.all[plan.demandIdx]!,
    application_id: IDS.application.published[plan.appPubIdx]!,
    role: plan.role,
    is_primary: plan.isPrimary,
    linked_by_employee_id: plan.linkedByEmployeeId,
    created_at: daysAgo(anchor, 16 - i * 3),
  }));

  // ── assemble ──────────────────────────────────────────────────────────────

  return {
    demandComments,
    demandLikes,
    demandCommentLikes,
    demandReports,
    demandProgressUpdates,
    demandPilots,
    demandApplications,
  };
}
