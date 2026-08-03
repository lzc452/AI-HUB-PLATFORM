import type {
  ActorContext,
  DemandApplicationRole,
  DemandPriorityInput,
  DemandStatus,
} from "@ai-hub/contracts";
import type {
  DemandAuthorizationPort,
  DemandCommentRecord,
  DemandCollaboratorRecord,
  DemandDraftInput,
  DemandEntry,
  DemandListResult,
  DemandApplicationLinkRecord,
  DemandApplicationBridge,
  DemandPilotRecord,
  DemandProgressRecord,
  DemandReportRecord,
  DemandRepository,
} from "./demand.types.js";
import type { AnalyticsBehaviorEventRecorder } from "../analytics/analytics.types.js";

const reviewableStatuses = new Set<DemandStatus>(["draft", "rejected"]);
const statusTransitions: Readonly<
  Record<DemandStatus, readonly DemandStatus[]>
> = {
  draft: [],
  pending_review: [],
  rejected: [],
  published: ["in_progress", "closed"],
  in_progress: ["pilot", "completed", "closed"],
  pilot: ["completed", "closed"],
  completed: ["closed"],
  closed: [],
  merged: [],
};

export class DemandService {
  constructor(
    private readonly repository: DemandRepository,
    private readonly authorization: DemandAuthorizationPort,
    private readonly applicationBridge?: DemandApplicationBridge,
    private readonly analyticsEvents?: AnalyticsBehaviorEventRecorder,
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

  async claim(
    actor: ActorContext,
    demandId: string,
    expectedVersion: number,
  ): Promise<DemandEntry> {
    await this.assertAllowed(actor, "claim", demandId);
    const current = await this.requireDemand(demandId);
    if (current.ownerEmployeeId !== null) {
      throw new Error("DEMAND_CONFLICT");
    }
    if (
      !new Set<DemandStatus>(["published", "in_progress", "pilot"]).has(
        current.status,
      )
    ) {
      throw new Error("DEMAND_CLAIM_INVALID_STATE");
    }
    return this.repository.withTransaction(async (repository) => {
      const claimed = await repository.claimOwner(
        demandId,
        actor.employeeId,
        expectedVersion,
      );
      await this.recordMutation(repository, claimed, actor, "demand.claimed", {
        ownerEmployeeId: actor.employeeId,
      });
      return claimed;
    });
  }

  async addCollaborator(
    actor: ActorContext,
    demandId: string,
    employeeId: string,
    role: DemandCollaboratorRecord["role"],
    expectedVersion: number,
  ): Promise<DemandCollaboratorRecord> {
    await this.assertAllowed(actor, "collaborate", demandId);
    const current = await this.requireDemand(demandId);
    if (current.ownerEmployeeId !== actor.employeeId) {
      throw new Error("DEMAND_OWNER_REQUIRED");
    }
    if (role === "owner") {
      throw new Error("DEMAND_COLLABORATOR_ROLE_INVALID");
    }
    return this.repository.withTransaction(async (repository) => {
      const collaborator = await repository.assignCollaborator(
        demandId,
        employeeId,
        role,
        expectedVersion,
      );
      await repository.recordAudit({
        demandId,
        actorEmployeeId: actor.employeeId,
        eventType: "demand.collaborator.assigned",
        details: { employeeId, role },
      });
      await repository.emitOutbox({
        demandId,
        eventType: "demand.collaborator.assigned",
      });
      return collaborator;
    });
  }

  async listCollaborators(
    actor: ActorContext,
    demandId: string,
  ): Promise<readonly DemandCollaboratorRecord[]> {
    await this.getDetail(actor, demandId);
    return this.repository.listCollaborators(demandId);
  }

  async setPriority(
    actor: ActorContext,
    demandId: string,
    expectedVersion: number,
    input: DemandPriorityInput,
  ): Promise<DemandEntry> {
    await this.assertAllowed(actor, "prioritize", demandId);
    if (
      !actor.roleCodes.some((role) =>
        ["demand_operator", "super_admin"].includes(role),
      )
    ) {
      throw new Error("DEMAND_PRIORITY_FORBIDDEN");
    }
    for (const value of Object.values(input)) {
      if (!Number.isInteger(value) || value < 1 || value > 5) {
        throw new Error("DEMAND_PRIORITY_INVALID");
      }
    }
    const score =
      input.businessValue * 3 +
      input.adminPriority * 2 -
      input.implementationCost * 2 -
      input.riskLevel * 2;
    const explanation =
      `businessValue=${input.businessValue}*3 + ` +
      `adminPriority=${input.adminPriority}*2 - ` +
      `implementationCost=${input.implementationCost}*2 - ` +
      `riskLevel=${input.riskLevel}*2 = ${score}`;
    return this.repository.withTransaction(async (repository) => {
      const prioritized = await repository.setPriority(
        demandId,
        input,
        expectedVersion,
        score,
        explanation,
      );
      await this.recordMutation(
        repository,
        prioritized,
        actor,
        "demand.priority.updated",
        {
          ...input,
          score,
          explanation,
        },
      );
      return prioritized;
    });
  }

  async advanceStatus(
    actor: ActorContext,
    demandId: string,
    expectedVersion: number,
    nextStatus: DemandStatus,
    reason?: string,
  ): Promise<DemandEntry> {
    await this.assertAllowed(actor, "progress", demandId);
    const current = await this.requireDemand(demandId);
    this.assertProgressActor(actor, current);
    if (!statusTransitions[current.status].includes(nextStatus)) {
      throw new Error("DEMAND_STATUS_TRANSITION_INVALID");
    }
    if (nextStatus === "closed" && !reason?.trim()) {
      throw new Error("DEMAND_CLOSE_REASON_REQUIRED");
    }
    return this.repository.withTransaction(async (repository) => {
      const updated = await repository.transitionStatus(
        demandId,
        nextStatus,
        expectedVersion,
        reason?.trim() ?? null,
      );
      await this.recordMutation(
        repository,
        updated,
        actor,
        "demand.status.changed",
        {
          from: current.status,
          to: nextStatus,
          reason: reason?.trim() ?? null,
        },
      );
      return updated;
    });
  }

  async addProgressUpdate(
    actor: ActorContext,
    demandId: string,
    input: { title: string; body: string },
  ): Promise<DemandProgressRecord> {
    await this.assertAllowed(actor, "progress", demandId);
    const current = await this.requireDemand(demandId);
    this.assertProgressActor(actor, current);
    const title = input.title.trim();
    const body = input.body.trim();
    if (
      title.length < 2 ||
      title.length > 200 ||
      body.length < 2 ||
      body.length > 5_000
    ) {
      throw new Error("DEMAND_PROGRESS_INVALID");
    }
    return this.repository.withTransaction(async (repository) => {
      const progress = await repository.createProgressUpdate({
        demandId,
        authorEmployeeId: actor.employeeId,
        status: current.status,
        title,
        body,
      });
      await repository.recordAudit({
        demandId,
        actorEmployeeId: actor.employeeId,
        eventType: "demand.progress.created",
        details: { progressId: progress.progressId },
      });
      await repository.emitOutbox({
        demandId,
        eventType: "demand.progress.created",
      });
      return progress;
    });
  }

  async listProgressUpdates(
    actor: ActorContext,
    demandId: string,
  ): Promise<readonly DemandProgressRecord[]> {
    await this.getDetail(actor, demandId);
    return this.repository.listProgressUpdates(demandId);
  }

  async createPilot(
    actor: ActorContext,
    demandId: string,
    input: {
      applicationId?: string;
      name: string;
      startsAt: Date;
      endsAt?: Date;
    },
  ): Promise<DemandPilotRecord> {
    await this.assertAllowed(actor, "progress", demandId);
    const current = await this.requireDemand(demandId);
    this.assertProgressActor(actor, current);
    if (current.status !== "in_progress" && current.status !== "pilot") {
      throw new Error("DEMAND_PILOT_INVALID_STATE");
    }
    const name = input.name.trim();
    if (name.length < 2 || name.length > 200) {
      throw new Error("DEMAND_PILOT_INVALID");
    }
    if (input.endsAt !== undefined && input.endsAt <= input.startsAt) {
      throw new Error("DEMAND_PILOT_INVALID_DATES");
    }
    return this.repository.withTransaction(async (repository) => {
      const pilot = await repository.createPilot({
        demandId,
        applicationId: input.applicationId ?? null,
        name,
        startsAt: input.startsAt,
        endsAt: input.endsAt ?? null,
        outcome: null,
        status: "planned",
        createdByEmployeeId: actor.employeeId,
      });
      await repository.recordAudit({
        demandId,
        actorEmployeeId: actor.employeeId,
        eventType: "demand.pilot.created",
        details: { pilotId: pilot.pilotId },
      });
      await repository.emitOutbox({
        demandId,
        eventType: "demand.pilot.created",
      });
      return pilot;
    });
  }

  async updatePilot(
    actor: ActorContext,
    demandId: string,
    pilotId: string,
    input: Partial<{
      endsAt: Date | null;
      outcome: string | null;
      status: DemandPilotRecord["status"];
    }>,
  ): Promise<DemandPilotRecord> {
    await this.assertAllowed(actor, "progress", demandId);
    const current = await this.requireDemand(demandId);
    this.assertProgressActor(actor, current);
    return this.repository.withTransaction(async (repository) => {
      const pilot = await repository.updatePilot(pilotId, input);
      if (pilot.demandId !== demandId)
        throw new Error("DEMAND_PILOT_NOT_FOUND");
      await repository.recordAudit({
        demandId,
        actorEmployeeId: actor.employeeId,
        eventType: "demand.pilot.updated",
        details: { pilotId, ...input },
      });
      await repository.emitOutbox({
        demandId,
        eventType: "demand.pilot.updated",
      });
      return pilot;
    });
  }

  async merge(
    actor: ActorContext,
    sourceDemandId: string,
    targetDemandId: string,
    sourceExpectedVersion: number,
    targetExpectedVersion: number,
  ): Promise<{ source: DemandEntry; target: DemandEntry }> {
    await this.assertAllowed(actor, "merge", sourceDemandId);
    if (sourceDemandId === targetDemandId) {
      throw new Error("DEMAND_MERGE_INVALID_TARGET");
    }
    const source = await this.requireDemand(sourceDemandId);
    const target = await this.requireDemand(targetDemandId);
    this.assertProgressActor(actor, source);
    if (source.status === "merged" || target.status === "merged") {
      throw new Error("DEMAND_MERGE_INVALID_STATE");
    }
    return this.repository.withTransaction(async (repository) => {
      const merged = await repository.mergeDemands(
        sourceDemandId,
        targetDemandId,
        sourceExpectedVersion,
        targetExpectedVersion,
      );
      await repository.recordAudit({
        demandId: sourceDemandId,
        actorEmployeeId: actor.employeeId,
        eventType: "demand.merged",
        details: { targetDemandId },
      });
      await repository.recordAudit({
        demandId: targetDemandId,
        actorEmployeeId: actor.employeeId,
        eventType: "demand.merge.received",
        details: { sourceDemandId },
      });
      await repository.emitOutbox({
        demandId: sourceDemandId,
        eventType: "demand.merged",
      });
      await repository.emitOutbox({
        demandId: targetDemandId,
        eventType: "demand.merge.received",
      });
      return merged;
    });
  }

  async linkApplication(
    actor: ActorContext,
    demandId: string,
    applicationId: string,
    role: DemandApplicationRole,
    isPrimary: boolean,
    expectedVersion: number,
  ): Promise<DemandApplicationLinkRecord> {
    await this.assertAllowed(actor, "associate_application", demandId);
    const current = await this.requireDemand(demandId);
    this.assertProgressActor(actor, current);
    if (isPrimary && role !== "solution") {
      throw new Error("DEMAND_PRIMARY_SOLUTION_ROLE_INVALID");
    }
    return this.repository.withTransaction(async (repository) => {
      const link = await repository.linkApplication(
        demandId,
        applicationId,
        role,
        isPrimary,
        expectedVersion,
        actor.employeeId,
      );
      await repository.recordAudit({
        demandId,
        actorEmployeeId: actor.employeeId,
        eventType: "demand.application.linked",
        details: { applicationId, role, isPrimary },
      });
      await repository.emitOutbox({
        demandId,
        eventType: "demand.application.linked",
      });
      return link;
    });
  }

  async listApplicationLinks(
    actor: ActorContext,
    demandId: string,
  ): Promise<readonly DemandApplicationLinkRecord[]> {
    await this.getDetail(actor, demandId);
    return this.repository.listApplicationLinks(demandId);
  }

  async createApplicationFromDemand(
    actor: ActorContext,
    demandId: string,
    input: {
      name: string;
      summary: string;
      maintainerEmployeeId?: string;
      departmentId?: string;
      role: DemandApplicationRole;
      isPrimary: boolean;
      expectedVersion: number;
    },
  ): Promise<DemandApplicationLinkRecord> {
    await this.assertAllowed(actor, "associate_application", demandId);
    const demand = await this.requireDemand(demandId);
    this.assertProgressActor(actor, demand);
    if (
      !new Set<DemandStatus>(["in_progress", "pilot", "completed"]).has(
        demand.status,
      )
    ) {
      throw new Error("DEMAND_APPLICATION_BRIDGE_INVALID_STATE");
    }
    if (this.applicationBridge === undefined) {
      throw new Error("DEMAND_APPLICATION_BRIDGE_UNAVAILABLE");
    }
    return this.repository.withApplicationTransaction(
      async (repository, applicationRepository) => {
        const application =
          await this.applicationBridge!.createApplicationInTransaction(
            actor,
            {
              name: input.name,
              summary: input.summary,
              ...(input.maintainerEmployeeId === undefined
                ? {}
                : { maintainerEmployeeId: input.maintainerEmployeeId }),
              ...(input.departmentId === undefined
                ? {}
                : { departmentId: input.departmentId }),
            },
            applicationRepository,
          );
        const link = await repository.linkApplication(
          demandId,
          application.applicationId,
          input.role,
          input.isPrimary,
          input.expectedVersion,
          actor.employeeId,
        );
        await repository.recordAudit({
          demandId,
          actorEmployeeId: actor.employeeId,
          eventType: "demand.application.created_from_demand",
          details: { applicationId: application.applicationId },
        });
        await repository.emitOutbox({
          demandId,
          eventType: "demand.application.created_from_demand",
        });
        return link;
      },
    );
  }

  async list(
    actor: ActorContext,
    input: {
      status?: DemandStatus;
      query?: string;
      page: number;
      pageSize: number;
      sort?: "recent" | "priority";
    },
  ): Promise<DemandListResult> {
    if (input.page < 1 || input.pageSize < 1 || input.pageSize > 100) {
      throw new Error("DEMAND_PAGINATION_INVALID");
    }
    await this.assertAllowed(actor, "read");
    if (
      input.sort === "priority" &&
      !actor.roleCodes.some((role) =>
        ["demand_operator", "super_admin"].includes(role),
      )
    ) {
      throw new Error("DEMAND_PRIORITY_FORBIDDEN");
    }
    const visible = await this.repository.listVisible({
      actor,
      ...(input.status === undefined ? {} : { status: input.status }),
      ...(input.query === undefined ? {} : { query: input.query }),
      ...(input.sort === "priority" ? { sortByPriority: true } : {}),
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
    const projected = this.projectDemand(actor, demand);
    await this.analyticsEvents?.record(actor, {
      eventName: "demand_viewed",
      aggregateType: "demand",
      aggregateId: demandId,
      occurredAt: new Date().toISOString(),
      idempotencyKey: `demand-viewed:${actor.sessionId}:${demandId}:${Date.now()}`,
      metadata: { source: "demand.detail" },
    });
    return projected;
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
    const report = await this.repository.withTransaction(async (repository) => {
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
    await this.analyticsEvents?.record(actor, {
      eventName: "demand_reported",
      aggregateType: "demand",
      aggregateId: input.demandId,
      occurredAt: new Date().toISOString(),
      idempotencyKey: `demand-reported:${report.reportId}`,
      metadata: { source: "demand.report" },
    });
    return report;
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

  private assertProgressActor(actor: ActorContext, demand: DemandEntry): void {
    if (
      demand.ownerEmployeeId !== actor.employeeId &&
      !actor.roleCodes.some((role) =>
        ["demand_operator", "super_admin"].includes(role),
      )
    ) {
      throw new Error("DEMAND_PROGRESS_FORBIDDEN");
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
