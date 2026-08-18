import {
  hasPermission,
  PERMISSIONS,
  type ActorContext,
  type ApplicationDraft,
  type ApplicationDraftRecord,
} from "@ai-hub/contracts";
import type {
  ApplicationAuthorizationPort,
  ApplicationRepository,
  ApplicationRecord,
  ApplicationStatus,
  ApplicationVersionRecord,
  ApplicationWorkspace,
  ApplicationAdminListInput,
  ApplicationAdminListResult,
  DeliveryChannel,
  DeliveryRecord,
  ReviewDecision,
  ReviewQueueRecord,
  ReviewQueueView,
} from "./application.types.js";
import { randomUUID } from "node:crypto";
import type { AnalyticsBehaviorEventRecorder } from "../analytics/analytics.types.js";
import { assertSafeRichText, sanitizeRichText } from "./content-security.js";

export interface CreateApplicationInput {
  name: string;
  summary: string;
  maintainerEmployeeId?: string;
  departmentId?: string;
}

export interface CreateVersionInput {
  version: string;
  changelog: string;
  artifactKey: string;
  artifactSha256: string;
  artifactSignature: string;
  scanStatus: "passed";
}

export interface CreateDeliveryInput {
  channel: DeliveryChannel;
  entryUrl: string;
  minClientVersion?: string;
  enabled: boolean;
}

/** 提交完整性校验问题。 */
export interface DraftValidationIssue {
  code: string;
  message: string;
}

/** 提交校验失败（携带问题列表，供 400 响应返回）。 */
export class DraftValidationError extends Error {
  constructor(public readonly issues: readonly DraftValidationIssue[]) {
    super("DRAFT_VALIDATION_FAILED");
    this.name = "DraftValidationError";
  }
}

const allowedActions = {
  create: "create",
  update: "update",
  review: "review",
  publish: "publish",
} as const;

const requiredDeliveryChannels: readonly DeliveryChannel[] = [
  "web",
  "desktop",
  "mobile",
  "mini_program",
];

/** 按应用类型映射发布所需的交付渠道；未知类型回退到四类齐全（保守）。 */
const requiredChannelsByType: Readonly<
  Record<string, readonly DeliveryChannel[]>
> = {
  web_app: ["web"],
  desktop_app: ["desktop"],
  mobile_app: ["mobile"],
  mini_program: ["mini_program"],
};

export class ApplicationService {
  constructor(
    private readonly repository: ApplicationRepository,
    private readonly authorization: ApplicationAuthorizationPort,
    _artifactVerifier: import("./storage.port.js").ArtifactVerificationPort,
    private readonly analyticsEvents?: AnalyticsBehaviorEventRecorder,
  ) {}

  async createApplication(
    actor: ActorContext,
    input: CreateApplicationInput,
  ): Promise<ApplicationRecord> {
    return this.repository.withTransaction((repository) =>
      this.createApplicationInTransaction(actor, input, repository),
    );
  }

  async createApplicationInTransaction(
    actor: ActorContext,
    input: CreateApplicationInput,
    repository: ApplicationRepository,
  ): Promise<ApplicationRecord> {
    await this.assertAuthorized(actor, allowedActions.create);
    const application = await repository.createApplication({
      ownerEmployeeId: actor.employeeId,
      maintainerEmployeeId: input.maintainerEmployeeId ?? actor.employeeId,
      departmentId: input.departmentId ?? actor.primaryDepartmentId,
      name: input.name,
      summary: input.summary,
    });
    await this.recordChange(
      repository,
      "application.created",
      application.applicationId,
      null,
      actor.employeeId,
    );
    return application;
  }

  async saveDraft(
    actor: ActorContext,
    applicationId: string,
    draft: ApplicationDraft,
  ): Promise<ApplicationDraftRecord> {
    await this.assertAuthorized(actor, allowedActions.update);
    const application = await this.requireApplication(applicationId);
    if (application.ownerEmployeeId !== actor.employeeId) {
      throw new Error("APPLICATION_OWNER_REQUIRED");
    }
    if (
      application.status === "archived" ||
      application.status === "withdrawn"
    ) {
      throw new Error("APPLICATION_NOT_EDITABLE");
    }
    const sanitizedDraft: ApplicationDraft = {
      ...draft,
      summaryHtml: sanitizeRichText(draft.summaryHtml),
      manualHtml: draft.manualHtml === null ? null : sanitizeRichText(draft.manualHtml),
      examplesHtml:
        draft.examplesHtml === null ? null : sanitizeRichText(draft.examplesHtml),
    };
    // 次级防御：白名单清洗后再用既有黑名单校验一遍（fail-closed）。
    assertSafeRichText(sanitizedDraft.summaryHtml);
    if (sanitizedDraft.manualHtml !== null)
      assertSafeRichText(sanitizedDraft.manualHtml);
    if (sanitizedDraft.examplesHtml !== null)
      assertSafeRichText(sanitizedDraft.examplesHtml);
    await this.repository.upsertDraft(applicationId, sanitizedDraft);
    return {
      applicationId,
      status: application.status,
      ownerEmployeeId: application.ownerEmployeeId,
      draft,
      updatedAt: new Date().toISOString(),
    };
  }

