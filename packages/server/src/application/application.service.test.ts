import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import type {
  ActorContext,
  AuthorizationDecision,
  BehaviorEventInput,
  DeliveryTarget,
} from "@ai-hub/contracts";
import { ApplicationService } from "./application.service.js";
import { CLAIM_HOLD_MS } from "../system/outbox/sla-reminder.worker.js";
import {
  PERMISSIVE_WEB_TARGET_POLICY,
  type ResolveHost,
  type WebTargetPolicy,
} from "../system/security/web-url-policy.js";
import type {
  ApplicationRecord,
  ApplicationRepository,
  ApplicationVersionRecord,
  ArtifactUploadRecord,
  AssetRecord,
  DeliveryChannel,
  DeliveryRecord,
  ReviewQueueRecord,
  ReviewRecord,
  ValidationCheckRecord,
} from "./application.types.js";

const owner: ActorContext = {
  employeeId: "E100",
  roleCodes: ["application_owner"],
  departmentIds: ["dept-rnd"],
  primaryDepartmentId: "dept-rnd",
  sessionId: "session-owner",
};
const reviewer: ActorContext = {
  employeeId: "E200",
  roleCodes: ["application_reviewer"],
  departmentIds: ["dept-review"],
  primaryDepartmentId: "dept-review",
  sessionId: "session-reviewer",
};
const outsider: ActorContext = {
  employeeId: "E300",
  roleCodes: ["employee"],
  departmentIds: ["dept-other"],
  primaryDepartmentId: "dept-other",
  sessionId: "session-outsider",
};
const superAdmin: ActorContext = {
  employeeId: "E999",
  roleCodes: ["super_admin"],
  departmentIds: [],
  primaryDepartmentId: "",
  sessionId: "session-super-admin",
  permissions: ["*"],
};

class MemoryApplicationRepository implements ApplicationRepository {
  applications = new Map<string, ApplicationRecord>();
  /** 维护人关联表（application_id → 保序列表），与 Kysely 实现一致。 */
  maintainers = new Map<string, string[]>();
  versions = new Map<string, ApplicationVersionRecord>();
  deliveries: DeliveryRecord[] = [];
  reviews: ReviewRecord[] = [];
  reviewQueue: ReviewQueueRecord[] = [];
  uploads = new Map<string, ArtifactUploadRecord>();
  assets = new Map<string, AssetRecord>();
  validationChecks: ValidationCheckRecord[] = [];
  audits: string[] = [];
  events: string[] = [];
  catalogRegistrations: string[] = [];
  catalogTypes = new Map<string, string>();
  deliveryAssets: Array<{
    applicationId: string;
    channel: DeliveryChannel;
    assetId: string;
    sortOrder?: number;
    version?: string | null;
  }> = [];
  deliveryTargets: Array<{
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
  }> = [];
  failOutbox = false;
  nextId = 1;
  private transactionQueue: Promise<void> = Promise.resolve();

  async withTransaction<T>(
    operation: (repository: this) => Promise<T>,
  ): Promise<T> {
    const previous = this.transactionQueue;
    let release!: () => void;
    this.transactionQueue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    const snapshot = {
      applications: new Map(this.applications),
      maintainers: new Map(this.maintainers),
      drafts: new Map(this.drafts),
      versions: new Map(this.versions),
      snapshots: new Map(this.snapshots),
      deliveries: [...this.deliveries],
      reviews: [...this.reviews],
      reviewQueue: [...this.reviewQueue],
      uploads: new Map(this.uploads),
      assets: new Map(this.assets),
      validationChecks: [...this.validationChecks],
      audits: [...this.audits],
      events: [...this.events],
      catalogRegistrations: [...this.catalogRegistrations],
      deliveryAssets: [...this.deliveryAssets],
      deliveryTargets: [...this.deliveryTargets],
      nextId: this.nextId,
    };
    try {
      return await operation(this);
    } catch (error) {
      Object.assign(this, snapshot);
      throw error;
    } finally {
      release();
    }
  }
  async createApplication(input: {
    ownerEmployeeId: string;
    maintainerEmployeeId: string;
    departmentId: string;
    name: string;
    summary: string;
  }) {
    const application: ApplicationRecord = {
      applicationId: `app-${this.nextId++}`,
      ownerEmployeeId: input.ownerEmployeeId,
      maintainerEmployeeId: input.maintainerEmployeeId,
      departmentId: input.departmentId,
      name: input.name,
      summary: input.summary,
      status: "draft",
      currentVersionId: null,
      pendingVersionId: null,
    };
    this.applications.set(application.applicationId, application);
    registerVerifiedUpload(this, application.applicationId);
    return application;
  }
  async findApplication(id: string) {
    return this.applications.get(id) ?? null;
  }
  async findApplicationMeta(applicationId: string) {
    const current = this.applications.get(applicationId);
    if (current === undefined) return null;
    // 与生产 findApplicationMeta 一致：维护人显示以关联表首条为准，空时回退单列。
    const maintainers = this.maintainers.get(applicationId) ?? [];
    return {
      ownerName: `owner-${current.ownerEmployeeId}`,
      maintainerName:
        maintainers.length > 0
          ? `maintainer-${maintainers[0]}`
          : `maintainer-${current.maintainerEmployeeId}`,
      departmentName: `dept-${current.departmentId}`,
      updatedAt: new Date(),
    };
  }
  async deleteDraftApplication(applicationId: string) {
    this.applications.delete(applicationId);
    this.drafts.delete(applicationId);
  }
  async transferOwner(applicationId: string, newOwnerEmployeeId: string) {
    const current = this.applications.get(applicationId);
    if (current === undefined) return null;
    const updated = { ...current, ownerEmployeeId: newOwnerEmployeeId };
    this.applications.set(applicationId, updated);
    return updated;
  }
  drafts = new Map<
    string,
    { draft: import("@ai-hub/contracts").ApplicationDraft; updatedAt: Date }
  >();
  async setMaintainers(
    applicationId: string,
    maintainerEmployeeIds: readonly string[],
  ) {
    const uniqueIds = [...new Set(maintainerEmployeeIds)];
    this.maintainers.set(applicationId, uniqueIds);
    const current = this.applications.get(applicationId);
    if (current !== undefined && uniqueIds.length > 0) {
      this.applications.set(applicationId, {
        ...current,
        maintainerEmployeeId: uniqueIds[0]!,
      });
    }
  }
  async listMaintainers(applicationId: string) {
    return this.maintainers.get(applicationId) ?? [];
  }
  async upsertDraft(
    applicationId: string,
    draft: import("@ai-hub/contracts").ApplicationDraft,
  ) {
    this.drafts.set(applicationId, { draft, updatedAt: new Date() });
  }
  async findDraft(applicationId: string) {
    return this.drafts.get(applicationId) ?? null;
  }
  async updateApplicationContent(
    applicationId: string,
    input: { name: string; summary: string },
  ) {
    const current = this.applications.get(applicationId);
    if (current !== undefined) {
      this.applications.set(applicationId, { ...current, ...input });
    }
  }
  async upsertCatalogMetadata(
    applicationId: string,
    input: { categoryId: string; applicationType: string },
  ) {
    this.catalogTypes.set(applicationId, input.applicationType);
  }
  async replaceTagLinks(_applicationId: string, _tagIds: readonly string[]) {
    // no-op in memory repository
  }
  async replaceAudiences(
    _applicationId: string,
    _audience: readonly import("@ai-hub/contracts").AudienceRule[],
  ) {
    // no-op in memory repository
  }
  snapshots = new Map<string, { payload: unknown; createdAt: Date }>();
  async snapshotVersionContent(applicationVersionId: string, payload: unknown) {
    this.snapshots.set(applicationVersionId, {
      payload,
      createdAt: new Date("2026-08-01T02:30:00.000Z"),
    });
  }
  async findVersionSnapshot(applicationVersionId: string) {
    return this.snapshots.get(applicationVersionId) ?? null;
  }
  async getApplicationType(applicationId: string) {
    return this.catalogTypes.get(applicationId) ?? null;
  }
  async createVersion(
    input: Omit<ApplicationVersionRecord, "createdAt" | "signed">,
  ) {
    const version: ApplicationVersionRecord = {
      ...input,
      signed: this.artifactSignedFor(input),
      createdAt: new Date(),
    };
    this.versions.set(version.applicationVersionId, version);
    return version;
  }
  async findVersion(id: string) {
    const version = this.versions.get(id) ?? null;
    return version === null
      ? null
      : { ...version, signed: this.artifactSignedFor(version) };
  }
  async listVersions(applicationId: string) {
    return [...this.versions.values()]
      .filter((version) => version.applicationId === applicationId)
      .map((version) => ({
        ...version,
        signed: this.artifactSignedFor(version),
      }));
  }

