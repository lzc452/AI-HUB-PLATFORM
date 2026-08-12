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

type DemandStatus = Insertable<DatabaseSchema["ai_demands"]>["status"];

// ── demand definitions (18 demands in status-group order) ────────────────────

interface DemandDef {
  title: string;
  problemStatement: string;
  desiredOutcome: string;
  requesterEmployeeId: string;
  status: DemandStatus;
  audienceType: "all" | "department" | "employee";
  audienceDepartmentId: string | null;
  audienceEmployeeId: string | null;
  displayAnonymously: boolean;
  /** Scenario key describing the pre-condition this demand provides. */
  scenario: string;
}

const DEMAND_DEFS: readonly DemandDef[] = Object.freeze([
  // ── 3 drafts (indices 0..2) ──────────────────────────────────────────────────
  {
    title: "智能文档自动分类工具",
    problemStatement:
      "部门每天产生大量非结构化文档，人工分类耗时且容易出错，影响信息检索效率。",
    desiredOutcome:
      "提供基于AI的文档自动分类能力，支持自定义分类规则，日均处理能力≥1000份文档。",
    requesterEmployeeId: EMP.employee,
    status: "draft",
    audienceType: "all",
    audienceDepartmentId: null,
    audienceEmployeeId: null,
    displayAnonymously: false,
    scenario: "demand.draft.edit",
  },
  {
    title: "跨部门知识图谱构建平台",
    problemStatement:
      "各部门知识分散在多个系统中，缺乏统一的知识关联和检索机制。",
    desiredOutcome: "构建企业级知识图谱，实现跨部门知识的自动关联和智能检索。",
    requesterEmployeeId: EMP.employee,
    status: "draft",
    audienceType: "department",
    audienceDepartmentId: DEPT.rnd,
    audienceEmployeeId: null,
    displayAnonymously: false,
    scenario: "demand.draft.department",
  },
  {
    title: "保密项目专用代码审查工具",
    problemStatement: "敏感项目需要内部代码审查，但现有工具无法满足保密要求。",
    desiredOutcome:
      "开发一套本地化部署的代码审查工具，支持离线运行和端到端加密。",
    requesterEmployeeId: EMP.superAdmin,
    status: "draft",
    audienceType: "employee",
    audienceDepartmentId: null,
    audienceEmployeeId: EMP.appAdmin,
    displayAnonymously: true,
    scenario: "demand.draft.anonymous",
  },

  // ── 2 pending_review (indices 3..4) ─────────────────────────────────────────
  {
    title: "AI驱动的员工培训推荐系统",
    problemStatement:
      "员工技能提升路径不清晰，培训资源利用率低，缺少个性化推荐机制。",
    desiredOutcome:
      "基于员工岗位、技能图谱和历史培训数据，自动推荐个性化学习路径和课程。",
    requesterEmployeeId: EMP.appAdmin,
    status: "pending_review",
    audienceType: "all",
    audienceDepartmentId: null,
    audienceEmployeeId: null,
    displayAnonymously: false,
    scenario: "demand.review.approve",
  },
  {
    title: "财务报表智能生成工具",
    problemStatement: "每月财务报表编制耗时3个工作日，数据来源分散且容易遗漏。",
    desiredOutcome:
      "实现财务报表的自动化采集、汇总和生成，将编制时间缩短至半天以内。",
    requesterEmployeeId: EMP.employee,
    status: "pending_review",
    audienceType: "department",
    audienceDepartmentId: DEPT.innovation,
    audienceEmployeeId: null,
    displayAnonymously: true,
    scenario: "demand.review.reject",
  },

  // ── 2 rejected (indices 5..6) ───────────────────────────────────────────────
  {
    title: "旧版数据ETL管道重写",
    problemStatement: "现有ETL脚本使用Python 2.7，急需升级到Python 3版本。",
    desiredOutcome: "完成ETL脚本的Python 3迁移和性能优化。",
    requesterEmployeeId: EMP.employee,
    status: "rejected",
    audienceType: "all",
    audienceDepartmentId: null,
    audienceEmployeeId: null,
    displayAnonymously: false,
    scenario: "demand.review.rejected",
  },
  {
    title: "内部论坛AI版主机器人",
    problemStatement: "内部论坛水帖和广告内容日益增多，需要自动化内容审核。",
    desiredOutcome:
      "开发AI版主机器人，自动识别和过滤违规内容，支持24小时不间断运行。",
    requesterEmployeeId: EMP.appAdmin,
    status: "rejected",
    audienceType: "department",
    audienceDepartmentId: DEPT.rnd,
    audienceEmployeeId: null,
    displayAnonymously: false,
    scenario: "demand.review.rejected",
  },

  // ── 2 published (indices 7..8) ──────────────────────────────────────────────
  {
    title: "智能排班与资源调度系统",
    problemStatement:
      "跨部门项目排班纯靠人工协调，经常出现资源冲突和沟通成本过高的问题。",
    desiredOutcome:
      "开发智能排班系统，支持自动冲突检测、资源优化分配和可视化甘特图。",
    requesterEmployeeId: EMP.appAdmin,
    status: "published",
    audienceType: "all",
    audienceDepartmentId: null,
    audienceEmployeeId: null,
    displayAnonymously: false,
    scenario: "demand.claim.available",
  },
  {
    title: "自动化合规审计工具",
    problemStatement: "企业合规检查依赖人工抽样，覆盖面不足且效率低下。",
    desiredOutcome:
      "提供自动化的合规审计工具，覆盖全部业务流程，支持自定义审计规则。",
    requesterEmployeeId: EMP.employee,
    status: "published",
    audienceType: "department",
    audienceDepartmentId: DEPT.admin,
    audienceEmployeeId: null,
    displayAnonymously: false,
    scenario: "demand.claim.available",
  },

  // ── 3 in_progress (indices 9..11) ───────────────────────────────────────────
  {
    title: "AI辅助项目风险评估平台",
    problemStatement:
      "项目风险识别依赖资深项目经理经验，新人难以准确评估，导致多起项目延期。",
    desiredOutcome:
      "基于历史项目数据和机器学习模型，自动识别风险因子并给出评估建议。",
    requesterEmployeeId: EMP.appAdmin,
    status: "in_progress",
    audienceType: "all",
    audienceDepartmentId: null,
    audienceEmployeeId: null,
    displayAnonymously: false,
    scenario: "demand.status.transition",
  },
  {
    title: "多语言文档翻译与校对系统",
    problemStatement:
      "国际化业务需要大量文档翻译，外包翻译质量不稳定且周期长。",
    desiredOutcome:
      "企业级多语言翻译平台，支持AI初译+人工校对模式，术语库统一管理。",
    requesterEmployeeId: EMP.employee,
    status: "in_progress",
    audienceType: "department",
    audienceDepartmentId: DEPT.rnd,
    audienceEmployeeId: null,
    displayAnonymously: false,
    scenario: "demand.collaborator.manage",
  },
  {
    title: "研发效能度量仪表盘",
    problemStatement:
      "研发团队缺少统一的效能度量工具，不同团队使用不同指标，缺乏可比性。",
    desiredOutcome:
      "统一的研发效能度量平台，支持自定义指标体系、趋势分析和团队对比。",
    requesterEmployeeId: EMP.appAdmin,
    status: "in_progress",
    audienceType: "employee",
    audienceDepartmentId: null,
    audienceEmployeeId: EMP.innovation,
    displayAnonymously: false,
    scenario: "demand.progress.update",
  },

  // ── 1 pilot (index 12) ──────────────────────────────────────────────────────
  {
    title: "企业级API全生命周期管理平台",
    problemStatement:
      "API管理分散在多个工具中，缺乏统一的API设计、测试和监控能力。",
    desiredOutcome:
      "提供API全生命周期管理，覆盖设计、mock、测试、发布、监控和退役全流程。",
    requesterEmployeeId: EMP.appAdmin,
    status: "pilot",
    audienceType: "all",
    audienceDepartmentId: null,
    audienceEmployeeId: null,
    displayAnonymously: false,
    scenario: "demand.pilot.manage",
  },

  // ── 2 completed (indices 13..14) ────────────────────────────────────────────
  {
    title: "智能客服工单自动分配系统",
    problemStatement:
      "客服工单手动分配效率低，高峰期积压严重，客户满意度下降。",
    desiredOutcome:
      "基于AI的工单智能分配，综合考虑客服技能、负载和优先级，提升首次解决率。",
    requesterEmployeeId: EMP.appAdmin,
    status: "completed",
    audienceType: "all",
    audienceDepartmentId: null,
    audienceEmployeeId: null,
    displayAnonymously: false,
    scenario: "demand.completed.reference",
  },
  {
    title: "统一数据血缘追踪工具",
    problemStatement:
      "数据仓库表间依赖关系不透明，数据问题排查耗时长，影响业务决策时效。",
    desiredOutcome:
      "构建数据血缘追踪系统，可视化展示数据流向，支持影响分析和根因定位。",
    requesterEmployeeId: EMP.employee,
    status: "completed",
    audienceType: "department",
    audienceDepartmentId: DEPT.rnd,
    audienceEmployeeId: null,
    displayAnonymously: false,
    scenario: "demand.reopen.candidate",
  },

  // ── 1 closed (index 15) ─────────────────────────────────────────────────────
  {
    title: "遗留系统批量接口自动化测试",
    problemStatement:
      "遗留系统的批量接口测试依赖人工执行，每次版本发布前需要2天回归测试。",
    desiredOutcome:
      "实现批量接口自动化测试框架，支持回归测试一键执行和结果自动分析。",
    requesterEmployeeId: EMP.appAdmin,
    status: "closed",
    audienceType: "department",
    audienceDepartmentId: DEPT.rnd,
    audienceEmployeeId: null,
    displayAnonymously: false,
    scenario: "demand.closed.archived",
  },

  // ── 2 merged (indices 16..17) ───────────────────────────────────────────────
  {
    title: "统一通知中心（已合并至消息推送中心）",
    problemStatement:
      "系统通知分散在邮件、短信、站内信等多个渠道，缺少统一管理入口。",
    desiredOutcome: "配合消息推送中心实现多渠道通知的统一管理和策略配置。",
    requesterEmployeeId: EMP.appAdmin,
    status: "merged",
    audienceType: "all",
    audienceDepartmentId: null,
    audienceEmployeeId: null,
    displayAnonymously: false,
    scenario: "demand.merge.source",
  },
  {
    title: "企业消息推送中心（合并了统一通知中心）",
    problemStatement:
      "各业务系统独立对接通知渠道，重复开发且策略不一致，需要统一消息推送服务。",
    desiredOutcome:
      "建设企业级消息推送中心，统一管理邮件、短信、钉钉等渠道的消息分发与追踪。",
    requesterEmployeeId: EMP.employee,
    status: "merged",
    audienceType: "all",
    audienceDepartmentId: null,
    audienceEmployeeId: null,
    displayAnonymously: false,
    scenario: "demand.merge.target",
  },
]);