  async getDraft(
    actor: ActorContext,
    applicationId: string,
  ): Promise<ApplicationDraftRecord> {
    await this.assertAuthorized(actor, allowedActions.update);
    const application = await this.requireApplication(applicationId);
    if (
      application.ownerEmployeeId !== actor.employeeId &&
      !hasPermission(actor, PERMISSIONS.APPLICATION_MANAGE)
    ) {
      throw new Error("APPLICATION_ACCESS_FORBIDDEN");
    }
    const result = await this.repository.findDraft(applicationId);
    if (result === null) throw new Error("DRAFT_NOT_FOUND");
    return {
      applicationId,
      status: application.status,
      ownerEmployeeId: application.ownerEmployeeId,
      draft: result.draft,
      updatedAt: result.updatedAt.toISOString(),
    };
  }

  /** 提交草稿进入审核：完整性校验 → 规范化落库 → 创建无安装包版本 → 进入审核队列。 */
  async submitDraft(
    actor: ActorContext,
    applicationId: string,
  ): Promise<ApplicationRecord> {
    await this.assertAuthorized(actor, allowedActions.update);
    const application = await this.requireApplication(applicationId);
    if (application.ownerEmployeeId !== actor.employeeId) {
      throw new Error("APPLICATION_OWNER_REQUIRED");
    }
    if (application.status !== "draft" && application.status !== "published") {
      throw new Error("INVALID_APPLICATION_TRANSITION");
    }
    const result = await this.repository.findDraft(applicationId);
    if (result === null) throw new Error("DRAFT_NOT_FOUND");
    const draft = result.draft;

    // 提交审核前对富文本做白名单清洗（XSS 防护），并作为版本快照持久化。
    const sanitizedDraft: ApplicationDraft = {
      ...draft,
      summaryHtml: sanitizeRichText(draft.summaryHtml),
      manualHtml: draft.manualHtml === null ? null : sanitizeRichText(draft.manualHtml),
      examplesHtml:
        draft.examplesHtml === null ? null : sanitizeRichText(draft.examplesHtml),
    };
    // 次级防御：白名单清洗后再用既有黑名单校验一遍（fail-closed）。
    assertSafeRichText(sanitizedDraft.summaryHtml);
    if (sanitizedDraft.manualHtml !== null)
      assertSafeRichText(sanitizedDraft.manualHtml);
    if (sanitizedDraft.examplesHtml !== null)
      assertSafeRichText(sanitizedDraft.examplesHtml);

    const issues = validateDraftCompleteness(sanitizedDraft);
    if (issues.length > 0) throw new DraftValidationError(issues);

    const existingVersions = await this.repository.listVersions(applicationId);
    if (existingVersions.some((v) => v.version === draft.version)) {
      throw new Error("VERSION_ALREADY_EXISTS");
    }

    const plainSummary = draft.summaryHtml.replace(/<[^>]*>/g, "").trim();

    return this.repository.withTransaction(async (repository) => {
      await repository.updateApplicationContent(applicationId, {
        name: draft.name,
        summary: plainSummary,
      });
      await repository.upsertCatalogMetadata(applicationId, {
        categoryId: draft.categoryId,
        applicationType: draft.applicationType,
      });
      await repository.replaceTagLinks(applicationId, draft.tagIds);
      await repository.replaceAudiences(applicationId, draft.audience);

      const version = await repository.createVersion({
        applicationVersionId: randomUUID(),
        applicationId,
        version: draft.version,
        changelog: draft.changelog,
        artifactKey: null,
        artifactSha256: null,
        artifactSignature: null,
        scanStatus: "passed",
        createdByEmployeeId: actor.employeeId,
      });
      await repository.snapshotVersionContent(
        version.applicationVersionId,
        sanitizedDraft,
      );

      const isPublishedUpdate = application.status === "published";
      const updated = await repository.setApplicationStatus({
        applicationId,
        expectedStatus: application.status,
        // 已发布应用提交更新审核时，保持 published（继续在目录可见）；
        // draft 提交审核才进入 in_review。
        status: isPublishedUpdate ? "published" : "in_review",
        pendingVersionId: isPublishedUpdate ? version.applicationVersionId : null,
      });
      await repository.createReviewQueue({
        applicationId,
        applicationVersionId: version.applicationVersionId,
        status: "available",
        claimedByEmployeeId: null,
        claimedAt: null,
        slaDueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        // 记录审核前的应用状态，驳回时据其正确回滚。
        sourceStatus: application.status,
      });
      await this.recordChange(
        repository,
        "application.submitted",
        applicationId,
        version.applicationVersionId,
        actor.employeeId,
      );
      await this.recordChange(
        repository,
        "application.review.requested",
        applicationId,
        version.applicationVersionId,
        actor.employeeId,
      );
      await this.recordChange(
        repository,
        "application.review.sla.created",
        applicationId,
        version.applicationVersionId,
        actor.employeeId,
      );
      return updated;
    });
  }