  /** 与生产 artifactSignedSubquery 一致的关联 upload signed 推导（含空字符串签名等同 NULL）。 */
  private artifactSignedFor(input: {
    applicationId: string;
    artifactKey: string | null;
    artifactSha256: string | null;
    artifactSignature: string | null;
  }): boolean | null {
    if (input.artifactKey === null || input.artifactSha256 === null)
      return null;
    const signature =
      input.artifactSignature === "" ? null : input.artifactSignature;
    const upload = [...this.uploads.values()].find(
      (candidate) =>
        candidate.applicationId === input.applicationId &&
        candidate.objectKey === input.artifactKey &&
        candidate.sha256 === input.artifactSha256 &&
        candidate.signature === signature &&
        candidate.uploadStatus === "completed" &&
        candidate.scanStatus === "passed",
    );
    if (upload === undefined) return null;
    return (
      upload.signed ??
      (upload.signature !== null && upload.signature.length > 0)
    );
  }
  async createArtifactUpload(
    input: Omit<ArtifactUploadRecord, "uploadId" | "createdAt" | "completedAt">,
  ) {
    const record: ArtifactUploadRecord = {
      ...input,
      uploadId: `upload-${this.nextId++}`,
      createdAt: new Date(),
      completedAt: null,
    };
    this.uploads.set(record.uploadId, record);
    return record;
  }
  async findArtifactUpload(uploadId: string) {
    return this.uploads.get(uploadId) ?? null;
  }
  async findVerifiedArtifact(input: {
    applicationId: string;
    objectKey: string;
    sha256: string;
    signature: string | null;
  }) {
    // 空字符串语义等同未签名（与 Kysely 实现一致）。
    const signature = input.signature === "" ? null : input.signature;
    return (
      [...this.uploads.values()].find(
        (upload) =>
          upload.applicationId === input.applicationId &&
          upload.objectKey === input.objectKey &&
          upload.sha256 === input.sha256 &&
          upload.signature === signature &&
          upload.uploadStatus === "completed" &&
          upload.scanStatus === "passed",
      ) ?? null
    );
  }
  async recordValidationCheck(input: {
    applicationVersionId: string;
    checkCode: string;
    label: string;
    status: "passed" | "safe" | "warning" | "info" | "failed";
    detail: string | null;
  }) {
    const existing = this.validationChecks.find(
      (check) =>
        check.applicationVersionId === input.applicationVersionId &&
        check.checkCode === input.checkCode,
    );
    if (existing === undefined) {
      this.validationChecks.push({
        validationCheckId: `check-${this.nextId++}`,
        createdAt: new Date(),
        ...input,
      });
    } else {
      Object.assign(existing, input);
    }
  }
  async listValidationChecks(applicationVersionId: string) {
    return this.validationChecks.filter(
      (check) => check.applicationVersionId === applicationVersionId,
    );
  }
  async updateArtifactUpload(
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
  ) {
    const current = this.uploads.get(uploadId);
    if (current === undefined) return null;
    const updated = { ...current, ...input };
    this.uploads.set(uploadId, updated);
    return updated;
  }
  async createAsset(input: Omit<AssetRecord, "assetId" | "createdAt">) {
    const record: AssetRecord = {
      ...input,
      assetId: `asset-${this.nextId++}`,
      createdAt: new Date(),
    };
    this.assets.set(record.assetId, record);
    return record;
  }
  async listAssets(applicationId: string) {
    return [...this.assets.values()].filter(
      (asset) => asset.applicationId === applicationId,
    );
  }
  async findAsset(assetId: string) {
    return this.assets.get(assetId) ?? null;
  }
  async deleteAsset(assetId: string) {
    this.assets.delete(assetId);
  }
  async setApplicationStatus(input: {
    applicationId: string;
    expectedStatus: ApplicationRecord["status"];
    status: ApplicationRecord["status"];
    currentVersionId?: string;
    pendingVersionId?: string | null;
  }) {
    const current = this.applications.get(input.applicationId);
    if (current === undefined) throw new Error("APPLICATION_NOT_FOUND");
    if (current.status !== input.expectedStatus) {
      throw new Error("APPLICATION_STATE_CONFLICT");
    }
    // 与 Kysely 实现一致：写入非空 pendingVersionId 时 CAS 要求当前没有 pending 版本。
    if (
      input.pendingVersionId !== undefined &&
      input.pendingVersionId !== null &&
      current.pendingVersionId !== null
    ) {
      throw new Error("REVIEW_ALREADY_PENDING");
    }
    const updated = {
      ...current,
      status: input.status,
      currentVersionId: input.currentVersionId ?? current.currentVersionId,
      pendingVersionId:
        input.pendingVersionId === undefined
          ? current.pendingVersionId
          : input.pendingVersionId,
    };
    this.applications.set(input.applicationId, updated);
    return updated;
  }
  async createDelivery(input: Omit<DeliveryRecord, "deliveryId">) {
    const delivery = { ...input, deliveryId: `delivery-${this.nextId++}` };
    this.deliveries.push(delivery);
    return delivery;
  }
  async listDeliveries(id: string) {
    return this.deliveries
      .filter((delivery) => delivery.applicationId === id)
      .map((delivery) => ({
        ...delivery,
        targets: this.deliveryTargets.filter(
          (target) => target.deliveryId === delivery.deliveryId,
        ),
      }));
  }
  async saveDeliveryTargets(
    deliveryId: string,
    targets: readonly DeliveryTarget[],
  ) {
    this.deliveryTargets = this.deliveryTargets.filter(
      (target) => target.deliveryId !== deliveryId,
    );
    for (const target of targets) {
      this.deliveryTargets.push({
        deliveryTargetId: `target-${this.nextId++}`,
        deliveryId,
        kind: target.kind,
        os: target.kind === "desktop" ? target.os : null,
        platform: target.kind === "desktop" ? null : target.platform,
        arch: target.kind === "miniprogram" ? null : (target.arch ?? null),
        appId: target.kind === "miniprogram" ? target.appId : null,
        qrCodeAssetId:
          target.kind === "miniprogram" ? target.qrCodeAssetId : null,
        versionNote: target.kind === "miniprogram" ? target.versionNote : null,
        enabled: target.kind === "miniprogram" ? target.enabled : true,
        createdAt: new Date(),
      });
    }
  }
  async listDeliveryTargets(deliveryId: string) {
    return this.deliveryTargets.filter(
      (target) => target.deliveryId === deliveryId,
    );
  }
  async createReview(input: Omit<ReviewRecord, "reviewId" | "createdAt">) {
    const review = {
      ...input,
      reviewId: `review-${this.nextId++}`,
      createdAt: new Date(),
    };
    this.reviews.push(review);
    return review;
  }
  async listReviews(id: string) {
    return this.reviews.filter((review) => review.applicationId === id);
  }
  async createReviewQueue(
    input: Omit<ReviewQueueRecord, "reviewQueueId" | "createdAt">,
  ) {
    const queue = {
      ...input,
      reviewQueueId: `queue-${this.nextId++}`,
      createdAt: new Date(),
    };
    this.reviewQueue.push(queue);
    return queue;
  }
  async findReviewQueueByVersion(id: string) {
    return (
      this.reviewQueue.find((queue) => queue.applicationVersionId === id) ??
      null
    );
  }
  async claimReviewQueue(id: string, employeeId: string) {
    const queue = this.reviewQueue.find(
      (candidate) => candidate.applicationVersionId === id,
    );
    if (queue === undefined || queue.status !== "available") {
      throw new Error("REVIEW_QUEUE_NOT_AVAILABLE");
    }
    const updated = {
      ...queue,
      status: "claimed" as const,
      claimedByEmployeeId: employeeId,
      claimedAt: new Date(),
    };
    this.reviewQueue[this.reviewQueue.indexOf(queue)] = updated;
    return updated;
  }
  async releaseReviewQueue(id: string, employeeId: string) {
    const queue = this.reviewQueue.find(
      (candidate) => candidate.applicationVersionId === id,
    );
    if (
      queue === undefined ||
      queue.claimedByEmployeeId !== employeeId ||
      queue.status !== "claimed"
    ) {
      throw new Error("REVIEW_QUEUE_CLAIM_REQUIRED");
    }
    const updated = {
      ...queue,
      status: "available" as const,
      claimedByEmployeeId: null,
      claimedAt: null,
    };
    this.reviewQueue[this.reviewQueue.indexOf(queue)] = updated;
    return updated;
  }
  async transferReviewQueue(id: string, employeeId: string) {
    const queue = this.reviewQueue.find(
      (candidate) => candidate.applicationVersionId === id,
    );
    if (queue === undefined || queue.status !== "claimed") {
      throw new Error("REVIEW_QUEUE_NOT_CLAIMED");
    }
    const updated = {
      ...queue,
      claimedByEmployeeId: employeeId,
      claimedAt: new Date(),
    };
    this.reviewQueue[this.reviewQueue.indexOf(queue)] = updated;
    return updated;
  }
  async listExpiredClaims(now: Date) {
    const cutoff = new Date(now.getTime() - CLAIM_HOLD_MS);
    return this.reviewQueue
      .filter(
        (queue) =>
          queue.status === "claimed" &&
          queue.claimedAt !== null &&
          queue.claimedAt < cutoff,
      )
      .map((queue) => ({
        applicationVersionId: queue.applicationVersionId,
        claimedByEmployeeId: queue.claimedByEmployeeId,
      }));
  }
  async completeReviewQueue(applicationVersionId: string) {
    const queue = this.reviewQueue.find(
      (candidate) => candidate.applicationVersionId === applicationVersionId,
    );
    if (queue === undefined) throw new Error("REVIEW_QUEUE_NOT_FOUND");
    const updated = { ...queue, status: "completed" as const };
    this.reviewQueue[this.reviewQueue.indexOf(queue)] = updated;
    return updated;
  }
  async deleteReviewQueue(applicationVersionId: string) {
    const index = this.reviewQueue.findIndex(
      (candidate) => candidate.applicationVersionId === applicationVersionId,
    );
    if (index >= 0) this.reviewQueue.splice(index, 1);
  }
  async recordAudit(input: { eventType: string }) {
    this.audits.push(input.eventType);
  }
  async emitOutbox(input: { eventType: string }) {
    if (this.failOutbox) throw new Error("OUTBOX_WRITE_FAILED");
    this.events.push(input.eventType);
  }
  async registerToCatalog(input: {
    applicationId: string;
    name: string;
    summary: string;
    categoryId?: string;
    applicationType?: string;
  }) {
    this.catalogRegistrations.push(input.applicationId);
  }
  async linkDeliveryAsset(input: {
    applicationId: string;
    channel: DeliveryChannel;
    assetId: string;
    sortOrder?: number;
    version?: string | null;
  }) {
    this.deliveryAssets.push(input);
  }
  async updateAsset(
    assetId: string,
    input: Partial<Pick<AssetRecord, "scanStatus" | "sha256" | "sizeBytes">>,
  ) {
    const asset = this.assets.get(assetId);
    if (asset === null) return null;
    const updated = { ...asset, ...input } as AssetRecord;
    this.assets.set(assetId, updated);
    return updated;
  }
}

const allowAll = async (): Promise<AuthorizationDecision> => ({
  allowed: true,
  reasonCode: "ALLOW_TEST",
});
const versionInput = {
  version: "1.0.0",
  changelog: "Initial release",
  artifactKey: "artifacts/app-1/1.0.0.zip",
  artifactSha256: "a".repeat(64),
  artifactSignature: "signature-1",
  scanStatus: "passed" as const,
};

function makeService(
  options: {
    webTargetPolicy?: WebTargetPolicy;
    resolveWebTargetHost?: ResolveHost;
    /** 二维码资产读取桩；未提供时 QR 校验 fail-closed（QR_VALIDATION_UNAVAILABLE）。 */
    objectStorage?: {
      get(key: string): Promise<Uint8Array | null>;
    };
  } = {},
) {
  const repository = new MemoryApplicationRepository();
  const analyticsEvents: string[] = [];
  const artifactVerifier = {
    async verifyArtifact(input: { signature: string; expectedSha256: string }) {
      if (input.signature === "reject") {
        return {
          accepted: false as const,
          scanStatus: "failed" as const,
          sha256: input.expectedSha256,
          reason: "MALWARE_DETECTED" as const,
        };
      }
      return {
        accepted: true as const,
        scanStatus: "passed" as const,
        sha256: input.expectedSha256,
      };
    },
  };
  const notificationCalls: Array<{
    scenario: string;
    recipientEmployeeId: string;
    aggregateId: string;
  }> = [];
  const notifications = {
    queue: async (
      _actor: ActorContext,
      scenario: string,
      input: {
        recipientEmployeeId: string;
        aggregateId: string;
        variables?: Readonly<Record<string, string | number>>;
      },
    ) => {
      notificationCalls.push({
        scenario,
        recipientEmployeeId: input.recipientEmployeeId,
        aggregateId: input.aggregateId,
      });
      return { notificationId: `notification-${notificationCalls.length}` };
    },
  };
  return {
    repository,
    service: new ApplicationService(
      repository,
      { authorize: allowAll },
      artifactVerifier,
      {
        record: async (
          _actor: ActorContext | null,
          input: BehaviorEventInput,
        ) => {
          analyticsEvents.push(input.eventName);
          return { inserted: true };
        },
      },
      notifications,
      // 默认宽松策略 + 确定性解析桩，避免既有用例依赖真实 DNS；
      // 白名单专项用例通过 makeService 传入严格策略覆盖。
      options.webTargetPolicy ?? PERMISSIVE_WEB_TARGET_POLICY,
      options.resolveWebTargetHost ??
        (async () => [{ address: "10.0.0.1", family: 4 }]),
      options.objectStorage,
    ),
    analyticsEvents,
    notificationCalls,
    notifications,
  };
}

