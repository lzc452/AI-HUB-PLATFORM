import type {
  ActorContext,
  CreateDemandInput,
  DemandStatus,
} from "@ai-hub/contracts";
import type {
  DemandAuthorizationPort,
  DemandCommentRecord,
  DemandDraftInput,
  DemandEntry,
  DemandListResult,
  DemandReportRecord,
  DemandRepository,
} from "./demand.types.js";

const reviewableStatuses = new Set<DemandStatus>(["draft", "rejected"]);

export class DemandService {
  constructor(
    private readonly repository: DemandRepository,
    private readonly authorization: DemandAuthorizationPort,
  ) {}

  async createDraft(
    actor: ActorContext,
    input: DemandDraftInput,
  ): Promise<DemandEntry> {
    await this.assertAllowed(actor, "create");
    const normalized = this.normalizeInput(input);
    return this.repository.withTransaction(async (repository) => {
      const demand = await repository.createDraft({
        requesterEmployeeId: actor.employeeId,
        title: normalized.title,
        problemStatement: normalized.problemStatement,
        desiredOutcome: normalized.desiredOutcome,
        audienceType: normalized.audienceType,
        departmentId: normalized.departmentId,
        employeeId: normalized.employeeId,
        includeChildren: normalized.includeChildren,
        displayAnonymously: normalized.displayAnonymously,
      });
      await this.recordMutation(repository, demand, actor, "demand.created");
      return demand;
    });
  }

  async saveDraft(
    actor: ActorContext,
    demandId: string,
    expectedVersion: number,
    input: Partial<DemandDraftInput>,
  ): Promise<DemandEntry> {
    await this.assertAllowed(actor, "update", demandId);
    const current = await this.requireDemand(demandId);
    this.assertRequester(actor, current);
    if (!reviewableStatuses.has(current.status)) {
      throw new Error("DEMAND_DRAFT_NOT_EDITABLE");
    }
    const normalized = this.normalizePartialInput(input, current);
    return this.repository.withTransaction(async (repository) => {
      const updated = await repository.updateDraft(
        demandId,
        expectedVersion,
        normalized,
      );
      await this.recordMutation(repository, updated, actor, "demand.updated");
      return updated;
    });
  }

  async submitForReview(
    actor: ActorContext,
    demandId: string,
  ): Promise<DemandEntry> {
    await this.assertAllowed(actor, "submit", demandId);
    const current = await this.requireDemand(demandId);
    this.assertRequester(actor, current);
    if (!reviewableStatuses.has(current.status)) {
      throw new Error("DEMAND_SUBMIT_INVALID_STATE");
    }
    return this.repository.withTransaction(async (repository) => {
      const submitted = await repository.transitionStatus(
        demandId,
        "pending_review",
        current.version,
        null,
      );
      await this.recordMutation(
        repository,
        submitted,
        actor,
        "demand.submitted",
      );
      return submitted;
    });
  }

  async review(
    actor: ActorContext,
    demandId: string,
    decision: "publish" | "reject",
    reason?: string,
  ): Promise<DemandEntry> {
    await this.assertAllowed(actor, "review", demandId);
    if (
      !actor.roleCodes.some((role) =>
        ["demand_reviewer", "demand_operator", "super_admin"].includes(role),
      )
    ) {
      throw new Error("DEMAND_REVIEW_FORBIDDEN");
    }
    const current = await this.requireDemand(demandId);
    if (current.status !== "pending_review") {
      throw new Error("DEMAND_REVIEW_INVALID_STATE");
    }
    if (decision === "reject" && !reason?.trim()) {
      throw new Error("DEMAND_REJECTION_REASON_REQUIRED");
    }
    const nextStatus: DemandStatus =
      decision === "publish" ? "published" : "rejected";
    return this.repository.withTransaction(async (repository) => {
      const reviewed = await repository.transitionStatus(
        demandId,
        nextStatus,
        current.version,
        decision === "reject" ? reason!.trim() : null,
      );
      await this.recordMutation(
        repository,
        reviewed,
        actor,
        "demand.reviewed",
        {
          decision,
          reason: decision === "reject" ? reason!.trim() : null,
        },
      );
      return reviewed;
    });
  }