  async createVersion(
    actor: ActorContext,
    applicationId: string,
    input: CreateVersionInput,
  ): Promise<ApplicationVersionRecord> {
    await this.assertAuthorized(actor, allowedActions.update);
    const application = await this.requireApplication(applicationId);
    if (application.ownerEmployeeId !== actor.employeeId) {
      throw new Error("APPLICATION_OWNER_REQUIRED");
    }
    if (
      application.status === "archived" ||
      application.status === "withdrawn"
    ) {
      throw new Error("APPLICATION_NOT_EDITABLE");
    }
    if (input.scanStatus !== "passed") {
      throw new Error("ARTIFACT_NOT_VERIFIED");
    }
    const verifiedUpload = await this.repository.findVerifiedArtifact({
      applicationId,
      objectKey: input.artifactKey,
      sha256: input.artifactSha256,
      signature: input.artifactSignature,
    });
    if (verifiedUpload === null) {
      throw new Error("ARTIFACT_NOT_VERIFIED");
    }
    const versions = await this.repository.listVersions(applicationId);
    if (versions.some((version) => version.version === input.version)) {
      throw new Error("VERSION_ALREADY_EXISTS");
    }

    return this.repository.withTransaction(async (repository) => {
      const version = await repository.createVersion({
        applicationVersionId: randomUUID(),
        applicationId,
        version: input.version,
        changelog: input.changelog,
        artifactKey: input.artifactKey,
        artifactSha256: input.artifactSha256,
        artifactSignature: input.artifactSignature,
        scanStatus: input.scanStatus,
        createdByEmployeeId: actor.employeeId,
      });
      await this.recordChange(
        repository,
        "application.version.created",
        applicationId,
        version.applicationVersionId,
        actor.employeeId,
      );
      return version;
    });
  }

  async submitForReview(
    actor: ActorContext,
    applicationVersionId: string,
  ): Promise<ApplicationRecord> {
    await this.assertAuthorized(actor, allowedActions.update);
    const version = await this.requireVersion(applicationVersionId);
    if (version.createdByEmployeeId !== actor.employeeId) {
      throw new Error("APPLICATION_OWNER_REQUIRED");
    }
    if (version.scanStatus !== "passed") {
      throw new Error("ARTIFACT_NOT_VERIFIED");
    }
    const application = await this.requireApplication(version.applicationId);
    if (application.status !== "draft" && application.status !== "published") {
      throw new Error("INVALID_APPLICATION_TRANSITION");
    }
    return this.repository.withTransaction(async (repository) => {
      const isPublishedUpdate = application.status === "published";
      const updated = await repository.setApplicationStatus({
        applicationId: application.applicationId,
        expectedStatus: application.status,
        // 已发布应用提交更新审核时，保持 published（继续在目录可见）；
        // draft 提交审核才进入 in_review。
        status: isPublishedUpdate ? "published" : "in_review",
        pendingVersionId: isPublishedUpdate ? applicationVersionId : null,
      });
      await repository.createReviewQueue({
        applicationId: application.applicationId,
        applicationVersionId,
        status: "available",
        claimedByEmployeeId: null,
        claimedAt: null,
        slaDueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        // 记录审核前的应用状态，驳回时据其正确回滚。
        sourceStatus: application.status,
      });
      await this.recordChange(
        repository,
        "application.submitted",
        application.applicationId,
        applicationVersionId,
        actor.employeeId,
      );
      await this.recordChange(
        repository,
        "application.review.requested",
        application.applicationId,
        applicationVersionId,
        actor.employeeId,
      );
      await this.recordChange(
        repository,
        "application.review.sla.created",
        application.applicationId,
        applicationVersionId,
        actor.employeeId,
      );
      return updated;
    });
  }

  async claimReview(
    actor: ActorContext,
    applicationVersionId: string,
  ): Promise<ReviewQueueRecord> {
    await this.assertAuthorized(actor, allowedActions.review);
    const version = await this.requireVersion(applicationVersionId);
    const application = await this.requireApplication(version.applicationId);
    if (application.ownerEmployeeId === actor.employeeId) {
      throw new Error("SELF_REVIEW_FORBIDDEN");
    }
    const queue = await this.requireReviewQueue(applicationVersionId);
    if (queue.status !== "available") {
      throw new Error("REVIEW_QUEUE_NOT_AVAILABLE");
    }
    const updated = await this.repository.withTransaction(
      async (repository) => {
        const claimed = await repository.claimReviewQueue(
          applicationVersionId,
          actor.employeeId,
        );
        await this.recordChange(
          repository,
          "application.review.claimed",
          application.applicationId,
          applicationVersionId,
          actor.employeeId,
        );
        return claimed;
      },
    );
    return updated;
  }

