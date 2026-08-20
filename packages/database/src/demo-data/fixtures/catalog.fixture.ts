import type { Insertable } from "kysely";
import type { DatabaseSchema } from "../../schema.js";
import { IDS } from "../ids.js";
import { daysAgo } from "../time-utils.js";
import { DEMO_ACCOUNT_DEFINITIONS } from "../../demo-seed.js";

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * V1 演示账号收敛：仅分发 DEMO-EMPLOYEE 与 DEMO-SUPER-ADMIN 两个账号。
 * 管理类演示操作（应用管理、需求运营、组织管理）统一由超级管理员承担。
 */
const EMP = Object.freeze({
  employee: DEMO_ACCOUNT_DEFINITIONS[0]!.employeeId,
  appAdmin: DEMO_ACCOUNT_DEFINITIONS[1]!.employeeId,
  innovation: DEMO_ACCOUNT_DEFINITIONS[1]!.employeeId,
  orgAdmin: DEMO_ACCOUNT_DEFINITIONS[1]!.employeeId,
  superAdmin: DEMO_ACCOUNT_DEFINITIONS[1]!.employeeId,
});

const DEPT = Object.freeze({
  rnd: "demo-rnd",
  innovation: "demo-innovation",
  admin: "demo-admin",
});

// ── category / tag definitions ────────────────────────────────────────────────

interface CategoryDef {
  category_id: string;
  name: string;
  sort_order: number;
  enabled: boolean;
}

interface TagDef {
  tag_id: string;
  name: string;
  enabled: boolean;
}

const CATEGORY_DEFS: readonly CategoryDef[] = Object.freeze([
  {
    category_id: IDS.catalog.category.productivity,
    name: "效能工具",
    sort_order: 1,
    enabled: true,
  },
  {
    category_id: IDS.catalog.category.ai,
    name: "AI 智能",
    sort_order: 2,
    enabled: true,
  },
  {
    category_id: IDS.catalog.category.reporting,
    name: "数据报表",
    sort_order: 3,
    enabled: true,
  },
  {
    category_id: IDS.catalog.category.collaboration,
    name: "协同办公",
    sort_order: 4,
    enabled: true,
  },
  {
    category_id: IDS.catalog.category.automation,
    name: "流程自动化",
    sort_order: 5,
    enabled: true,
  },
  {
    category_id: IDS.catalog.category.smartAssistant,
    name: "智能助手",
    sort_order: 6,
    enabled: true,
  },
  {
    category_id: IDS.catalog.category.documentOffice,
    name: "文档办公",
    sort_order: 7,
    enabled: true,
  },
  {
    category_id: IDS.catalog.category.dataAnalysis,
    name: "数据分析",
    sort_order: 8,
    enabled: true,
  },
  {
    category_id: IDS.catalog.category.imageRecognition,
    name: "图像识别",
    sort_order: 9,
    enabled: true,
  },
  {
    category_id: IDS.catalog.category.financeTax,
    name: "财务税务",
    sort_order: 10,
    enabled: true,
  },
  {
    category_id: IDS.catalog.category.customerService,
    name: "客户服务",
    sort_order: 11,
    enabled: true,
  },
  {
    category_id: IDS.catalog.category.devTools,
    name: "开发工具",
    sort_order: 12,
    enabled: true,
  },
  {
    category_id: IDS.catalog.category.educationTraining,
    name: "教育培训",
    sort_order: 13,
    enabled: true,
  },
  {
    category_id: IDS.catalog.category.hrManagement,
    name: "人力资源",
    sort_order: 14,
    enabled: true,
  },
  {
    category_id: IDS.catalog.category.securityCompliance,
    name: "安全合规",
    sort_order: 15,
    enabled: true,
  },
]);

