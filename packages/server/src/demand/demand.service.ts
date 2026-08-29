import {
  hasPermission,
  PERMISSIONS,
  type ActorContext,
  type DemandApplicationRole,
  type DemandPriorityInput,
  type DemandPriorityLevel,
  type DemandStatus,
} from "@ai-hub/contracts";
import type {
  DemandAuthorizationPort,
  DemandCommentRecord,
  DemandCollaboratorRecord,
  DemandClaimProposalRecord,
  DemandAttachmentRecord,
  DemandDraftInput,
  DemandEntry,
  DemandIdentityPort,
  DemandListResult,
  DemandApplicationLinkRecord,
  DemandApplicationBridge,
  DemandNotificationPort,
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
  pending_claim: ["claimed", "closed"],
  claimed: ["validating", "pilot", "converted", "closed"],
  validating: ["pilot", "converted", "closed"],
  pilot: ["converted", "closed"],
  converted: ["closed"],
  closed: [],
  merged: [],
};

export class DemandService {
  constructor(
    private readonly repository: DemandRepository,
    private readonly authorization: DemandAuthorizationPort,
    private readonly applicationBridge?: DemandApplicationBridge,
    private readonly analyticsEvents?: AnalyticsBehaviorEventRecorder,
    private readonly identityPort?: DemandIdentityPort,
    private readonly notifications?: DemandNotificationPort,
  ) {}