  async releaseReview(
    actor: ActorContext,
    applicationVersionId: string,
  ): Promise<ReviewQueueRecord> {
    await this.assertAuthorized(actor, allowedActions.review);
    const version = await this.requireVersion(applicationVersionId);
    const application = await this.requireApplication(version.applicationId);
    const queue = await this.requireReviewQueue(applicationVersionId);
    if (queue.claimedByEmployeeId !== actor.employeeId) {
      throw new Error("REVIEW_QUEUE_CLAIM_REQUIRED");
    }
    return this.repository.withTransaction(async (repository) => {
      const released = await repository.releaseReviewQueue(
        applicationVersionId,
        actor.employeeId,
      );
      await this.recordChange(
        repository,
        "application.review.released",
        application.applicationId,
        applicationVersionId,
        actor.employeeId,
      );
      return released;
    });
  }

  async review(
    actor: ActorContext,
    applicationVersionId: string,
    decision: ReviewDecision,
    comment: string,
  ): Promise<ApplicationRecord> {
    await this.assertAuthorized(actor, allowedActions.review);
    const version = await this.requireVersion(applicationVersionId);
    const application = await this.requireApplication(version.applicationId);
    if (application.ownerEmployeeId === actor.employeeId) {
      throw new Error("SELF_REVIEW_FORBIDDEN");
    }
    // 已发布应用提交更新审核时，应用状态仍为 published（保持目录可见），
    // 因此审核入口允许 in_review 或 published；其余状态不合法。
    if (
      application.status !== "in_review" &&
      application.status !== "published"
    ) {
      throw new Error("INVALID_APPLICATION_TRANSITION");
    }
    const queue = await this.requireReviewQueue(applicationVersionId);
    if (queue.claimedByEmployeeId !== actor.employeeId) {
      throw new Error("REVIEW_QUEUE_CLAIM_REQUIRED");
    }
    if (queue.status !== "claimed") {
      throw new Error("REVIEW_QUEUE_CLAIM_REQUIRED");
    }
    // 依据审核前的应用状态决定终态：驳回回滚到原状态；通过时
    // draft→approved（仍由 publish 切换为 published），published→保持 published 并切换当前版本。
    const approved = decision === "approve";
    const sourceStatus = (queue.sourceStatus ?? "draft") as ApplicationStatus;
    const nextStatus: ApplicationStatus = approved
      ? sourceStatus === "published"
        ? "published"
        : "approved"
      : sourceStatus;
    const updated = await this.repository.withTransaction(
      async (repository) => {
        await repository.createReview({
          applicationId: application.applicationId,
          applicationVersionId,
          reviewerEmployeeId: actor.employeeId,
          applicationOwnerEmployeeId: application.ownerEmployeeId,
          decision,
          comment,
        });
        const updated = await repository.setApplicationStatus({
          applicationId: application.applicationId,
          expectedStatus: application.status,
          status: nextStatus,
          // 审核结束，清除待生效版本标记。
          pendingVersionId: null,
          // 发布应用更新通过：切换当前版本为新审核版本。
          ...(approved && sourceStatus === "published"
            ? { currentVersionId: applicationVersionId }
            : {}),
        });
        await this.recordChange(
          repository,
          "application.reviewed",
          application.applicationId,
          applicationVersionId,
          actor.employeeId,
        );
        // 关闭审核队列，避免其以 available/claimed 残留。
        if (repository.completeReviewQueue !== undefined) {
          await repository.completeReviewQueue(applicationVersionId);
        }
        return updated;
      },
    );
    await this.analyticsEvents?.record(actor, {
      eventName: "review_decided",
      aggregateType: "review",
      aggregateId: applicationVersionId,
      occurredAt: new Date().toISOString(),
      idempotencyKey: `review-decided:${applicationVersionId}:${decision}`,
      metadata: { decision },
    });
    return updated;
  }

