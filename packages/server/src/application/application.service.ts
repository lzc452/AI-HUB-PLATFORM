import type { ActorContext } from "@ai-hub/contracts";
import type {
  ApplicationAuthorizationPort,
  ApplicationRepository,
  ApplicationRecord,
  ApplicationVersionRecord,
  DeliveryChannel,
  DeliveryRecord,
  ReviewDecision,
  ReviewQueueRecord,
  ReviewQueueView,
} from "./application.types.js";
import type { ArtifactVerificationPort } from "./storage.port.js";
import { randomUUID } from "node:crypto";

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

export class ApplicationService {
  constructor(
    private readonly repository: ApplicationRepository,
    private readonly authorization: ApplicationAuthorizationPort,
    private readonly artifactVerifier: ArtifactVerificationPort,
  ) {}

  async createApplication(
    actor: ActorContext,
    input: CreateApplicationInput,
  ): Promise<ApplicationRecord> {
    await this.assertAuthorized(actor, allowedActions.create);
    return this.repository.withTransaction(async (repository) => {
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
    const verification = await this.artifactVerifier.verifyArtifact({
      artifactKey: input.artifactKey,
      expectedSha256: input.artifactSha256,
      signature: input.artifactSignature,
    });
    if (
      !verification.accepted ||
      verification.scanStatus !== "passed" ||
      verification.sha256 !== input.artifactSha256
    ) {
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
    return this.repository.withTransaction(async (repository) => {
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
    });
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
    return this.repository.withTransaction(async (repository) => {
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
    });
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
    if (
      requiredDeliveryChannels.some(
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

  async getApplication(applicationId: string): Promise<ApplicationRecord> {
    return this.requireApplication(applicationId);
  }

  listVersions(applicationId: string) {
    return this.repository.listVersions(applicationId);
  }

  listDeliveries(applicationId: string) {
    return this.repository.listDeliveries(applicationId);
  }

  listReviews(applicationId: string) {
    return this.repository.listReviews(applicationId);
  }

  async getReviewQueue(applicationVersionId: string): Promise<ReviewQueueView> {
    const queue = await this.requireReviewQueue(applicationVersionId);
    return {
      ...queue,
      slaStatus: queue.slaDueAt.getTime() < Date.now() ? "overdue" : "on_time",
    };
  }

  async getPublishedVersion(
    applicationId: string,
  ): Promise<ApplicationVersionRecord> {
    const application = await this.requireApplication(applicationId);
    if (application.currentVersionId === null) {
      throw new Error("PUBLISHED_VERSION_NOT_FOUND");
    }
    const version = await this.repository.findVersion(
      application.currentVersionId,
    );
    if (version === null) throw new Error("PUBLISHED_VERSION_NOT_FOUND");
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
