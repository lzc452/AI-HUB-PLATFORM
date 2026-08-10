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

/**
 * Index in `IDS.application.all` where published apps begin.
 * Published: all[7]..all[16] (10 apps).
 */
const PUBLISHED_OFFSET = 7;

// ── likes plan (12) ─────────────────────────────────────────────────────────

interface LikePlan {
  /** Index into IDS.application.published */
  appIdx: number;
  employeeId: string;
}

const LIKES_PLAN: readonly LikePlan[] = Object.freeze([
  { appIdx: 0, employeeId: EMP.employee },
  { appIdx: 1, employeeId: EMP.employee },
  { appIdx: 1, employeeId: EMP.appAdmin },
  { appIdx: 2, employeeId: EMP.employee },
  { appIdx: 2, employeeId: EMP.innovation },
  { appIdx: 3, employeeId: EMP.employee },
  { appIdx: 4, employeeId: EMP.appAdmin },
  { appIdx: 5, employeeId: EMP.innovation },
  { appIdx: 6, employeeId: EMP.orgAdmin },
  { appIdx: 7, employeeId: EMP.superAdmin },
  { appIdx: 8, employeeId: EMP.employee },
  { appIdx: 9, employeeId: EMP.appAdmin },
]);

// ── ratings plan (8) ────────────────────────────────────────────────────────

interface RatingPlan {
  /** Index into IDS.rating */
  ratingIdx: number;
  /** Index into IDS.application.published */
  appIdx: number;
  employeeId: string;
  stars: number;
  body: string | null;
  displayAnonymously: boolean;
}

const RATINGS_PLAN: readonly RatingPlan[] = Object.freeze([
  {
    ratingIdx: 0,
    appIdx: 0,
    employeeId: EMP.employee,
    stars: 5,
    body: "非常好用的工具，大大提升了工作效率！",
    displayAnonymously: false,
  },
  {
    ratingIdx: 1,
    appIdx: 1,
    employeeId: EMP.appAdmin,
    stars: 4,
    body: "功能齐全，使用方便，推荐给团队使用",
    displayAnonymously: false,
  },
  {
    ratingIdx: 2,
    appIdx: 2,
    employeeId: EMP.innovation,
    stars: 4,
    body: "数据分析很准确，报表生成速度也很快",
    displayAnonymously: false,
  },
  {
    ratingIdx: 3,
    appIdx: 3,
    employeeId: EMP.orgAdmin,
    stars: 3,
    body: "界面友好，但推送功能偶尔会延迟",
    displayAnonymously: false,
  },
  {
    ratingIdx: 4,
    appIdx: 4,
    employeeId: EMP.superAdmin,
    stars: 3,
    body: "整体还行，安全策略配置比较灵活",
    displayAnonymously: false,
  },
  {
    ratingIdx: 5,
    appIdx: 5,
    employeeId: EMP.employee,
    stars: 2,
    body: "薪酬查询模块偶尔会卡顿，需要优化",
    displayAnonymously: false,
  },
  {
    ratingIdx: 6,
    appIdx: 6,
    employeeId: EMP.appAdmin,
    stars: 2,
    body: "全文检索有时不够精准，需要改进分词",
    displayAnonymously: false,
  },
  {
    ratingIdx: 7,
    appIdx: 7,
    employeeId: EMP.innovation,
    stars: 1,
    body: null,
    displayAnonymously: true,
  },
]);

// ── comments plan (8: 5 root + 3 replies) ───────────────────────────────────

interface CommentPlan {
  /** Index into IDS.appComment */
  commentIdx: number;
  /** Index into IDS.application.published */
  appIdx: number;
  /** Index into IDS.appComment for parent, or null for root */
  parentCommentIdx: number | null;
  authorEmployeeId: string;
  body: string;
  displayAnonymously: boolean;
}