function registerVerifiedUpload(
  repository: MemoryApplicationRepository,
  applicationId: string,
  input: {
    version: string;
    changelog: string;
    artifactKey: string;
    artifactSha256: string;
    artifactSignature: string | null;
    scanStatus: "passed";
    signed?: boolean;
  } = versionInput,
): void {
  repository.uploads.set(`verified-${applicationId}-${input.version}`, {
    uploadId: `verified-${applicationId}-${input.version}`,
    applicationId,
    uploadedByEmployeeId: owner.employeeId,
    objectKey: input.artifactKey,
    fileName: "artifact.zip",
    mimeType: "application/zip",
    sizeBytes: 1,
    kind: "artifact",
    sha256: input.artifactSha256,
    signature: input.artifactSignature,
    // 与生产语义一致：未显式指定时按签名推导，不默认 true。
    signed:
      input.signed ??
      (input.artifactSignature !== null && input.artifactSignature.length > 0),
    partCount: 1,
    uploadStatus: "completed",
    scanStatus: "passed",
    errorCode: null,
    expiresAt: new Date("2099-01-01"),
    completedAt: new Date(),
    createdAt: new Date(),
  });
}

async function configureAllDeliveryChannels(
  service: ApplicationService,
  applicationId: string,
): Promise<void> {
  for (const channel of ["web", "desktop", "mobile", "mini_program"] as const) {
    await service.configureDelivery(owner, applicationId, {
      channel,
      entryUrl: `https://${channel}.internal/apps/${applicationId}`,
      enabled: true,
    });
  }
}

function completeDraft(): import("@ai-hub/contracts").ApplicationDraft {
  return {
    name: "智能考勤助手",
    departmentId: "dept-rnd",
    // 注意：维护人不得自审（claimReview 会拒绝维护人认领），
    // 因此草稿维护人不能是下面测试中承担审核角色的 E200。
    maintainerEmployeeIds: ["E400"],
    categoryId: "productivity",
    applicationType: "web_app",
    tagIds: ["ai"],
    icon: {
      mode: "auto",
      backgroundColor: "#185FA5",
      text: "智",
      assetId: null,
    },
    screenshotAssetIds: ["asset-1"],
    summaryHtml: "<p>简介</p>",
    manualHtml: "<p>手册</p>",
    manualAssetId: null,
    examplesHtml: "<p>示例</p>",
    examplesAssetId: null,
    faq: [],
    audience: [
      {
        audienceType: "all",
        departmentId: null,
        employeeId: null,
        includeChildren: false,
      },
    ],
    risk: {
      handlesSensitiveData: false,
      sendsDataExternally: false,
      retainsConversations: false,
      retentionPeriod: null,
      modelProviders: ["local"],
      providerNote: null,
      affectsHighRiskDecisions: false,
      inputRestrictionDisclaimer: "请勿输入敏感信息",
    },
    deliveries: [
      {
        channel: "web",
        entryUrl: "https://apps.example.com",
        minClientVersion: null,
        enabled: true,
        assetIds: [],
      },
    ],
    version: "1.0.0",
    changelog: "首次发布",
  };
}
async function preparePublishedApplication(
  service: ApplicationService,
): Promise<{
  application: ApplicationRecord;
  version: ApplicationVersionRecord;
}> {
  const application = await service.createApplication(owner, {
    name: "Copilot",
    summary: "Internal assistant",
  });
  const version = await service.createVersion(
    owner,
    application.applicationId,
    versionInput,
  );
  // 自动上架门禁要求类型对应渠道齐全（§5.4），先配置再进入审核。
  await configureAllDeliveryChannels(service, application.applicationId);
  await service.submitForReview(owner, version.applicationVersionId);
  await service.claimReview(reviewer, version.applicationVersionId);
  // 首次发布审核通过即自动上架（自动 publish），无需手动 publish 步骤。
  await service.review(
    reviewer,
    version.applicationVersionId,
    "approve",
    "Approved",
  );
  return { application, version };
}

async function prepareLegacyApprovedApplication(
  service: ApplicationService,
  repository: MemoryApplicationRepository,
): Promise<{
  application: ApplicationRecord;
  version: ApplicationVersionRecord;
}> {
  const application = await service.createApplication(owner, {
    name: "Copilot",
    summary: "Internal assistant",
  });
  const version = await service.createVersion(
    owner,
    application.applicationId,
    versionInput,
  );
  await configureAllDeliveryChannels(service, application.applicationId);
  // 模拟自动上架上线前的历史数据：审核通过后应用停在 approved，等待责任人手动 publish。
  repository.applications.set(application.applicationId, {
    ...application,
    status: "approved",
    currentVersionId: null,
  });
  return { application, version };
}

async function createVersionFor(
  service: ApplicationService,
  repository: MemoryApplicationRepository,
  applicationId: string,
  version: string,
  changelog = `Release ${version}`,
): Promise<ApplicationVersionRecord> {
  const input = { ...versionInput, version, changelog };
  registerVerifiedUpload(repository, applicationId, input);
  return service.createVersion(owner, applicationId, input);
}

