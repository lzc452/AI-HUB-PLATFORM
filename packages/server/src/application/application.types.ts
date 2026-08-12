import type {
  ActorContext,
  AuthorizationDecision,
  AuthorizationRequest,
} from "@ai-hub/contracts";

export type ApplicationStatus =
  | "draft"
  | "in_review"
  | "approved"
  | "published"
  | "withdrawn"
  | "archived";
export type ApplicationVersionScanStatus = "pending" | "passed" | "failed";
export type ReviewDecision = "approve" | "reject" | "request_changes";
export type ReviewQueueStatus = "available" | "claimed";
export type ReviewSlaStatus = "on_time" | "overdue";
export type DeliveryChannel = "web" | "desktop" | "mobile" | "mini_program";

export interface ApplicationRecord {
  applicationId: string;
  ownerEmployeeId: string;
  maintainerEmployeeId: string;
  departmentId: string;
  name: string;
  summary: string;
  status: ApplicationStatus;
  currentVersionId: string | null;
}

export interface ApplicationVersionRecord {
  applicationVersionId: string;
  applicationId: string;
  version: string;
  changelog: string;
  artifactKey: string;
  artifactSha256: string;
  artifactSignature: string;
  scanStatus: ApplicationVersionScanStatus;
  createdByEmployeeId: string;
  createdAt: Date;
}

export interface DeliveryRecord {
  deliveryId: string;
  applicationId: string;
  channel: DeliveryChannel;
  entryUrl: string;
  minClientVersion: string | null;
  enabled: boolean;
}

export interface ReviewRecord {
  reviewId: string;
  applicationId: string;
  applicationVersionId: string;
  reviewerEmployeeId: string;
  applicationOwnerEmployeeId: string;
  decision: ReviewDecision;
  comment: string;
  createdAt: Date;
}

export interface ReviewQueueRecord {
  reviewQueueId: string;
  applicationId: string;
  applicationVersionId: string;
  status: ReviewQueueStatus;
  claimedByEmployeeId: string | null;
  claimedAt: Date | null;
  slaDueAt: Date;
  createdAt: Date;
}

export type ReviewQueueView = ReviewQueueRecord & {
  slaStatus: ReviewSlaStatus;
};

export interface ApplicationWorkspace {
  application: ApplicationRecord;
  versions: readonly ApplicationVersionRecord[];
  deliveries: readonly DeliveryRecord[];
  reviews: readonly ReviewRecord[];
  reviewQueue: ReviewQueueRecord | null;
}

export interface ApplicationAuthorizationPort {
  authorize(request: AuthorizationRequest): Promise<AuthorizationDecision>;
}

export interface ApplicationRepository {
  withTransaction<T>(
    operation: (repository: ApplicationRepository) => Promise<T>,
  ): Promise<T>;
  createApplication(input: {
    ownerEmployeeId: string;
    maintainerEmployeeId: string;
    departmentId: string;
    name: string;
    summary: string;
  }): Promise<ApplicationRecord>;
  findApplication(applicationId: string): Promise<ApplicationRecord | null>;
  createVersion(
    input: Omit<ApplicationVersionRecord, "createdAt">,
  ): Promise<ApplicationVersionRecord>;
  findVersion(
    applicationVersionId: string,
  ): Promise<ApplicationVersionRecord | null>;
  listVersions(
    applicationId: string,
  ): Promise<readonly ApplicationVersionRecord[]>;
  setApplicationStatus(
    applicationId: string,
    status: ApplicationStatus,
    currentVersionId?: string,
  ): Promise<ApplicationRecord>;
  createDelivery(
    input: Omit<DeliveryRecord, "deliveryId">,
  ): Promise<DeliveryRecord>;
  listDeliveries(applicationId: string): Promise<readonly DeliveryRecord[]>;
  createReview(
    input: Omit<ReviewRecord, "reviewId" | "createdAt">,
  ): Promise<ReviewRecord>;
  listReviews(applicationId: string): Promise<readonly ReviewRecord[]>;
  createReviewQueue(
    input: Omit<ReviewQueueRecord, "reviewQueueId" | "createdAt">,
  ): Promise<ReviewQueueRecord>;
  findReviewQueueByVersion(
    applicationVersionId: string,
  ): Promise<ReviewQueueRecord | null>;
  claimReviewQueue(
    applicationVersionId: string,
    employeeId: string,
  ): Promise<ReviewQueueRecord>;
  releaseReviewQueue(
    applicationVersionId: string,
    employeeId: string,
  ): Promise<ReviewQueueRecord>;
  recordAudit(input: {
    applicationId: string;
    applicationVersionId?: string | null;
    actorEmployeeId?: string | null;
    eventType: string;
    details?: unknown;
  }): Promise<void>;
  emitOutbox(input: {
    applicationId: string;
    applicationVersionId?: string | null;
    eventType: string;
  }): Promise<void>;
}

export type ApplicationActor = ActorContext;
