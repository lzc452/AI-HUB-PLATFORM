import type {
  ActorContext,
  AuthorizationDecision,
  CreateDemandInput,
  DemandStatus,
} from "@ai-hub/contracts";

export interface DemandEntry {
  demandId: string;
  requesterEmployeeId: string;
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
  recordAudit(input: {
    demandId: string;
    actorEmployeeId: string;
    eventType: string;
    details?: unknown;
  }): Promise<void>;
  emitOutbox(input: { demandId: string; eventType: string }): Promise<void>;
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