// ── priority definitions ─────────────────────────────────────────────────────

interface PriorityDef {
  businessValue: number;
  implementationCost: number;
  riskLevel: number;
  adminPriority: number;
}

/**
 * Priority score formula (from DemandService.setPriority):
 *   score = businessValue*0.4 + adminPriority*0.3
 *         + (6-implementationCost)*0.15 + (6-riskLevel)*0.15
 */
function computePriority(def: PriorityDef): {
  businessValue: number;
  implementationCost: number;
  riskLevel: number;
  adminPriority: number;
  priorityScore: number;
  priorityExplanation: string;
} {
  const score = Number(
    (
      def.businessValue * 0.4 +
      def.adminPriority * 0.3 +
      (6 - def.implementationCost) * 0.15 +
      (6 - def.riskLevel) * 0.15
    ).toFixed(1),
  );
  const explanation =
    `0.40*businessValue=${def.businessValue} + ` +
    `0.30*adminPriority=${def.adminPriority} + ` +
    `0.15*(6-implementationCost=${def.implementationCost}) + ` +
    `0.15*(6-riskLevel=${def.riskLevel}) = ${score}`;
  return {
    businessValue: def.businessValue,
    implementationCost: def.implementationCost,
    riskLevel: def.riskLevel,
    adminPriority: def.adminPriority,
    priorityScore: score,
    priorityExplanation: explanation,
  };
}

