import type { ActorContext } from "@ai-hub/contracts";
import type {
  InteractionAuthorizationPort,
  InteractionRepository,
  ReportRecord,
} from "./interaction.types.js";
import type { CatalogVisibilityPort } from "../catalog/catalog-visibility.policy.js";
import type { AnalyticsBehaviorEventRecorder } from "../analytics/analytics.types.js";

export class InteractionService {
  constructor(
    private readonly repository: InteractionRepository,
    private readonly authorization: InteractionAuthorizationPort,
    private readonly visibility: CatalogVisibilityPort,
    private readonly analyticsEvents?: AnalyticsBehaviorEventRecorder,
  ) {}

  async toggleLike(actor: ActorContext, applicationId: string) {
    await this.assertAllowed(actor, "interact");
    await this.visibility.requireVisible(actor, applicationId);
    await this.requireApplication(applicationId);
    return this.repository.withTransaction(async (repository) => {
      const liked = await repository.hasLike(applicationId, actor.employeeId);
      if (liked) await repository.removeLike(applicationId, actor.employeeId);
      else await repository.addLike(applicationId, actor.employeeId);
      await repository.recordAudit({
        applicationId,
        actorEmployeeId: actor.employeeId,
        eventType: liked
          ? "interaction.like.removed"
          : "interaction.like.added",
      });
      await repository.emitOutbox?.({
        applicationId,
        eventType: liked
          ? "interaction.like.removed"
          : "interaction.like.added",
      });
      if (!liked) {
        await this.analyticsEvents?.record(actor, {
          eventName: "application_liked",
          aggregateType: "application",
          aggregateId: applicationId,
          occurredAt: new Date().toISOString(),
          idempotencyKey: `application-liked:${applicationId}:${actor.employeeId}:${Date.now()}`,
          metadata: { source: "interaction.like" },
        });
      }
      return { liked: !liked };
    });
  }

  async rate(
    actor: ActorContext,
    input: {
      applicationId: string;
      stars: number;
      body?: string;
      displayAnonymously?: boolean;
    },
  ) {
    await this.assertAllowed(actor, "interact");
    if (!Number.isInteger(input.stars) || input.stars < 1 || input.stars > 5) {
      throw new Error("RATING_STARS_INVALID");
    }
    await this.visibility.requireVisible(actor, input.applicationId);
    const application = await this.requireApplication(input.applicationId);
    const versionId = await this.repository.findCurrentVersionId(
      input.applicationId,
    );
    return this.repository.withTransaction(async (repository) => {
      const rating = await repository.upsertRating({
        applicationId: input.applicationId,
        applicationVersionId: versionId,
        employeeId: actor.employeeId,
        stars: input.stars,
        body: input.body ?? null,
        displayAnonymously: input.displayAnonymously ?? false,
      });
      await repository.recordAudit({
        applicationId: application.applicationId,
        actorEmployeeId: actor.employeeId,
        eventType: "interaction.rating.updated",
      });
      await repository.emitOutbox?.({
        applicationId: application.applicationId,
        eventType: "interaction.rating.updated",
      });
      await this.analyticsEvents?.record(actor, {
        eventName: "application_rated",
        aggregateType: "application",
        aggregateId: input.applicationId,
        occurredAt: new Date().toISOString(),
        idempotencyKey: `application-rated:${rating.ratingId}`,
        metadata: { source: "interaction.rating" },
      });
      return rating;
    });
  }