const TAG_DEFS: readonly TagDef[] = Object.freeze([
  { tag_id: IDS.catalog.tag.ai, name: "AI 智能", enabled: true },
  { tag_id: IDS.catalog.tag.attendance, name: "考勤", enabled: true },
  { tag_id: IDS.catalog.tag.productivity, name: "效能", enabled: true },
  { tag_id: IDS.catalog.tag.reporting, name: "报表", enabled: true },
  { tag_id: IDS.catalog.tag.collaboration, name: "协同", enabled: true },
  { tag_id: IDS.catalog.tag.automation, name: "自动化", enabled: true },
  { tag_id: IDS.catalog.tag.security, name: "安全", enabled: true },
  { tag_id: IDS.catalog.tag.mobile, name: "移动端", enabled: true },
  { tag_id: IDS.catalog.tag.smartAssistant, name: "智能助手", enabled: true },
  {
    tag_id: IDS.catalog.tag.documentProcessing,
    name: "文档处理",
    enabled: true,
  },
  { tag_id: IDS.catalog.tag.ocr, name: "OCR 识别", enabled: true },
  { tag_id: IDS.catalog.tag.dataAnalytics, name: "数据分析", enabled: true },
  {
    tag_id: IDS.catalog.tag.processAutomation,
    name: "流程自动化",
    enabled: true,
  },
  { tag_id: IDS.catalog.tag.mobileOffice, name: "移动办公", enabled: true },
  {
    tag_id: IDS.catalog.tag.securityCompliance,
    name: "安全合规",
    enabled: true,
  },
  { tag_id: IDS.catalog.tag.reportAnalysis, name: "报表分析", enabled: true },
  { tag_id: IDS.catalog.tag.approvalFlow, name: "流程审批", enabled: true },
  { tag_id: IDS.catalog.tag.knowledgeBase, name: "知识库", enabled: true },
]);

// ── metadata plan (10 published apps) ─────────────────────────────────────────

type HealthStatus = "healthy" | "degraded" | "failed" | "unknown";

interface MetadataPlan {
  appIdx: number; // index into IDS.application.published
  category_id: string;
  application_type: string;
  search_name: string;
  search_summary: string;
  search_pinyin: string;
  search_initials: string;
  recommendation_rank: number;
  health_status: HealthStatus;
  deprecated_reason: string | null;
  replacement_application_id: string | null;
}

/**
 * Metadata distribution across the 10 published apps:
 *   published[0..6] — 7 healthy
 *   published[7..8] — 2 degraded
 *   published[9]   — 1 with replacement tracking
 */
const METADATA_PLAN: readonly MetadataPlan[] = Object.freeze([
  // 7 healthy (indices 0..6)
  {
    appIdx: 0,
    category_id: IDS.catalog.category.productivity,
    application_type: "attendance",
    search_name: "zhineng kaoqin zhushou",
    search_summary:
      "mianxiang yanfa tuandui de zhineng kaoqin yu paiban yingyong",
    search_pinyin: "zhi neng kao qin zhu shou",
    search_initials: "znkqzs",
    recommendation_rank: 85,
    health_status: "healthy",
    deprecated_reason: null,
    replacement_application_id: null,
  },
  {
    appIdx: 1,
    category_id: IDS.catalog.category.ai,
    application_type: "finance",
    search_name: "caiwu baoxiao xitong",
    search_summary: "qiye ji zhineng caiwu baoxiao shenpi pingtai",
    search_pinyin: "cai wu bao xiao xi tong",
    search_initials: "cwbxxt",
    recommendation_rank: 90,
    health_status: "healthy",
    deprecated_reason: null,
    replacement_application_id: null,
  },
  {
    appIdx: 2,
    category_id: IDS.catalog.category.collaboration,
    application_type: "document",
    search_name: "wendang xiezuo pingtai",
    search_summary: "shishi xietong wendang bianji yu guanli pingtai",
    search_pinyin: "wen dang xie zuo ping tai",
    search_initials: "wdxzpt",
    recommendation_rank: 78,
    health_status: "healthy",
    deprecated_reason: null,
    replacement_application_id: null,
  },
  {
    appIdx: 3,
    category_id: IDS.catalog.category.automation,
    application_type: "messaging",
    search_name: "xiaoxi tuisong zhongxin",
    search_summary: "duo qudao xiaoxi tongyi tuisong yu chuda zhuizong pingtai",
    search_pinyin: "xiao xi tui song zhong xin",
    search_initials: "xxtszx",
    recommendation_rank: 82,
    health_status: "healthy",
    deprecated_reason: null,
    replacement_application_id: null,
  },
  {
    appIdx: 4,
    category_id: IDS.catalog.category.reporting,
    application_type: "security",
    search_name: "tongyi renzheng wangguan",
    search_summary:
      "qiye ji tongyi shenfen renzheng yu dandian denglu wangguan",
    search_pinyin: "tong yi ren zheng wang guan",
    search_initials: "tyrzwg",
    recommendation_rank: 88,
    health_status: "healthy",
    deprecated_reason: null,
    replacement_application_id: null,
  },
  {
    appIdx: 5,
    category_id: IDS.catalog.category.productivity,
    application_type: "hr",
    search_name: "renli ziyuan menhu",
    search_summary: "yuangong zizhu HR fuwu menhu",
    search_pinyin: "ren li zi yuan men hu",
    search_initials: "rlzymh",
    recommendation_rank: 75,
    health_status: "healthy",
    deprecated_reason: null,
    replacement_application_id: null,
  },
  {
    appIdx: 6,
    category_id: IDS.catalog.category.ai,
    application_type: "observability",
    search_name: "rizhi fenxi pingtai",
    search_summary: "duo yuan rizhi jizhong caiji yu fenxi pingtai",
    search_pinyin: "ri zhi fen xi ping tai",
    search_initials: "rzfxpt",
    recommendation_rank: 80,
    health_status: "healthy",
    deprecated_reason: null,
    replacement_application_id: null,
  },
  // 2 degraded (indices 7..8)
  {
    appIdx: 7,
    category_id: IDS.catalog.category.automation,
    application_type: "devops",
    search_name: "rongqi guanli kongzhitai",
    search_summary: "rongqi hua yingyong bianpai yu jiankong guanli kongzhitai",
    search_pinyin: "rong qi guan li kong zhi tai",
    search_initials: "rqglkzt",
    recommendation_rank: 60,
    health_status: "degraded",
    deprecated_reason: "部分集群连接不稳定，推荐使用新版k8s面板",
    replacement_application_id: null,
  },
  {
    appIdx: 8,
    category_id: IDS.catalog.category.automation,
    application_type: "api-gateway",
    search_name: "api wangguan guanli",
    search_summary: "tongyi API wangguan guanli pingtai",
    search_pinyin: "API wang guan guan li",
    search_initials: "apiwggl",
    recommendation_rank: 55,
    health_status: "degraded",
    deprecated_reason: "存在安全风险，建议评估后迁移",
    replacement_application_id: null,
  },
  // 1 with replacement tracking (index 9)
  {
    appIdx: 9,
    category_id: IDS.catalog.category.reporting,
    application_type: "data-sync",
    search_name: "shuju tongbu yinqing",
    search_summary: "yigou xitong shuju shishi tongbu yu zhuanhuan yinqing",
    search_pinyin: "shu ju tong bu yin qing",
    search_initials: "sjtbyq",
    recommendation_rank: 40,
    health_status: "degraded",
    deprecated_reason: "架构升级，请迁移至新一代同步引擎",
    replacement_application_id: IDS.application.published[4]!,
  },
]);