  async publish(
    actor: ActorContext,
    applicationVersionId: string,
  ): Promise<ApplicationRecord> {
    await this.assertAuthorized(actor, allowedActions.publish);
    const version = await this.requireVersion(applicationVersionId);
    const application = await this.requireApplication(version.applicationId);
    if (application.ownerEmployeeId !== actor.employeeId) {
      throw new Error("APPLICATION_OWNER_REQUIRED");
    }
    this.requireStatus(application, "approved");
    const deliveries = await this.repository.listDeliveries(
      application.applicationId,
    );
    const applicationType = await this.repository.getApplicationType(
      application.applicationId,
    );
    const requiredChannels =
      applicationType !== null &&
      requiredChannelsByType[applicationType] !== undefined
        ? requiredChannelsByType[applicationType]
        : requiredDeliveryChannels;
    if (
      requiredChannels.some(
        (channel) =>
          !deliveries.some(
            (delivery) => delivery.channel === channel && delivery.enabled,
          ),
      )
    ) {
      throw new Error("DELIVERY_CHANNELS_INCOMPLETE");
    }
    return this.repository.withTransaction(async (repository) => {
      const updated = await repository.setApplicationStatus({
        applicationId: application.applicationId,
        expectedStatus: "approved",
        status: "published",
        currentVersionId: applicationVersionId,
      });
      await repository.registerToCatalog({
        applicationId: application.applicationId,
        name: application.name,
        summary: application.summary,
      });
      await this.recordChange(
        repository,
        "application.published",
        application.applicationId,
        applicationVersionId,
        actor.employeeId,
      );
      return updated;
    });
  }

  async withdraw(
    actor: ActorContext,
    applicationId: string,
    reason: string,
  ): Promise<ApplicationRecord> {
    await this.assertAuthorized(actor, allowedActions.publish);
    const application = await this.requireApplication(applicationId);
    if (application.ownerEmployeeId !== actor.employeeId) {
      throw new Error("APPLICATION_OWNER_REQUIRED");
    }
    this.requireStatus(application, "published");
    return this.transition(
      application,
      "withdrawn",
      "application.withdrawn",
      reason,
      actor.employeeId,
    );
  }

  async rollback(
    actor: ActorContext,
    applicationId: string,
    applicationVersionId: string,
  ): Promise<ApplicationRecord> {
    await this.assertAuthorized(actor, allowedActions.publish);
    const application = await this.requireApplication(applicationId);
    if (application.ownerEmployeeId !== actor.employeeId) {
      throw new Error("APPLICATION_OWNER_REQUIRED");
    }
    this.requireStatus(application, "published");
    const version = await this.requireVersion(applicationVersionId);
    if (version.applicationId !== applicationId) {
      throw new Error("APPLICATION_VERSION_MISMATCH");
    }
    if (version.applicationVersionId === application.currentVersionId) {
      throw new Error("ROLLBACK_TARGET_IS_CURRENT");
    }
    return this.repository.withTransaction(async (repository) => {
      const updated = await repository.setApplicationStatus({
        applicationId,
        expectedStatus: "published",
        status: "published",
        currentVersionId: applicationVersionId,
      });
      await this.recordChange(
        repository,
        "application.rolled_back",
        applicationId,
        applicationVersionId,
        actor.employeeId,
      );
      return updated;
    });
  }

  async archive(
    actor: ActorContext,
    applicationId: string,
  ): Promise<ApplicationRecord> {
    await this.assertAuthorized(actor, allowedActions.publish);
    const application = await this.requireApplication(applicationId);
    if (application.ownerEmployeeId !== actor.employeeId) {
      throw new Error("APPLICATION_OWNER_REQUIRED");
    }
    this.requireStatus(application, "withdrawn");
    return this.transition(
      application,
      "archived",
      "application.archived",
      undefined,
      actor.employeeId,
    );
  }

  async configureDelivery(
    actor: ActorContext,
    applicationId: string,
    input: CreateDeliveryInput,
  ): Promise<DeliveryRecord> {
    await this.assertAuthorized(actor, allowedActions.update);
    const application = await this.requireApplication(applicationId);
    if (application.ownerEmployeeId !== actor.employeeId) {
      throw new Error("APPLICATION_OWNER_REQUIRED");
    }
    if (application.status === "archived") {
      throw new Error("APPLICATION_NOT_EDITABLE");
    }
    return this.repository.withTransaction(async (repository) => {
      const delivery = await repository.createDelivery({
        applicationId,
        channel: input.channel,
        entryUrl: input.entryUrl,
        minClientVersion: input.minClientVersion ?? null,
        enabled: input.enabled,
      });
      await this.recordChange(
        repository,
        "application.delivery.configured",
        applicationId,
        null,
        actor.employeeId,
      );
      return delivery;
    });
  }

  async getApplication(
    applicationId: string,
    actor?: ActorContext,
  ): Promise<ApplicationRecord> {
    const application = await this.requireApplication(applicationId);
    if (actor !== undefined) {
      this.assertApplicationReadable(actor, application);
      await this.analyticsEvents?.record(actor, {
        eventName: "application_viewed",
        aggregateType: "application",
        aggregateId: applicationId,
        occurredAt: new Date().toISOString(),
        idempotencyKey: `application-viewed:${actor.sessionId}:${applicationId}:${Date.now()}`,
        metadata: { source: "application.get" },
        audience: { departmentId: application.departmentId },
      });
    }
    return application;
  }