  /** 普通员工创建根评论（最大两级：根评论 + 一级回复）。 */
  async createComment(
    actor: ActorContext,
    input: {
      applicationId: string;
      body: string;
      displayAnonymously?: boolean;
    },
  ) {
    await this.assertAllowed(actor, "interact");
    await this.visibility.requireVisible(actor, input.applicationId);
    await this.requireApplication(input.applicationId);
    if (input.body.trim().length === 0) {
      throw new Error("COMMENT_BODY_REQUIRED");
    }
    const versionId = await this.repository.findCurrentVersionId(
      input.applicationId,
    );
    return this.repository.withTransaction(async (repository) => {
      const comment = await repository.createComment({
        applicationId: input.applicationId,
        applicationVersionId: versionId,
        parentCommentId: null,
        authorEmployeeId: actor.employeeId,
        body: input.body.trim(),
        displayAnonymously: input.displayAnonymously ?? false,
        commentKind: "user",
        hiddenAt: null,
      });
      await repository.emitOutbox?.({
        applicationId: input.applicationId,
        eventType: "interaction.comment.created",
      });
      await this.analyticsEvents?.record(actor, {
        eventName: "application_commented",
        aggregateType: "application",
        aggregateId: input.applicationId,
        occurredAt: new Date().toISOString(),
        idempotencyKey: `application-commented:${comment.commentId}`,
        metadata: { source: "interaction.comment" },
      });
      return comment;
    });
  }

  /** 所有者/维护者回复一级评论（官方回复，保留两级深度约束）。 */
  async replyComment(
    actor: ActorContext,
    input: {
      applicationId: string;
      parentCommentId: string;
      body: string;
    },
  ) {
    await this.assertAllowed(actor, "interact");
    await this.visibility.requireVisibleOrManageable(actor, input.applicationId);
    const application = await this.requireApplication(input.applicationId);
    if (
      application.ownerEmployeeId !== actor.employeeId &&
      application.maintainerEmployeeId !== actor.employeeId
    ) {
      throw new Error("OFFICIAL_REPLY_FORBIDDEN");
    }
    if (input.body.trim().length === 0) {
      throw new Error("COMMENT_BODY_REQUIRED");
    }
    const parent = await this.repository.findComment(input.parentCommentId);
    if (parent === null || parent.applicationId !== input.applicationId) {
      throw new Error("COMMENT_NOT_FOUND");
    }
    if (parent.parentCommentId !== null)
      throw new Error("COMMENT_DEPTH_EXCEEDED");
    const versionId = await this.repository.findCurrentVersionId(
      input.applicationId,
    );
    return this.repository.withTransaction(async (repository) => {
      const comment = await repository.createComment({
        applicationId: input.applicationId,
        applicationVersionId: versionId,
        parentCommentId: input.parentCommentId,
        authorEmployeeId: actor.employeeId,
        body: input.body.trim(),
        displayAnonymously: false,
        commentKind: "official",
        hiddenAt: null,
      });
      await repository.emitOutbox?.({
        applicationId: input.applicationId,
        eventType: "interaction.comment.created",
      });
      await this.analyticsEvents?.record(actor, {
        eventName: "application_commented",
        aggregateType: "application",
        aggregateId: input.applicationId,
        occurredAt: new Date().toISOString(),
        idempotencyKey: `application-commented:${comment.commentId}`,
        metadata: { source: "interaction.comment.official" },
      });
      return comment;
    });
  }

  async report(
    actor: ActorContext,
    input: { applicationId: string; commentId: string; reason: string },
  ) {
    await this.assertAllowed(actor, "interact");
    await this.visibility.requireVisible(actor, input.applicationId);
    const comment = await this.repository.findComment(input.commentId);
    if (comment === null || comment.applicationId !== input.applicationId) {
      throw new Error("COMMENT_NOT_FOUND");
    }
    return this.repository.withTransaction(async (repository) => {
      const report = await repository.createReport({
        applicationId: input.applicationId,
        commentId: input.commentId,
        reporterEmployeeId: actor.employeeId,
        reason: input.reason,
        status: "open",
        resolvedByEmployeeId: null,
        resolvedAt: null,
      });
      await repository.emitOutbox?.({
        applicationId: input.applicationId,
        eventType: "interaction.report.created",
      });
      return report;
    });
  }

  async resolveReport(
    actor: ActorContext,
    reportId: string,
    status: ReportRecord["status"],
  ) {
    await this.assertAllowed(actor, "moderate");
    const existing = await this.repository.findReport(reportId);
    if (existing === null) throw new Error("REPORT_NOT_FOUND");
    await this.visibility.requireVisible(actor, existing.applicationId);
    return this.repository.withTransaction(async (repository) => {
      const report = await repository.resolveReport(
        reportId,
        status,
        actor.employeeId,
      );
      await repository.emitOutbox?.({
        applicationId: report.applicationId,
        eventType: "interaction.report.resolved",
      });
      return report;
    });
  }

