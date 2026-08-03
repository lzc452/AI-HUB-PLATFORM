import type {
  ActorContext,
  AuthorizationDecision,
  CreateDemandInput,
  DemandCollaboratorRole,
  DemandStatus,
} from "@ai-hub/contracts";

export interface DemandEntry {
  demandId: string;
  requesterEmployeeId: string | null;
  title: string;
  problemStatement: string;
  desiredOutcome: string;
  status: DemandStatus;
  audienceType: CreateDemandInput["audienceType"];
  audienceDepartmentId: string | null;
  audienceEmployeeId?: string | null;
  includeChildren?: boolean;
  displayAnonymously: boolean;
  reviewReason: string | null;
  likeCount: number;
  commentCount: number;
  priorityScore: number | null;
  priorityExplanation: string | null;
  ownerEmployeeId: string | null;
  primarySolutionApplicationId: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface DemandRepository {
  withTransaction<T>(
    operation: (repository: DemandRepository) => Promise<T>,
  ): Promise<T>;
  createDraft(input: {
    requesterEmployeeId: string;
    title: string;
    problemStatement: string;
    desiredOutcome: string;
    audienceType: CreateDemandInput["audienceType"];
    departmentId: string | null;
    employeeId: string | null;
    includeChildren: boolean;
    displayAnonymously: boolean;
  }): Promise<DemandEntry>;
  findById(demandId: string): Promise<DemandEntry | null>;
  listVisible(input: {
    actor: ActorContext;
    status?: DemandStatus;
    query?: string;
  }): Promise<readonly DemandEntry[]>;
  findVisible(
    actor: ActorContext,
    demandId: string,
  ): Promise<DemandEntry | null>;
  updateDraft(
    demandId: string,
    expectedVersion: number,
    input: Partial<{
      title: string;
      problemStatement: string;
      desiredOutcome: string;
      audienceType: CreateDemandInput["audienceType"];
      departmentId: string | null;
      employeeId: string | null;
      includeChildren: boolean;
      displayAnonymously: boolean;
    }>,
  ): Promise<DemandEntry>;
  transitionStatus(
    demandId: string,
    status: DemandStatus,
    expectedVersion: number,
    reviewReason?: string | null,
  ): Promise<DemandEntry>;
  claimOwner(
    demandId: string,
    employeeId: string,
    expectedVersion: number,
  ): Promise<DemandEntry>;
  assignCollaborator(
    demandId: string,
    employeeId: string,
    role: DemandCollaboratorRole,
    expectedVersion: number,
  ): Promise<DemandCollaboratorRecord>;
  listCollaborators(
    demandId: string,
  ): Promise<readonly DemandCollaboratorRecord[]>;
  hasLike(demandId: string, employeeId: string): Promise<boolean>;
  addLike(demandId: string, employeeId: string): Promise<void>;
  removeLike(demandId: string, employeeId: string): Promise<void>;
  findComment(commentId: string): Promise<DemandCommentRecord | null>;
  createComment(
    input: Omit<DemandCommentRecord, "commentId" | "createdAt" | "updatedAt">,
  ): Promise<DemandCommentRecord>;
  listComments(demandId: string): Promise<readonly DemandCommentRecord[]>;
  setCommentHidden(commentId: string, hiddenAt: Date | null): Promise<void>;
  createReport(
    input: Omit<DemandReportRecord, "reportId" | "createdAt">,
  ): Promise<DemandReportRecord>;
  resolveReport(
    reportId: string,
    status: DemandReportRecord["status"],
    employeeId: string,
  ): Promise<DemandReportRecord>;
  recordAudit(input: {
    demandId: string;
    actorEmployeeId: string;
    eventType: string;
    details?: unknown;
  }): Promise<void>;
  emitOutbox(input: { demandId: string; eventType: string }): Promise<void>;
}

export interface DemandCollaboratorRecord {
  demandId: string;
  employeeId: string;
  role: DemandCollaboratorRole;
  createdAt: Date;
}

export interface DemandListResult {
  items: readonly DemandEntry[];
  total: number;
  page: number;
  pageSize: number;
}

export interface DemandCommentRecord {
  commentId: string;
  demandId: string;
  parentCommentId: string | null;
  authorEmployeeId: string;
  body: string;
  displayAnonymously: boolean;
  hiddenAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DemandReportRecord {
  reportId: string;
  demandId: string;
  commentId: string | null;
  reporterEmployeeId: string;
  reason: string;
  status: "open" | "dismissed" | "hidden" | "restored";
  resolvedByEmployeeId: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
}

export interface DemandAuthorizationPort {
  authorize(input: {
    actor: ActorContext;
    action: string;
    resourceType: "demand";
    resourceId?: string;
  }): Promise<AuthorizationDecision>;
}

export interface DemandDraftInput {
  title: string;
  problemStatement: string;
  desiredOutcome: string;
  audienceType: CreateDemandInput["audienceType"];
  departmentId?: string;
  employeeId?: string;
  includeChildren?: boolean;
  displayAnonymously?: boolean;
}
