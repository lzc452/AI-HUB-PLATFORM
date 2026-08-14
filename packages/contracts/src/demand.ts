import type { ActorContext } from "./identity.js";

export type DemandStatus =
  | "draft"
  | "pending_review"
  | "rejected"
  | "pending_claim"
  | "claimed"
  | "validating"
  | "pilot"
  | "converted"
  | "closed"
  | "merged";

export type DemandAudienceType = "all" | "department" | "employee";
export type DemandCollaboratorRole = "owner" | "collaborator" | "operator";
export type DemandApplicationRole = "candidate" | "pilot" | "solution";
export type DemandReportStatus = "open" | "dismissed" | "hidden" | "restored";
export type DemandPriorityLevel = "high" | "medium" | "low";
export type DemandClaimProposalStatus =
  | "proposed"
  | "selected"
  | "rejected"
  | "withdrawn";

export interface CreateDemandInput {
  title: string;
  problemStatement: string;
  businessScenario: string;
  impact: string;
  desiredOutcome: string;
  currentWorkaround: string;
  dataSensitivity: string;
  aiSolutionIdea?: string;
  audienceType: DemandAudienceType;
  departmentId?: string;
  employeeId?: string;
  includeChildren?: boolean;
  displayAnonymously?: boolean;
  attachmentIds?: string[];
}

export interface DemandAttachment {
  attachmentId: string;
  demandId: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedByEmployeeId: string;
  createdAt: string;
}

export interface DemandPriorityInput {
  businessValue: number;
  impactedHeadcount: number;
  usageFrequency: number;
  strategicFit: number;
  technicalFeasibility: number;
  dataComplianceRisk: number;
  implementationCost: number;
}

export interface DemandClaimProposalInput {
  ownerEmployeeId: string;
  collaboratorEmployeeIds: string[];
  approach: string;
  estimatedValidationDuration: string;
  resourceNeeds: string;
  preference?: string;
}

export interface DemandClaimProposal {
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
  createdAt: string;
  updatedAt: string;
}

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
  reviewReason: string | null;
  audienceType: DemandAudienceType;
  audienceDepartmentId: string | null;
  audienceEmployeeId?: string | null;
  includeChildren?: boolean;
  displayAnonymously: boolean;
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
  createdAt: string;
  updatedAt: string;
}

export interface DemandListQuery {
  actor: ActorContext;
  status?: DemandStatus;
  query?: string;
  requesterDepartmentId?: string;
  audienceType?: DemandAudienceType;
  sort?: "recent" | "priority" | "hot";
  page: number;
  pageSize: number;
}
