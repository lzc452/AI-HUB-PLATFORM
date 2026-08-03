import type {
  ActorContext,
  CreateDemandInput,
  DemandStatus,
} from "@ai-hub/contracts";
import type {
  DemandAuthorizationPort,
  DemandDraftInput,
  DemandEntry,
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
