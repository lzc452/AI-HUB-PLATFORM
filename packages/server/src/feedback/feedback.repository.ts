import type { DatabaseSchema } from "@ai-hub/database";
import { randomUUID } from "node:crypto";
import type { Kysely, Selectable } from "kysely";
import type { FeedbackRecord, FeedbackRepository } from "./feedback.types.js";

export class KyselyFeedbackRepository implements FeedbackRepository {
  constructor(private readonly db: Kysely<DatabaseSchema>) {}

  withTransaction<T>(
    operation: (repository: FeedbackRepository) => Promise<T>,
  ): Promise<T> {
    return this.db
      .transaction()
      .execute(async (transaction) =>
        operation(new KyselyFeedbackRepository(transaction)),
      );
  }

  async findApplication(applicationId: string) {
    const row = await this.db
      .selectFrom("applications")
      .select(["application_id", "owner_employee_id", "maintainer_employee_id"])
      .where("application_id", "=", applicationId)
      .executeTakeFirst();
    return row === undefined
      ? null
      : {
          applicationId: row.application_id,
          ownerEmployeeId: row.owner_employee_id,
          maintainerEmployeeId: row.maintainer_employee_id,
        };
  }

  async createFeedback(
    input: Omit<
      FeedbackRecord,
      "feedbackId" | "createdAt" | "updatedAt" | "resolvedAt"
    >,
  ): Promise<FeedbackRecord> {
    const row = await this.db
      .insertInto("application_feedback")
      .values({
        application_id: input.applicationId,
        application_version_id: input.applicationVersionId,
        creator_employee_id: input.creatorEmployeeId,
        type: input.type,
        body: input.body,
        status: input.status,
        assignee_employee_id: input.assigneeEmployeeId,
        resolution: input.resolution,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return this.mapFeedback(row);
  }

  async listFeedbackByCreator(
    applicationId: string,
    creatorEmployeeId: string,
  ): Promise<readonly FeedbackRecord[]> {
    const rows = await this.db
      .selectFrom("application_feedback")
      .selectAll()
      .where("application_id", "=", applicationId)
      .where("creator_employee_id", "=", creatorEmployeeId)
      .orderBy("created_at", "desc")
      .execute();
    return rows.map((row) => this.mapFeedback(row));
  }

  async findFeedback(feedbackId: string): Promise<FeedbackRecord | null> {
    const row = await this.db
      .selectFrom("application_feedback")
      .selectAll()
      .where("feedback_id", "=", feedbackId)
      .executeTakeFirst();
    return row === undefined ? null : this.mapFeedback(row);
  }

  async updateFeedback(
    feedbackId: string,
    input: Partial<
      Pick<
        FeedbackRecord,
        "status" | "assigneeEmployeeId" | "resolution" | "resolvedAt"
      >
    >,
  ): Promise<FeedbackRecord | null> {
    const row = await this.db
      .updateTable("application_feedback")
      .set({
        ...(input.status === undefined ? {} : { status: input.status }),
        ...(input.assigneeEmployeeId === undefined
          ? {}
          : { assignee_employee_id: input.assigneeEmployeeId }),
        ...(input.resolution === undefined
          ? {}
          : { resolution: input.resolution }),
        ...(input.resolvedAt === undefined
          ? {}
          : { resolved_at: input.resolvedAt }),
        updated_at: new Date(),
      })
      .where("feedback_id", "=", feedbackId)
      .returningAll()
      .executeTakeFirst();
    return row === undefined ? null : this.mapFeedback(row);
  }

  async emitOutbox(input: {
    applicationId: string;
    eventType: string;
  }): Promise<void> {
    await this.db
      .insertInto("outbox_events")
      .values({
        event_type: input.eventType,
        aggregate_type: "application",
        aggregate_id: input.applicationId,
        payload: { applicationId: input.applicationId },
        idempotency_key: `${input.eventType}:${input.applicationId}:${randomUUID()}`,
        status: "pending",
        attempts: 0,
        available_at: new Date(),
        claimed_by: null,
        claimed_at: null,
        last_error: null,
        completed_at: null,
      })
      .execute();
  }

  async recordAudit(input: {
    applicationId: string;
    actorEmployeeId: string;
    eventType: string;
    details?: unknown;
  }): Promise<void> {
    await this.db
      .insertInto("application_audit_events")
      .values({
        application_id: input.applicationId,
        application_version_id: null,
        actor_employee_id: input.actorEmployeeId,
        event_type: input.eventType,
        details: input.details ?? {},
      })
      .execute();
  }

  private mapFeedback(
    row: Selectable<DatabaseSchema["application_feedback"]>,
  ): FeedbackRecord {
    return {
      feedbackId: row.feedback_id,
      applicationId: row.application_id,
      applicationVersionId: row.application_version_id,
      creatorEmployeeId: row.creator_employee_id,
      type: row.type,
      body: row.body,
      status: row.status,
      assigneeEmployeeId: row.assignee_employee_id,
      resolution: row.resolution,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      resolvedAt: row.resolved_at,
    };
  }
}