// Priority for published, in_progress, pilot, completed, closed, merged demands
const PRIORITIES: ReadonlyMap<
  number,
  ReturnType<typeof computePriority>
> = new Map([
  // Published 1 (index 7): medium priority
  [
    7,
    computePriority({
      businessValue: 4,
      implementationCost: 2,
      riskLevel: 2,
      adminPriority: 3,
    }),
  ],
  // Published 2 (index 8): lower priority
  [
    8,
    computePriority({
      businessValue: 3,
      implementationCost: 3,
      riskLevel: 3,
      adminPriority: 2,
    }),
  ],
  // In Progress 1 (index 9): high business value
  [
    9,
    computePriority({
      businessValue: 5,
      implementationCost: 2,
      riskLevel: 1,
      adminPriority: 5,
    }),
  ],
  // In Progress 2 (index 10): medium priority
  [
    10,
    computePriority({
      businessValue: 4,
      implementationCost: 4,
      riskLevel: 2,
      adminPriority: 3,
    }),
  ],
  // In Progress 3 (index 11): lower priority
  [
    11,
    computePriority({
      businessValue: 3,
      implementationCost: 2,
      riskLevel: 3,
      adminPriority: 4,
    }),
  ],
  // Pilot 1 (index 12): high priority
  [
    12,
    computePriority({
      businessValue: 5,
      implementationCost: 1,
      riskLevel: 2,
      adminPriority: 4,
    }),
  ],
  // Completed 1 (index 13): high priority
  [
    13,
    computePriority({
      businessValue: 5,
      implementationCost: 2,
      riskLevel: 1,
      adminPriority: 5,
    }),
  ],
  // Completed 2 (index 14): medium priority
  [
    14,
    computePriority({
      businessValue: 4,
      implementationCost: 3,
      riskLevel: 2,
      adminPriority: 3,
    }),
  ],
  // Closed 1 (index 15): medium priority
  [
    15,
    computePriority({
      businessValue: 3,
      implementationCost: 2,
      riskLevel: 4,
      adminPriority: 2,
    }),
  ],
  // Merged 1 - source (index 16): medium-high
  [
    16,
    computePriority({
      businessValue: 4,
      implementationCost: 2,
      riskLevel: 3,
      adminPriority: 3,
    }),
  ],
  // Merged 2 - target (index 17): high priority (accumulated from merge)
  [
    17,
    computePriority({
      businessValue: 5,
      implementationCost: 1,
      riskLevel: 2,
      adminPriority: 5,
    }),
  ],
]);