  async listAdmin(
    actor: ActorContext,
    input: ApplicationAdminListInput,
  ): Promise<ApplicationAdminListResult> {
    if (input.page < 1 || input.pageSize < 1 || input.pageSize > 100) {
      throw new Error("APPLICATION_PAGINATION_INVALID");
    }
    if (this.repository.listAdmin === undefined) {
      throw new Error("APPLICATION_ADMIN_LIST_UNAVAILABLE");
    }
    return this.repository.listAdmin(actor, input);
  }

  async getAdminKpis(actor: ActorContext) {
    if (this.repository.getAdminKpis === undefined) {
      throw new Error("APPLICATION_ADMIN_KPIS_UNAVAILABLE");
    }
    return this.repository.getAdminKpis(actor);
  }

  async listVersions(applicationId: string, actor?: ActorContext) {
    const application = await this.requireApplication(applicationId);
    if (actor !== undefined) {
      this.assertApplicationReadable(actor, application);
    }
    return this.repository.listVersions(applicationId);
  }

  async getWorkspace(
    applicationId: string,
    actor?: ActorContext,
  ): Promise<ApplicationWorkspace> {
    const application = await this.getApplication(applicationId, actor);
    const [versions, deliveries, reviews, assets] = await Promise.all([
      this.repository.listVersions(applicationId),
      this.repository.listDeliveries(applicationId),
      this.repository.listReviews(applicationId),
      this.repository.listAssets(applicationId),
    ]);
    const latestVersion = versions[0];
    const reviewQueue = latestVersion
      ? await this.repository.findReviewQueueByVersion(
          latestVersion.applicationVersionId,
        )
      : null;
    const meta = await this.repository.findApplicationMeta(applicationId);
    return {
      application,
      ownerName: meta?.ownerName ?? "",
      maintainerName: meta?.maintainerName ?? "",
      departmentName: meta?.departmentName ?? "",
      updatedAt: (meta?.updatedAt ?? new Date()).toISOString(),
      versions,
      deliveries,
      reviews,
      reviewQueue,
      assets,
    };
  }

  async listDeliveries(applicationId: string, actor?: ActorContext) {
    const application = await this.requireApplication(applicationId);
    if (actor !== undefined) {
      this.assertApplicationReadable(actor, application);
    }
    return this.repository.listDeliveries(applicationId);
  }

  async listReviews(applicationId: string, actor?: ActorContext) {
    const application = await this.requireApplication(applicationId);
    if (actor !== undefined) {
      this.assertApplicationReadable(actor, application);
    }
    return this.repository.listReviews(applicationId);
  }

  async getReviewQueue(
    applicationVersionId: string,
    actor?: ActorContext,
  ): Promise<ReviewQueueView> {
    const queue = await this.requireReviewQueue(applicationVersionId);
    const result: ReviewQueueView = {
      ...queue,
      slaStatus: queue.slaDueAt.getTime() < Date.now() ? "overdue" : "on_time",
    };
    if (result.slaStatus === "overdue") {
      await this.analyticsEvents?.record(actor ?? null, {
        eventName: "review_sla_breached",
        aggregateType: "review",
        aggregateId: applicationVersionId,
        occurredAt: new Date().toISOString(),
        idempotencyKey: `review-sla-breached:${applicationVersionId}:${queue.slaDueAt.toISOString()}`,
        metadata: { source: "review.queue" },
      });
    }
    return result;
  }

  async getPublishedVersion(
    applicationId: string,
    actor?: ActorContext,
  ): Promise<ApplicationVersionRecord> {
    const application = await this.requireApplication(applicationId);
    if (actor !== undefined) {
      this.assertApplicationReadable(actor, application);
    }
    if (application.currentVersionId === null) {
      throw new Error("PUBLISHED_VERSION_NOT_FOUND");
    }
    const version = await this.repository.findVersion(
      application.currentVersionId,
    );
    if (version === null) throw new Error("PUBLISHED_VERSION_NOT_FOUND");
    if (actor !== undefined) {
      await this.analyticsEvents?.record(actor, {
        eventName: "application_delivered",
        aggregateType: "application",
        aggregateId: applicationId,
        occurredAt: new Date().toISOString(),
        idempotencyKey: `application-delivered:${actor.sessionId}:${applicationId}:${version.applicationVersionId}:${Date.now()}`,
        metadata: { source: "application.published-version" },
        audience: { departmentId: application.departmentId },
      });
    }
    return version;
  }

