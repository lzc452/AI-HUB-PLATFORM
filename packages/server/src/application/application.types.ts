import type {
  ApplicationAdminKpis,
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
export type ArtifactUploadStatus = "uploading" | "completed" | "failed";
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

export interface ArtifactUploadRecord {
  uploadId: string;
  applicationId: string;
  uploadedByEmployeeId: string;
  objectKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string | null;
  signature: string | null;
  partCount: number;
  uploadStatus: ArtifactUploadStatus;
  scanStatus: ApplicationVersionScanStatus;
  errorCode: string | null;
  expiresAt: Date;
  completedAt: Date | null;
  createdAt: Date;
}

export interface AssetRecord {
  assetId: string;
  applicationId: string;
  applicationVersionId: string | null;
  assetType: "icon" | "screenshot" | "attachment";
  name: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  sortOrder: number;
  sha256: string | null;
  scanStatus: ApplicationVersionScanStatus;
  uploadedByEmployeeId: string | null;
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

export interface ApplicationAdminListInput {
  keyword?: string;
  mode?: "all" | "review" | "owned";
  status?: ApplicationStatus;
  departmentId?: string;
  applicationType?: string;
  channel?: DeliveryChannel;
  sort?: "recent" | "name" | "status";
  page: number;
  pageSize: number;
}

export interface ApplicationAdminListRow {
  applicationId: string;
  name: string;
  summary: string;
  categoryId: string;
  status: ApplicationStatus;
  currentVersion: string;
  currentVersionId: string | null;
  ownerName: string;
  departmentName: string;
  deliveryChannels: readonly DeliveryChannel[];
  updatedAt: string;
  isMine: boolean;
  needsMyReview: boolean;
}

export interface ApplicationAdminListResult {
  items: readonly ApplicationAdminListRow[];
  page: number;
  pageSize: number;
  total: number;
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
  listAdmin?(
    actor: ActorContext,
    input: ApplicationAdminListInput,
  ): Promise<ApplicationAdminListResult>;
  getAdminKpis?(actor: ActorContext): Promise<ApplicationAdminKpis>;
  createVersion(
    input: Omit<ApplicationVersionRecord, "createdAt">,
  ): Promise<ApplicationVersionRecord>;
  findVersion(
    applicationVersionId: string,
  ): Promise<ApplicationVersionRecord | null>;
  listVersions(
    applicationId: string,
  ): Promise<readonly ApplicationVersionRecord[]>;
  createArtifactUpload(
    input: Omit<ArtifactUploadRecord, "uploadId" | "createdAt" | "completedAt">,
  ): Promise<ArtifactUploadRecord>;
  findArtifactUpload(uploadId: string): Promise<ArtifactUploadRecord | null>;
  findVerifiedArtifact(input: {
    applicationId: string;
    objectKey: string;
    sha256: string;
    signature: string;
  }): Promise<ArtifactUploadRecord | null>;
  updateArtifactUpload(
    uploadId: string,
    input: Partial<
      Pick<
        ArtifactUploadRecord,
        | "sha256"
        | "signature"
        | "sizeBytes"
        | "uploadStatus"
        | "scanStatus"
        | "errorCode"
        | "completedAt"
        | "objectKey"
      >
    >,
  ): Promise<ArtifactUploadRecord | null>;
  createAsset(
    input: Omit<AssetRecord, "assetId" | "createdAt">,
  ): Promise<AssetRecord>;
  listAssets(applicationId: string): Promise<readonly AssetRecord[]>;
  findAsset(assetId: string): Promise<AssetRecord | null>;
  deleteAsset(assetId: string): Promise<void>;
  setApplicationStatus(input: {
    applicationId: string;
    expectedStatus: ApplicationStatus;
    status: ApplicationStatus;
    currentVersionId?: string;
  }): Promise<ApplicationRecord>;
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
    details?: unknown;
  }): Promise<void>;
  registerToCatalog(input: {
    applicationId: string;
    name: string;
    summary: string;
    categoryId?: string;
    applicationType?: string;
  }): Promise<void>;
  linkDeliveryAsset(input: {
    applicationId: string;
    channel: DeliveryChannel;
    assetId: string;
    sortOrder?: number;
    version?: string | null;
  }): Promise<void>;
  updateAsset(
    assetId: string,
    input: Partial<Pick<AssetRecord, "scanStatus" | "sha256" | "sizeBytes">>,
  ): Promise<AssetRecord | null>;
}

export type ApplicationActor = ActorContext;