// ── owner / version plan ─────────────────────────────────────────────────────

interface DemandStatePlan {
  ownerEmployeeId: string | null;
  version: number;
  mergedIntoDemandId: string | null;
  primarySolutionApplicationId: string | null;
}

const STATE_PLANS: readonly DemandStatePlan[] = Object.freeze([
  // drafts: no owner, v1
  {
    ownerEmployeeId: null,
    version: 1,
    mergedIntoDemandId: null,
    primarySolutionApplicationId: null,
  },
  {
    ownerEmployeeId: null,
    version: 1,
    mergedIntoDemandId: null,
    primarySolutionApplicationId: null,
  },
  {
    ownerEmployeeId: null,
    version: 1,
    mergedIntoDemandId: null,
    primarySolutionApplicationId: null,
  },
  // pending_review: no owner, v1 (submitted from draft)
  {
    ownerEmployeeId: null,
    version: 1,
    mergedIntoDemandId: null,
    primarySolutionApplicationId: null,
  },
  {
    ownerEmployeeId: null,
    version: 2,
    mergedIntoDemandId: null,
    primarySolutionApplicationId: null,
  },
  // rejected: no owner, v1
  {
    ownerEmployeeId: null,
    version: 1,
    mergedIntoDemandId: null,
    primarySolutionApplicationId: null,
  },
  {
    ownerEmployeeId: null,
    version: 1,
    mergedIntoDemandId: null,
    primarySolutionApplicationId: null,
  },
  // published: no owner (available for claiming), v1/v2
  {
    ownerEmployeeId: null,
    version: 1,
    mergedIntoDemandId: null,
    primarySolutionApplicationId: null,
  },
  {
    ownerEmployeeId: null,
    version: 1,
    mergedIntoDemandId: null,
    primarySolutionApplicationId: null,
  },
  // in_progress: claimed by various employees
  {
    ownerEmployeeId: EMP.appAdmin,
    version: 2,
    mergedIntoDemandId: null,
    primarySolutionApplicationId: null,
  },
  {
    ownerEmployeeId: EMP.superAdmin,
    version: 1,
    mergedIntoDemandId: null,
    primarySolutionApplicationId: null,
  },
  {
    ownerEmployeeId: EMP.innovation,
    version: 1,
    mergedIntoDemandId: null,
    primarySolutionApplicationId: null,
  },
  // pilot: claimed, linked to an application solution
  {
    ownerEmployeeId: EMP.appAdmin,
    version: 3,
    mergedIntoDemandId: null,
    primarySolutionApplicationId: IDS.application.published[6]!,
  },
  // completed: claimed, linked to application solution
  {
    ownerEmployeeId: EMP.appAdmin,
    version: 4,
    mergedIntoDemandId: null,
    primarySolutionApplicationId: IDS.application.published[7]!,
  },
  {
    ownerEmployeeId: EMP.employee,
    version: 2,
    mergedIntoDemandId: null,
    primarySolutionApplicationId: null,
  },
  // closed: claimed
  {
    ownerEmployeeId: EMP.appAdmin,
    version: 2,
    mergedIntoDemandId: null,
    primarySolutionApplicationId: null,
  },
  // merged source → merged target
  {
    ownerEmployeeId: EMP.appAdmin,
    version: 3,
    mergedIntoDemandId: IDS.demand.merged[1]!,
    primarySolutionApplicationId: null,
  },
  {
    ownerEmployeeId: EMP.employee,
    version: 4,
    mergedIntoDemandId: null,
    primarySolutionApplicationId: null,
  },
]);