// ── tag-link plan (2-3 tags per published app) ────────────────────────────────

interface TagLinkPlan {
  appIdx: number; // index into IDS.application.published
  tag_ids: readonly string[];
}

const TAG_LINK_PLAN: readonly TagLinkPlan[] = Object.freeze([
  {
    appIdx: 0,
    tag_ids: [
      IDS.catalog.tag.attendance,
      IDS.catalog.tag.productivity,
      IDS.catalog.tag.mobile,
    ],
  },
  { appIdx: 1, tag_ids: [IDS.catalog.tag.ai, IDS.catalog.tag.automation] },
  {
    appIdx: 2,
    tag_ids: [IDS.catalog.tag.collaboration, IDS.catalog.tag.productivity],
  },
  {
    appIdx: 3,
    tag_ids: [
      IDS.catalog.tag.automation,
      IDS.catalog.tag.mobile,
      IDS.catalog.tag.collaboration,
    ],
  },
  { appIdx: 4, tag_ids: [IDS.catalog.tag.security, IDS.catalog.tag.ai] },
  {
    appIdx: 5,
    tag_ids: [IDS.catalog.tag.productivity, IDS.catalog.tag.collaboration],
  },
  { appIdx: 6, tag_ids: [IDS.catalog.tag.ai, IDS.catalog.tag.reporting] },
  {
    appIdx: 7,
    tag_ids: [IDS.catalog.tag.automation, IDS.catalog.tag.security],
  },
  {
    appIdx: 8,
    tag_ids: [
      IDS.catalog.tag.ai,
      IDS.catalog.tag.security,
      IDS.catalog.tag.automation,
    ],
  },
  {
    appIdx: 9,
    tag_ids: [IDS.catalog.tag.automation, IDS.catalog.tag.reporting],
  },
]);

// ── audience plan (3 entries: all / department / employee) ────────────────────

interface AudiencePlan {
  audienceIdx: number; // index into IDS.audience
  appIdx: number; // index into IDS.application.published
  audience_type: "all" | "department" | "employee";
  department_id: string | null;
  employee_id: string | null;
  include_children: boolean;
}

