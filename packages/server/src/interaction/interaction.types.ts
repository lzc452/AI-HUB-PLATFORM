import type { ActorContext, AuthorizationDecision } from "@ai-hub/contracts";

/** 员工账号状态（与 employees.status 一致）。 */
export type EmployeeStatus =
  | "pending_binding"
  | "active"
  | "disabled"
  | "archived";

export interface ApplicationTeamRecord {
  applicationId: string;
  ownerEmployeeId: string;
  maintainerEmployeeId: string;
}

export interface RatingRecord {
  ratingId: string;
  applicationId: string;
  applicationVersionId: string;
  employeeId: string;
  stars: number;
  body: string | null;
  displayAnonymously: boolean;
  /** 评分员工状态（disabled/archived 视为已停用）；员工行缺失时为 null。 */
  authorStatus: EmployeeStatus | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CommentRecord {
  commentId: string;
  applicationId: string;
  applicationVersionId: string;
  parentCommentId: string | null;
  authorEmployeeId: string;
  body: string;
  displayAnonymously: boolean;
  commentKind: "user" | "official";
  hiddenAt: Date | null;
  /** 评论作者状态（disabled/archived 视为已停用）；员工行缺失时为 null。 */
  authorStatus: EmployeeStatus | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReportRecord {
  reportId: string;
  applicationId: string;
  commentId: string;
  reporterEmployeeId: string;
  reason: string;
  status: "open" | "dismissed" | "hidden" | "restored";
  resolvedByEmployeeId: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
}

export interface InteractionAuthorizationPort {
  authorize(request: {
    actor: ActorContext;
    action: string;
    resourceType: string;
  }): Promise<AuthorizationDecision>;
}

/** 举报处理后的站内通知端口（由通知矩阵服务实现，可选装配）。 */
export interface InteractionNotificationPort {
  queue(
    actor: ActorContext,
    scenario: string,
    input: {
      recipientEmployeeId: string;
      aggregateId: string;
      variables?: Readonly<Record<string, string | number>>;
    },
  ): Promise<unknown>;
}

export interface InteractionRepository {
  withTransaction<T>(
    operation: (repository: InteractionRepository) => Promise<T>,
  ): Promise<T>;
  findApplication(applicationId: string): Promise<ApplicationTeamRecord | null>;
  findCurrentVersionId(applicationId: string): Promise<string>;
  hasLike(applicationId: string, employeeId: string): Promise<boolean>;
  addLike(applicationId: string, employeeId: string): Promise<string>;
  removeLike(applicationId: string, employeeId: string): Promise<void>;
  upsertRating(
    input: Omit<
      RatingRecord,
      "ratingId" | "createdAt" | "updatedAt" | "authorStatus"
    >,
  ): Promise<RatingRecord>;
  findComment(commentId: string): Promise<CommentRecord | null>;
  createComment(
    input: Omit<
      CommentRecord,
      "commentId" | "createdAt" | "updatedAt" | "authorStatus"
    >,
  ): Promise<CommentRecord>;
  createReport(
    input: Omit<ReportRecord, "reportId" | "createdAt">,
  ): Promise<ReportRecord>;
  findReport(reportId: string): Promise<ReportRecord | null>;
  resolveReport(
    reportId: string,
    status: ReportRecord["status"],
    employeeId: string,
  ): Promise<ReportRecord>;
  listRatings(input: {
    applicationId: string;
    page: number;
    pageSize: number;
  }): Promise<{ items: readonly RatingRecord[]; total: number }>;
  listComments(input: {
    applicationId: string;
    page: number;
    pageSize: number;
  }): Promise<{ items: readonly CommentRecord[]; total: number }>;
  hideComment(commentId: string): Promise<CommentRecord>;
  restoreComment(commentId: string): Promise<CommentRecord>;
  recordAudit(input: {
    applicationId: string;
    actorEmployeeId: string;
    eventType: string;
    details?: unknown;
  }): Promise<void>;
  emitOutbox?(input: {
    applicationId: string;
    eventType: string;
    /** 稳定业务幂等键；传入后同一业务事件重试将去重（低危-6/7）。缺失时回退随机键。 */
    idempotencyKey?: string;
  }): Promise<void>;
}
