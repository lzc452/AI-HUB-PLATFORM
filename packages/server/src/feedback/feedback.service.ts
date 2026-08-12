import type { ActorContext } from "@ai-hub/contracts";
import { KyselyApplicationRepository } from "../application/application.repository.js";
import type {
  FeedbackRecord,
  FeedbackRepository,
  FeedbackStatus,
  FeedbackType,
} from "./feedback.types.js";

export class FeedbackService {
  constructor(
    private readonly repository: FeedbackRepository,
    private readonly applications: KyselyApplicationRepository,
  ) {}

  async createFeedback(
    actor: ActorContext,
    input: {
      applicationId: string;
      type: FeedbackType;
      body: string;
    },
  ): Promise<FeedbackRecord> {
    const application = await this.applications.findApplication(
      input.applicationId,
    );
    if (application === null) throw new Error("APPLICATION_NOT_FOUND");
    if (input.body.trim().length === 0)
      throw new Error("FEEDBACK_BODY_REQUIRED");
    const record = await this.repository.createFeedback({
      applicationId: input.applicationId,
      applicationVersionId: application.currentVersionId,
      creatorEmployeeId: actor.employeeId,
      type: input.type,
      body: input.body.trim(),
      status: "open",
      assigneeEmployeeId: null,
      resolution: null,
    });
    await this.repository.emitOutbox({
      applicationId: input.applicationId,
      eventType: "feedback.created",
    });
    return record;
  }

  async listMyFeedback(
    actor: ActorContext,
    applicationId: string,
  ): Promise<readonly FeedbackRecord[]> {
    return this.repository.listFeedbackByCreator(
      applicationId,
      actor.employeeId,
    );
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
    const application = await this.applications.findApplication(
      input.applicationId,
    );
    if (application === null) throw new Error("APPLICATION_NOT_FOUND");
    if (
      application.ownerEmployeeId !== actor.employeeId &&
      application.maintainerEmployeeId !== actor.employeeId
    ) {
      throw new Error("OFFICIAL_FEEDBACK_UPDATE_FORBIDDEN");
    }
    const existing = await this.repository.findFeedback(input.feedbackId);
    if (existing === null) throw new Error("FEEDBACK_NOT_FOUND");
    if (existing.applicationId !== input.applicationId) {
      throw new Error("FEEDBACK_APPLICATION_MISMATCH");
    }
    const resolvedAt =
      input.status === "resolved" || input.status === "closed"
        ? new Date()
        : null;
    const updated = await this.repository.updateFeedback(input.feedbackId, {
      status: input.status,
      ...(input.resolution === undefined
        ? {}
        : { resolution: input.resolution }),
      ...(resolvedAt === null ? {} : { resolvedAt }),
    });
    if (updated === null) throw new Error("FEEDBACK_NOT_FOUND");
    return updated;
  }
}
