/**
 * Portal app 历史写入的只读归类与确定性修复计划。
 *
 * 该模块不访问数据库；CLI 负责收集事实、执行事务并保存审计快照。将判断逻辑
 * 独立为纯函数，使 dry-run、apply 与 rollback 使用同一套不变量。
 */

export type ReconciledApplicationStatus =
  | "draft"
  | "in_review"
  | "approved"
  | "published"
  | "withdrawn"
  | "archived";

export interface PortalAppVersionFact {
  applicationVersionId: string;
  createdAt: Date;
}

export interface PortalAppReviewFact {
  applicationVersionId: string;
  decision: "approve" | "reject" | "request_changes";
}

export interface PortalAppReviewQueueFact {
  applicationVersionId: string;
  status: "available" | "claimed" | "completed";
}

export interface PortalAppHistoryFact {
  hasCanonicalPublishedEvent: boolean;
  hasPortalPublishedEvent: boolean;
  portalEventTypes: readonly string[];
}

export interface PortalAppReconciliationFact {
  applicationId: string;
  status: ReconciledApplicationStatus;
  currentVersionId: string | null;
  pendingVersionId: string | null;
  versions: readonly PortalAppVersionFact[];
  reviews: readonly PortalAppReviewFact[];
  queues: readonly PortalAppReviewQueueFact[];
  history: PortalAppHistoryFact;
}

export interface PortalAppStateSnapshot {
  status: ReconciledApplicationStatus;
  currentVersionId: string | null;
  pendingVersionId: string | null;
}

export interface PortalAppReconciliationPlan {
  applicationId: string;
  reasons: readonly string[];
  manualReasons: readonly string[];
  before: PortalAppStateSnapshot;
  after: PortalAppStateSnapshot;
}

/**
 * 只为有 Portal app 历史事件的应用生成计划。无法确定业务事实时将
 * manualReasons 返回给调用方，apply 不应修改该记录。
 */
export function planPortalAppReconciliation(
  fact: PortalAppReconciliationFact,
): PortalAppReconciliationPlan | null {
  if (fact.history.portalEventTypes.length === 0) return null;

  const before: PortalAppStateSnapshot = {
    status: fact.status,
    currentVersionId: fact.currentVersionId,
    pendingVersionId: fact.pendingVersionId,
  };
  const reasons: string[] = [];
  const manualReasons: string[] = [];
  const versionIds = new Set(
    fact.versions.map((version) => version.applicationVersionId),
  );
  const approvedVersionIds = new Set(
    fact.reviews
      .filter(
        (review) =>
          review.decision === "approve" &&
          versionIds.has(review.applicationVersionId),
      )
      .map((review) => review.applicationVersionId),
  );
  const latestApprovedVersionId = [...fact.versions]
    .filter((version) => approvedVersionIds.has(version.applicationVersionId))
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .at(0)?.applicationVersionId;
  const activeQueueVersionIds = new Set(
    fact.queues
      .filter(
        (queue) => queue.status === "available" || queue.status === "claimed",
      )
      .map((queue) => queue.applicationVersionId),
  );

  const danglingApprovals = fact.reviews.some(
    (review) =>
      review.decision === "approve" &&
      !versionIds.has(review.applicationVersionId),
  );
  if (danglingApprovals) {
    manualReasons.push("APPROVAL_REVIEW_VERSION_MISSING");
  }

  const currentVersionIsValid =
    fact.currentVersionId === null ||
    approvedVersionIds.has(fact.currentVersionId);
  const pendingVersionIsValid =
    fact.pendingVersionId === null ||
    activeQueueVersionIds.has(fact.pendingVersionId);
  const hasActiveQueue = activeQueueVersionIds.size > 0;
  const activeQueueInCompatibleState =
    !hasActiveQueue ||
    fact.status === "in_review" ||
    fact.status === "published";

  if (!activeQueueInCompatibleState) {
    manualReasons.push("ACTIVE_REVIEW_QUEUE_STATE_AMBIGUOUS");
  }

  let after: PortalAppStateSnapshot = { ...before };
  if (!currentVersionIsValid) {
    reasons.push("CURRENT_VERSION_WITHOUT_APPROVAL_EVIDENCE");
    after = {
      ...after,
      currentVersionId: latestApprovedVersionId ?? null,
    };
  }
  if (!pendingVersionIsValid) {
    reasons.push("PENDING_VERSION_WITHOUT_ACTIVE_REVIEW_QUEUE");
    after = { ...after, pendingVersionId: null };
  }
  if (fact.status === "in_review" && !hasActiveQueue) {
    reasons.push("IN_REVIEW_WITHOUT_ACTIVE_REVIEW_QUEUE");
  }
  if (fact.status === "published" && after.currentVersionId === null) {
    reasons.push("PUBLISHED_WITHOUT_APPROVED_CURRENT_VERSION");
  }
  // approved 是兼容旧发布端点的中间状态，但它仍必须指向一个已审核通过的
  // 版本；否则既不能安全发布，也不能凭空补出审核事实。
  if (fact.status === "approved" && after.currentVersionId === null) {
    reasons.push("APPROVED_WITHOUT_APPROVED_CURRENT_VERSION");
  }

  const hasPublishedHistory =
    fact.history.hasCanonicalPublishedEvent ||
    fact.history.hasPortalPublishedEvent;
  if (
    fact.status === "withdrawn" &&
    reasons.length > 0 &&
    !hasPublishedHistory
  ) {
    reasons.push("WITHDRAWN_WITHOUT_PUBLISHED_HISTORY");
  }
  const requiresSafeStateRecovery =
    reasons.includes("IN_REVIEW_WITHOUT_ACTIVE_REVIEW_QUEUE") ||
    reasons.includes("PUBLISHED_WITHOUT_APPROVED_CURRENT_VERSION") ||
    reasons.includes("APPROVED_WITHOUT_APPROVED_CURRENT_VERSION");
  // withdrawn 只能表示曾经发生过合法发布；没有任何发布事实的异常遗留记录
  // 回到 draft，交由负责人重新提交，不能保留看似已下架的状态。
  const withdrawnWithoutPublishedHistory = reasons.includes(
    "WITHDRAWN_WITHOUT_PUBLISHED_HISTORY",
  );
  if (requiresSafeStateRecovery || withdrawnWithoutPublishedHistory) {
    after = {
      ...after,
      status: hasPublishedHistory ? "withdrawn" : "draft",
    };
  }

  if (reasons.length === 0 && manualReasons.length === 0) return null;
  return {
    applicationId: fact.applicationId,
    reasons,
    manualReasons,
    before,
    after,
  };
}

export function isPortalAppPlanRepairable(
  plan: PortalAppReconciliationPlan,
): boolean {
  return plan.reasons.length > 0 && plan.manualReasons.length === 0;
}

export function samePortalAppState(
  left: PortalAppStateSnapshot,
  right: PortalAppStateSnapshot,
): boolean {
  return (
    left.status === right.status &&
    left.currentVersionId === right.currentVersionId &&
    left.pendingVersionId === right.pendingVersionId
  );
}