const AUDIENCE_PLAN: readonly AudiencePlan[] = Object.freeze([
  {
    audienceIdx: 0,
    appIdx: 0,
    audience_type: "all",
    department_id: null,
    employee_id: null,
    include_children: false,
  },
  {
    audienceIdx: 1,
    appIdx: 1,
    audience_type: "department",
    department_id: DEPT.rnd,
    employee_id: null,
    include_children: true,
  },
  {
    audienceIdx: 2,
    appIdx: 2,
    audience_type: "employee",
    department_id: null,
    employee_id: EMP.employee,
    include_children: false,
  },
]);

// ── label plan (for degraded / replacement apps) ──────────────────────────────

interface LabelPlan {
  appIdx: number; // index into IDS.application.published
  labels: readonly string[];
}

const LABEL_PLAN: readonly LabelPlan[] = Object.freeze([
  { appIdx: 7, labels: ["部分功能受限", "推荐升级"] },
  { appIdx: 8, labels: ["安全风险", "评估中"] },
  { appIdx: 9, labels: ["已弃用", "请迁移至新版本"] },
]);

// ── delivery-action plan (spanning all 3 action types) ────────────────────────

type ActionType = "web_redirect" | "package_download" | "qr_display";
type ActionChannel = "web" | "desktop" | "mobile" | "mini_program";

interface DeliveryActionPlan {
  actionIdx: number; // index into IDS.deliveryAction
  appIdx: number; // index into IDS.application.published
  action_type: ActionType;
  channel: ActionChannel | null;
  actorEmployeeId: string;
}

const DELIVERY_ACTION_PLAN: readonly DeliveryActionPlan[] = Object.freeze([
  {
    actionIdx: 0,
    appIdx: 0,
    action_type: "web_redirect",
    channel: "web",
    actorEmployeeId: EMP.appAdmin,
  },
  {
    actionIdx: 1,
    appIdx: 0,
    action_type: "package_download",
    channel: "desktop",
    actorEmployeeId: EMP.employee,
  },
  {
    actionIdx: 2,
    appIdx: 1,
    action_type: "qr_display",
    channel: "mobile",
    actorEmployeeId: EMP.appAdmin,
  },
  {
    actionIdx: 3,
    appIdx: 2,
    action_type: "web_redirect",
    channel: "web",
    actorEmployeeId: EMP.employee,
  },
  {
    actionIdx: 4,
    appIdx: 3,
    action_type: "web_redirect",
    channel: "web",
    actorEmployeeId: EMP.innovation,
  },
  {
    actionIdx: 5,
    appIdx: 4,
    action_type: "package_download",
    channel: "desktop",
    actorEmployeeId: EMP.orgAdmin,
  },
  {
    actionIdx: 6,
    appIdx: 5,
    action_type: "qr_display",
    channel: "mobile",
    actorEmployeeId: EMP.appAdmin,
  },
  {
    actionIdx: 7,
    appIdx: 6,
    action_type: "web_redirect",
    channel: "web",
    actorEmployeeId: EMP.appAdmin,
  },
  {
    actionIdx: 8,
    appIdx: 7,
    action_type: "package_download",
    channel: "desktop",
    actorEmployeeId: EMP.employee,
  },
  {
    actionIdx: 9,
    appIdx: 8,
    action_type: "qr_display",
    channel: "mini_program",
    actorEmployeeId: EMP.appAdmin,
  },
  {
    actionIdx: 10,
    appIdx: 9,
    action_type: "web_redirect",
    channel: "web",
    actorEmployeeId: EMP.appAdmin,
  },
  {
    actionIdx: 11,
    appIdx: 4,
    action_type: "qr_display",
    channel: "mobile",
    actorEmployeeId: EMP.innovation,
  },
  {
    actionIdx: 12,
    appIdx: 3,
    action_type: "package_download",
    channel: "desktop",
    actorEmployeeId: EMP.orgAdmin,
  },
]);

// ── fixture data type ──────────────────────────────────────────────────────────

export interface CatalogFixtureData {
  categories: Array<Insertable<DatabaseSchema["catalog_categories"]>>;
  tags: Array<Insertable<DatabaseSchema["catalog_tags"]>>;
  metadata: Array<Insertable<DatabaseSchema["application_catalog_metadata"]>>;
  audiences: Array<Insertable<DatabaseSchema["application_audiences"]>>;
  tagLinks: Array<Insertable<DatabaseSchema["application_tag_links"]>>;
  labels: Array<Insertable<DatabaseSchema["application_catalog_labels"]>>;
  deliveryActions: Array<
    Insertable<DatabaseSchema["catalog_delivery_actions"]>
  >;
}