const COMMENTS_PLAN: readonly CommentPlan[] = Object.freeze([
  {
    commentIdx: 0,
    appIdx: 0,
    parentCommentIdx: null,
    authorEmployeeId: EMP.employee,
    body: "这个应用非常好用，推荐给大家！",
    displayAnonymously: false,
  },
  {
    commentIdx: 1,
    appIdx: 0,
    parentCommentIdx: null,
    authorEmployeeId: EMP.appAdmin,
    body: "感谢反馈，我们会持续优化功能和体验",
    displayAnonymously: false,
  },
  {
    commentIdx: 2,
    appIdx: 1,
    parentCommentIdx: null,
    authorEmployeeId: EMP.innovation,
    body: "有没有人遇到登录问题？最近经常超时",
    displayAnonymously: false,
  },
  {
    commentIdx: 3,
    appIdx: 1,
    parentCommentIdx: 2,
    authorEmployeeId: EMP.employee,
    body: "我这边登录正常，可以试试清除浏览器缓存再重试",
    displayAnonymously: false,
  },
  {
    commentIdx: 4,
    appIdx: 3,
    parentCommentIdx: null,
    authorEmployeeId: EMP.orgAdmin,
    body: "希望能支持批量操作功能，逐条处理太慢了",
    displayAnonymously: false,
  },
  {
    commentIdx: 5,
    appIdx: 3,
    parentCommentIdx: 4,
    authorEmployeeId: EMP.appAdmin,
    body: "收到，已加入需求池，后续版本会支持批量导入",
    displayAnonymously: false,
  },
  {
    commentIdx: 6,
    appIdx: 5,
    parentCommentIdx: null,
    authorEmployeeId: EMP.employee,
    body: "界面设计很简洁，体验不错，要是能自定义主题就更好了",
    displayAnonymously: false,
  },
  {
    commentIdx: 7,
    appIdx: 0,
    parentCommentIdx: 1,
    authorEmployeeId: EMP.employee,
    body: "期待更多新功能上线！",
    displayAnonymously: false,
  },
]);

// ── reports plan (2: 1 open + 1 dismissed) ──────────────────────────────────

interface ReportPlan {
  /** Index into IDS.appReport */
  reportIdx: number;
  /** Index into IDS.application.published */
  appIdx: number;
  /** Index into IDS.appComment for the reported comment */
  commentIdx: number;
  reporterEmployeeId: string;
  reason: string;
  status: "open" | "dismissed";
  resolvedByEmployeeId: string | null;
}

const REPORTS_PLAN: readonly ReportPlan[] = Object.freeze([
  {
    reportIdx: 0,
    appIdx: 1,
    commentIdx: 2,
    reporterEmployeeId: EMP.appAdmin,
    reason: "评论包含误导性信息，建议核实后处理",
    status: "open",
    resolvedByEmployeeId: null,
  },
  {
    reportIdx: 1,
    appIdx: 5,
    commentIdx: 6,
    reporterEmployeeId: EMP.orgAdmin,
    reason: "与主题无关的闲聊内容",
    status: "dismissed",
    resolvedByEmployeeId: EMP.superAdmin,
  },
]);

// ── delivery-actions plan (12) ──────────────────────────────────────────────

type ActionType = "web_redirect" | "package_download" | "qr_display";
type Channel = "web" | "desktop" | "mobile" | "mini_program";

interface DeliveryActionPlan {
  /** Index into IDS.deliveryAction */
  actionIdx: number;
  /** Index into IDS.application.published */
  appIdx: number;
  actionType: ActionType;
  channel: Channel | null;
  actorEmployeeId: string;
}

/**
 * Uses IDS.deliveryAction indices 13..24 to avoid collision with the catalog
 * fixture (which uses indices 0..12).
 */
const DELIVERY_ACTION_PLAN: readonly DeliveryActionPlan[] = Object.freeze([
  {
    actionIdx: 13,
    appIdx: 0,
    actionType: "web_redirect",
    channel: "web",
    actorEmployeeId: EMP.employee,
  },
  {
    actionIdx: 14,
    appIdx: 1,
    actionType: "package_download",
    channel: "desktop",
    actorEmployeeId: EMP.appAdmin,
  },
  {
    actionIdx: 15,
    appIdx: 2,
    actionType: "qr_display",
    channel: "mobile",
    actorEmployeeId: EMP.innovation,
  },
  {
    actionIdx: 16,
    appIdx: 3,
    actionType: "web_redirect",
    channel: "web",
    actorEmployeeId: EMP.orgAdmin,
  },
  {
    actionIdx: 17,
    appIdx: 4,
    actionType: "package_download",
    channel: "desktop",
    actorEmployeeId: EMP.superAdmin,
  },
  {
    actionIdx: 18,
    appIdx: 5,
    actionType: "qr_display",
    channel: "mini_program",
    actorEmployeeId: EMP.employee,
  },
  {
    actionIdx: 19,
    appIdx: 6,
    actionType: "web_redirect",
    channel: "web",
    actorEmployeeId: EMP.appAdmin,
  },
  {
    actionIdx: 20,
    appIdx: 7,
    actionType: "package_download",
    channel: "desktop",
    actorEmployeeId: EMP.innovation,
  },
  {
    actionIdx: 21,
    appIdx: 8,
    actionType: "qr_display",
    channel: "mobile",
    actorEmployeeId: EMP.orgAdmin,
  },
  {
    actionIdx: 22,
    appIdx: 9,
    actionType: "web_redirect",
    channel: "web",
    actorEmployeeId: EMP.superAdmin,
  },
  {
    actionIdx: 23,
    appIdx: 4,
    actionType: "qr_display",
    channel: "mini_program",
    actorEmployeeId: EMP.employee,
  },
  {
    actionIdx: 24,
    appIdx: 0,
    actionType: "package_download",
    channel: "desktop",
    actorEmployeeId: EMP.appAdmin,
  },
]);