  /**
   * 删除草稿应用：仅允许负责人删除 status=draft 的应用，级联清理子表数据，
   * 写入审计与 outbox 事件（先落事件再删主记录，避免审计外键受限）。
   */
  async deleteApplication(
    actor: ActorContext,
    applicationId: string,
  ): Promise<void> {
    await this.assertAuthorized(actor, allowedActions.update);
    const application = await this.requireApplication(applicationId);
    if (application.ownerEmployeeId !== actor.employeeId) {
      throw new Error("APPLICATION_OWNER_REQUIRED");
    }
    if (application.status !== "draft") {
      throw new Error("APPLICATION_DELETE_STATUS_INVALID");
    }
    return this.repository.withTransaction(async (repository) => {
      await this.recordChange(
        repository,
        "application.deleted",
        applicationId,
        null,
        actor.employeeId,
        { name: application.name },
      );
      await repository.deleteDraftApplication(applicationId);
    });
  }

  /** 移交责任人：负责人本人或应用管理员可将应用移交给在职员工。 */
  async transferOwner(
    actor: ActorContext,
    applicationId: string,
    newOwnerEmployeeId: string,
  ): Promise<ApplicationRecord> {
    await this.assertAuthorized(actor, allowedActions.update);
    const application = await this.requireApplication(applicationId);
    if (
      application.ownerEmployeeId !== actor.employeeId &&
      !hasPermission(actor, PERMISSIONS.APPLICATION_MANAGE)
    ) {
      throw new Error("APPLICATION_OWNER_REQUIRED");
    }
    if (newOwnerEmployeeId === application.ownerEmployeeId) {
      throw new Error("OWNER_UNCHANGED");
    }
    if (application.status === "archived") {
      throw new Error("APPLICATION_NOT_EDITABLE");
    }
    return this.repository.withTransaction(async (repository) => {
      const updated = await repository.transferOwner(
        applicationId,
        newOwnerEmployeeId,
      );
      if (updated === null) throw new Error("APPLICATION_NOT_FOUND");
      await this.recordChange(
        repository,
        "application.owner.transferred",
        applicationId,
        null,
        actor.employeeId,
        {
          from: application.ownerEmployeeId,
          to: newOwnerEmployeeId,
        },
      );
      return updated;
    });
  }

  private async transition(
    application: ApplicationRecord,
    status: ApplicationRecord["status"],
    eventType: string,
    reason?: string,
    actorEmployeeId?: string,
    applicationVersionId?: string,
  ) {
    return this.repository.withTransaction(async (repository) => {
      const updated = await repository.setApplicationStatus({
        applicationId: application.applicationId,
        expectedStatus: application.status,
        status,
      });
      await this.recordChange(
        repository,
        eventType,
        application.applicationId,
        applicationVersionId ?? application.currentVersionId,
        actorEmployeeId ?? null,
        reason === undefined ? undefined : { reason },
      );
      return updated;
    });
  }

  private async assertAuthorized(
    actor: ActorContext,
    action: string,
  ): Promise<void> {
    const decision = await this.authorization.authorize({
      actor,
      action,
      resourceType: "application",
    });
    if (!decision.allowed) throw new Error("NOT_AUTHORIZED");
  }

  private assertApplicationReadable(
    actor: ActorContext,
    application: ApplicationRecord,
  ): void {
    if (
      application.ownerEmployeeId === actor.employeeId ||
      application.maintainerEmployeeId === actor.employeeId ||
      hasPermission(actor, PERMISSIONS.APPLICATION_MANAGE)
    ) {
      return;
    }
    throw new Error("APPLICATION_ACCESS_FORBIDDEN");
  }

  private async requireApplication(
    applicationId: string,
  ): Promise<ApplicationRecord> {
    const application = await this.repository.findApplication(applicationId);
    if (application === null) throw new Error("APPLICATION_NOT_FOUND");
    return application;
  }

  private async requireVersion(
    applicationVersionId: string,
  ): Promise<ApplicationVersionRecord> {
    const version = await this.repository.findVersion(applicationVersionId);
    if (version === null) throw new Error("APPLICATION_VERSION_NOT_FOUND");
    return version;
  }

  private async requireReviewQueue(
    applicationVersionId: string,
  ): Promise<ReviewQueueRecord> {
    const queue =
      await this.repository.findReviewQueueByVersion(applicationVersionId);
    if (queue === null) throw new Error("REVIEW_QUEUE_NOT_FOUND");
    return queue;
  }

  private requireStatus(
    application: ApplicationRecord,
    expected: ApplicationRecord["status"],
  ): void {
    if (application.status !== expected) {
      throw new Error("INVALID_APPLICATION_TRANSITION");
    }
  }

  private async recordChange(
    repository: ApplicationRepository,
    eventType: string,
    applicationId: string,
    applicationVersionId: string | null,
    actorEmployeeId: string | null,
    details?: unknown,
  ): Promise<void> {
    await repository.recordAudit({
      applicationId,
      applicationVersionId,
      actorEmployeeId,
      eventType,
      details,
    });
    await repository.emitOutbox({
      applicationId,
      applicationVersionId,
      eventType,
      details,
    });
  }
}