// ── implementation ────────────────────────────────────────────────────────────

/**
 * Build the catalog fixture.
 *
 * Produces:
 * - 15 categories (productivity, ai, reporting, collaboration, automation + 10 new zh-seed categories)
 * - 18 tags (ai, attendance, productivity, reporting, collaboration, automation, security, mobile + 10 new zh-seed tags)
 * - 10 catalog metadata entries for published apps (7 healthy, 2 degraded, 1 with replacement)
 * - 3 audience types (all, department, employee)
 * - 23 tag links (2-3 per published app)
 * - 6 labels for degraded/replacement apps
 * - 13 delivery actions spanning all 3 action types
 */
export function buildCatalogFixture(anchor: Date): CatalogFixtureData {
  // ── categories (15) ───────────────────────────────────────────────────────

  const categories: Array<Insertable<DatabaseSchema["catalog_categories"]>> =
    CATEGORY_DEFS.map((c) => ({
      category_id: c.category_id,
      name: c.name,
      sort_order: c.sort_order,
      enabled: c.enabled,
      // 与迁移 0050 一致：新增 10 条中前 5 条（sort_order 6..10）为热门。
      is_hot: c.sort_order >= 6 && c.sort_order <= 10,
    }));

  // ── tags (18) ─────────────────────────────────────────────────────────────

  const tags: Array<Insertable<DatabaseSchema["catalog_tags"]>> = TAG_DEFS.map(
    (t) => ({
      tag_id: t.tag_id,
      name: t.name,
      enabled: t.enabled,
    }),
  );

  // ── catalog metadata (10) ─────────────────────────────────────────────────

  const metadata: Array<
    Insertable<DatabaseSchema["application_catalog_metadata"]>
  > = METADATA_PLAN.map((m) => ({
    application_id: IDS.application.published[m.appIdx]!,
    category_id: m.category_id,
    application_type: m.application_type,
    search_name: m.search_name,
    search_summary: m.search_summary,
    search_pinyin: m.search_pinyin,
    search_initials: m.search_initials,
    recommendation_rank: m.recommendation_rank,
    health_status: m.health_status,
    deprecated_reason: m.deprecated_reason,
    replacement_application_id: m.replacement_application_id,
  }));

  // ── audiences (3) ─────────────────────────────────────────────────────────

  const audiences: Array<Insertable<DatabaseSchema["application_audiences"]>> =
    AUDIENCE_PLAN.map((a) => ({
      audience_id: IDS.audience[a.audienceIdx]!,
      application_id: IDS.application.published[a.appIdx]!,
      audience_type: a.audience_type,
      department_id: a.department_id,
      employee_id: a.employee_id,
      include_children: a.include_children,
    }));

  // ── tag links (22) ────────────────────────────────────────────────────────

  const tagLinks: Array<Insertable<DatabaseSchema["application_tag_links"]>> =
    TAG_LINK_PLAN.flatMap((plan) =>
      plan.tag_ids.map((tagId) => ({
        application_id: IDS.application.published[plan.appIdx]!,
        tag_id: tagId,
      })),
    );

  // ── labels (6) ────────────────────────────────────────────────────────────

  const labels: Array<
    Insertable<DatabaseSchema["application_catalog_labels"]>
  > = LABEL_PLAN.flatMap((plan) =>
    plan.labels.map((label) => ({
      application_id: IDS.application.published[plan.appIdx]!,
      label,
    })),
  );

  // ── delivery actions (13) ─────────────────────────────────────────────────

  const deliveryActions: Array<
    Insertable<DatabaseSchema["catalog_delivery_actions"]>
  > = DELIVERY_ACTION_PLAN.map((plan, i) => ({
    action_id: IDS.deliveryAction[plan.actionIdx]!,
    application_id: IDS.application.published[plan.appIdx]!,
    application_version_id:
      IDS.version[
        IDS.application.all.indexOf(IDS.application.published[plan.appIdx]!)
      ]!,
    actor_employee_id: plan.actorEmployeeId,
    action_type: plan.action_type,
    channel: plan.channel,
    occurred_at: daysAgo(anchor, 30 - i),
  }));

  // ── assemble ──────────────────────────────────────────────────────────────

  return {
    categories,
    tags,
    metadata,
    audiences,
    tagLinks,
    labels,
    deliveryActions,
  };
}
