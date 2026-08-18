import type {
  ApplicationAdminKpis,
  ActorContext,
  ApplicationDraft,
  AudienceRule,
  AuthorizationDecision,
  AuthorizationRequest,
  DeliveryTarget,
  UploadKind,
} from "@ai-hub/contracts";

export type ApplicationStatus =
  | "draft"
  | "in_review"
  | "approved"
  | "published"
  | "withdrawn"
  | "archived";
export type ApplicationVersionScanStatus = "pending" | "passed" | "failed";
export type ArtifactUploadStatus =
  | "uploading"
  | "verifying"
  | "completed"
  | "failed";
export type ReviewDecision = "approve" | "reject" | "request_changes";
export type ReviewQueueStatus = "available" | "claimed" | "completed";
export type ReviewSlaStatus = "on_time" | "overdue";
export type DeliveryChannel = "web" | "desktop" | "mobile" | "mini_program";
export type ValidationCheckStatus =
  | "passed"
  | "safe"
  | "warning"
  | "info"
  | "failed";

export interface ValidationCheckRecord {
  validationCheckId: string;
  applicationVersionId: string;
  checkCode: string;
  label: string;
  status: ValidationCheckStatus;
  detail: string | null;
  createdAt: Date;
}

export interface ApplicationRecord {
  applicationId: string;
  ownerEmployeeId: string;
  maintainerEmployeeId: string;
  departmentId: string;
  name: string;
  summary: string;
  status: ApplicationStatus;
  currentVersionId: string | null;
  /** 已发布应用提交更新审核时，处于审核中的待生效版本；审核结束置空。 */
  pendingVersionId: string | null;
}

export interface ApplicationVersionRecord {
  applicationVersionId: string;
  applicationId: string;
  version: string;
  changelog: string;
  artifactKey: string | null;
  artifactSha256: string | null;
  artifactSignature: string | null;
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
  kind: UploadKind;
  sha256: string | null;
  signature: string | null;
  /** 制品验证完成后是否已签名（0041 迁移新增；未签名制品必须由提交人显式
   *  确认风险才能创建版本/提交审核，规格 §5.5）。NOT NULL 列，mapper 恒填充；
   *  旧测试 fixture 省略时视为已签名。 */
  signed?: boolean;
  partCount: number;
  uploadStatus: ArtifactUploadStatus;
  scanStatus: ApplicationVersionScanStatus;
  errorCode: string | null;
  /** 新版数据库字段；旧测试 fixture 可以省略，由 mapper/DTO 使用默认值。 */
  stagingObjectKey?: string;
  verificationStartedAt?: Date | null;
  verificationAttempts?: number;
  updatedAt?: Date;
  expiresAt: Date;
  completedAt: Date | null;
  createdAt: Date;
}

export type AssetType = "icon" | "screenshot" | "cover" | "attachment" | "qr";

export interface AssetRecord {
  assetId: string;
  applicationId: string;
  applicationVersionId: string | null;
  assetType: AssetType;
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
  /** 交付目标（OS/平台/小程序渠道）；列表读取时一并返回。 */
  targets?: readonly DeliveryTargetRecord[];
}

