import type { ActorContext } from "@ai-hub/contracts";
import type { CatalogVisibilityPort } from "../catalog/catalog-visibility.policy.js";
import type { AnalyticsBehaviorEventRecorder } from "../analytics/analytics.types.js";
import type {
  FeedbackRecord,
  FeedbackRepository,
  FeedbackStatus,
  FeedbackType,
} from "./feedback.types.js";

export class FeedbackService {
  constructor(
    private readonly repository: FeedbackRepository,
    private readonly visibility: CatalogVisibilityPort,
    private readonly analyticsEvents?: AnalyticsBehaviorEventRecorder,
  ) {}

  async createFeedback(
    actor: ActorContext,
    input: {
      applicationId: string;
      type: FeedbackType;
      body: string;
    },
  ): Promise<FeedbackRecord> {
    if (input.body.trim().length === 0)
      throw new Error("FEEDBACK_BODY_REQUIRED");
    const catalogEntry = await this.visibility.requireVisible(
      actor,
      input.applicationId,
    );
    return this.repository.withTransaction(async (repository) => {
      const record = await repository.createFeedback({
        applicationId: input.applicationId,
        applicationVersionId: catalogEntry.currentVersionId,
        creatorEmployeeId: actor.employeeId,
        type: input.type,
        body: input.body.trim(),
        status: "open",
        assigneeEmployeeId: null,
        resolution: null,
      });
      await repository.recordAudit({
        applicationId: input.applicationId,
        actorEmployeeId: actor.employeeId,
        eventType: "feedback.created",
        details: { feedbackId: record.feedbackId, type: record.type },
      });
      await repository.emitOutbox({
        applicationId: input.applicationId,
        eventType: "feedback.created",
        idempotencyKey: `feedback-created:${record.feedbackId}`,
      });
      await this.analyticsEvents?.record(actor, {
        eventName: "feedback_submitted",
        aggregateType: "feedback",
        aggregateId: record.feedbackId,
        occurredAt: new Date().toISOString(),
        idempotencyKey: `feedback-submitted:${record.feedbackId}`,
        metadata: { source: "feedback.create" },
      });
      return record;
    });
  }

  async listMyFeedback(
    actor: ActorContext,
    applicationId: string,
  ): Promise<readonly FeedbackRecord[]> {
    await this.visibility.requireVisible(actor, applicationId);
    return this.repository.listFeedbackByCreator(
      applicationId,
      actor.employeeId,
    );
  }

  /** 所有者/维护者查看该应用收到的全部反馈（含非发布态自有应用）。 */
  async listApplicationFeedback(
    actor: ActorContext,
    applicationId: string,
  ): Promise<readonly FeedbackRecord[]> {
    await this.visibility.requireVisibleOrManageable(actor, applicationId);
    const application = await this.repository.findApplication(applicationId);
    if (application === null) throw new Error("APPLICATION_NOT_FOUND");
    if (
      application.ownerEmployeeId !== actor.employeeId &&
      application.maintainerEmployeeId !== actor.employeeId
    ) {
      throw new Error("OFFICIAL_FEEDBACK_VIEW_FORBIDDEN");
    }
    return this.repository.listByApplication(applicationId);
  }

  async updateFeedbackStatus(
    actor: ActorContext,
    input: {
      applicationId: string;
      feedbackId: string;
      status: FeedbackStatus;
      resolution?: string;
    },
  ): Promise<FeedbackRecord> {
    await this.visibility.requireVisibleOrManageable(
      actor,
      input.applicationId,
    );
    const terminal = input.status === "resolved" || input.status === "closed";
    const resolution = input.resolution?.trim() ?? "";
    if (terminal && resolution.length === 0) {
      throw new Error("FEEDBACK_RESOLUTION_REQUIRED");
    }
    return this.repository.withTransaction(async (repository) => {
      const application = await repository.findApplication(input.applicationId);
      if (application === null) throw new Error("APPLICATION_NOT_FOUND");
      if (
        application.ownerEmployeeId !== actor.employeeId &&
        application.maintainerEmployeeId !== actor.employeeId
      ) {
        throw new Error("OFFICIAL_FEEDBACK_UPDATE_FORBIDDEN");
      }
      const existing = await repository.findFeedback(input.feedbackId);
      if (existing === null) throw new Error("FEEDBACK_NOT_FOUND");
      if (existing.applicationId !== input.applicationId) {
        throw new Error("FEEDBACK_APPLICATION_MISMATCH");
      }
      const updated = await repository.updateFeedback(input.feedbackId, {
        status: input.status,
        resolution: terminal ? resolution : null,
        resolvedAt: terminal ? new Date() : null,
      });
      if (updated === null) throw new Error("FEEDBACK_NOT_FOUND");
      await repository.recordAudit({
        applicationId: input.applicationId,
        actorEmployeeId: actor.employeeId,
        eventType: "feedback.status.updated",
        details: {
          feedbackId: input.feedbackId,
          previousStatus: existing.status,
          status: updated.status,
        },
      });
      await repository.emitOutbox({
        applicationId: input.applicationId,
        eventType: "feedback.status.updated",
        idempotencyKey: `feedback-status-updated:${input.feedbackId}:${input.status}`,
      });
      if (terminal) {
        await this.analyticsEvents?.record(actor, {
          eventName: "feedback_resolved",
          aggregateType: "feedback",
          aggregateId: input.feedbackId,
          occurredAt: new Date().toISOString(),
          idempotencyKey: `feedback-resolved:${input.feedbackId}:${input.status}`,
          metadata: { source: "feedback.status.updated" },
        });
      }
      return updated;
    });
  }
}