  async list(
    actor: ActorContext,
    input: {
      status?: DemandStatus;
      query?: string;
      page: number;
      pageSize: number;
    },
  ): Promise<DemandListResult> {
    if (input.page < 1 || input.pageSize < 1 || input.pageSize > 100) {
      throw new Error("DEMAND_PAGINATION_INVALID");
    }
    await this.assertAllowed(actor, "read");
    const visible = await this.repository.listVisible({
      actor,
      ...(input.status === undefined ? {} : { status: input.status }),
      ...(input.query === undefined ? {} : { query: input.query }),
    });
    const start = (input.page - 1) * input.pageSize;
    return {
      items: visible
        .slice(start, start + input.pageSize)
        .map((demand) => this.projectDemand(actor, demand)),
      total: visible.length,
      page: input.page,
      pageSize: input.pageSize,
    };
  }

  async getDetail(actor: ActorContext, demandId: string): Promise<DemandEntry> {
    await this.assertAllowed(actor, "read", demandId);
    const demand = await this.repository.findVisible(actor, demandId);
    if (demand === null) throw new Error("DEMAND_NOT_FOUND");
    return this.projectDemand(actor, demand);
  }

  async toggleLike(
    actor: ActorContext,
    demandId: string,
  ): Promise<{ liked: boolean }> {
    await this.assertAllowed(actor, "interact", demandId);
    await this.getDetail(actor, demandId);
    return this.repository.withTransaction(async (repository) => {
      const currentlyLiked = await repository.hasLike(
        demandId,
        actor.employeeId,
      );
      if (currentlyLiked) {
        await repository.removeLike(demandId, actor.employeeId);
      } else {
        await repository.addLike(demandId, actor.employeeId);
      }
      await repository.recordAudit({
        demandId,
        actorEmployeeId: actor.employeeId,
        eventType: currentlyLiked ? "demand.unliked" : "demand.liked",
      });
      await repository.emitOutbox({
        demandId,
        eventType: currentlyLiked ? "demand.unliked" : "demand.liked",
      });
      return { liked: !currentlyLiked };
    });
  }

  async addComment(
    actor: ActorContext,
    input: {
      demandId: string;
      parentCommentId: string | null;
      body: string;
      displayAnonymously?: boolean;
    },
  ): Promise<DemandCommentRecord> {
    await this.assertAllowed(actor, "interact", input.demandId);
    await this.getDetail(actor, input.demandId);
    const body = input.body.trim();
    if (body.length < 2 || body.length > 5_000) {
      throw new Error("DEMAND_COMMENT_INVALID");
    }
    if (input.parentCommentId !== null) {
      const parent = await this.repository.findComment(input.parentCommentId);
      if (parent === null || parent.demandId !== input.demandId) {
        throw new Error("DEMAND_COMMENT_NOT_FOUND");
      }
      if (parent.parentCommentId !== null) {
        throw new Error("DEMAND_COMMENT_DEPTH_EXCEEDED");
      }
    }
    return this.repository.withTransaction(async (repository) => {
      const comment = await repository.createComment({
        demandId: input.demandId,
        parentCommentId: input.parentCommentId,
        authorEmployeeId: actor.employeeId,
        body,
        displayAnonymously: input.displayAnonymously ?? false,
        hiddenAt: null,
      });
      await repository.recordAudit({
        demandId: input.demandId,
        actorEmployeeId: actor.employeeId,
        eventType: "demand.comment.created",
        details: { commentId: comment.commentId },
      });
      await repository.emitOutbox({
        demandId: input.demandId,
        eventType: "demand.comment.created",
      });
      return comment;
    });
  }

