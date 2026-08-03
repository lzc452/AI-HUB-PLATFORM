import type { DatabaseSchema } from "@ai-hub/database";
import type { Kysely, Selectable } from "kysely";
import { randomUUID } from "node:crypto";
import type {
  ApplicationRecord,
  ApplicationRepository,
  ApplicationVersionRecord,
  DeliveryRecord,
  ReviewQueueRecord,
  ReviewRecord,
} from "./application.types.js";

export class KyselyApplicationRepository implements ApplicationRepository {
  constructor(private readonly db: Kysely<DatabaseSchema>) {}

  withTransaction<T>(
    operation: (repository: ApplicationRepository) => Promise<T>,
  ): Promise<T> {
    return this.db
      .transaction()
      .execute(async (transaction) =>
        operation(new KyselyApplicationRepository(transaction)),
      );
  }

  async createApplication(input: {
    ownerEmployeeId: string;
    maintainerEmployeeId: string;
    departmentId: string;
    name: string;
    summary: string;
  }): Promise<ApplicationRecord> {
    const row = await this.db
      .insertInto("applications")
      .values({
        owner_employee_id: input.ownerEmployeeId,
        maintainer_employee_id: input.maintainerEmployeeId,
        department_id: input.departmentId,
        name: input.name,
        summary: input.summary,
        status: "draft",
        current_version_id: null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return this.mapApplication(row);
  }

  async findApplication(
    applicationId: string,
  ): Promise<ApplicationRecord | null> {
    const row = await this.db
      .selectFrom("applications")
      .selectAll()
      .where("application_id", "=", applicationId)
      .executeTakeFirst();
    return row === undefined ? null : this.mapApplication(row);
  }

  async createVersion(
    input: Omit<ApplicationVersionRecord, "createdAt">,
  ): Promise<ApplicationVersionRecord> {
    const row = await this.db
      .insertInto("application_versions")
      .values({
        application_version_id: input.applicationVersionId,
        application_id: input.applicationId,
        version: input.version,
        changelog: input.changelog,
        artifact_key: input.artifactKey,
        artifact_sha256: input.artifactSha256,
        artifact_signature: input.artifactSignature,
        scan_status: input.scanStatus,
        created_by_employee_id: input.createdByEmployeeId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return this.mapVersion(row);
  }

  async findVersion(
    applicationVersionId: string,
  ): Promise<ApplicationVersionRecord | null> {
    const row = await this.db
      .selectFrom("application_versions")
      .selectAll()
      .where("application_version_id", "=", applicationVersionId)
      .executeTakeFirst();
    return row === undefined ? null : this.mapVersion(row);
  }

  async listVersions(
    applicationId: string,
  ): Promise<readonly ApplicationVersionRecord[]> {
    const rows = await this.db
      .selectFrom("application_versions")
      .selectAll()
      .where("application_id", "=", applicationId)
      .orderBy("created_at", "desc")
      .execute();
    return rows.map((row) => this.mapVersion(row));
  }

  async setApplicationStatus(
    applicationId: string,
    status: ApplicationRecord["status"],
    currentVersionId?: string,
  ): Promise<ApplicationRecord> {
    const row = await this.db
      .updateTable("applications")
      .set({
        status,
        ...(currentVersionId === undefined
          ? {}
          : { current_version_id: currentVersionId }),
        updated_at: new Date(),
      })
      .where("application_id", "=", applicationId)
      .returningAll()
      .executeTakeFirstOrThrow();
    return this.mapApplication(row);
  }

  async createDelivery(
    input: Omit<DeliveryRecord, "deliveryId">,
  ): Promise<DeliveryRecord> {
    const row = await this.db
      .insertInto("application_deliveries")
      .values({
        application_id: input.applicationId,
        channel: input.channel,
        entry_url: input.entryUrl,
        min_client_version: input.minClientVersion,
        enabled: input.enabled,
      })
      .onConflict((oc) =>
        oc.columns(["application_id", "channel"]).doUpdateSet({
          entry_url: input.entryUrl,
          min_client_version: input.minClientVersion,
          enabled: input.enabled,
          updated_at: new Date(),
        }),
      )
      .returningAll()
      .executeTakeFirstOrThrow();
    return this.mapDelivery(row);
  }

  async listDeliveries(
    applicationId: string,
  ): Promise<readonly DeliveryRecord[]> {
    const rows = await this.db
      .selectFrom("application_deliveries")
      .selectAll()
      .where("application_id", "=", applicationId)
      .orderBy("channel")
      .execute();
    return rows.map((row) => this.mapDelivery(row));
  }

  async createReview(
    input: Omit<ReviewRecord, "reviewId" | "createdAt">,
  ): Promise<ReviewRecord> {
    const row = await this.db
      .insertInto("application_reviews")
      .values({
        application_id: input.applicationId,
        application_version_id: input.applicationVersionId,
        reviewer_employee_id: input.reviewerEmployeeId,
        application_owner_employee_id: input.applicationOwnerEmployeeId,
        decision: input.decision,
        comment: input.comment,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return this.mapReview(row);
  }

  async listReviews(applicationId: string): Promise<readonly ReviewRecord[]> {
    const rows = await this.db
      .selectFrom("application_reviews")
      .selectAll()
      .where("application_id", "=", applicationId)
      .orderBy("created_at", "desc")
      .execute();
    return rows.map((row) => this.mapReview(row));
  }

  async createReviewQueue(
    input: Omit<ReviewQueueRecord, "reviewQueueId" | "createdAt">,
  ): Promise<ReviewQueueRecord> {
    const row = await this.db
      .insertInto("application_review_queue")
      .values({
        application_id: input.applicationId,
        application_version_id: input.applicationVersionId,
        status: input.status,
        claimed_by_employee_id: input.claimedByEmployeeId,
        claimed_at: input.claimedAt,
        sla_due_at: input.slaDueAt,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return this.mapReviewQueue(row);
  }

  async findReviewQueueByVersion(
    applicationVersionId: string,
  ): Promise<ReviewQueueRecord | null> {
    const row = await this.db
      .selectFrom("application_review_queue")
      .selectAll()
      .where("application_version_id", "=", applicationVersionId)
      .executeTakeFirst();
    return row === undefined ? null : this.mapReviewQueue(row);
  }

  async claimReviewQueue(
    applicationVersionId: string,
    employeeId: string,
  ): Promise<ReviewQueueRecord> {
    const row = await this.db
      .updateTable("application_review_queue")
      .set({
        status: "claimed",
        claimed_by_employee_id: employeeId,
        claimed_at: new Date(),
      })
      .where("application_version_id", "=", applicationVersionId)
      .where("status", "=", "available")
      .returningAll()
      .executeTakeFirstOrThrow();
    return this.mapReviewQueue(row);
  }

  async releaseReviewQueue(
    applicationVersionId: string,
    employeeId: string,
  ): Promise<ReviewQueueRecord> {
    const row = await this.db
      .updateTable("application_review_queue")
      .set({
        status: "available",
        claimed_by_employee_id: null,
        claimed_at: null,
      })
      .where("application_version_id", "=", applicationVersionId)
      .where("claimed_by_employee_id", "=", employeeId)
      .returningAll()
      .executeTakeFirstOrThrow();
    return this.mapReviewQueue(row);
  }

  async recordAudit(input: {
    applicationId: string;
    applicationVersionId?: string | null;
    actorEmployeeId?: string | null;
    eventType: string;
    details?: unknown;
  }): Promise<void> {
    await this.db
      .insertInto("application_audit_events")
      .values({
        application_id: input.applicationId,
        application_version_id: input.applicationVersionId ?? null,
        actor_employee_id: input.actorEmployeeId ?? null,
        event_type: input.eventType,
        details: input.details ?? {},
      })
      .execute();
  }

  async emitOutbox(input: {
    applicationId: string;
    applicationVersionId?: string | null;
    eventType: string;
  }): Promise<void> {
    await this.db
      .insertInto("outbox_events")
      .values({
        event_type: input.eventType,
        aggregate_type: "application",
        aggregate_id: input.applicationId,
        payload: {
          applicationId: input.applicationId,
          applicationVersionId: input.applicationVersionId ?? null,
        },
        idempotency_key: `${input.eventType}:${input.applicationId}:${input.applicationVersionId ?? "none"}:${randomUUID()}`,
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

  private mapApplication(row: Selectable<DatabaseSchema["applications"]>) {
    return {
      applicationId: row.application_id,
      ownerEmployeeId: row.owner_employee_id,
      maintainerEmployeeId: row.maintainer_employee_id,
      departmentId: row.department_id,
      name: row.name,
      summary: row.summary,
      status: row.status,
      currentVersionId: row.current_version_id,
    } satisfies ApplicationRecord;
  }

  private mapVersion(row: Selectable<DatabaseSchema["application_versions"]>) {
    return {
      applicationVersionId: row.application_version_id,
      applicationId: row.application_id,
      version: row.version,
      changelog: row.changelog,
      artifactKey: row.artifact_key,
      artifactSha256: row.artifact_sha256,
      artifactSignature: row.artifact_signature,
      scanStatus: row.scan_status,
      createdByEmployeeId: row.created_by_employee_id,
      createdAt: row.created_at,
    } satisfies ApplicationVersionRecord;
  }

  private mapDelivery(
    row: Selectable<DatabaseSchema["application_deliveries"]>,
  ) {
    return {
      deliveryId: row.delivery_id,
      applicationId: row.application_id,
      channel: row.channel,
      entryUrl: row.entry_url,
      minClientVersion: row.min_client_version,
      enabled: row.enabled,
    } satisfies DeliveryRecord;
  }

  private mapReview(row: Selectable<DatabaseSchema["application_reviews"]>) {
    return {
      reviewId: row.review_id,
      applicationId: row.application_id,
      applicationVersionId: row.application_version_id,
      reviewerEmployeeId: row.reviewer_employee_id,
      applicationOwnerEmployeeId: row.application_owner_employee_id,
      decision: row.decision,
      comment: row.comment,
      createdAt: row.created_at,
    } satisfies ReviewRecord;
  }

  private mapReviewQueue(
    row: Selectable<DatabaseSchema["application_review_queue"]>,
  ): ReviewQueueRecord {
    return {
      reviewQueueId: row.review_queue_id,
      applicationId: row.application_id,
      applicationVersionId: row.application_version_id,
      status: row.status,
      claimedByEmployeeId: row.claimed_by_employee_id,
      claimedAt: row.claimed_at,
      slaDueAt: row.sla_due_at,
      createdAt: row.created_at,
    };
  }
}
