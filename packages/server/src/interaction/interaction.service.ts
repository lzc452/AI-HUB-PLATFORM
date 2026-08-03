import type { ActorContext } from "@ai-hub/contracts";
import type {
  InteractionAuthorizationPort,
  InteractionRepository,
  ReportRecord,
} from "./interaction.types.js";

export class InteractionService {
  constructor(
    private readonly repository: InteractionRepository,
    private readonly authorization: InteractionAuthorizationPort,
  ) {}

  async toggleLike(actor: ActorContext, applicationId: string) {
    await this.assertAllowed(actor, "interact");
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
      return rating;
    });
  }

  async reply(
    actor: ActorContext,
    input: {
      applicationId: string;
      parentCommentId: string | null;
      body: string;
    },
  ) {
    await this.assertAllowed(actor, "interact");
    const application = await this.requireApplication(input.applicationId);
    if (
      application.ownerEmployeeId !== actor.employeeId &&
      application.maintainerEmployeeId !== actor.employeeId
    ) {
      throw new Error("OFFICIAL_REPLY_FORBIDDEN");
    }
    if (input.parentCommentId !== null) {
      const parent = await this.repository.findComment(input.parentCommentId);
      if (parent === null || parent.applicationId !== input.applicationId) {
        throw new Error("COMMENT_NOT_FOUND");
      }
      if (parent.parentCommentId !== null)
        throw new Error("COMMENT_DEPTH_EXCEEDED");
    }
    const versionId = await this.repository.findCurrentVersionId(
      input.applicationId,
    );
    return this.repository.withTransaction(async (repository) => {
      const comment = await repository.createComment({
        applicationId: input.applicationId,
        applicationVersionId: versionId,
        parentCommentId: input.parentCommentId,
        authorEmployeeId: actor.employeeId,
        body: input.body,
        displayAnonymously: false,
        hiddenAt: null,
      });
      await repository.emitOutbox?.({
        applicationId: input.applicationId,
        eventType: "interaction.comment.created",
      });
      return comment;
    });
  }

  async report(
    actor: ActorContext,
    input: { applicationId: string; commentId: string; reason: string },
  ) {
    await this.assertAllowed(actor, "interact");
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
    await this.repository.recordAudit({
      applicationId: comment.applicationId,
      actorEmployeeId: actor.employeeId,
      eventType: "interaction.anonymous_identity.viewed",
      details: { commentId },
    });
    return comment.authorEmployeeId;
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