  async listComments(
    actor: ActorContext,
    demandId: string,
  ): Promise<readonly DemandCommentRecord[]> {
    await this.getDetail(actor, demandId);
    const comments = await this.repository.listComments(demandId);
    return comments
      .filter((comment) => comment.hiddenAt === null)
      .map((comment) => this.projectComment(actor, comment));
  }

  async report(
    actor: ActorContext,
    input: { demandId: string; commentId: string | null; reason: string },
  ): Promise<DemandReportRecord> {
    await this.assertAllowed(actor, "interact", input.demandId);
    await this.getDetail(actor, input.demandId);
    if (input.commentId !== null) {
      const comment = await this.repository.findComment(input.commentId);
      if (comment === null || comment.demandId !== input.demandId) {
        throw new Error("DEMAND_COMMENT_NOT_FOUND");
      }
    }
    const reason = input.reason.trim();
    if (reason.length < 3 || reason.length > 2_000) {
      throw new Error("DEMAND_REPORT_INVALID");
    }
    return this.repository.withTransaction(async (repository) => {
      const report = await repository.createReport({
        demandId: input.demandId,
        commentId: input.commentId,
        reporterEmployeeId: actor.employeeId,
        reason,
        status: "open",
        resolvedByEmployeeId: null,
        resolvedAt: null,
      });
      await repository.recordAudit({
        demandId: input.demandId,
        actorEmployeeId: actor.employeeId,
        eventType: "demand.report.created",
        details: { reportId: report.reportId },
      });
      await repository.emitOutbox({
        demandId: input.demandId,
        eventType: "demand.report.created",
      });
      return report;
    });
  }

  async resolveReport(
    actor: ActorContext,
    reportId: string,
    status: DemandReportRecord["status"],
  ): Promise<DemandReportRecord> {
    await this.assertAllowed(actor, "moderate");
    if (
      !actor.roleCodes.some((role) =>
        ["demand_moderator", "demand_operator", "super_admin"].includes(role),
      )
    ) {
      throw new Error("DEMAND_MODERATION_FORBIDDEN");
    }
    return this.repository.withTransaction(async (repository) => {
      const report = await repository.resolveReport(
        reportId,
        status,
        actor.employeeId,
      );
      if (
        report.commentId !== null &&
        (status === "hidden" || status === "restored")
      ) {
        await repository.setCommentHidden(
          report.commentId,
          status === "hidden" ? new Date() : null,
        );
      }
      await repository.recordAudit({
        demandId: report.demandId,
        actorEmployeeId: actor.employeeId,
        eventType: "demand.report.resolved",
        details: { reportId, status },
      });
      await repository.emitOutbox({
        demandId: report.demandId,
        eventType: "demand.report.resolved",
      });
      return report;
    });
  }

  async lookupAnonymousAuthor(
    actor: ActorContext,
    commentId: string,
  ): Promise<string> {
    await this.assertAllowed(actor, "anonymous_audit");
    const comment = await this.repository.findComment(commentId);
    if (comment === null) throw new Error("DEMAND_COMMENT_NOT_FOUND");
    await this.repository.recordAudit({
      demandId: comment.demandId,
      actorEmployeeId: actor.employeeId,
      eventType: "demand.anonymous_identity.viewed",
      details: { commentId },
    });
    return comment.authorEmployeeId;
  }

  private projectDemand(actor: ActorContext, demand: DemandEntry): DemandEntry {
    if (
      !demand.displayAnonymously ||
      demand.requesterEmployeeId === actor.employeeId ||
      actor.roleCodes.includes("super_admin")
    ) {
      return demand;
    }
    return { ...demand, requesterEmployeeId: null };
  }

  private projectComment(
    actor: ActorContext,
    comment: DemandCommentRecord,
  ): DemandCommentRecord {
    if (
      !comment.displayAnonymously ||
      comment.authorEmployeeId === actor.employeeId ||
      actor.roleCodes.includes("super_admin")
    ) {
      return comment;
    }
    return { ...comment, authorEmployeeId: "" };
  }