// ── collaborator plan (6 entries) ────────────────────────────────────────────

interface CollaboratorDef {
  demandIndex: number;
  employeeId: string;
  role: "owner" | "collaborator" | "operator";
}

const COLLABORATOR_DEFS: readonly CollaboratorDef[] = Object.freeze([
  // In Progress 1: owner entry + a collaborator
  { demandIndex: 9, employeeId: EMP.appAdmin, role: "owner" },
  { demandIndex: 9, employeeId: EMP.employee, role: "collaborator" },
  // In Progress 2: owner entry
  { demandIndex: 10, employeeId: EMP.superAdmin, role: "owner" },
  // Pilot 1: additional collaborator
  { demandIndex: 12, employeeId: EMP.innovation, role: "collaborator" },
  // Completed 1: operator
  { demandIndex: 13, employeeId: EMP.superAdmin, role: "operator" },
  // Merged 1 source: collaborator
  { demandIndex: 16, employeeId: EMP.orgAdmin, role: "collaborator" },
]);

// ── audit event plan (10 events) ─────────────────────────────────────────────

interface AuditDef {
  demandIndex: number;
  actorEmployeeId: string | null;
  eventType: string;
  details: Record<string, unknown>;
}

const AUDIT_DEFS: readonly AuditDef[] = Object.freeze([
  // Pending Review 1 (index 3): submitted + reviewed (approved)
  {
    demandIndex: 3,
    actorEmployeeId: EMP.appAdmin,
    eventType: "demand.submitted",
    details: { status: "pending_review" },
  },
  {
    demandIndex: 3,
    actorEmployeeId: EMP.innovation,
    eventType: "demand.reviewed",
    details: { decision: "publish" },
  },

  // Pending Review 2 (index 4): submitted + reviewed (rejected)
  {
    demandIndex: 4,
    actorEmployeeId: EMP.employee,
    eventType: "demand.submitted",
    details: { status: "pending_review" },
  },
  {
    demandIndex: 4,
    actorEmployeeId: EMP.innovation,
    eventType: "demand.reviewed",
    details: {
      decision: "reject",
      reason: "方案可行性不足，建议补充技术调研后重新提交",
    },
  },

  // Published 1 (index 7): created
  {
    demandIndex: 7,
    actorEmployeeId: EMP.appAdmin,
    eventType: "demand.created",
    details: { source: "demo-seed" },
  },

  // In Progress 1 (index 9): claimed + status changed
  {
    demandIndex: 9,
    actorEmployeeId: EMP.appAdmin,
    eventType: "demand.claimed",
    details: { ownerEmployeeId: EMP.appAdmin },
  },
  {
    demandIndex: 9,
    actorEmployeeId: EMP.appAdmin,
    eventType: "demand.status.changed",
    details: { from: "published", to: "in_progress" },
  },

  // Completed 1 (index 13): status progression
  {
    demandIndex: 13,
    actorEmployeeId: EMP.appAdmin,
    eventType: "demand.status.changed",
    details: { from: "pilot", to: "completed" },
  },

  // Merged 1 → Merged 2 (indices 16, 17): merge audit trail
  {
    demandIndex: 16,
    actorEmployeeId: EMP.appAdmin,
    eventType: "demand.merged",
    details: { targetDemandId: IDS.demand.merged[1]! },
  },
  {
    demandIndex: 17,
    actorEmployeeId: EMP.employee,
    eventType: "demand.merge.received",
    details: { sourceDemandId: IDS.demand.merged[0]! },
  },
]);

