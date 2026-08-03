import type { ActorContext } from "./identity.js";

export type DemandStatus =
  | "draft"
  | "pending_review"
  | "rejected"
  | "published"
  | "in_progress"
  | "pilot"
  | "completed"
  | "closed"
  | "merged";

export type DemandAudienceType = "all" | "department" | "employee";
export type DemandCollaboratorRole = "owner" | "collaborator" | "operator";
export type DemandApplicationRole = "candidate" | "pilot" | "solution";
export type DemandReportStatus = "open" | "dismissed" | "hidden" | "restored";

export interface CreateDemandInput {
  title: string;
  problemStatement: string;
  desiredOutcome: string;
  audienceType: DemandAudienceType;
  departmentId?: string;
  employeeId?: string;
  includeChildren?: boolean;
  displayAnonymously?: boolean;
}

export interface DemandPriorityInput {
  businessValue: number;
  implementationCost: number;
  riskLevel: number;
  adminPriority: number;
}

export interface DemandEntry {
  demandId: string;
  requesterEmployeeId: string | null;
  title: string;
  problemStatement: string;
  desiredOutcome: string;
  status: DemandStatus;
  reviewReason: string | null;
  audienceType: DemandAudienceType;
  audienceDepartmentId: string | null;
  displayAnonymously: boolean;
  likeCount: number;
  commentCount: number;
  priorityScore: number | null;
  priorityExplanation: string | null;
  ownerEmployeeId: string | null;
  primarySolutionApplicationId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface DemandListQuery {
  actor: ActorContext;
  status?: DemandStatus;
  query?: string;
  page: number;
  pageSize: number;
}
