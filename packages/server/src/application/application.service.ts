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
import { assertSafeRichText } from "./content-security.js";

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
    assertSafeRichText(draft.summaryHtml);
    if (draft.manualHtml !== null) assertSafeRichText(draft.manualHtml);
    if (draft.examplesHtml !== null) assertSafeRichText(draft.examplesHtml);
    await this.repository.upsertDraft(applicationId, draft);
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

    const issues = validateDraftCompleteness(draft);
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
      await repository.snapshotVersionContent(version.applicationVersionId, draft);

      const updated = await repository.setApplicationStatus(
        applicationId,
        "in_review",
      );
      await repository.createReviewQueue({
        applicationId,
        applicationVersionId: version.applicationVersionId,
        status: "available",
        claimedByEmployeeId: null,
        claimedAt: null,
        slaDueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
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
      const updated = await repository.setApplicationStatus(
        application.applicationId,
        "in_review",
      );
      await repository.createReviewQueue({
        applicationId: application.applicationId,
        applicationVersionId,
        status: "available",
        claimedByEmployeeId: null,
        claimedAt: null,
        slaDueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
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
    this.requireStatus(application, "in_review");
    const queue = await this.requireReviewQueue(applicationVersionId);
    if (queue.claimedByEmployeeId !== actor.employeeId) {
      throw new Error("REVIEW_QUEUE_CLAIM_REQUIRED");
    }
    const nextStatus = decision === "approve" ? "approved" : "draft";
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
        const updated = await repository.setApplicationStatus(
          application.applicationId,
          nextStatus,
        );
        await this.recordChange(
          repository,
          "application.reviewed",
          application.applicationId,
          applicationVersionId,
          actor.employeeId,
        );
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
      const updated = await repository.setApplicationStatus(
        application.applicationId,
        "published",
        applicationVersionId,
      );
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
      const updated = await repository.setApplicationStatus(
        applicationId,
        "published",
        applicationVersionId,
      );
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
    const [versions, deliveries, reviews] = await Promise.all([
      this.repository.listVersions(applicationId),
      this.repository.listDeliveries(applicationId),
      this.repository.listReviews(applicationId),
    ]);
    const latestVersion = versions[0];
    const reviewQueue = latestVersion
      ? await this.repository.findReviewQueueByVersion(
          latestVersion.applicationVersionId,
        )
      : null;
    return {
      application,
      versions,
      deliveries,
      reviews,
      reviewQueue,
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

  async deleteApplication(
    actor: ActorContext,
    applicationId: string,
  ): Promise<never> {
    void actor;
    void applicationId;
    throw new Error("PHYSICAL_DELETE_FORBIDDEN");
  }

  private async transition(
    application: ApplicationRecord,
    status: ApplicationRecord["status"],
    eventType: string,
    reason?: string,
    actorEmployeeId?: string,
    applicationVersionId?: string,
  ) {
    void reason;
    return this.repository.withTransaction(async (repository) => {
      const updated = await repository.setApplicationStatus(
        application.applicationId,
        status,
      );
      await this.recordChange(
        repository,
        eventType,
        application.applicationId,
        applicationVersionId ?? application.currentVersionId,
        actorEmployeeId ?? null,
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
  ): Promise<void> {
    await repository.recordAudit({
      applicationId,
      applicationVersionId,
      actorEmployeeId,
      eventType,
    });
    await repository.emitOutbox({
      applicationId,
      applicationVersionId,
      eventType,
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
  if (typeof draft.departmentId !== "string" || draft.departmentId.length === 0) {
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
    if (typeof icon.text !== "string" || icon.text.length === 0) {
      fail("DRAFT_ICON_TEXT_REQUIRED", "自动图标需指定展示字符");
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

  if (typeof draft.summaryHtml !== "string" || draft.summaryHtml.trim().length === 0) {
    fail("DRAFT_SUMMARY_REQUIRED", "简介不能为空");
  }
  const hasManual =
    (typeof draft.manualHtml === "string" && draft.manualHtml.trim().length > 0) ||
    (typeof draft.manualAssetId === "string" && draft.manualAssetId.length > 0);
  if (!hasManual) {
    fail("DRAFT_MANUAL_REQUIRED", "操作手册需提供富文本或附件");
  }
  const hasExamples =
    (typeof draft.examplesHtml === "string" &&
      draft.examplesHtml.trim().length > 0) ||
    (typeof draft.examplesAssetId === "string" && draft.examplesAssetId.length > 0);
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
    if (!Array.isArray(risk.modelProviders) || risk.modelProviders.length === 0) {
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