  async lookupAnonymousAuthor(actor: ActorContext, commentId: string) {
    const decision = await this.authorization.authorize({
      actor,
      action: "anonymous_audit",
      resourceType: "interaction",
    });
    if (!decision.allowed) throw new Error("ANONYMOUS_IDENTITY_FORBIDDEN");
    const comment = await this.repository.findComment(commentId);
    if (comment === null) throw new Error("COMMENT_NOT_FOUND");
    await this.visibility.requireVisible(actor, comment.applicationId);
    await this.repository.recordAudit({
      applicationId: comment.applicationId,
      actorEmployeeId: actor.employeeId,
      eventType: "interaction.anonymous_identity.viewed",
      details: { commentId },
    });
    return comment.authorEmployeeId;
  }

  async listRatings(
    actor: ActorContext,
    applicationId: string,
    page: number,
    pageSize: number,
  ) {
    await this.assertAllowed(actor, "interact");
    await this.visibility.requireVisible(actor, applicationId);
    await this.requireApplication(applicationId);
    if (page < 1 || pageSize < 1 || pageSize > 100) {
      throw new Error("INTERACTION_PAGINATION_INVALID");
    }
    return this.repository.listRatings({ applicationId, page, pageSize });
  }

  async listComments(
    actor: ActorContext,
    applicationId: string,
    page: number,
    pageSize: number,
  ) {
    await this.assertAllowed(actor, "interact");
    await this.visibility.requireVisibleOrManageable(actor, applicationId);
    await this.requireApplication(applicationId);
    if (page < 1 || pageSize < 1 || pageSize > 100) {
      throw new Error("INTERACTION_PAGINATION_INVALID");
    }
    return this.repository.listComments({ applicationId, page, pageSize });
  }

  async hideComment(
    actor: ActorContext,
    applicationId: string,
    commentId: string,
  ) {
    await this.assertAllowed(actor, "moderate");
    await this.visibility.requireVisible(actor, applicationId);
    const comment = await this.repository.findComment(commentId);
    if (comment === null || comment.applicationId !== applicationId) {
      throw new Error("COMMENT_NOT_FOUND");
    }
    return this.repository.withTransaction(async (repository) => {
      const updated = await repository.hideComment(commentId);
      await repository.recordAudit({
        applicationId,
        actorEmployeeId: actor.employeeId,
        eventType: "interaction.comment.hidden",
        details: { commentId },
      });
      await repository.emitOutbox?.({
        applicationId,
        eventType: "interaction.comment.hidden",
      });
      return updated;
    });
  }

  async restoreComment(
    actor: ActorContext,
    applicationId: string,
    commentId: string,
  ) {
    await this.assertAllowed(actor, "moderate");
    await this.visibility.requireVisible(actor, applicationId);
    const comment = await this.repository.findComment(commentId);
    if (comment === null || comment.applicationId !== applicationId) {
      throw new Error("COMMENT_NOT_FOUND");
    }
    return this.repository.withTransaction(async (repository) => {
      const updated = await repository.restoreComment(commentId);
      await repository.recordAudit({
        applicationId,
        actorEmployeeId: actor.employeeId,
        eventType: "interaction.comment.restored",
        details: { commentId },
      });
      await repository.emitOutbox?.({
        applicationId,
        eventType: "interaction.comment.restored",
      });
      return updated;
    });
  }

  private async requireApplication(applicationId: string) {
    const application = await this.repository.findApplication(applicationId);
    if (application === null) throw new Error("APPLICATION_NOT_FOUND");
    return application;
  }

  private async assertAllowed(actor: ActorContext, action: string) {
    const decision = await this.authorization.authorize({
      actor,
      action,
      resourceType: "interaction",
    });
    if (!decision.allowed) throw new Error("NOT_AUTHORIZED");
  }
}
