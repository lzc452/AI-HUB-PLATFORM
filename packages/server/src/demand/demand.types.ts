import type {
  ActorContext,
  AuthorizationDecision,
  CreateDemandInput,
  DemandCollaboratorRole,
  DemandApplicationRole,
  DemandStatus,
  DemandPriorityInput,
  DemandPriorityLevel,
  DemandClaimProposalStatus,
} from "@ai-hub/contracts";
import type { ApplicationRepository } from "../application/application.types.js";

export interface DemandEntry {
  demandId: string;
  requesterEmployeeId: string | null;
  requesterDepartmentId?: string | null;
  requesterDisplayName?: string | null;
  title: string;
  problemStatement: string;
  businessScenario?: string | null;
  impact?: string | null;
  desiredOutcome: string;
  currentWorkaround?: string | null;
  dataSensitivity?: string | null;
  aiSolutionIdea?: string | null;
  status: DemandStatus;
  audienceType: CreateDemandInput["audienceType"];
  audienceDepartmentId: string | null;
  audienceEmployeeId?: string | null;
  includeChildren?: boolean;
  displayAnonymously: boolean;
  reviewReason: string | null;
  likeCount: number;
  commentCount: number;
  likedByCurrentActor?: boolean;
  businessValue?: number | null;
  impactedHeadcount?: number | null;
  usageFrequency?: number | null;
  strategicFit?: number | null;
  technicalFeasibility?: number | null;
  dataComplianceRisk?: number | null;
  implementationCost?: number | null;
  priorityScore: number | null;
  priorityExplanation: string | null;
  confirmedPriority?: DemandPriorityLevel | null;
  priorityAdjustmentReason?: string | null;
  ownerEmployeeId: string | null;
  ownerDisplayName?: string | null;
  primarySolutionApplicationId: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface DemandApplicationBridge {
  createApplicationInTransaction(
    actor: ActorContext,
    input: {
      name: string;
      summary: string;
      maintainerEmployeeId?: string;
      departmentId?: string;
    },
    repository: ApplicationRepository,
  ): Promise<{ applicationId: string }>;
}

export interface DemandIdentityPort {
  /**
   * 按权限码取收件人。可选：装配的 identity 端口若未实现（如内存替身），
   * 广播收件人为空属于「无人可通知」，不应让需求提交失败。
   *
   * 刻意不提供按角色码取收件人的入口：审核职责常由自定义角色承担，
   * 按角色码取会把这些审核员整体漏掉，而按权限码取天然覆盖所有授权路径。
   */
  listEmployeeIdsWithPermission?(permission: string): Promise<string[]>;
}

/** 钉钉通知矩阵队列端口（由 notification 模块的矩阵服务实现）。 */
export interface DemandNotificationPort {
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

export interface DemandRepository {
  withTransaction<T>(
    operation: (repository: DemandRepository) => Promise<T>,
  ): Promise<T>;
  withApplicationTransaction<T>(
    operation: (
      demandRepository: DemandRepository,
      applicationRepository: ApplicationRepository,
    ) => Promise<T>,
  ): Promise<T>;
  createDraft(input: {
    requesterEmployeeId: string;
    title: string;
    problemStatement: string;
    businessScenario: string;
    impact: string;
    desiredOutcome: string;
    currentWorkaround: string;
    dataSensitivity: string;
    aiSolutionIdea: string | null;
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
    requesterDepartmentId?: string;
    audienceType?: CreateDemandInput["audienceType"];
    sort?: "recent" | "priority" | "hot";
  }): Promise<readonly DemandEntry[]>;
  /**
   * 分页版可见需求查询（可选）。
   *
   * 存在的理由与 catalog 的 `listVisiblePage` 相同：`listVisible` 会把**全部**
   * 可见需求捞回内存再由服务层 `slice`，数据量上来后每次翻页都要搬运整表。
   *
   * 声明为可选是为了不破坏既有内存替身（测试里手写的 repository 没有这个方法），
   * 服务层按`repository.listVisiblePage !== undefined` 决定走哪条路——
   * 有 SQL 实现时把 limit/offset 下推，没有时退回原行为。
   */
  listVisiblePage?(input: {
    actor: ActorContext;
    status?: DemandStatus;
    query?: string;
    requesterDepartmentId?: string;
    audienceType?: CreateDemandInput["audienceType"];
    sort?: "recent" | "priority" | "hot";
    page: number;
    pageSize: number;
  }): Promise<DemandListResult>;
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
      businessScenario: string;
      impact: string;
      desiredOutcome: string;
      currentWorkaround: string;
      dataSensitivity: string;
      aiSolutionIdea: string | null;
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
  confirmClaim(
    demandId: string,
    ownerEmployeeId: string,
    collaboratorEmployeeIds: string[],
    expectedVersion: number,
  ): Promise<DemandEntry>;
  releaseClaim(demandId: string, expectedVersion: number): Promise<DemandEntry>;
  assignCollaborator(
    demandId: string,
    employeeId: string,
    role: DemandCollaboratorRole,
    expectedVersion: number,
  ): Promise<DemandCollaboratorRecord>;
  updateCollaboratorRole(
    demandId: string,
    employeeId: string,
    role: DemandCollaboratorRole,
    expectedVersion: number,
  ): Promise<DemandCollaboratorRecord>;
  listCollaborators(
    demandId: string,
  ): Promise<readonly DemandCollaboratorRecord[]>;
  removeCollaborator(
    demandId: string,
    employeeId: string,
    expectedVersion: number,
  ): Promise<void>;
  setPriority(
    demandId: string,
    input: DemandPriorityInput,
    expectedVersion: number,
    score: number,
    explanation: string,
  ): Promise<DemandEntry>;
  confirmPriority(
    demandId: string,
    confirmedPriority: DemandPriorityLevel,
    adjustmentReason: string | null,
    expectedVersion: number,
  ): Promise<DemandEntry>;
  createProgressUpdate(input: {
    demandId: string;
    authorEmployeeId: string;
    status: DemandStatus;
    title: string;
    body: string;
  }): Promise<DemandProgressRecord>;
  listProgressUpdates(
    demandId: string,
  ): Promise<readonly DemandProgressRecord[]>;
  createPilot(input: {
    demandId: string;
    applicationId: string | null;
    name: string;
    startsAt: Date;
    endsAt: Date | null;
    outcome: string | null;
    status: DemandPilotRecord["status"];
    createdByEmployeeId: string;
  }): Promise<DemandPilotRecord>;
  updatePilot(
    pilotId: string,
    input: Partial<{
      endsAt: Date | null;
      outcome: string | null;
      status: DemandPilotRecord["status"];
    }>,
  ): Promise<DemandPilotRecord>;
  mergeDemands(
    sourceDemandId: string,
    targetDemandId: string,
    sourceExpectedVersion: number,
    targetExpectedVersion: number,
  ): Promise<{ source: DemandEntry; target: DemandEntry }>;
  linkApplication(
    demandId: string,
    applicationId: string,
    role: DemandApplicationRole,
    isPrimary: boolean,
    expectedVersion: number,
    linkedByEmployeeId: string,
  ): Promise<DemandApplicationLinkRecord>;
  listApplicationLinks(
    demandId: string,
  ): Promise<readonly DemandApplicationLinkRecord[]>;
  unlinkApplication(
    demandId: string,
    applicationId: string,
    expectedVersion: number,
  ): Promise<void>;
  hasLike(demandId: string, employeeId: string): Promise<boolean>;
  addLike(demandId: string, employeeId: string): Promise<void>;
  removeLike(demandId: string, employeeId: string): Promise<void>;
  hasCommentLike(commentId: string, employeeId: string): Promise<boolean>;
  addCommentLike(commentId: string, employeeId: string): Promise<void>;
  removeCommentLike(commentId: string, employeeId: string): Promise<void>;
  findComment(commentId: string): Promise<DemandCommentRecord | null>;
  findReport(reportId: string): Promise<DemandReportRecord | null>;
  createComment(
    input: Omit<
      DemandCommentRecord,
      "commentId" | "createdAt" | "updatedAt" | "authorEmployeeId"
    > & { authorEmployeeId: string },
  ): Promise<DemandCommentRecord>;
  listComments(
    demandId: string,
    actor?: ActorContext,
  ): Promise<readonly DemandCommentRecord[]>;
  setCommentHidden(commentId: string, hiddenAt: Date | null): Promise<void>;
  createReport(
    input: Omit<DemandReportRecord, "reportId" | "createdAt">,
  ): Promise<DemandReportRecord>;
  resolveReport(
    reportId: string,
    status: DemandReportRecord["status"],
    employeeId: string,
  ): Promise<DemandReportRecord>;
  listPilots(demandId: string): Promise<readonly DemandPilotRecord[]>;
  listReports(demandId: string): Promise<readonly DemandReportRecord[]>;
  createClaimProposal(input: {
    demandId: string;
    proposerEmployeeId: string;
    ownerEmployeeId: string;
    collaboratorEmployeeIds: string[];
    approach: string;
    estimatedValidationDuration: string;
    resourceNeeds: string;
    preference: string | null;
  }): Promise<DemandClaimProposalRecord>;
  listClaimProposals(
    demandId: string,
  ): Promise<readonly DemandClaimProposalRecord[]>;
  findClaimProposal(
    proposalId: string,
  ): Promise<DemandClaimProposalRecord | null>;
  updateClaimProposalStatus(
    proposalId: string,
    status: DemandClaimProposalStatus,
  ): Promise<DemandClaimProposalRecord>;
  createAttachment(input: {
    storageKey: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    sha256: string;
    uploadedByEmployeeId: string;
  }): Promise<DemandAttachmentRecord>;
  linkAttachmentToDemand(attachmentId: string, demandId: string): Promise<void>;
  listAttachments(demandId: string): Promise<readonly DemandAttachmentRecord[]>;
  deleteAttachment(attachmentId: string): Promise<void>;
  recordAudit(input: {
    demandId: string;
    actorEmployeeId: string;
    eventType: string;
    details?: unknown;
  }): Promise<void>;
  emitOutbox(input: {
    demandId: string;
    eventType: string;
    /** 稳定业务幂等键；传入后同一业务事件重试将去重（低危-6/7）。缺失时回退随机键。 */
    idempotencyKey?: string;
  }): Promise<void>;
}

export interface DemandCollaboratorRecord {
  demandId: string;
  employeeId: string;
  role: DemandCollaboratorRole;
  createdAt: Date;
}

export interface DemandClaimProposalRecord {
  proposalId: string;
  demandId: string;
  proposerEmployeeId: string;
  ownerEmployeeId: string;
  collaboratorEmployeeIds: string[];
  approach: string;
  estimatedValidationDuration: string;
  resourceNeeds: string;
  preference: string | null;
  status: DemandClaimProposalStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface DemandAttachmentRecord {
  attachmentId: string;
  demandId: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedByEmployeeId: string;
  createdAt: Date;
}

export interface DemandProgressRecord {
  progressId: string;
  demandId: string;
  authorEmployeeId: string;
  status: DemandStatus;
  title: string;
  body: string;
  createdAt: Date;
}

export interface DemandPilotRecord {
  pilotId: string;
  demandId: string;
  applicationId: string | null;
  name: string;
  startsAt: Date;
  endsAt: Date | null;
  outcome: string | null;
  status: "planned" | "running" | "completed" | "cancelled";
  createdByEmployeeId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DemandApplicationLinkRecord {
  demandId: string;
  applicationId: string;
  role: DemandApplicationRole;
  isPrimary: boolean;
  linkedByEmployeeId: string;
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
  authorEmployeeId: string | null;
  authorDisplayName?: string | null;
  authorDepartmentId?: string | null;
  body: string;
  displayAnonymously: boolean;
  likeCount?: number;
  likedByCurrentActor?: boolean;
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
  businessScenario: string;
  impact: string;
  desiredOutcome: string;
  currentWorkaround: string;
  dataSensitivity: string;
  aiSolutionIdea?: string;
  audienceType: CreateDemandInput["audienceType"];
  departmentId?: string;
  employeeId?: string;
  includeChildren?: boolean;
  displayAnonymously?: boolean;
  attachmentIds?: string[];
}