// ── fixture data type ────────────────────────────────────────────────────────

export interface DemandFixtureData {
  demands: Array<Insertable<DatabaseSchema["ai_demands"]>>;
  demandCollaborators: Array<
    Insertable<DatabaseSchema["ai_demand_collaborators"]>
  >;
  demandAuditEvents: Array<
    Insertable<DatabaseSchema["ai_demand_audit_events"]>
  >;
}

// ── implementation ──────────────────────────────────────────────────────────

export function buildDemandFixture(anchor: Date): DemandFixtureData {
  // ── demands (18) ────────────────────────────────────────────────────────────

  const demands: Array<Insertable<DatabaseSchema["ai_demands"]>> = Array.from(
    { length: 18 },
    (_, i) => {
      const def = DEMAND_DEFS[i]!;
      const state = STATE_PLANS[i]!;
      const priority = PRIORITIES.get(i);

      // Each demo demand has a single-line title for easy scanning.
      // Build full problem_statement and desired_outcome from def.
      const reviewReason: string | null = (() => {
        if (def.status === "rejected" && i === 5) {
          return "方案与其他需求重复，建议合并处理";
        }
        if (def.status === "rejected" && i === 6) {
          return "需求范围过大，建议拆分为多个子需求重新提交";
        }
        if (def.status === "closed") {
          return "需求已实现并入正式版本";
        }
        return null;
      })();

      const publishedAt: Date | null =
        def.status !== "draft" &&
        def.status !== "pending_review" &&
        def.status !== "rejected"
          ? daysAgo(anchor, 30 - i * 2)
          : null;

      const closedAt: Date | null =
        def.status === "closed" ? daysAgo(anchor, 5) : null;

      return {
        demand_id: IDS.demand.all[i]!,
        requester_employee_id: def.requesterEmployeeId,
        title: def.title,
        problem_statement: def.problemStatement,
        desired_outcome: def.desiredOutcome,
        status: def.status,
        audience_type: def.audienceType,
        audience_department_id: def.audienceDepartmentId,
        audience_employee_id: def.audienceEmployeeId,
        include_children: false,
        display_anonymously: def.displayAnonymously,
        review_reason: reviewReason,
        business_value: priority?.businessValue ?? null,
        implementation_cost: priority?.implementationCost ?? null,
        risk_level: priority?.riskLevel ?? null,
        admin_priority: priority?.adminPriority ?? null,
        priority_score: priority?.priorityScore ?? null,
        priority_explanation: priority?.priorityExplanation ?? null,
        owner_employee_id: state.ownerEmployeeId,
        version: state.version,
        merged_into_demand_id: state.mergedIntoDemandId,
        primary_solution_application_id: state.primarySolutionApplicationId,
        published_at: publishedAt,
        closed_at: closedAt,
        created_at: daysAgo(anchor, 60 - i * 2),
        updated_at: daysAgo(anchor, 30 - i * 2),
      };
    },
  );

  // ── collaborators (6) ───────────────────────────────────────────────────────

  const demandCollaborators: Array<
    Insertable<DatabaseSchema["ai_demand_collaborators"]>
  > = COLLABORATOR_DEFS.map((def, i) => ({
    demand_id: IDS.demand.all[def.demandIndex]!,
    employee_id: def.employeeId,
    role: def.role,
    created_at: daysAgo(anchor, 25 - i * 3),
  }));

  // ── audit events (10) ───────────────────────────────────────────────────────

  const demandAuditEvents: Array<
    Insertable<DatabaseSchema["ai_demand_audit_events"]>
  > = AUDIT_DEFS.map((def, i) => ({
    audit_event_id: IDS.demandAuditEvent[i]!,
    demand_id: IDS.demand.all[def.demandIndex]!,
    actor_employee_id: def.actorEmployeeId,
    event_type: def.eventType,
    details: def.details,
    created_at: daysAgo(anchor, 40 - i * 3),
  }));

  // ── assemble ───────────────────────────────────────────────────────────────

  return {
    demands,
    demandCollaborators,
    demandAuditEvents,
  };
}