/** delivery_targets 行。 */
export interface DeliveryTargetRecord {
  deliveryTargetId: string;
  deliveryId: string;
  kind: "desktop" | "mobile" | "miniprogram";
  os: "windows" | "macos" | null;
  platform: "android" | "ios" | "wechat" | "dingtalk" | "alipay" | null;
  arch: string | null;
  appId: string | null;
  qrCodeAssetId: string | null;
  versionNote: string | null;
  enabled: boolean;
  createdAt: Date;
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
  /** 进入审核前的应用状态（'draft' | 'published'），用于驳回回滚。 */
  sourceStatus: string | null;
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
  ownerName: string;
  maintainerName: string;
  departmentName: string;
  updatedAt: string;
  versions: readonly ApplicationVersionRecord[];
  deliveries: readonly DeliveryRecord[];
  reviews: readonly ReviewRecord[];
  reviewQueue: ReviewQueueRecord | null;
  assets: readonly AssetRecord[];
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

/** 钉钉通知矩阵队列端口（由 notification 模块的矩阵服务实现；与 demand 模块同模式）。 */
export interface ApplicationNotificationPort {
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
  deleteDraftApplication(applicationId: string): Promise<void>;
  transferOwner(
    applicationId: string,
    newOwnerEmployeeId: string,
  ): Promise<ApplicationRecord | null>;
  findApplication(applicationId: string): Promise<ApplicationRecord | null>;
  findApplicationMeta(applicationId: string): Promise<{
    ownerName: string;
    maintainerName: string;
    departmentName: string;
    updatedAt: Date;
  } | null>;
  upsertDraft(applicationId: string, draft: ApplicationDraft): Promise<void>;
  findDraft(
    applicationId: string,
  ): Promise<{ draft: ApplicationDraft; updatedAt: Date } | null>;
  updateApplicationContent(
    applicationId: string,
    input: { name: string; summary: string },
  ): Promise<void>;
  upsertCatalogMetadata(
    applicationId: string,
    input: { categoryId: string; applicationType: string },
  ): Promise<void>;
  replaceTagLinks(
    applicationId: string,
    tagIds: readonly string[],
  ): Promise<void>;
  replaceAudiences(
    applicationId: string,
    audience: readonly AudienceRule[],
  ): Promise<void>;
  snapshotVersionContent(
    applicationVersionId: string,
    payload: unknown,
  ): Promise<void>;
  getApplicationType(applicationId: string): Promise<string | null>;
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
    signature: string | null;
  }): Promise<ArtifactUploadRecord | null>;
  updateArtifactUpload(
    uploadId: string,
    input: Partial<
      Pick<
        ArtifactUploadRecord,
        | "sha256"
        | "signature"
        | "signed"
        | "sizeBytes"
        | "uploadStatus"
        | "scanStatus"
        | "errorCode"
        | "completedAt"
        | "objectKey"
        | "stagingObjectKey"
        | "verificationStartedAt"
        | "verificationAttempts"
        | "updatedAt"
      >
    >,
  ): Promise<ArtifactUploadRecord | null>;
  claimArtifactVerification?(input: {
    uploadId: string;
    expectedSha256: string;
    requestedSignature?: string | null;
  }): Promise<ArtifactUploadRecord | null>;
  finalizeArtifactVerification?(input: {
    uploadId: string;
    objectKey: string;
    signature: string | null;
    signed: boolean;
  }): Promise<ArtifactUploadRecord | null>;
  failArtifactVerification?(input: {
    uploadId: string;
    errorCode: string;
  }): Promise<ArtifactUploadRecord | null>;
  listStaleArtifactVerifications?(input: {
    olderThan: Date;
    limit: number;
  }): Promise<readonly ArtifactUploadRecord[]>;
  resetStaleArtifactVerification?(uploadId: string): Promise<boolean>;
  /** 幂等 upsert 自动校验检查点（unique (application_version_id, check_code)）。 */
  recordValidationCheck(input: {
    applicationVersionId: string;
    checkCode: string;
    label: string;
    status: ValidationCheckStatus;
    detail: string | null;
  }): Promise<void>;
  listValidationChecks(
    applicationVersionId: string,
  ): Promise<readonly ValidationCheckRecord[]>;
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
    pendingVersionId?: string | null;
  }): Promise<ApplicationRecord>;
  createDelivery(
    input: Omit<DeliveryRecord, "deliveryId">,
  ): Promise<DeliveryRecord>;
  listDeliveries(applicationId: string): Promise<readonly DeliveryRecord[]>;
  /** 替换式保存交付目标（先删后插，幂等）。 */
  saveDeliveryTargets(
    deliveryId: string,
    targets: readonly DeliveryTarget[],
  ): Promise<void>;
  listDeliveryTargets(
    deliveryId: string,
  ): Promise<readonly DeliveryTargetRecord[]>;
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
  /** 超级管理员转交已领取的评审任务（仅 status='claimed' 可转交）。 */
  transferReviewQueue(
    applicationVersionId: string,
    employeeId: string,
  ): Promise<ReviewQueueRecord>;
  /** 领取超时（claimed_at 早于 now - CLAIM_HOLD_MS）且仍未结论的认领。 */
  listExpiredClaims(now: Date): Promise<
    readonly {
      applicationVersionId: string;
      claimedByEmployeeId: string | null;
    }[]
  >;
  /** 审核结束（通过或驳回）后将队列置为终态 'completed'，避免其继续残留。 */
  completeReviewQueue(applicationVersionId: string): Promise<ReviewQueueRecord>;
  /** 提交人撤回待审核版本时删除队列行（application_version_id 有 UNIQUE 约束，
   *  保留 completed 行会阻塞同一版本的再次提交）。 */
  deleteReviewQueue(applicationVersionId: string): Promise<void>;
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
    /** 稳定业务幂等键；传入后同一业务事件重试将去重（低危-6/7）。缺失时回退随机键。 */
    idempotencyKey?: string;
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