// ── fixture data type ────────────────────────────────────────────────────────

export interface AppInteractionFixtureData {
  applicationLikes: Array<Insertable<DatabaseSchema["application_likes"]>>;
  applicationRatings: Array<Insertable<DatabaseSchema["application_ratings"]>>;
  applicationComments: Array<Insertable<DatabaseSchema["application_comments"]>>;
  applicationReports: Array<Insertable<DatabaseSchema["application_reports"]>>;
  deliveryActions: Array<
    Insertable<DatabaseSchema["catalog_delivery_actions"]>
  >;
}

// ── implementation ──────────────────────────────────────────────────────────

/**
 * Build the application-interaction fixture.
 *
 * Produces:
 * - 12 likes across published apps from various employees
 * - 8 ratings (1-5 stars, unique per (application_id, employee_id))
 * - 8 comments (5 root + 3 replies across 4 published apps)
 * - 2 reports (1 open + 1 dismissed)
 * - 12 delivery actions spanning all 3 action types and 4 channels
 */
export function buildApplicationInteractionFixture(
  anchor: Date,
): AppInteractionFixtureData {
  // ── likes (12) ──────────────────────────────────────────────────────────

  const applicationLikes: Array<Insertable<DatabaseSchema["application_likes"]>> =
    LIKES_PLAN.map((plan, i) => ({
      application_id: IDS.application.published[plan.appIdx]!,
      employee_id: plan.employeeId,
      created_at: daysAgo(anchor, 25 - i),
    }));

  // ── ratings (8) ─────────────────────────────────────────────────────────

  const applicationRatings: Array<
    Insertable<DatabaseSchema["application_ratings"]>
  > = RATINGS_PLAN.map((plan, i) => ({
    rating_id: IDS.rating[plan.ratingIdx]!,
    application_id: IDS.application.published[plan.appIdx]!,
    application_version_id:
      IDS.version[PUBLISHED_OFFSET + plan.appIdx]!,
    employee_id: plan.employeeId,
    stars: plan.stars,
    body: plan.body,
    display_anonymously: plan.displayAnonymously,
    created_at: daysAgo(anchor, 20 - i),
    updated_at: daysAgo(anchor, 20 - i),
  }));

  // ── comments (8) ────────────────────────────────────────────────────────

  // Build a lookup from comment plan index to the resulting comment_id UUID
  // so replies can reference their parent's ID.
  const commentIdByPlanIdx = new Map<number, string>();
  for (const plan of COMMENTS_PLAN) {
    commentIdByPlanIdx.set(plan.commentIdx, IDS.appComment[plan.commentIdx]!);
  }

  const applicationComments: Array<
    Insertable<DatabaseSchema["application_comments"]>
  > = COMMENTS_PLAN.map((plan, i) => ({
    comment_id: IDS.appComment[plan.commentIdx]!,
    application_id: IDS.application.published[plan.appIdx]!,
    application_version_id:
      IDS.version[PUBLISHED_OFFSET + plan.appIdx]!,
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

  // ── reports (2) ─────────────────────────────────────────────────────────

  const applicationReports: Array<
    Insertable<DatabaseSchema["application_reports"]>
  > = REPORTS_PLAN.map((plan, i) => ({
    report_id: IDS.appReport[plan.reportIdx]!,
    application_id: IDS.application.published[plan.appIdx]!,
    comment_id: IDS.appComment[plan.commentIdx]!,
    reporter_employee_id: plan.reporterEmployeeId,
    reason: plan.reason,
    status: plan.status,
    resolved_by_employee_id: plan.resolvedByEmployeeId,
    resolved_at:
      plan.status === "dismissed" ? daysAgo(anchor, 5 - i) : null,
    created_at: daysAgo(anchor, 10 - i),
  }));

  // ── delivery actions (12) ───────────────────────────────────────────────

  const deliveryActions: Array<
    Insertable<DatabaseSchema["catalog_delivery_actions"]>
  > = DELIVERY_ACTION_PLAN.map((plan, i) => ({
    action_id: IDS.deliveryAction[plan.actionIdx]!,
    application_id: IDS.application.published[plan.appIdx]!,
    application_version_id:
      IDS.version[PUBLISHED_OFFSET + plan.appIdx]!,
    actor_employee_id: plan.actorEmployeeId,
    action_type: plan.actionType,
    channel: plan.channel,
    occurred_at: daysAgo(anchor, 12 - i),
  }));

  // ── assemble ────────────────────────────────────────────────────────────

  return {
    applicationLikes,
    applicationRatings,
    applicationComments,
    applicationReports,
    deliveryActions,
  };
}
