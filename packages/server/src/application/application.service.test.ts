import { describe, expect, it } from "vitest";
import type {
  ActorContext,
  AuthorizationDecision,
  BehaviorEventInput,
} from "@ai-hub/contracts";
import { ApplicationService } from "./application.service.js";
import { CLAIM_HOLD_MS } from "../system/outbox/sla-reminder.worker.js";
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
  versions = new Map<string, ApplicationVersionRecord>();
  deliveries: DeliveryRecord[] = [];
  reviews: ReviewRecord[] = [];
  reviewQueue: ReviewQueueRecord[] = [];
  uploads = new Map<string, ArtifactUploadRecord>();
  assets = new Map<string, AssetRecord>();
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
      versions: new Map(this.versions),
      deliveries: [...this.deliveries],
      reviews: [...this.reviews],
      reviewQueue: [...this.reviewQueue],
      uploads: new Map(this.uploads),
      assets: new Map(this.assets),
      audits: [...this.audits],
      events: [...this.events],
      catalogRegistrations: [...this.catalogRegistrations],
      deliveryAssets: [...this.deliveryAssets],
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
    return {
      ownerName: `owner-${current.ownerEmployeeId}`,
      maintainerName: `maintainer-${current.maintainerEmployeeId}`,
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
  async snapshotVersionContent(
    _applicationVersionId: string,
    _payload: unknown,
  ) {
    // no-op in memory repository
  }
  async getApplicationType(applicationId: string) {
    return this.catalogTypes.get(applicationId) ?? null;
  }
  async createVersion(input: Omit<ApplicationVersionRecord, "createdAt">) {
    const version = { ...input, createdAt: new Date() };
    this.versions.set(version.applicationVersionId, version);
    return version;
  }
  async findVersion(id: string) {
    return this.versions.get(id) ?? null;
  }
  async listVersions(applicationId: string) {
    return [...this.versions.values()].filter(
      (version) => version.applicationId === applicationId,
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
    signature: string;
  }) {
    return (
      [...this.uploads.values()].find(
        (upload) =>
          upload.applicationId === input.applicationId &&
          upload.objectKey === input.objectKey &&
          upload.sha256 === input.sha256 &&
          upload.signature === input.signature &&
          upload.uploadStatus === "completed" &&
          upload.scanStatus === "passed",
      ) ?? null
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
    return this.deliveries.filter((delivery) => delivery.applicationId === id);
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

function makeService() {
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
    ),
    analyticsEvents,
  };
}

function registerVerifiedUpload(
  repository: MemoryApplicationRepository,
  applicationId: string,
  input = versionInput,
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