/**
 * 提交完整性门禁（纯函数，可单测）。
 *
 * 返回问题列表；为空数组即表示草稿可提交。与前端 `superRefine` 采用同一套规则，
 * 服务端为最终权威，避免前端被绕过。
 */
export function validateDraftCompleteness(
  draft: ApplicationDraft,
): DraftValidationIssue[] {
  const issues: DraftValidationIssue[] = [];
  const fail = (code: string, message: string): void => {
    issues.push({ code, message });
  };

  if (typeof draft.name !== "string" || draft.name.trim().length === 0) {
    fail("DRAFT_NAME_REQUIRED", "应用名称不能为空");
  } else if (draft.name.length > 160) {
    fail("DRAFT_NAME_TOO_LONG", "应用名称不能超过 160 字");
  }
  if (
    typeof draft.departmentId !== "string" ||
    draft.departmentId.length === 0
  ) {
    fail("DRAFT_DEPARTMENT_REQUIRED", "归属部门不能为空");
  }
  if (typeof draft.categoryId !== "string" || draft.categoryId.length === 0) {
    fail("DRAFT_CATEGORY_REQUIRED", "分类不能为空");
  }
  if (
    !Array.isArray(draft.maintainerEmployeeIds) ||
    draft.maintainerEmployeeIds.length === 0
  ) {
    fail("DRAFT_MAINTAINER_REQUIRED", "至少指定一名维护人");
  }

  const icon = draft.icon;
  if (icon === undefined || icon === null) {
    fail("DRAFT_ICON_REQUIRED", "应用图标不能为空");
  } else if (icon.mode === "auto") {
    if (
      typeof icon.backgroundColor !== "string" ||
      icon.backgroundColor.trim().length === 0
    ) {
      fail("DRAFT_ICON_BACKGROUND_REQUIRED", "自动图标需指定背景色");
    }
  } else if (icon.mode === "upload") {
    if (typeof icon.assetId !== "string" || icon.assetId.length === 0) {
      fail("DRAFT_ICON_ASSET_REQUIRED", "上传图标需指定图标资产");
    }
  } else {
    fail("DRAFT_ICON_MODE_INVALID", "图标模式非法");
  }

  if (
    !Array.isArray(draft.screenshotAssetIds) ||
    draft.screenshotAssetIds.length < 1 ||
    draft.screenshotAssetIds.length > 6
  ) {
    fail("DRAFT_SCREENSHOTS_COUNT", "截图数量需在 1–6 张之间");
  }

  if (
    typeof draft.summaryHtml !== "string" ||
    draft.summaryHtml.trim().length === 0
  ) {
    fail("DRAFT_SUMMARY_REQUIRED", "简介不能为空");
  }
  const hasManual =
    (typeof draft.manualHtml === "string" &&
      draft.manualHtml.trim().length > 0) ||
    (typeof draft.manualAssetId === "string" && draft.manualAssetId.length > 0);
  if (!hasManual) {
    fail("DRAFT_MANUAL_REQUIRED", "操作手册需提供富文本或附件");
  }
  const hasExamples =
    (typeof draft.examplesHtml === "string" &&
      draft.examplesHtml.trim().length > 0) ||
    (typeof draft.examplesAssetId === "string" &&
      draft.examplesAssetId.length > 0);
  if (!hasExamples) {
    fail("DRAFT_EXAMPLES_REQUIRED", "使用示例需提供富文本或附件");
  }

  if (!Array.isArray(draft.audience) || draft.audience.length === 0) {
    fail("DRAFT_AUDIENCE_REQUIRED", "受众规则至少一条");
  }

  const risk = draft.risk;
  if (risk === undefined || risk === null) {
    fail("DRAFT_RISK_REQUIRED", "AI 风险声明不能为空");
  } else {
    const booleans = [
      risk.handlesSensitiveData,
      risk.sendsDataExternally,
      risk.retainsConversations,
      risk.affectsHighRiskDecisions,
    ];
    if (booleans.some((value) => typeof value !== "boolean")) {
      fail("DRAFT_RISK_OPTION_REQUIRED", "AI 风险选项需逐项选择是/否");
    }
    if (
      !Array.isArray(risk.modelProviders) ||
      risk.modelProviders.length === 0
    ) {
      fail("DRAFT_RISK_PROVIDER_REQUIRED", "需选择模型 / AI 提供方");
    }
    if (
      typeof risk.inputRestrictionDisclaimer !== "string" ||
      risk.inputRestrictionDisclaimer.trim().length === 0
    ) {
      fail("DRAFT_RISK_DISCLAIMER_REQUIRED", "免责声明不能为空");
    }
  }

  if (!Array.isArray(draft.deliveries) || draft.deliveries.length === 0) {
    fail("DRAFT_DELIVERY_REQUIRED", "交付配置不能为空");
  }

  return issues;
}