  async createDraft(
    actor: ActorContext,
    input: DemandDraftInput,
  ): Promise<DemandEntry> {
    await this.assertAllowed(actor, "create");
    const normalized = this.normalizeInput(input);
    const attachmentIds = input.attachmentIds ?? [];
    return this.repository.withTransaction(async (repository) => {
      const demand = await repository.createDraft({
        requesterEmployeeId: actor.employeeId,
        title: normalized.title,
        problemStatement: normalized.problemStatement,
        businessScenario: normalized.businessScenario,
        impact: normalized.impact,
        desiredOutcome: normalized.desiredOutcome,
        currentWorkaround: normalized.currentWorkaround,
        dataSensitivity: normalized.dataSensitivity,
        aiSolutionIdea: normalized.aiSolutionIdea,
        audienceType: normalized.audienceType,
        departmentId: normalized.departmentId,
        employeeId: normalized.employeeId,
        includeChildren: normalized.includeChildren,
        displayAnonymously: normalized.displayAnonymously,
      });
      for (const attachmentId of attachmentIds) {
        await repository.linkAttachmentToDemand(attachmentId, demand.demandId);
      }
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
    const submitted = await this.repository.withTransaction(
      async (repository) => {
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
      },
    );
    if (this.notifications !== undefined) {
      const reviewers =
        (await this.identityPort?.listEmployeeIdsWithRole("demand_operator")) ??
        [];
      // 矩阵 demand.submitted 语义为广播全部运营者；单条失败不阻断其余广播。
      for (const reviewer of reviewers) {
        try {
          await this.notifications.queue(actor, "demand.submitted", {
            recipientEmployeeId: reviewer,
            aggregateId: demandId,
          });
        } catch {
          // 通知失败不回滚提交。
        }
      }
    }
    return submitted;
  }

  async review(
    actor: ActorContext,
    demandId: string,
    decision: "publish" | "reject",
    reason?: string,
  ): Promise<DemandEntry> {
    await this.assertAllowed(actor, "review", demandId);
    if (!hasPermission(actor, PERMISSIONS.DEMAND_REVIEW)) {
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
      decision === "publish" ? "pending_claim" : "rejected";
    const reviewed = await this.repository.withTransaction(
      async (repository) => {
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
      },
    );
    // 事务外通知提交人（与 submitForReview 一致），失败不回滚审核结论。
    // requesterEmployeeId 仅在匿名投影中为 null，审核读取的是全量记录。
    if (
      this.notifications !== undefined &&
      current.requesterEmployeeId !== null
    ) {
      try {
        await this.notifications.queue(actor, "demand.reviewed", {
          recipientEmployeeId: current.requesterEmployeeId,
          aggregateId: demandId,
          variables: { decision },
        });
      } catch {
        // 规格 §5.8：外部通知失败不回滚业务操作——审核结论已在事务内提交；
        // 收件人被除权（NOTIFICATION_RECIPIENT_NOT_AUTHORIZED）或 DB 故障时
        // 不得让已提交的结论以 500 返回给客户端（客户端重试会撞状态错误）。
      }
    }
    return reviewed;
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
      !new Set<DemandStatus>(["pending_claim", "claimed", "pilot"]).has(
        current.status,
      )
    ) {
      throw new Error("DEMAND_CLAIM_INVALID_STATE");
    }
    const claimed = await this.repository.withTransaction(
      async (repository) => {
        const claimed = await repository.claimOwner(
          demandId,
          actor.employeeId,
          expectedVersion,
        );
        await this.recordMutation(
          repository,
          claimed,
          actor,
          "demand.claimed",
          {
            ownerEmployeeId: actor.employeeId,
          },
        );
        return claimed;
      },
    );
    // 事务外通知提交人（矩阵 demand.claimed）：失败不回滚认领。
    if (
      this.notifications !== undefined &&
      current.requesterEmployeeId !== null
    ) {
      try {
        await this.notifications.queue(actor, "demand.claimed", {
          recipientEmployeeId: current.requesterEmployeeId,
          aggregateId: demandId,
        });
      } catch {
        // 通知失败不回滚认领。
      }
    }
    return claimed;
  }

  async submitClaimProposal(
    actor: ActorContext,
    demandId: string,
    input: {
      ownerEmployeeId: string;
      collaboratorEmployeeIds: string[];
      approach: string;
      estimatedValidationDuration: string;
      resourceNeeds: string;
      preference?: string;
    },
  ): Promise<DemandClaimProposalRecord> {
    await this.assertAllowed(actor, "claim", demandId);
    const current = await this.requireDemand(demandId);
    if (current.status !== "pending_claim") {
      throw new Error("DEMAND_CLAIM_INVALID_STATE");
    }
    const approach = input.approach.trim();
    const estimatedValidationDuration =
      input.estimatedValidationDuration.trim();
    const resourceNeeds = input.resourceNeeds.trim();
    const preference = input.preference?.trim() || null;
    if (
      approach.length < 5 ||
      approach.length > 5000 ||
      estimatedValidationDuration.length < 1 ||
      estimatedValidationDuration.length > 200 ||
      resourceNeeds.length < 1 ||
      resourceNeeds.length > 2000
    ) {
      throw new Error("DEMAND_CLAIM_PROPOSAL_INVALID");
    }
    const collaboratorIds = [
      ...new Set(input.collaboratorEmployeeIds.filter((id) => id.trim())),
    ];
    if (collaboratorIds.length > 20) {
      throw new Error("DEMAND_CLAIM_PROPOSAL_INVALID");
    }
    return this.repository.withTransaction(async (repository) => {
      const proposal = await repository.createClaimProposal({
        demandId,
        proposerEmployeeId: actor.employeeId,
        ownerEmployeeId: input.ownerEmployeeId.trim(),
        collaboratorEmployeeIds: collaboratorIds,
        approach,
        estimatedValidationDuration,
        resourceNeeds,
        preference,
      });
      await repository.recordAudit({
        demandId,
        actorEmployeeId: actor.employeeId,
        eventType: "demand.claim_proposal.created",
        details: { proposalId: proposal.proposalId },
      });
      await repository.emitOutbox({
        demandId,
        eventType: "demand.claim_proposal.created",
      });
      return proposal;
    });
  }

  async listClaimProposals(
    actor: ActorContext,
    demandId: string,
  ): Promise<readonly DemandClaimProposalRecord[]> {
    await this.getDetail(actor, demandId);
    return this.repository.listClaimProposals(demandId);
  }

  async withdrawClaimProposal(
    actor: ActorContext,
    demandId: string,
    proposalId: string,
  ): Promise<DemandClaimProposalRecord> {
    await this.assertAllowed(actor, "claim", demandId);
    const proposal = await this.repository.findClaimProposal(proposalId);
    if (proposal === null || proposal.demandId !== demandId) {
      throw new Error("DEMAND_CLAIM_PROPOSAL_NOT_FOUND");
    }
    if (proposal.proposerEmployeeId !== actor.employeeId) {
      throw new Error("DEMAND_CLAIM_PROPOSAL_FORBIDDEN");
    }
    if (proposal.status !== "proposed") {
      throw new Error("DEMAND_CLAIM_PROPOSAL_INVALID_STATE");
    }
    return this.repository.withTransaction(async (repository) => {
      const withdrawn = await repository.updateClaimProposalStatus(
        proposalId,
        "withdrawn",
      );
      await repository.recordAudit({
        demandId,
        actorEmployeeId: actor.employeeId,
        eventType: "demand.claim_proposal.withdrawn",
        details: { proposalId },
      });
      await repository.emitOutbox({
        demandId,
        eventType: "demand.claim_proposal.withdrawn",
      });
      return withdrawn;
    });
  }

  async confirmClaim(
    actor: ActorContext,
    demandId: string,
    proposalId: string,
    expectedVersion: number,
  ): Promise<DemandEntry> {
    await this.assertAllowed(actor, "manage", demandId);
    if (!hasPermission(actor, PERMISSIONS.DEMAND_MANAGE)) {
      throw new Error("DEMAND_CLAIM_CONFIRM_FORBIDDEN");
    }
    const proposal = await this.repository.findClaimProposal(proposalId);
    if (proposal === null || proposal.demandId !== demandId) {
      throw new Error("DEMAND_CLAIM_PROPOSAL_NOT_FOUND");
    }
    if (proposal.status !== "proposed") {
      throw new Error("DEMAND_CLAIM_PROPOSAL_INVALID_STATE");
    }
    const current = await this.requireDemand(demandId);
    if (current.status !== "pending_claim") {
      throw new Error("DEMAND_CLAIM_INVALID_STATE");
    }
    return this.repository.withTransaction(async (repository) => {
      const claimed = await repository.confirmClaim(
        demandId,
        proposal.ownerEmployeeId,
        proposal.collaboratorEmployeeIds,
        expectedVersion,
      );
      await repository.updateClaimProposalStatus(proposalId, "selected");
      await repository.recordAudit({
        demandId,
        actorEmployeeId: actor.employeeId,
        eventType: "demand.claim.confirmed",
        details: {
          proposalId,
          ownerEmployeeId: proposal.ownerEmployeeId,
        },
      });
      await repository.emitOutbox({
        demandId,
        eventType: "demand.claim.confirmed",
      });
      return claimed;
    });
  }

  async releaseClaim(
    actor: ActorContext,
    demandId: string,
    expectedVersion: number,
    reason?: string,
  ): Promise<DemandEntry> {
    await this.assertAllowed(actor, "manage", demandId);
    if (!hasPermission(actor, PERMISSIONS.DEMAND_MANAGE)) {
      throw new Error("DEMAND_CLAIM_CONFIRM_FORBIDDEN");
    }
    const current = await this.requireDemand(demandId);
    if (
      !new Set<DemandStatus>(["claimed", "validating", "pilot"]).has(
        current.status,
      )
    ) {
      throw new Error("DEMAND_RELEASE_INVALID_STATE");
    }
    const releaseReason = reason?.trim() || null;
    return this.repository.withTransaction(async (repository) => {
      const released = await repository.releaseClaim(demandId, expectedVersion);
      await this.recordMutation(
        repository,
        released,
        actor,
        "demand.claim.released",
        {
          reason: releaseReason,
        },
      );
      return released;
    });
  }

  async createAttachment(
    actor: ActorContext,
    input: {
      storageKey: string;
      fileName: string;
      mimeType: string;
      sizeBytes: number;
      sha256: string;
    },
  ): Promise<DemandAttachmentRecord> {
    await this.assertAllowed(actor, "create");
    return this.repository.createAttachment({
      storageKey: input.storageKey,
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      sha256: input.sha256,
      uploadedByEmployeeId: actor.employeeId,
    });
  }

  async deleteAttachment(
    actor: ActorContext,
    demandId: string,
    attachmentId: string,
  ): Promise<void> {
    await this.assertAllowed(actor, "update", demandId);
    const current = await this.requireDemand(demandId);
    this.assertRequester(actor, current);
    if (!reviewableStatuses.has(current.status)) {
      throw new Error("DEMAND_DRAFT_NOT_EDITABLE");
    }
    const attachments = await this.repository.listAttachments(demandId);
    if (!attachments.some((item) => item.attachmentId === attachmentId)) {
      throw new Error("DEMAND_ATTACHMENT_NOT_FOUND");
    }
    await this.repository.withTransaction(async (repository) => {
      await repository.deleteAttachment(attachmentId);
      await repository.recordAudit({
        demandId,
        actorEmployeeId: actor.employeeId,
        eventType: "demand.attachment.removed",
        details: { attachmentId },
      });
      await repository.emitOutbox({
        demandId,
        eventType: "demand.attachment.removed",
      });
    });
  }

  async listAttachments(
    actor: ActorContext,
    demandId: string,
  ): Promise<readonly DemandAttachmentRecord[]> {
    await this.getDetail(actor, demandId);
    return this.repository.listAttachments(demandId);
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
    const collaborator = await this.repository.withTransaction(
      async (repository) => {
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
      },
    );
    // 事务外通知新协作者（矩阵 demand.collaborator_assigned）：失败不回滚分配。
    if (this.notifications !== undefined) {
      try {
        await this.notifications.queue(actor, "demand.collaborator_assigned", {
          recipientEmployeeId: employeeId,
          aggregateId: demandId,
        });
      } catch {
        // 通知失败不回滚协作者分配。
      }
    }
    return collaborator;
  }

  async listCollaborators(
    actor: ActorContext,
    demandId: string,
  ): Promise<readonly DemandCollaboratorRecord[]> {
    await this.getDetail(actor, demandId);
    return this.repository.listCollaborators(demandId);
  }

  async updateCollaboratorRole(
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
    if (current.ownerEmployeeId === employeeId || role === "owner") {
      throw new Error("DEMAND_COLLABORATOR_ROLE_INVALID");
    }
    return this.repository.withTransaction(async (repository) => {
      const collaborator = await repository.updateCollaboratorRole(
        demandId,
        employeeId,
        role,
        expectedVersion,
      );
      await repository.recordAudit({
        demandId,
        actorEmployeeId: actor.employeeId,
        eventType: "demand.collaborator.role.updated",
        details: { employeeId, role },
      });
      await repository.emitOutbox({
        demandId,
        eventType: "demand.collaborator.role.updated",
      });
      return collaborator;
    });
  }

  async setPriority(
    actor: ActorContext,
    demandId: string,
    expectedVersion: number,
    input: DemandPriorityInput,
  ): Promise<DemandEntry> {
    await this.assertAllowed(actor, "prioritize", demandId);
    if (!hasPermission(actor, PERMISSIONS.DEMAND_PRIORITIZE)) {
      throw new Error("DEMAND_PRIORITY_FORBIDDEN");
    }
    for (const value of Object.values(input)) {
      if (!Number.isInteger(value) || value < 1 || value > 5) {
        throw new Error("DEMAND_PRIORITY_INVALID");
      }
    }
    const score = Number(
      (
        input.businessValue * 0.2 +
        input.impactedHeadcount * 0.15 +
        input.usageFrequency * 0.1 +
        input.strategicFit * 0.15 +
        input.technicalFeasibility * 0.1 +
        (6 - input.dataComplianceRisk) * 0.15 +
        (6 - input.implementationCost) * 0.15
      ).toFixed(1),
    );
    const explanation =
      `0.20*businessValue=${input.businessValue} + ` +
      `0.15*impactedHeadcount=${input.impactedHeadcount} + ` +
      `0.10*usageFrequency=${input.usageFrequency} + ` +
      `0.15*strategicFit=${input.strategicFit} + ` +
      `0.10*technicalFeasibility=${input.technicalFeasibility} + ` +
      `0.15*(6-dataComplianceRisk=${input.dataComplianceRisk}) + ` +
      `0.15*(6-implementationCost=${input.implementationCost}) = ${score}`;
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

  async confirmPriority(
    actor: ActorContext,
    demandId: string,
    expectedVersion: number,
    confirmedPriority: DemandPriorityLevel,
    adjustmentReason?: string,
  ): Promise<DemandEntry> {
    await this.assertAllowed(actor, "prioritize", demandId);
    if (!hasPermission(actor, PERMISSIONS.DEMAND_PRIORITIZE)) {
      throw new Error("DEMAND_PRIORITY_FORBIDDEN");
    }
    const current = await this.requireDemand(demandId);
    if (current.priorityScore === null) {
      throw new Error("DEMAND_PRIORITY_NOT_SCORED");
    }
    const reason = adjustmentReason?.trim() || null;
    if (reason !== null && (reason.length < 3 || reason.length > 2000)) {
      throw new Error("DEMAND_PRIORITY_ADJUSTMENT_INVALID");
    }
    return this.repository.withTransaction(async (repository) => {
      const confirmed = await repository.confirmPriority(
        demandId,
        confirmedPriority,
        reason,
        expectedVersion,
      );
      await this.recordMutation(
        repository,
        confirmed,
        actor,
        "demand.priority.confirmed",
        { confirmedPriority, adjustmentReason: reason },
      );
      return confirmed;
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
    const updated = await this.repository.withTransaction(
      async (repository) => {
        const transitioned = await repository.transitionStatus(
          demandId,
          nextStatus,
          expectedVersion,
          reason?.trim() ?? null,
        );
        await this.recordMutation(
          repository,
          transitioned,
          actor,
          "demand.status.changed",
          {
            from: current.status,
            to: nextStatus,
            reason: reason?.trim() ?? null,
          },
        );
        return transitioned;
      },
    );
    // 事务外通知提交人（矩阵 demand.closed，仅关闭场景）：失败不回滚状态流转。
    if (
      nextStatus === "closed" &&
      this.notifications !== undefined &&
      current.requesterEmployeeId !== null
    ) {
      try {
        await this.notifications.queue(actor, "demand.closed", {
          recipientEmployeeId: current.requesterEmployeeId,
          aggregateId: demandId,
        });
      } catch {
        // 通知失败不回滚关闭。
      }
    }
    return updated;
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
    const progress = await this.repository.withTransaction(
      async (repository) => {
        const created = await repository.createProgressUpdate({
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
          details: { progressId: created.progressId },
        });
        await repository.emitOutbox({
          demandId,
          eventType: "demand.progress.created",
        });
        return created;
      },
    );
    // 事务外通知提交人（矩阵 demand.progress_updated，status 取需求当前状态）：
    // 失败不回滚进度更新。
    if (
      this.notifications !== undefined &&
      current.requesterEmployeeId !== null
    ) {
      try {
        await this.notifications.queue(actor, "demand.progress_updated", {
          recipientEmployeeId: current.requesterEmployeeId,
          aggregateId: demandId,
          variables: { status: current.status },
        });
      } catch {
        // 通知失败不回滚进度更新。
      }
    }
    return progress;
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
    if (current.status !== "claimed" && current.status !== "pilot") {
      throw new Error("DEMAND_PILOT_INVALID_STATE");
    }
    const name = input.name.trim();
    if (name.length < 2 || name.length > 200) {
      throw new Error("DEMAND_PILOT_INVALID");
    }
    if (input.endsAt !== undefined && input.endsAt <= input.startsAt) {
      throw new Error("DEMAND_PILOT_INVALID_DATES");
    }
    const pilot = await this.repository.withTransaction(async (repository) => {
      const created = await repository.createPilot({
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
        details: { pilotId: created.pilotId },
      });
      await repository.emitOutbox({
        demandId,
        eventType: "demand.pilot.created",
      });
      return created;
    });
    // 事务外通知提交人（矩阵 demand.pilot_started）：失败不回滚试点创建。
    if (
      this.notifications !== undefined &&
      current.requesterEmployeeId !== null
    ) {
      try {
        await this.notifications.queue(actor, "demand.pilot_started", {
          recipientEmployeeId: current.requesterEmployeeId,
          aggregateId: demandId,
        });
      } catch {
        // 通知失败不回滚试点创建。
      }
    }
    return pilot;
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
    const merged = await this.repository.withTransaction(async (repository) => {
      const mergedResult = await repository.mergeDemands(
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
      return mergedResult;
    });
    // 事务外通知源/目标需求提交人（矩阵 demand.merged）：失败不回滚合并。
    if (this.notifications !== undefined) {
      const recipients = [
        { demandId: sourceDemandId, employeeId: source.requesterEmployeeId },
        { demandId: targetDemandId, employeeId: target.requesterEmployeeId },
      ];
      for (const recipient of recipients) {
        if (recipient.employeeId === null) continue;
        try {
          await this.notifications.queue(actor, "demand.merged", {
            recipientEmployeeId: recipient.employeeId,
            aggregateId: recipient.demandId,
          });
        } catch {
          // 通知失败不回滚合并。
        }
      }
    }
    return merged;
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
      !new Set<DemandStatus>([
        "claimed",
        "validating",
        "pilot",
        "converted",
      ]).has(demand.status)
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
      requesterDepartmentId?: string;
      audienceType?: DemandEntry["audienceType"];
      sort?: "recent" | "priority" | "hot";
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
      ...(input.requesterDepartmentId === undefined
        ? {}
        : { requesterDepartmentId: input.requesterDepartmentId }),
      ...(input.audienceType === undefined
        ? {}
        : { audienceType: input.audienceType }),
      ...(input.sort === undefined ? {} : { sort: input.sort }),
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
      audience: {
        departmentId: demand.audienceDepartmentId,
        employeeId: demand.audienceEmployeeId ?? null,
      },
    });
    return projected;
  }

  async toggleLike(
    actor: ActorContext,
    demandId: string,
  ): Promise<{ liked: boolean }> {
    await this.assertAllowed(actor, "interact", demandId);
    const demand = await this.getDetail(actor, demandId);
    const result = await this.repository.withTransaction(async (repository) => {
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
    if (result.liked) {
      await this.analyticsEvents?.record(actor, {
        eventName: "demand_liked",
        aggregateType: "demand",
        aggregateId: demandId,
        occurredAt: new Date().toISOString(),
        idempotencyKey: `demand-liked:${actor.sessionId}:${demandId}:${Date.now()}`,
        metadata: { source: "demand.like" },
        audience: {
          departmentId: demand.audienceDepartmentId,
          employeeId: demand.audienceEmployeeId ?? null,
        },
      });
    }
    return result;
  }

  async toggleCommentLike(
    actor: ActorContext,
    demandId: string,
    commentId: string,
  ): Promise<{ liked: boolean }> {
    await this.assertAllowed(actor, "interact", demandId);
    await this.getDetail(actor, demandId);
    const comment = await this.repository.findComment(commentId);
    if (comment === null || comment.demandId !== demandId) {
      throw new Error("DEMAND_COMMENT_NOT_FOUND");
    }
    if (comment.hiddenAt !== null) {
      throw new Error("DEMAND_COMMENT_HIDDEN");
    }
    return this.repository.withTransaction(async (repository) => {
      const currentlyLiked = await repository.hasCommentLike(
        commentId,
        actor.employeeId,
      );
      if (currentlyLiked) {
        await repository.removeCommentLike(commentId, actor.employeeId);
      } else {
        await repository.addCommentLike(commentId, actor.employeeId);
      }
      const eventType = currentlyLiked
        ? "demand.comment.unliked"
        : "demand.comment.liked";
      await repository.recordAudit({
        demandId,
        actorEmployeeId: actor.employeeId,
        eventType,
        details: { commentId },
      });
      await repository.emitOutbox({ demandId, eventType });
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
    const demand = await this.getDetail(actor, input.demandId);
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
    const comment = await this.repository.withTransaction(
      async (repository) => {
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
          idempotencyKey: `demand-comment-created:${comment.commentId}`,
        });
        return comment;
      },
    );
    await this.analyticsEvents?.record(actor, {
      eventName: "demand_commented",
      aggregateType: "demand",
      aggregateId: input.demandId,
      occurredAt: new Date().toISOString(),
      idempotencyKey: `demand-commented:${comment.commentId}`,
      metadata: { source: "demand.comment" },
      audience: {
        departmentId: demand.audienceDepartmentId,
        employeeId: demand.audienceEmployeeId ?? null,
      },
    });
    return this.projectComment(actor, comment);
  }

  async listComments(
    actor: ActorContext,
    demandId: string,
  ): Promise<readonly DemandCommentRecord[]> {
    await this.getDetail(actor, demandId);
    const comments = await this.repository.listComments(demandId, actor);
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
        idempotencyKey: `demand-report-created:${report.reportId}`,
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
    demandId: string,
    reportId: string,
    status: DemandReportRecord["status"],
  ): Promise<DemandReportRecord> {
    await this.assertAllowed(actor, "moderate");
    if (!hasPermission(actor, PERMISSIONS.DEMAND_MODERATE)) {
      throw new Error("DEMAND_MODERATION_FORBIDDEN");
    }
    const existing = await this.repository.findReport(reportId);
    if (existing === null) throw new Error("DEMAND_REPORT_NOT_FOUND");
    if (existing.demandId !== demandId) {
      throw new Error("DEMAND_RESOURCE_MISMATCH");
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
        idempotencyKey: `demand-report-resolved:${report.reportId}`,
      });
      return report;
    });
  }

  async listPilots(
    actor: ActorContext,
    demandId: string,
  ): Promise<readonly DemandPilotRecord[]> {
    await this.getDetail(actor, demandId);
    return this.repository.listPilots(demandId);
  }

  async listReports(
    actor: ActorContext,
    demandId: string,
  ): Promise<readonly DemandReportRecord[]> {
    await this.assertAllowed(actor, "moderate", demandId);
    if (!hasPermission(actor, PERMISSIONS.DEMAND_MODERATE)) {
      throw new Error("DEMAND_MODERATION_FORBIDDEN");
    }
    await this.requireDemand(demandId);
    return this.repository.listReports(demandId);
  }

  async removeCollaborator(
    actor: ActorContext,
    demandId: string,
    employeeId: string,
    expectedVersion: number,
  ): Promise<void> {
    await this.assertAllowed(actor, "collaborate", demandId);
    const current = await this.requireDemand(demandId);
    if (current.ownerEmployeeId !== actor.employeeId) {
      throw new Error("DEMAND_OWNER_REQUIRED");
    }
    if (current.ownerEmployeeId === employeeId) {
      throw new Error("DEMAND_OWNER_COLLABORATOR_PROTECTED");
    }
    await this.repository.withTransaction(async (repository) => {
      await repository.removeCollaborator(
        demandId,
        employeeId,
        expectedVersion,
      );
      await repository.recordAudit({
        demandId,
        actorEmployeeId: actor.employeeId,
        eventType: "demand.collaborator.removed",
        details: { employeeId },
      });
      await repository.emitOutbox({
        demandId,
        eventType: "demand.collaborator.removed",
      });
    });
  }

  async unlinkApplication(
    actor: ActorContext,
    demandId: string,
    applicationId: string,
    expectedVersion: number,
  ): Promise<void> {
    await this.assertAllowed(actor, "associate_application", demandId);
    const current = await this.requireDemand(demandId);
    this.assertProgressActor(actor, current);
    await this.repository.withTransaction(async (repository) => {
      await repository.unlinkApplication(
        demandId,
        applicationId,
        expectedVersion,
      );
      await repository.recordAudit({
        demandId,
        actorEmployeeId: actor.employeeId,
        eventType: "demand.application.unlinked",
        details: { applicationId },
      });
      await repository.emitOutbox({
        demandId,
        eventType: "demand.application.unlinked",
      });
    });
  }

  async lookupAnonymousAuthor(
    actor: ActorContext,
    demandId: string,
    commentId: string,
  ): Promise<string> {
    await this.assertAllowed(actor, "anonymous_audit");
    const comment = await this.repository.findComment(commentId);
    if (comment === null) throw new Error("DEMAND_COMMENT_NOT_FOUND");
    if (comment.demandId !== demandId) {
      throw new Error("DEMAND_RESOURCE_MISMATCH");
    }
    if (comment.authorEmployeeId === null) {
      throw new Error("DEMAND_COMMENT_NOT_FOUND");
    }
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
      hasPermission(actor, PERMISSIONS.DEMAND_ANONYMOUS_AUDIT)
    ) {
      return demand;
    }
    return {
      ...demand,
      requesterEmployeeId: null,
      requesterDisplayName: null,
      requesterDepartmentId: null,
    };
  }

  private projectComment(
    actor: ActorContext,
    comment: DemandCommentRecord,
  ): DemandCommentRecord {
    if (
      !comment.displayAnonymously ||
      comment.authorEmployeeId === actor.employeeId ||
      hasPermission(actor, PERMISSIONS.DEMAND_ANONYMOUS_AUDIT)
    ) {
      return comment;
    }
    return {
      ...comment,
      authorEmployeeId: null,
      authorDisplayName: "匿名用户",
      authorDepartmentId: null,
    };
  }

  private normalizeInput(input: DemandDraftInput): Required<
    Pick<
      DemandDraftInput,
      | "title"
      | "problemStatement"
      | "businessScenario"
      | "impact"
      | "desiredOutcome"
      | "currentWorkaround"
      | "dataSensitivity"
      | "audienceType"
      | "includeChildren"
      | "displayAnonymously"
    >
  > & {
    departmentId: string | null;
    employeeId: string | null;
    aiSolutionIdea: string | null;
  } {
    const title = input.title.trim();
    const problemStatement = input.problemStatement.trim();
    const businessScenario = input.businessScenario.trim();
    const impact = input.impact.trim();
    const desiredOutcome = input.desiredOutcome.trim();
    const currentWorkaround = input.currentWorkaround.trim();
    const dataSensitivity = input.dataSensitivity.trim();
    const aiSolutionIdea = input.aiSolutionIdea?.trim() || null;
    if (
      title.length < 3 ||
      title.length > 200 ||
      problemStatement.length < 10 ||
      businessScenario.length < 5 ||
      impact.length < 5 ||
      desiredOutcome.length < 10 ||
      currentWorkaround.length < 2 ||
      dataSensitivity.length < 2
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
      businessScenario,
      impact,
      desiredOutcome,
      currentWorkaround,
      dataSensitivity,
      aiSolutionIdea,
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
      businessScenario:
        input.businessScenario ?? current.businessScenario ?? "",
      impact: input.impact ?? current.impact ?? "",
      desiredOutcome: input.desiredOutcome ?? current.desiredOutcome,
      currentWorkaround:
        input.currentWorkaround ?? current.currentWorkaround ?? "",
      dataSensitivity: input.dataSensitivity ?? current.dataSensitivity ?? "",
      audienceType: input.audienceType ?? current.audienceType,
      includeChildren:
        input.includeChildren ?? current.includeChildren ?? false,
      displayAnonymously:
        input.displayAnonymously ?? current.displayAnonymously,
    };
    const aiSolutionIdea =
      input.aiSolutionIdea ?? current.aiSolutionIdea ?? null;
    if (aiSolutionIdea !== null) {
      draft.aiSolutionIdea = aiSolutionIdea;
    }
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
      !hasPermission(actor, PERMISSIONS.DEMAND_PROGRESS)
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
