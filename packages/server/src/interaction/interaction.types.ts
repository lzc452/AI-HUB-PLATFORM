import type { ActorContext, AuthorizationDecision } from "@ai-hub/contracts";

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
  hiddenAt: Date | null;
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

export interface InteractionRepository {
  withTransaction<T>(
    operation: (repository: InteractionRepository) => Promise<T>,
  ): Promise<T>;
  findApplication(applicationId: string): Promise<ApplicationTeamRecord | null>;
  findCurrentVersionId(applicationId: string): Promise<string>;
  hasLike(applicationId: string, employeeId: string): Promise<boolean>;
  addLike(applicationId: string, employeeId: string): Promise<void>;
  removeLike(applicationId: string, employeeId: string): Promise<void>;
  upsertRating(
    input: Omit<RatingRecord, "ratingId" | "createdAt" | "updatedAt">,
  ): Promise<RatingRecord>;
  findComment(commentId: string): Promise<CommentRecord | null>;
  createComment(
    input: Omit<CommentRecord, "commentId" | "createdAt" | "updatedAt">,
  ): Promise<CommentRecord>;
  createReport(
    input: Omit<ReportRecord, "reportId" | "createdAt">,
  ): Promise<ReportRecord>;
  resolveReport(
    reportId: string,
    status: ReportRecord["status"],
    employeeId: string,
  ): Promise<ReportRecord>;
  recordAudit(input: {
    applicationId: string;
    actorEmployeeId: string;
    eventType: string;
    details?: unknown;
  }): Promise<void>;
  emitOutbox?(input: {
    applicationId: string;
    eventType: string;
  }): Promise<void>;
}