describe("ApplicationService", () => {
  it("keeps versions immutable and rejects duplicate version numbers", async () => {
    const { service } = makeService();
    const application = await service.createApplication(owner, {
      name: "Copilot",
      summary: "Internal assistant",
    });
    await service.createVersion(owner, application.applicationId, versionInput);
    await expect(
      service.createVersion(owner, application.applicationId, versionInput),
    ).rejects.toThrow("VERSION_ALREADY_EXISTS");
  });

  it("records auto-validation checks when creating a version from a verified artifact", async () => {
    const { service, repository } = makeService();
    const application = await service.createApplication(owner, {
      name: "Copilot",
      summary: "Internal assistant",
    });
    const version = await service.createVersion(
      owner,
      application.applicationId,
      versionInput,
    );

    const checks = repository.validationChecks.filter(
      (check) => check.applicationVersionId === version.applicationVersionId,
    );
    // 已签名制品：摘要 / 恶意软件扫描 / 签名三检查点全部通过。
    expect(checks.map((check) => check.checkCode)).toEqual([
      "artifact.digest",
      "artifact.malware_scan",
      "artifact.signature",
    ]);
    expect(checks.every((check) => check.status === "passed")).toBe(true);
    expect(
      checks.find((check) => check.checkCode === "artifact.digest")?.detail,
    ).toBe(versionInput.artifactSha256);
    await expect(
      repository.listValidationChecks(version.applicationVersionId),
    ).resolves.toHaveLength(3);
  });

  it("persists maintainer and department ownership fields", async () => {
    const { service } = makeService();
    const application = await service.createApplication(owner, {
      name: "Copilot",
      summary: "Internal assistant",
      maintainerEmployeeId: "E200",
      departmentId: "dept-platform",
    } as never);

    expect(application).toMatchObject({
      ownerEmployeeId: "E100",
      maintainerEmployeeId: "E200",
      departmentId: "dept-platform",
    });
  });

  it("limits application reads to owner, maintainer, or application managers", async () => {
    const { service } = makeService();
    const application = await service.createApplication(owner, {
      name: "Copilot",
      summary: "Internal assistant",
      maintainerEmployeeId: reviewer.employeeId,
    } as never);

    await expect(
      service.getApplication(application.applicationId, outsider),
    ).rejects.toThrow("APPLICATION_ACCESS_FORBIDDEN");
    await expect(
      service.listVersions(application.applicationId, outsider),
    ).rejects.toThrow("APPLICATION_ACCESS_FORBIDDEN");
    await expect(
      service.listDeliveries(application.applicationId, outsider),
    ).rejects.toThrow("APPLICATION_ACCESS_FORBIDDEN");
    await expect(
      service.listReviews(application.applicationId, outsider),
    ).rejects.toThrow("APPLICATION_ACCESS_FORBIDDEN");

    await expect(
      service.getApplication(application.applicationId, reviewer),
    ).resolves.toMatchObject({ applicationId: application.applicationId });
    await expect(
      service.getApplication(application.applicationId, {
        ...outsider,
        permissions: ["application.manage"],
      }),
    ).resolves.toMatchObject({ applicationId: application.applicationId });
  });

  it("does not create a version from rejected artifact verification", async () => {
    const { service, repository } = makeService();
    const application = await service.createApplication(owner, {
      name: "Copilot",
      summary: "Internal assistant",
    });

    await expect(
      service.createVersion(owner, application.applicationId, {
        ...versionInput,
        artifactSignature: "reject",
      } as never),
    ).rejects.toThrow("ARTIFACT_NOT_VERIFIED");
    expect(repository.versions).toHaveLength(0);
  });

  it("requires persistent completed and passed upload evidence", async () => {
    const { service, repository } = makeService();
    const application = await service.createApplication(owner, {
      name: "Copilot",
      summary: "Internal assistant",
    });
    const key = `verified-${application.applicationId}-${versionInput.version}`;
    repository.uploads.set(key, {
      ...repository.uploads.get(key)!,
      uploadStatus: "uploading",
      scanStatus: "pending",
    });

    await expect(
      service.createVersion(owner, application.applicationId, versionInput),
    ).rejects.toThrow("ARTIFACT_NOT_VERIFIED");
  });

  it("requires explicit acceptance for unsigned artifacts at version creation", async () => {
    const { service, repository } = makeService();
    const application = await service.createApplication(owner, {
      name: "Copilot",
      summary: "Internal assistant",
    });
    registerVerifiedUpload(repository, application.applicationId, {
      ...versionInput,
      artifactSignature: null,
      signed: false,
    });

    await expect(
      service.createVersion(owner, application.applicationId, {
        ...versionInput,
        artifactSignature: null,
      }),
    ).rejects.toThrow("UNSIGNED_ARTIFACT_REQUIRES_CONFIRMATION");
    expect(repository.versions).toHaveLength(0);

    const version = await service.createVersion(
      owner,
      application.applicationId,
      { ...versionInput, artifactSignature: null, acceptUnsigned: true },
    );
    expect(version).toBeDefined();
    // T8 承接：未签名制品在版本校验报告中显著标记为 warning。
    const checks = repository.validationChecks.filter(
      (check) => check.applicationVersionId === version.applicationVersionId,
    );
    expect(
      checks.find((check) => check.checkCode === "artifact.signature"),
    ).toMatchObject({
      status: "warning",
      detail: "未签名制品，需人工确认",
    });
  });

  it("rejects submitting an unsigned-artifact version for review without explicit acceptance", async () => {
    const { service, repository } = makeService();
    const application = await service.createApplication(owner, {
      name: "Copilot",
      summary: "Internal assistant",
    });
    registerVerifiedUpload(repository, application.applicationId, {
      ...versionInput,
      artifactSignature: null,
      signed: false,
    });
    const version = await service.createVersion(
      owner,
      application.applicationId,
      { ...versionInput, artifactSignature: null, acceptUnsigned: true },
    );

    await expect(
      service.submitForReview(owner, version.applicationVersionId),
    ).rejects.toThrow("UNSIGNED_ARTIFACT_REQUIRES_CONFIRMATION");
    await expect(
      service.submitForReview(owner, version.applicationVersionId, {
        acceptUnsigned: true,
      }),
    ).resolves.toBeDefined();
  });

  it("carries the artifact signed status on version list and workspace queries", async () => {
    const { service, repository } = makeService();
    const application = await service.createApplication(owner, {
      name: "Copilot",
      summary: "Internal assistant",
    });
    registerVerifiedUpload(repository, application.applicationId, {
      ...versionInput,
      artifactSignature: null,
      signed: false,
    });
    const unsignedVersion = await service.createVersion(
      owner,
      application.applicationId,
      { ...versionInput, artifactSignature: null, acceptUnsigned: true },
    );
    registerVerifiedUpload(repository, application.applicationId, {
      ...versionInput,
      version: "2.0.0",
      changelog: "Signed release",
      artifactSignature: "signature-2",
    });
    const signedVersion = await service.createVersion(
      owner,
      application.applicationId,
      {
        ...versionInput,
        version: "2.0.0",
        changelog: "Signed release",
        artifactSignature: "signature-2",
      },
    );

    const versions = await service.listVersions(application.applicationId);
    expect(
      versions
        .map(({ version, signed }) => ({ version, signed }))
        .sort((a, b) => a.version.localeCompare(b.version)),
    ).toEqual([
      { version: "1.0.0", signed: false },
      { version: "2.0.0", signed: true },
    ]);
    const workspace = await service.getWorkspace(application.applicationId);
    expect(
      workspace.versions.find(
        (v) => v.applicationVersionId === unsignedVersion.applicationVersionId,
      )?.signed,
    ).toBe(false);
    expect(
      workspace.versions.find(
        (v) => v.applicationVersionId === signedVersion.applicationVersionId,
      )?.signed,
    ).toBe(true);
    // 未签名版本的 submitted review 仍受 acceptUnsigned 门禁保护（前端确认后携带确认提交）。
    await expect(
      service.submitForReview(owner, unsignedVersion.applicationVersionId),
    ).rejects.toThrow("UNSIGNED_ARTIFACT_REQUIRES_CONFIRMATION");
  });

  it("returns the stored snapshot for a version", async () => {
    const { service, repository } = makeService();
    const application = await service.createApplication(owner, {
      name: "Copilot",
      summary: "Internal assistant",
    });
    const version = await service.createVersion(
      owner,
      application.applicationId,
      versionInput,
    );
    const payload = {
      name: "Copilot",
      version: "1.0.0",
      tagIds: ["tag-1", "tag-2"],
    };
    await repository.snapshotVersionContent(
      version.applicationVersionId,
      payload,
    );

    const snapshot = await service.getVersionSnapshot(
      owner,
      application.applicationId,
      version.applicationVersionId,
    );
    expect(snapshot.payload).toEqual(payload);
    expect(snapshot.createdAt).toBeInstanceOf(Date);
  });

  it("forbids reading a snapshot by a non-owner outsider", async () => {
    const { service, repository } = makeService();
    const application = await service.createApplication(owner, {
      name: "Copilot",
      summary: "Internal assistant",
    });
    const version = await service.createVersion(
      owner,
      application.applicationId,
      versionInput,
    );
    await repository.snapshotVersionContent(version.applicationVersionId, {
      name: "Copilot",
    });

    await expect(
      service.getVersionSnapshot(
        outsider,
        application.applicationId,
        version.applicationVersionId,
      ),
    ).rejects.toThrow("APPLICATION_ACCESS_FORBIDDEN");
    await expect(
      service.getVersionDiff(
        outsider,
        application.applicationId,
        version.applicationVersionId,
        version.applicationVersionId,
      ),
    ).rejects.toThrow("APPLICATION_ACCESS_FORBIDDEN");
  });

  it("rejects a version that belongs to another application", async () => {
    const { service, repository } = makeService();
    const first = await service.createApplication(owner, {
      name: "First",
      summary: "A",
    });
    const second = await service.createApplication(owner, {
      name: "Second",
      summary: "B",
    });
    const version = await service.createVersion(
      owner,
      first.applicationId,
      versionInput,
    );
    await repository.snapshotVersionContent(version.applicationVersionId, {
      name: "First",
    });

    await expect(
      service.getVersionSnapshot(
        owner,
        second.applicationId,
        version.applicationVersionId,
      ),
    ).rejects.toThrow("APPLICATION_VERSION_NOT_FOUND");
  });

  it("returns VERSION_SNAPSHOT_NOT_FOUND when no snapshot exists", async () => {
    const { service } = makeService();
    const application = await service.createApplication(owner, {
      name: "Copilot",
      summary: "Internal assistant",
    });
    const version = await service.createVersion(
      owner,
      application.applicationId,
      versionInput,
    );

    await expect(
      service.getVersionSnapshot(
        owner,
        application.applicationId,
        version.applicationVersionId,
      ),
    ).rejects.toThrow("VERSION_SNAPSHOT_NOT_FOUND");
    await expect(
      service.getVersionDiff(
        owner,
        application.applicationId,
        version.applicationVersionId,
        version.applicationVersionId,
      ),
    ).rejects.toThrow("VERSION_SNAPSHOT_NOT_FOUND");
  });

  it("computes a top-level field diff with changed, added and removed", async () => {
    const { service, repository } = makeService();
    const application = await service.createApplication(owner, {
      name: "Copilot",
      summary: "Internal assistant",
    });
    const fromVersion = await service.createVersion(
      owner,
      application.applicationId,
      { ...versionInput, version: "1.0.0" },
    );
    const toVersion = await service.createVersion(
      owner,
      application.applicationId,
      { ...versionInput, version: "2.0.0" },
    );
    const fromPayload = {
      name: "Copilot",
      version: "1.0.0",
      tagIds: ["a"],
      legacy: true,
      risk: { handlesSensitiveData: false },
    };
    const toPayload = {
      name: "Copilot 2",
      version: "2.0.0",
      tagIds: ["a", "b"],
      risk: { handlesSensitiveData: true },
      newField: 42,
    };
    await repository.snapshotVersionContent(
      fromVersion.applicationVersionId,
      fromPayload,
    );
    await repository.snapshotVersionContent(
      toVersion.applicationVersionId,
      toPayload,
    );

    const diff = await service.getVersionDiff(
      owner,
      application.applicationId,
      fromVersion.applicationVersionId,
      toVersion.applicationVersionId,
    );
    // 结果按字段名排序：name → risk → tagIds → version
    expect(diff.changed).toEqual([
      { field: "name", from: "Copilot", to: "Copilot 2" },
      {
        field: "risk",
        from: { handlesSensitiveData: false },
        to: { handlesSensitiveData: true },
      },
      { field: "tagIds", from: ["a"], to: ["a", "b"] },
      { field: "version", from: "1.0.0", to: "2.0.0" },
    ]);
    expect(diff.added).toEqual([{ field: "newField", value: 42 }]);
    expect(diff.removed).toEqual([{ field: "legacy", value: true }]);
  });

  it("returns an empty diff for identical snapshots", async () => {
    const { service, repository } = makeService();
    const application = await service.createApplication(owner, {
      name: "Copilot",
      summary: "Internal assistant",
    });
    const fromVersion = await service.createVersion(
      owner,
      application.applicationId,
      { ...versionInput, version: "1.0.0" },
    );
    const toVersion = await service.createVersion(
      owner,
      application.applicationId,
      { ...versionInput, version: "2.0.0" },
    );
    const payload = { name: "Copilot", version: "1.0.0" };
    await repository.snapshotVersionContent(
      fromVersion.applicationVersionId,
      payload,
    );
    await repository.snapshotVersionContent(
      toVersion.applicationVersionId,
      payload,
    );

    const diff = await service.getVersionDiff(
      owner,
      application.applicationId,
      fromVersion.applicationVersionId,
      toVersion.applicationVersionId,
    );
    expect(diff).toEqual({ changed: [], added: [], removed: [] });
  });

  it("creates and claims a review queue item with an SLA notification", async () => {
    const { service, repository } = makeService();
    const application = await service.createApplication(owner, {
      name: "Copilot",
      summary: "Internal assistant",
    });
    const version = await service.createVersion(
      owner,
      application.applicationId,
      versionInput,
    );
    await service.submitForReview(owner, version.applicationVersionId);

    const queue = await (
      service as unknown as {
        claimReview: (
          actor: ActorContext,
          versionId: string,
        ) => Promise<unknown>;
      }
    ).claimReview(reviewer, version.applicationVersionId);

    expect(queue).toMatchObject({
      applicationVersionId: version.applicationVersionId,
      status: "claimed",
      claimedByEmployeeId: "E200",
    });
    expect(repository.events).toContain("application.review.requested");
    expect(repository.events).toContain("application.review.claimed");
    await expect(
      service.getReviewQueue(version.applicationVersionId),
    ).resolves.toMatchObject({ slaStatus: "on_time" });
  });

  it("auto-publishes a first-time approved application", async () => {
    const { service, repository } = makeService();
    const application = await service.createApplication(owner, {
      name: "Copilot",
      summary: "Internal assistant",
    });
    const version = await service.createVersion(
      owner,
      application.applicationId,
      versionInput,
    );
    // 自动上架要求类型对应渠道齐全（§5.4），先配置再提交审核。
    await configureAllDeliveryChannels(service, application.applicationId);
    await service.submitForReview(owner, version.applicationVersionId);
    await service.claimReview(reviewer, version.applicationVersionId);

    // draft 应用提交 → 管理员 approve → 应用 status 直接 published（不再等待手动 publish）
    const result = await service.review(
      reviewer,
      version.applicationVersionId,
      "approve",
      "ok",
    );

    expect(result.status).toBe("published");
    expect(result.currentVersionId).toBe(version.applicationVersionId);
    // 自动上架：目录注册与发布事件在审核事务内完成（等同原 publish 的效果）。
    expect(repository.catalogRegistrations).toEqual([
      application.applicationId,
    ]);
    expect(repository.events).toContain("application.published");
    expect(repository.events).toContain("application.reviewed");
    // 审核队列仍被关闭，无残留。
    await expect(
      service.getReviewQueue(version.applicationVersionId),
    ).resolves.toMatchObject({ status: "completed" });
  });

  it("rejects auto-publish approval when delivery channels are incomplete", async () => {
    const { service, repository } = makeService();
    const application = await service.createApplication(owner, {
      name: "Copilot",
      summary: "Internal assistant",
    });
    const version = await service.createVersion(
      owner,
      application.applicationId,
      versionInput,
    );
    await service.submitForReview(owner, version.applicationVersionId);
    await service.claimReview(reviewer, version.applicationVersionId);

    // 全程零交付配置 → approve 必须被拒绝（§5.4 类型对应渠道完整性），
    // 应用保持非 published，事务整体回滚。
    await expect(
      service.review(reviewer, version.applicationVersionId, "approve", "ok"),
    ).rejects.toThrow("DELIVERY_CHANNELS_INCOMPLETE");
    await expect(
      service.getApplication(application.applicationId),
    ).resolves.toMatchObject({
      status: "in_review",
      currentVersionId: null,
    });
    expect(repository.catalogRegistrations).toHaveLength(0);
    expect(repository.events).not.toContain("application.published");
  });

  it("moves a scanned version through review, auto-publication, withdrawal, and archive", async () => {
    const { service, repository, analyticsEvents } = makeService();
    const application = await service.createApplication(owner, {
      name: "Copilot",
      summary: "Internal assistant",
    });
    const version = await service.createVersion(
      owner,
      application.applicationId,
      versionInput,
    );
    // 自动上架要求类型对应渠道齐全（§5.4），先配置再提交审核。
    await configureAllDeliveryChannels(service, application.applicationId);
    await service.submitForReview(owner, version.applicationVersionId);
    await service.claimReview(reviewer, version.applicationVersionId);
    const reviewed = await service.review(
      reviewer,
      version.applicationVersionId,
      "approve",
      "Looks good",
    );
    expect(analyticsEvents).toContain("review_decided");
    // 首次发布审核通过即自动上架：无需手动 publish，应用直接 published。
    expect(reviewed).toMatchObject({
      status: "published",
      currentVersionId: version.applicationVersionId,
    });
    expect(repository.catalogRegistrations).toEqual([
      application.applicationId,
    ]);
    await service.withdraw(owner, application.applicationId, "superseded");
    await service.archive(owner, application.applicationId);
    await expect(
      service.getApplication(application.applicationId),
    ).resolves.toMatchObject({
      status: "archived",
      currentVersionId: version.applicationVersionId,
    });
    expect(repository.audits).toEqual([
      "application.created",
      "application.version.created",
      "application.delivery.configured",
      "application.delivery.configured",
      "application.delivery.configured",
      "application.delivery.configured",
      "application.submitted",
      "application.review.requested",
      "application.review.sla.created",
      "application.review.claimed",
      "application.reviewed",
      "application.published",
      "application.withdrawn",
      "application.archived",
    ]);
    expect(repository.events).toHaveLength(14);
  });

  it("allows creating a new version from archived or withdrawn applications for recovery", async () => {
    const { service, repository } = makeService();
    const { application } = await preparePublishedApplication(service);
    await service.withdraw(owner, application.applicationId, "superseded");
    const withdrawn = await createVersionFor(
      service,
      repository,
      application.applicationId,
      "2.0.0",
    );
    expect(withdrawn).toBeDefined();
    await service.archive(owner, application.applicationId);
    const archived = await createVersionFor(
      service,
      repository,
      application.applicationId,
      "3.0.0",
    );
    expect(archived).toBeDefined();
    expect(repository.versions.size).toBe(3);
  });

  it("restores an archived application to published after recovery review approval", async () => {
    const { service, repository } = makeService();
    const { application } = await preparePublishedApplication(service);
    await service.withdraw(owner, application.applicationId, "superseded");
    await service.archive(owner, application.applicationId);
    const recovered = await createVersionFor(
      service,
      repository,
      application.applicationId,
      "2.0.0",
    );
    await service.submitForReview(owner, recovered.applicationVersionId);
    await service.claimReview(reviewer, recovered.applicationVersionId);

    // 恢复路径审核通过直接 published（复用 T6 自动上架逻辑：registerToCatalog upsert 幂等）。
    const result = await service.review(
      reviewer,
      recovered.applicationVersionId,
      "approve",
      "恢复上架",
    );

    expect(result.status).toBe("published");
    expect(result.currentVersionId).toBe(recovered.applicationVersionId);
    expect(repository.catalogRegistrations).toContain(
      application.applicationId,
    );
    expect(repository.events).toContain("application.published");
  });

  it("allows a maintainer to request withdrawal with audit and notification", async () => {
    const { service, repository, notificationCalls } = makeService();
    const application = await service.createApplication(owner, {
      name: "Copilot",
      summary: "Internal assistant",
      maintainerEmployeeId: "E400",
    } as never);
    const version = await service.createVersion(
      owner,
      application.applicationId,
      versionInput,
    );
    await configureAllDeliveryChannels(service, application.applicationId);
    await service.submitForReview(owner, version.applicationVersionId);
    await service.claimReview(reviewer, version.applicationVersionId);
    await service.review(
      reviewer,
      version.applicationVersionId,
      "approve",
      "Approved",
    );
    const maintainer: ActorContext = { ...outsider, employeeId: "E400" };

    await expect(
      service.requestWithdraw(
        maintainer,
        application.applicationId,
        "应用已停止维护",
      ),
    ).resolves.toBeUndefined();

    expect(repository.audits).toContain("application.withdraw.requested");
    expect(repository.events).toContain("application.withdraw.requested");
    expect(notificationCalls).toEqual([
      {
        scenario: "application.withdraw.requested",
        recipientEmployeeId: "E100",
        aggregateId: application.applicationId,
      },
    ]);
  });

  it("keeps the withdraw-request audit when the notification queue fails", async () => {
    const { service, repository, notifications } = makeService();
    const application = await service.createApplication(owner, {
      name: "Copilot",
      summary: "Internal assistant",
      maintainerEmployeeId: "E400",
    } as never);
    const version = await service.createVersion(
      owner,
      application.applicationId,
      versionInput,
    );
    await configureAllDeliveryChannels(service, application.applicationId);
    await service.submitForReview(owner, version.applicationVersionId);
    await service.claimReview(reviewer, version.applicationVersionId);
    await service.review(
      reviewer,
      version.applicationVersionId,
      "approve",
      "Approved",
    );
    // 通知端口失败（如生产 notification.create 权限缺失）不得回滚业务：
    // 审计在事务内已提交，规格 §5.8「外部通知失败不回滚业务操作」。
    notifications.queue = async () => {
      throw new Error("NOT_AUTHORIZED");
    };

    await expect(
      service.requestWithdraw(
        { ...outsider, employeeId: "E400" },
        application.applicationId,
        "应用已停止维护",
      ),
    ).resolves.toBeUndefined();

    expect(repository.audits).toContain("application.withdraw.requested");
    expect(repository.events).toContain("application.withdraw.requested");
  });

  it("rejects withdraw requests from non-maintainers, non-published apps, or without a reason", async () => {
    const { service, repository } = makeService();
    const application = await service.createApplication(owner, {
      name: "Copilot",
      summary: "Internal assistant",
      maintainerEmployeeId: "E400",
    } as never);
    const version = await service.createVersion(
      owner,
      application.applicationId,
      versionInput,
    );
    await configureAllDeliveryChannels(service, application.applicationId);
    await service.submitForReview(owner, version.applicationVersionId);
    await service.claimReview(reviewer, version.applicationVersionId);
    await service.review(
      reviewer,
      version.applicationVersionId,
      "approve",
      "Approved",
    );

    // 非维护人/责任人不得申请。
    await expect(
      service.requestWithdraw(outsider, application.applicationId, "stop"),
    ).rejects.toThrow("APPLICATION_MAINTAINER_REQUIRED");
    // 空白原因必须被拒绝（应用仍为 published）。
    await expect(
      service.requestWithdraw(
        { ...outsider, employeeId: "E400" },
        application.applicationId,
        "   ",
      ),
    ).rejects.toThrow("WITHDRAW_REASON_REQUIRED");
    // 未发布应用不得申请下架。
    await service.withdraw(owner, application.applicationId, "stop");
    await expect(
      service.requestWithdraw(owner, application.applicationId, "stop"),
    ).rejects.toThrow("INVALID_APPLICATION_TRANSITION");
    expect(repository.events).not.toContain("application.withdraw.requested");
  });

  it("requires all four delivery channels before publication", async () => {
    const { service, repository } = makeService();
    // 手动 publish 仅兼容自动上架上线前的历史数据（审核通过后停在 approved）。
    const { version } = await prepareLegacyApprovedApplication(
      service,
      repository,
    );
    repository.deliveries.length = 0;

    await expect(
      service.publish(owner, version.applicationVersionId),
    ).rejects.toThrow("DELIVERY_CHANNELS_INCOMPLETE");
  });

  it("rejects a web delivery whose entry URL is not allowlisted", async () => {
    // 规格 §11.3：web 渠道入口必须命中内网白名单，被拒绝的 URL 不落库。
    const strictPolicy: WebTargetPolicy = {
      protocols: ["https"],
      allowedHostnames: ["apps.internal.example.com"],
      allowedPorts: [443],
      allowedCidrs: ["10.0.0.0/8"],
    };
    const { service, repository } = makeService({
      webTargetPolicy: strictPolicy,
    });
    const application = await service.createApplication(owner, {
      name: "白名单应用",
      summary: "校验入口 URL",
    });

    await expect(
      service.configureDelivery(owner, application.applicationId, {
        channel: "web",
        entryUrl: "https://evil.example.net/dashboard",
        enabled: true,
      }),
    ).rejects.toThrow("WEB_URL_HOST_NOT_ALLOWED");
    expect(repository.deliveries).toHaveLength(0);
  });

  it("rejects a web delivery resolving outside the allowed CIDRs", async () => {
    const strictPolicy: WebTargetPolicy = {
      protocols: ["https"],
      allowedHostnames: ["apps.internal.example.com"],
      allowedPorts: [443],
      allowedCidrs: ["10.0.0.0/8"],
    };
    const { service } = makeService({
      webTargetPolicy: strictPolicy,
      resolveWebTargetHost: async () => [{ address: "203.0.113.9", family: 4 }],
    });
    const application = await service.createApplication(owner, {
      name: "白名单应用",
      summary: "校验解析网段",
    });

    await expect(
      service.configureDelivery(owner, application.applicationId, {
        channel: "web",
        entryUrl: "https://apps.internal.example.com/dashboard",
        enabled: true,
      }),
    ).rejects.toThrow("WEB_URL_CIDR_NOT_ALLOWED");
  });

  it("accepts an allowlisted web delivery entry URL", async () => {
    const strictPolicy: WebTargetPolicy = {
      protocols: ["https"],
      allowedHostnames: ["apps.internal.example.com"],
      allowedPorts: [443],
      allowedCidrs: ["10.0.0.0/8"],
    };
    const { service, repository } = makeService({
      webTargetPolicy: strictPolicy,
    });
    const application = await service.createApplication(owner, {
      name: "白名单应用",
      summary: "放行内网入口",
    });

    const delivery = await service.configureDelivery(
      owner,
      application.applicationId,
      {
        channel: "web",
        entryUrl: "https://apps.internal.example.com/ocr",
        enabled: true,
      },
    );
    expect(delivery.entryUrl).toBe("https://apps.internal.example.com/ocr");
    expect(repository.deliveries).toHaveLength(1);
  });

  it("does not apply the web allowlist to non-web channels or empty URLs", async () => {
    const strictPolicy: WebTargetPolicy = {
      protocols: ["https"],
      allowedHostnames: ["apps.internal.example.com"],
      allowedPorts: [443],
      allowedCidrs: ["10.0.0.0/8"],
    };
    const { service, repository } = makeService({
      webTargetPolicy: strictPolicy,
    });
    const application = await service.createApplication(owner, {
      name: "白名单应用",
      summary: "非 web 渠道不套用白名单",
    });

    // desktop 的入口可以是外部下载地址，不套用内网 Web 白名单。
    const desktop = await service.configureDelivery(
      owner,
      application.applicationId,
      {
        channel: "desktop",
        entryUrl: "https://cdn.example.com/download.exe",
        enabled: true,
      },
    );
    expect(desktop.channel).toBe("desktop");
    // 空 URL 视为尚未配置入口，跳过校验。
    const web = await service.configureDelivery(
      owner,
      application.applicationId,
      {
        channel: "web",
        entryUrl: "",
        enabled: false,
      },
    );
    expect(web.entryUrl).toBe("");
    expect(repository.deliveries).toHaveLength(2);
  });

  it("saves desktop OS metadata targets and rejects mismatched target kinds", async () => {
    const { service, repository } = makeService();
    const application = await service.createApplication(owner, {
      name: "桌面应用",
      summary: "OS 元数据",
    });

    const delivery = await service.configureDelivery(
      owner,
      application.applicationId,
      {
        channel: "desktop",
        entryUrl: "https://cdn.example.com/download.exe",
        enabled: true,
        targets: [{ kind: "desktop", os: "windows", arch: "x64" }],
      },
    );
    const saved = await repository.listDeliveryTargets(delivery.deliveryId);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      kind: "desktop",
      os: "windows",
      arch: "x64",
      enabled: true,
    });

    // 渠道与目标类型不匹配 → 拒绝落库。
    await expect(
      service.configureDelivery(owner, application.applicationId, {
        channel: "desktop",
        entryUrl: "https://cdn.example.com/download.dmg",
        enabled: true,
        targets: [{ kind: "mobile", platform: "android", arch: null }],
      }),
    ).rejects.toThrow("DELIVERY_TARGET_INVALID");
  });

  it("rejects targets on the web channel", async () => {
    const { service } = makeService();
    const application = await service.createApplication(owner, {
      name: "Web 应用",
      summary: "web 渠道不支持 targets",
    });
    await expect(
      service.configureDelivery(owner, application.applicationId, {
        channel: "web",
        entryUrl: "",
        enabled: true,
        targets: [{ kind: "desktop", os: "windows", arch: null }],
      }),
    ).rejects.toThrow("DELIVERY_TARGETS_NOT_ALLOWED");
  });

  it("validates mini program qr content on save and backfills appId", async () => {
    const qrPng = await readFile(
      new URL("./fixtures/miniapp-qr-wechat.png", import.meta.url),
    );
    const { service, repository } = makeService({
      objectStorage: {
        get: async (key: string) =>
          key === "qr/wechat.png" ? new Uint8Array(qrPng) : null,
      },
    });
    const application = await service.createApplication(owner, {
      name: "小程序应用",
      summary: "二维码校验",
    });
    const asset = await repository.createAsset({
      applicationId: application.applicationId,
      applicationVersionId: null,
      assetType: "qr",
      name: "wechat-qr.png",
      storageKey: "qr/wechat.png",
      mimeType: "image/png",
      sizeBytes: qrPng.length,
      sortOrder: 0,
      sha256: null,
      scanStatus: "passed",
      uploadedByEmployeeId: owner.employeeId,
    });

    const delivery = await service.configureDelivery(
      owner,
      application.applicationId,
      {
        channel: "mini_program",
        entryUrl: "",
        enabled: true,
        targets: [
          {
            kind: "miniprogram",
            platform: "wechat",
            appId: "",
            qrCodeAssetId: asset.assetId,
            versionNote: null,
            enabled: true,
          },
        ],
      },
    );
    const saved = await repository.listDeliveryTargets(delivery.deliveryId);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      kind: "miniprogram",
      platform: "wechat",
      qrCodeAssetId: asset.assetId,
      enabled: true,
    });
    // appId 为空时回填二维码解析出的目标标识。
    expect(saved[0]?.appId).toBe("wxa://gh_abcdef1234567890");
  });

  it("rejects mini program qr content that is not a valid target", async () => {
    const badPng = await readFile(
      new URL("./fixtures/not-a-miniapp-qr.png", import.meta.url),
    );
    const { service, repository } = makeService({
      objectStorage: { get: async () => new Uint8Array(badPng) },
    });
    const application = await service.createApplication(owner, {
      name: "小程序应用",
      summary: "二维码内容校验",
    });
    const asset = await repository.createAsset({
      applicationId: application.applicationId,
      applicationVersionId: null,
      assetType: "qr",
      name: "bad-qr.png",
      storageKey: "qr/bad.png",
      mimeType: "image/png",
      sizeBytes: badPng.length,
      sortOrder: 0,
      sha256: null,
      scanStatus: "passed",
      uploadedByEmployeeId: owner.employeeId,
    });
    await expect(
      service.configureDelivery(owner, application.applicationId, {
        channel: "mini_program",
        entryUrl: "",
        enabled: true,
        targets: [
          {
            kind: "miniprogram",
            platform: "wechat",
            appId: "wx-app-id",
            qrCodeAssetId: asset.assetId,
            versionNote: null,
            enabled: true,
          },
        ],
      }),
    ).rejects.toThrow("QR_TARGET_FORMAT_INVALID");
  });

  it("rejects mini program targets referencing missing or foreign assets", async () => {
    const { service } = makeService();
    const application = await service.createApplication(owner, {
      name: "小程序应用",
      summary: "资产存在性",
    });
    await expect(
      service.configureDelivery(owner, application.applicationId, {
        channel: "mini_program",
        entryUrl: "",
        enabled: true,
        targets: [
          {
            kind: "miniprogram",
            platform: "wechat",
            appId: "wx-app-id",
            qrCodeAssetId: "missing-asset",
            versionNote: null,
            enabled: true,
          },
        ],
      }),
    ).rejects.toThrow("DELIVERY_TARGET_ASSET_NOT_FOUND");
  });

  it("rejects auto-publish when the mini_program channel has no targets", async () => {
    const { service, repository } = makeService();
    const application = await service.createApplication(owner, {
      name: "小程序应用",
      summary: "目标完整性门禁",
    });
    repository.catalogTypes.set(application.applicationId, "mini_program");
    const version = await createVersionFor(
      service,
      repository,
      application.applicationId,
      "1.0.0",
    );
    // 小程序渠道启用但未配置任何目标 → approve 必须被拒绝。
    await service.configureDelivery(owner, application.applicationId, {
      channel: "mini_program",
      entryUrl: "",
      enabled: true,
    });
    await service.submitForReview(owner, version.applicationVersionId);
    await service.claimReview(reviewer, version.applicationVersionId);

    await expect(
      service.review(reviewer, version.applicationVersionId, "approve", "ok"),
    ).rejects.toThrow("DELIVERY_TARGETS_INCOMPLETE");
    expect(repository.events).not.toContain("application.published");
  });

  it("exempts legacy applications without catalog metadata from the target gate", async () => {
    // 有意的历史兼容豁免（非漏洞）：typeKnown === false 仅覆盖缺少
    // application_catalog_metadata 的存量应用；新应用创建即写类型
    // （upsertCatalogMetadata / registerToCatalog 以 web_app 兜底）必受
    // 目标门禁约束。未知类型分支仍要求四个渠道全部启用（比已知类型更严），
    // 只是不额外要求 mini_program target。
    const { service, repository } = makeService();
    const application = await service.createApplication(owner, {
      name: "存量应用（无 catalog metadata）",
      summary: "历史兼容豁免",
    });
    // 刻意不写 catalogTypes：模拟 0037 迁移前的存量数据。
    const version = await createVersionFor(
      service,
      repository,
      application.applicationId,
      "1.0.0",
    );
    // 四个渠道全部启用，mini_program 无 target → 仍应通过门禁自动上架。
    await configureAllDeliveryChannels(service, application.applicationId);
    await service.submitForReview(owner, version.applicationVersionId);
    await service.claimReview(reviewer, version.applicationVersionId);

    const result = await service.review(
      reviewer,
      version.applicationVersionId,
      "approve",
      "ok",
    );
    expect(result.status).toBe("published");
    expect(repository.events).toContain("application.published");
  });

  it("auto-publishes a mini_program application with a qr target configured", async () => {
    const qrPng = await readFile(
      new URL("./fixtures/miniapp-qr-wechat.png", import.meta.url),
    );
    const { service, repository } = makeService({
      objectStorage: {
        get: async (key: string) =>
          key === "qr/wechat.png" ? new Uint8Array(qrPng) : null,
      },
    });
    const application = await service.createApplication(owner, {
      name: "小程序应用",
      summary: "完整发布闭环",
    });
    repository.catalogTypes.set(application.applicationId, "mini_program");
    const asset = await repository.createAsset({
      applicationId: application.applicationId,
      applicationVersionId: null,
      assetType: "qr",
      name: "wechat-qr.png",
      storageKey: "qr/wechat.png",
      mimeType: "image/png",
      sizeBytes: qrPng.length,
      sortOrder: 0,
      sha256: null,
      scanStatus: "passed",
      uploadedByEmployeeId: owner.employeeId,
    });
    await service.configureDelivery(owner, application.applicationId, {
      channel: "mini_program",
      entryUrl: "",
      enabled: true,
      targets: [
        {
          kind: "miniprogram",
          platform: "wechat",
          appId: "wx-app-id",
          qrCodeAssetId: asset.assetId,
          versionNote: "v1.0.0",
          enabled: true,
        },
      ],
    });
    const version = await createVersionFor(
      service,
      repository,
      application.applicationId,
      "1.0.0",
    );
    await service.submitForReview(owner, version.applicationVersionId);
    await service.claimReview(reviewer, version.applicationVersionId);

    const result = await service.review(
      reviewer,
      version.applicationVersionId,
      "approve",
      "ok",
    );
    expect(result.status).toBe("published");
    expect(repository.events).toContain("application.published");
  });

  it("allows only one concurrent publication through expected-state CAS", async () => {
    const { service, repository } = makeService();
    const { application, version } = await prepareLegacyApprovedApplication(
      service,
      repository,
    );

    const results = await Promise.allSettled([
      service.publish(owner, version.applicationVersionId),
      service.publish(owner, version.applicationVersionId),
    ]);

    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected).toMatchObject({
      status: "rejected",
      reason: expect.objectContaining({
        message: "APPLICATION_STATE_CONFLICT",
      }),
    });
    expect(repository.catalogRegistrations).toEqual([
      application.applicationId,
    ]);
    expect(
      repository.events.filter((event) => event === "application.published"),
    ).toHaveLength(1);
  });

  it("rolls back lifecycle state, catalog registration and audit when Outbox fails", async () => {
    const { service, repository } = makeService();
    const { application, version } = await prepareLegacyApprovedApplication(
      service,
      repository,
    );
    repository.failOutbox = true;

    await expect(
      service.publish(owner, version.applicationVersionId),
    ).rejects.toThrow("OUTBOX_WRITE_FAILED");
    await expect(
      service.getApplication(application.applicationId),
    ).resolves.toMatchObject({ status: "approved", currentVersionId: null });
    expect(repository.catalogRegistrations).toHaveLength(0);
    expect(repository.audits).not.toContain("application.published");
    expect(repository.events).not.toContain("application.published");
  });

  it("rejects self-review and publication before approval", async () => {
    const { service } = makeService();
    const application = await service.createApplication(owner, {
      name: "Copilot",
      summary: "Internal assistant",
    });
    const version = await service.createVersion(
      owner,
      application.applicationId,
      versionInput,
    );
    await expect(
      service.publish(owner, version.applicationVersionId),
    ).rejects.toThrow("INVALID_APPLICATION_TRANSITION");
    await service.submitForReview(owner, version.applicationVersionId);
    await expect(
      service.review(owner, version.applicationVersionId, "approve", "self"),
    ).rejects.toThrow("SELF_REVIEW_FORBIDDEN");
  });

  it("rejects a review without a required comment for reject decision", async () => {
    const { service, repository } = makeService();
    const application = await service.createApplication(owner, {
      name: "Copilot",
      summary: "Internal assistant",
    });
    const version = await service.createVersion(
      owner,
      application.applicationId,
      versionInput,
    );
    await service.submitForReview(owner, version.applicationVersionId);
    await service.claimReview(reviewer, version.applicationVersionId);

    // 空白原因（含纯空白）必须被拒绝；审核事务不得写入任何结论。
    await expect(
      service.review(reviewer, version.applicationVersionId, "reject", "   "),
    ).rejects.toThrow("REVIEW_COMMENT_REQUIRED");
    await expect(
      service.review(
        reviewer,
        version.applicationVersionId,
        "request_changes",
        "",
      ),
    ).rejects.toThrow("REVIEW_COMMENT_REQUIRED");
    expect(repository.reviews).toHaveLength(0);
  });

  it("bans maintainers from self-review", async () => {
    const { service, repository } = makeService();
    const application = await service.createApplication(owner, {
      name: "Copilot",
      summary: "Internal assistant",
    });
    // 草稿维护人列表中的员工（与 submitDraft 快照一致）不得认领本应用审核。
    await service.saveDraft(owner, application.applicationId, {
      ...completeDraft(),
      maintainerEmployeeIds: [reviewer.employeeId],
    });
    await service.submitDraft(owner, application.applicationId);
    const [version] = [...repository.versions.values()];

    await expect(
      service.claimReview(reviewer, version!.applicationVersionId),
    ).rejects.toThrow("SELF_REVIEW_FORBIDDEN");
  });

  it("bans the legacy single maintainer from claiming review", async () => {
    const { service } = makeService();
    const application = await service.createApplication(owner, {
      name: "Copilot",
      summary: "Internal assistant",
      maintainerEmployeeId: reviewer.employeeId,
    } as never);
    const version = await service.createVersion(
      owner,
      application.applicationId,
      versionInput,
    );
    await service.submitForReview(owner, version.applicationVersionId);

    await expect(
      service.claimReview(reviewer, version.applicationVersionId),
    ).rejects.toThrow("SELF_REVIEW_FORBIDDEN");
    // 非维护人的审核员仍可认领。
    await expect(
      service.claimReview(outsider, version.applicationVersionId),
    ).resolves.toMatchObject({ status: "claimed" });
  });

  it("lets a super admin transfer a claimed review task", async () => {
    const { service, repository } = makeService();
    const application = await service.createApplication(owner, {
      name: "Copilot",
      summary: "Internal assistant",
    });
    const version = await service.createVersion(
      owner,
      application.applicationId,
      versionInput,
    );
    await service.submitForReview(owner, version.applicationVersionId);
    await service.claimReview(reviewer, version.applicationVersionId);

    const transferred = await service.transferReviewTask(
      superAdmin,
      version.applicationVersionId,
      "E300",
    );

    expect(transferred.claimedByEmployeeId).toBe("E300");
    expect(transferred.status).toBe("claimed");
    expect(repository.events).toContain("application.review.transferred");
    // 转交后新认领人可以直接出结论（首次发布自动上架需先配齐交付渠道）。
    await configureAllDeliveryChannels(service, application.applicationId);
    await expect(
      service.review(
        { ...outsider, employeeId: "E300" },
        version.applicationVersionId,
        "approve",
        "ok",
      ),
    ).resolves.toMatchObject({ status: "published" });
  });

  it("rejects review transfer by non-super-admins", async () => {
    const { service } = makeService();
    const application = await service.createApplication(owner, {
      name: "Copilot",
      summary: "Internal assistant",
    });
    const version = await service.createVersion(
      owner,
      application.applicationId,
      versionInput,
    );
    await service.submitForReview(owner, version.applicationVersionId);
    await service.claimReview(reviewer, version.applicationVersionId);

    await expect(
      service.transferReviewTask(
        reviewer,
        version.applicationVersionId,
        "E300",
      ),
    ).rejects.toThrow("REVIEW_TRANSFER_FORBIDDEN");
  });

  it("rejects transferring a review task that is not claimed", async () => {
    const { service } = makeService();
    const application = await service.createApplication(owner, {
      name: "Copilot",
      summary: "Internal assistant",
    });
    const version = await service.createVersion(
      owner,
      application.applicationId,
      versionInput,
    );
    await service.submitForReview(owner, version.applicationVersionId);

    await expect(
      service.transferReviewTask(
        superAdmin,
        version.applicationVersionId,
        "E300",
      ),
    ).rejects.toThrow("REVIEW_QUEUE_NOT_CLAIMED");
  });

  it("rejects transferring a review task to the owner or single maintainer", async () => {
    const { service } = makeService();
    const application = await service.createApplication(owner, {
      name: "Copilot",
      summary: "Internal assistant",
      maintainerEmployeeId: reviewer.employeeId,
    } as never);
    const version = await service.createVersion(
      owner,
      application.applicationId,
      versionInput,
    );
    await service.submitForReview(owner, version.applicationVersionId);
    // 先由非自审人 E300 认领，再由超管转交。
    await service.claimReview(outsider, version.applicationVersionId);

    await expect(
      service.transferReviewTask(
        superAdmin,
        version.applicationVersionId,
        owner.employeeId,
      ),
    ).rejects.toThrow("SELF_REVIEW_FORBIDDEN");
    await expect(
      service.transferReviewTask(
        superAdmin,
        version.applicationVersionId,
        reviewer.employeeId,
      ),
    ).rejects.toThrow("SELF_REVIEW_FORBIDDEN");
  });

  it("rejects transferring a review task to a draft maintainer", async () => {
    const { service, repository } = makeService();
    const application = await service.createApplication(owner, {
      name: "Copilot",
      summary: "Internal assistant",
    });
    await service.saveDraft(owner, application.applicationId, {
      ...completeDraft(),
      maintainerEmployeeIds: [reviewer.employeeId],
    });
    await service.submitDraft(owner, application.applicationId);
    const [version] = [...repository.versions.values()];
    await service.claimReview(outsider, version!.applicationVersionId);

    await expect(
      service.transferReviewTask(
        superAdmin,
        version!.applicationVersionId,
        reviewer.employeeId,
      ),
    ).rejects.toThrow("SELF_REVIEW_FORBIDDEN");
  });

  it("rejects review decisions by a maintainer who somehow holds the claim", async () => {
    const { service, repository } = makeService();
    const application = await service.createApplication(owner, {
      name: "Copilot",
      summary: "Internal assistant",
    });
    await service.saveDraft(owner, application.applicationId, {
      ...completeDraft(),
      maintainerEmployeeIds: [reviewer.employeeId],
    });
    await service.submitDraft(owner, application.applicationId);
    const [version] = [...repository.versions.values()];
    // 直接操作队列模拟维护人已持有认领（绕过认领入口守卫的历史数据/并发窗口），
    // review() 必须在出结论时仍然拒绝维护人自审。
    await repository.claimReviewQueue(
      version!.applicationVersionId,
      reviewer.employeeId,
    );

    await expect(
      service.review(reviewer, version!.applicationVersionId, "approve", "ok"),
    ).rejects.toThrow("SELF_REVIEW_FORBIDDEN");
  });

  it("allows owner to delete own draft application with audit", async () => {
    const { service, repository } = makeService();
    const application = await service.createApplication(owner, {
      name: "Copilot",
      summary: "Internal assistant",
    });
    await expect(
      service.deleteApplication(owner, application.applicationId),
    ).resolves.toBeUndefined();
    expect(repository.applications.has(application.applicationId)).toBe(false);
    expect(repository.audits).toContain("application.deleted");
  });

  it("rejects deletion by non-owner", async () => {
    const { service } = makeService();
    const application = await service.createApplication(owner, {
      name: "Copilot",
      summary: "Internal assistant",
    });
    await expect(
      service.deleteApplication(outsider, application.applicationId),
    ).rejects.toThrow("APPLICATION_OWNER_REQUIRED");
  });

  it("rejects deletion of non-draft applications", async () => {
    const { service, repository } = makeService();
    const application = await service.createApplication(owner, {
      name: "Copilot",
      summary: "Internal assistant",
    });
    await repository.setApplicationStatus({
      applicationId: application.applicationId,
      expectedStatus: "draft",
      status: "in_review",
    });
    await expect(
      service.deleteApplication(owner, application.applicationId),
    ).rejects.toThrow("APPLICATION_DELETE_STATUS_INVALID");
  });

  it("keeps older versions readable and supports audited rollback", async () => {
    const { service, repository } = makeService();
    const application = await service.createApplication(owner, {
      name: "Copilot",
      summary: "Internal assistant",
    });
    const first = await service.createVersion(
      owner,
      application.applicationId,
      versionInput,
    );
    // 自动上架要求类型对应渠道齐全（§5.4），先配置再提交审核。
    await configureAllDeliveryChannels(service, application.applicationId);
    await service.submitForReview(owner, first.applicationVersionId);
    await service.claimReview(reviewer, first.applicationVersionId);
    await service.review(
      reviewer,
      first.applicationVersionId,
      "approve",
      "Approved",
    );
    const second = await service.createVersion(
      owner,
      application.applicationId,
      (() => {
        const input = {
          ...versionInput,
          version: "2.0.0",
          changelog: "Second release",
        };
        registerVerifiedUpload(repository, application.applicationId, input);
        return input;
      })(),
    );
    expect(await service.listVersions(application.applicationId)).toHaveLength(
      2,
    );
    await service.submitForReview(owner, second.applicationVersionId);
    await service.claimReview(reviewer, second.applicationVersionId);
    await service.review(
      reviewer,
      second.applicationVersionId,
      "approve",
      "Approved",
    );
    // 已发布应用提交更新审核通过后即自动生效为当前版本（保持 published、目录持续可见），
    // 不再需要单独的 publish 步骤——这是「发布态应用更新审核」状态机修复的核心行为。
    await expect(
      service.getApplication(application.applicationId),
    ).resolves.toMatchObject({
      status: "published",
      currentVersionId: second.applicationVersionId,
    });
    await service.rollback(
      owner,
      application.applicationId,
      first.applicationVersionId,
    );
    await expect(
      service.getApplication(application.applicationId),
    ).resolves.toMatchObject({
      status: "published",
      currentVersionId: first.applicationVersionId,
    });
    await expect(
      service.listVersions(application.applicationId),
    ).resolves.toHaveLength(2);
    expect(repository.events).toContain("application.rolled_back");
  });

  it("rejects a second concurrent review submission while one is pending", async () => {
    const { service, repository } = makeService();
    const { application } = await preparePublishedApplication(service);
    const second = await createVersionFor(
      service,
      repository,
      application.applicationId,
      "2.0.0",
    );
    await service.submitForReview(owner, second.applicationVersionId);
    await expect(
      service.getApplication(application.applicationId),
    ).resolves.toMatchObject({
      status: "published",
      pendingVersionId: second.applicationVersionId,
    });
    const third = await createVersionFor(
      service,
      repository,
      application.applicationId,
      "3.0.0",
    );
    await expect(
      service.submitForReview(owner, third.applicationVersionId),
    ).rejects.toThrow("REVIEW_ALREADY_PENDING");
  });

  it("cancels a pending review, frees the slot and allows re-submission", async () => {
    const { service, repository } = makeService();
    const { application } = await preparePublishedApplication(service);
    const second = await createVersionFor(
      service,
      repository,
      application.applicationId,
      "2.0.0",
    );
    await service.submitForReview(owner, second.applicationVersionId);

    const result = await service.cancelPendingReview(
      owner,
      second.applicationVersionId,
    );

    expect(result.status).toBe("published");
    expect(result.pendingVersionId).toBeNull();
    // 队列行被删除（而非置 completed）：查询语义与"无待审核版本"一致，
    // 且同一版本可再次提交——application_review_queue.application_version_id
    // 的 UNIQUE 约束不再阻塞重新提交。
    await expect(
      service.getReviewQueue(second.applicationVersionId),
    ).rejects.toThrow("REVIEW_QUEUE_NOT_FOUND");
    await expect(
      service.submitForReview(owner, second.applicationVersionId),
    ).resolves.toMatchObject({
      status: "published",
      pendingVersionId: second.applicationVersionId,
    });
    expect(repository.events).toContain("application.review.withdrawn");
  });

  it("rejects a pending write through repository CAS when the slot is occupied", async () => {
    const repository = new MemoryApplicationRepository();
    const application = await repository.createApplication({
      ownerEmployeeId: owner.employeeId,
      maintainerEmployeeId: owner.employeeId,
      departmentId: owner.primaryDepartmentId,
      name: "Copilot",
      summary: "Internal assistant",
    });
    repository.applications.set(application.applicationId, {
      ...application,
      status: "published",
      pendingVersionId: "version-1",
    });
    // 模拟并发窗口：服务层预检读到 pending=null，但事务提交时 pending 已被占用——
    // setApplicationStatus 的 pending CAS 必须拒绝第二次写入并抛 REVIEW_ALREADY_PENDING。
    await expect(
      repository.setApplicationStatus({
        applicationId: application.applicationId,
        expectedStatus: "published",
        status: "published",
        pendingVersionId: "version-2",
      }),
    ).rejects.toThrow("REVIEW_ALREADY_PENDING");
    // 清空 pending 的写入不受该 CAS 限制（审核结束、撤回路径仍需能清除）。
    await expect(
      repository.setApplicationStatus({
        applicationId: application.applicationId,
        expectedStatus: "published",
        status: "published",
        pendingVersionId: null,
      }),
    ).resolves.toMatchObject({ pendingVersionId: null });
  });

  it("aggregates the application workspace for the four detail routes", async () => {
    const { service } = makeService();
    const application = await service.createApplication(owner, {
      name: "OCR 票据识别",
      summary: "统一处理企业票据",
    });
    const version = await service.createVersion(
      owner,
      application.applicationId,
      versionInput,
    );
    await service.configureDelivery(owner, application.applicationId, {
      channel: "web",
      entryUrl: "https://apps.example.com/ocr",
      enabled: true,
    });
    await service.submitForReview(owner, version.applicationVersionId);

    const workspace = await (
      service as unknown as {
        getWorkspace: (
          applicationId: string,
          actor?: ActorContext,
        ) => Promise<{
          application: ApplicationRecord;
          versions: ApplicationVersionRecord[];
          deliveries: DeliveryRecord[];
          reviews: ReviewRecord[];
          reviewQueue: ReviewQueueRecord | null;
        }>;
      }
    ).getWorkspace(application.applicationId, owner);

    expect(workspace.application).toMatchObject({
      applicationId: application.applicationId,
      name: "OCR 票据识别",
      status: "in_review",
    });
    expect(workspace.versions).toHaveLength(1);
    expect(workspace.deliveries).toHaveLength(1);
    expect(workspace.reviews).toHaveLength(0);
    expect(workspace.reviewQueue).toMatchObject({
      applicationVersionId: version.applicationVersionId,
      status: "available",
    });
  });

  it("persists maintainers when a draft is submitted", async () => {
    const { service, repository } = makeService();
    const application = await service.createApplication(owner, {
      name: "",
      summary: "",
    });
    await service.saveDraft(owner, application.applicationId, {
      ...completeDraft(),
      maintainerEmployeeIds: ["E400", "E401"],
    });

    await service.submitDraft(owner, application.applicationId);

    // 完整维护人列表落库（先删后插，保序）。
    await expect(
      repository.listMaintainers(application.applicationId),
    ).resolves.toEqual(["E400", "E401"]);
    // 主维护人（第一个）同步回单列字段：目录注册、工作区列表等既有读取路径有效。
    await expect(
      service.getApplication(application.applicationId),
    ).resolves.toMatchObject({ maintainerEmployeeId: "E400" });
  });

  it("syncs maintainers when a draft is saved", async () => {
    const { service, repository } = makeService();
    const application = await service.createApplication(owner, {
      name: "",
      summary: "",
    });
    await service.saveDraft(owner, application.applicationId, {
      ...completeDraft(),
      maintainerEmployeeIds: ["E400"],
    });
    await expect(
      repository.listMaintainers(application.applicationId),
    ).resolves.toEqual(["E400"]);

    // 新增维护人后再次保存：列表与主维护人同步。
    await service.saveDraft(owner, application.applicationId, {
      ...completeDraft(),
      maintainerEmployeeIds: ["E400", "E401"],
    });
    await expect(
      repository.listMaintainers(application.applicationId),
    ).resolves.toEqual(["E400", "E401"]);
    await expect(
      service.getApplication(application.applicationId),
    ).resolves.toMatchObject({ maintainerEmployeeId: "E400" });

    // 移除维护人：列表与主维护人同步收缩。
    await service.saveDraft(owner, application.applicationId, {
      ...completeDraft(),
      maintainerEmployeeIds: ["E401"],
    });
    await expect(
      repository.listMaintainers(application.applicationId),
    ).resolves.toEqual(["E401"]);
    await expect(
      service.getApplication(application.applicationId),
    ).resolves.toMatchObject({ maintainerEmployeeId: "E401" });
  });

  it("rolls back both the draft and the maintainer list when saveDraft fails mid-write", async () => {
    const { service, repository } = makeService();
    const application = await service.createApplication(owner, {
      name: "",
      summary: "",
    });
    // 模拟维护人写入中途失败（崩溃窗口）：草稿 JSON 与维护人关联表必须
    // 同事务回滚——否则 in_review 期间编辑草稿恰逢失败时，自审守卫（优先
    // 读关联表）会基于陈旧的关联表放行新加入的维护人。
    const originalSetMaintainers = repository.setMaintainers.bind(repository);
    repository.setMaintainers = async () => {
      throw new Error("SIMULATED_MAINTAINER_WRITE_FAILURE");
    };
    await expect(
      service.saveDraft(owner, application.applicationId, completeDraft()),
    ).rejects.toThrow("SIMULATED_MAINTAINER_WRITE_FAILURE");
    expect(repository.drafts.has(application.applicationId)).toBe(false);
    expect(repository.maintainers.has(application.applicationId)).toBe(false);
    repository.setMaintainers = originalSetMaintainers;
  });

  it("keeps the self-review guard on the persisted maintainer list even without a draft", async () => {
    const { service, repository } = makeService();
    const application = await service.createApplication(owner, {
      name: "",
      summary: "",
    });
    // 第二维护人（不是单列主维护人 E400）也不得认领本应用审核。
    await service.saveDraft(owner, application.applicationId, {
      ...completeDraft(),
      maintainerEmployeeIds: ["E400", reviewer.employeeId],
    });
    await service.submitDraft(owner, application.applicationId);
    const [version] = [...repository.versions.values()];
    // 模拟草稿缺失（历史数据/后续清理）：自审守卫回退读取维护人关联表。
    repository.drafts.delete(application.applicationId);

    await expect(
      service.claimReview(reviewer, version!.applicationVersionId),
    ).rejects.toThrow("SELF_REVIEW_FORBIDDEN");
  });

  it("submits a draft into review with an artifact-less version", async () => {
    const { service, repository } = makeService();
    const application = await service.createApplication(owner, {
      name: "",
      summary: "",
    });
    await service.saveDraft(owner, application.applicationId, completeDraft());

    const updated = await service.submitDraft(owner, application.applicationId);

    expect(updated.status).toBe("in_review");
    expect(repository.versions.size).toBe(1);
    const [version] = [...repository.versions.values()];
    expect(version?.artifactKey).toBeNull();
    expect(repository.events).toContain("application.submitted");
    expect(repository.events).toContain("application.review.requested");
  });

  it("submits a draft with multiple audience rules (all + departments + employees)", async () => {
    const { service, repository } = makeService();
    const application = await service.createApplication(owner, {
      name: "",
      summary: "",
    });
    const multiAudienceDraft = {
      ...completeDraft(),
      // 前端多选映射：全体员工一条 all、每个部门一条 department、每名员工一条 employee。
      audience: [
        {
          audienceType: "all" as const,
          departmentId: null,
          employeeId: null,
          includeChildren: false,
        },
        {
          audienceType: "department" as const,
          departmentId: "dept-rnd",
          employeeId: null,
          includeChildren: true,
        },
        {
          audienceType: "department" as const,
          departmentId: "dept-ops",
          employeeId: null,
          includeChildren: false,
        },
        {
          audienceType: "employee" as const,
          departmentId: null,
          employeeId: "E400",
          includeChildren: false,
        },
      ],
    };
    await service.saveDraft(
      owner,
      application.applicationId,
      multiAudienceDraft,
    );

    const updated = await service.submitDraft(owner, application.applicationId);

    expect(updated.status).toBe("in_review");
    // 提交链路的草稿持久化保持多条标量规则不变（replaceAudiences 每规则一行）。
    const stored = await repository.findDraft(application.applicationId);
    expect(stored?.draft.audience).toEqual(multiAudienceDraft.audience);
  });

  it("rejects an incomplete draft submission", async () => {
    const { service } = makeService();
    const application = await service.createApplication(owner, {
      name: "",
      summary: "",
    });
    await service.saveDraft(owner, application.applicationId, {
      ...completeDraft(),
      name: "",
    });

    await expect(
      service.submitDraft(owner, application.applicationId),
    ).rejects.toThrow("DRAFT_VALIDATION_FAILED");
  });

  it("auto-publishes a draft-submitted web app on approval", async () => {
    const { service, repository } = makeService();
    const application = await service.createApplication(owner, {
      name: "",
      summary: "",
    });
    await service.saveDraft(owner, application.applicationId, completeDraft());
    await service.submitDraft(owner, application.applicationId);

    const version = [...repository.versions.values()][0]!;
    // 草稿流程的 applicationType 为 web_app（§5.4），只需 web 渠道即可通过自动上架门禁。
    await service.configureDelivery(owner, application.applicationId, {
      channel: "web",
      entryUrl: "https://apps.example.com",
      enabled: true,
    });
    await service.claimReview(reviewer, version.applicationVersionId);
    const published = await service.review(
      reviewer,
      version.applicationVersionId,
      "approve",
      "ok",
    );

    // 审核通过即自动上架：无需手动 publish。
    expect(published.status).toBe("published");
    expect(published.currentVersionId).toBe(version.applicationVersionId);
  });
});