  private normalizeInput(
    input: DemandDraftInput,
  ): Required<
    Pick<
      DemandDraftInput,
      | "title"
      | "problemStatement"
      | "desiredOutcome"
      | "audienceType"
      | "includeChildren"
      | "displayAnonymously"
    >
  > & { departmentId: string | null; employeeId: string | null } {
    const title = input.title.trim();
    const problemStatement = input.problemStatement.trim();
    const desiredOutcome = input.desiredOutcome.trim();
    if (
      title.length < 3 ||
      title.length > 200 ||
      problemStatement.length < 10 ||
      desiredOutcome.length < 10
    ) {
      throw new Error("DEMAND_FIELD_INVALID");
    }
    if (
      input.audienceType === "department" &&
      input.departmentId?.trim() === undefined
    ) {
      throw new Error("DEMAND_AUDIENCE_INVALID");
    }
    if (
      input.audienceType === "employee" &&
      input.employeeId?.trim() === undefined
    ) {
      throw new Error("DEMAND_AUDIENCE_INVALID");
    }
    if (
      input.audienceType === "all" &&
      (input.departmentId !== undefined || input.employeeId !== undefined)
    ) {
      throw new Error("DEMAND_AUDIENCE_INVALID");
    }
    return {
      title,
      problemStatement,
      desiredOutcome,
      audienceType: input.audienceType,
      departmentId: input.departmentId?.trim() ?? null,
      employeeId: input.employeeId?.trim() ?? null,
      includeChildren: input.includeChildren ?? false,
      displayAnonymously: input.displayAnonymously ?? false,
    };
  }

  private normalizePartialInput(
    input: Partial<DemandDraftInput>,
    current: DemandEntry,
  ) {
    const draft: DemandDraftInput = {
      title: input.title ?? current.title,
      problemStatement: input.problemStatement ?? current.problemStatement,
      desiredOutcome: input.desiredOutcome ?? current.desiredOutcome,
      audienceType: input.audienceType ?? current.audienceType,
      includeChildren:
        input.includeChildren ?? current.includeChildren ?? false,
      displayAnonymously:
        input.displayAnonymously ?? current.displayAnonymously,
    };
    if (input.departmentId !== undefined) {
      draft.departmentId = input.departmentId;
    } else if (current.audienceDepartmentId !== null) {
      draft.departmentId = current.audienceDepartmentId;
    }
    if (input.employeeId !== undefined) {
      draft.employeeId = input.employeeId;
    } else if (
      current.audienceEmployeeId !== null &&
      current.audienceEmployeeId !== undefined
    ) {
      draft.employeeId = current.audienceEmployeeId;
    }
    const normalized = this.normalizeInput(draft);
    return normalized;
  }

  private async requireDemand(demandId: string): Promise<DemandEntry> {
    const demand = await this.repository.findById(demandId);
    if (demand === null) throw new Error("DEMAND_NOT_FOUND");
    return demand;
  }

  private assertRequester(actor: ActorContext, demand: DemandEntry): void {
    if (demand.requesterEmployeeId !== actor.employeeId) {
      throw new Error("DEMAND_REQUESTER_REQUIRED");
    }
  }

  private async assertAllowed(
    actor: ActorContext,
    action: string,
    resourceId?: string,
  ): Promise<void> {
    const decision = await this.authorization.authorize({
      actor,
      action,
      resourceType: "demand",
      ...(resourceId === undefined ? {} : { resourceId }),
    });
    if (!decision.allowed) {
      throw new Error(
        action === "review"
          ? "DEMAND_REVIEW_FORBIDDEN"
          : "DEMAND_NOT_AUTHORIZED",
      );
    }
  }

  private async recordMutation(
    repository: DemandRepository,
    demand: DemandEntry,
    actor: ActorContext,
    eventType: string,
    details: unknown = {},
  ): Promise<void> {
    await repository.recordAudit({
      demandId: demand.demandId,
      actorEmployeeId: actor.employeeId,
      eventType,
      details,
    });
    await repository.emitOutbox({ demandId: demand.demandId, eventType });
  }
}
