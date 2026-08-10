import type { DatabaseSchema } from "@ai-hub/database";
import { randomUUID } from "node:crypto";
import { type Kysely, type Selectable } from "kysely";
import type {
  ApplicationTeamRecord,
  CommentRecord,
  RatingRecord,
  ReportRecord,
} from "./interaction.types.js";
import type { InteractionRepository } from "./interaction.types.js";

export class KyselyInteractionRepository implements InteractionRepository {
  constructor(private readonly db: Kysely<DatabaseSchema>) {}

  withTransaction<T>(
    operation: (repository: InteractionRepository) => Promise<T>,
  ): Promise<T> {
    return this.db
      .transaction()
      .execute(async (transaction) =>
        operation(new KyselyInteractionRepository(transaction)),
      );
  }

  async findApplication(
    applicationId: string,
  ): Promise<ApplicationTeamRecord | null> {
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

  async findCurrentVersionId(applicationId: string): Promise<string> {
    const row = await this.db
      .selectFrom("applications")
      .select("current_version_id")
      .where("application_id", "=", applicationId)
      .executeTakeFirst();
    if (row?.current_version_id === null || row === undefined) {
      throw new Error("PUBLISHED_VERSION_NOT_FOUND");
    }
    return row.current_version_id;
  }

  async hasLike(applicationId: string, employeeId: string): Promise<boolean> {
    const row = await this.db
      .selectFrom("application_likes")
      .select("application_id")
      .where("application_id", "=", applicationId)
      .where("employee_id", "=", employeeId)
      .executeTakeFirst();
    return row !== undefined;
  }

  async addLike(applicationId: string, employeeId: string): Promise<void> {
    await this.db
      .insertInto("application_likes")
      .values({ application_id: applicationId, employee_id: employeeId })
      .onConflict((oc) =>
        oc.columns(["application_id", "employee_id"]).doNothing(),
      )
      .execute();
  }

  async removeLike(applicationId: string, employeeId: string): Promise<void> {
    await this.db
      .deleteFrom("application_likes")
      .where("application_id", "=", applicationId)
      .where("employee_id", "=", employeeId)
      .execute();
  }

  async upsertRating(
    input: Omit<RatingRecord, "ratingId" | "createdAt" | "updatedAt">,
  ): Promise<RatingRecord> {
    const row = await this.db
      .insertInto("application_ratings")
      .values({
        application_id: input.applicationId,
        application_version_id: input.applicationVersionId,
        employee_id: input.employeeId,
        stars: input.stars,
        body: input.body,
        display_anonymously: input.displayAnonymously,
      })
      .onConflict((oc) =>
        oc.columns(["application_id", "employee_id"]).doUpdateSet({
          application_version_id: input.applicationVersionId,
          stars: input.stars,
          body: input.body,
          display_anonymously: input.displayAnonymously,
          updated_at: new Date(),
        }),
      )
      .returningAll()
      .executeTakeFirstOrThrow();
    return this.mapRating(row);
  }

  async findComment(commentId: string): Promise<CommentRecord | null> {
    const row = await this.db
      .selectFrom("application_comments")
      .selectAll()
      .where("comment_id", "=", commentId)
      .executeTakeFirst();
    return row === undefined ? null : this.mapComment(row);
  }

  async createComment(
    input: Omit<CommentRecord, "commentId" | "createdAt" | "updatedAt">,
  ): Promise<CommentRecord> {
    const row = await this.db
      .insertInto("application_comments")
      .values({
        application_id: input.applicationId,
        application_version_id: input.applicationVersionId,
        parent_comment_id: input.parentCommentId,
        author_employee_id: input.authorEmployeeId,
        body: input.body,
        display_anonymously: input.displayAnonymously,
        hidden_at: input.hiddenAt,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return this.mapComment(row);
  }

  async createReport(
    input: Omit<ReportRecord, "reportId" | "createdAt">,
  ): Promise<ReportRecord> {
    const row = await this.db
      .insertInto("application_reports")
      .values({
        application_id: input.applicationId,
        comment_id: input.commentId,
        reporter_employee_id: input.reporterEmployeeId,
        reason: input.reason,
        status: input.status,
        resolved_by_employee_id: input.resolvedByEmployeeId,
        resolved_at: input.resolvedAt,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return this.mapReport(row);
  }

  async resolveReport(
    reportId: string,
    status: ReportRecord["status"],
    employeeId: string,
  ): Promise<ReportRecord> {
    const row = await this.db
      .updateTable("application_reports")
      .set({
        status,
        resolved_by_employee_id: employeeId,
        resolved_at: new Date(),
      })
      .where("report_id", "=", reportId)
      .returningAll()
      .executeTakeFirstOrThrow();
    return this.mapReport(row);
  }

  async listRatings(input: {
    applicationId: string;
    page: number;
    pageSize: number;
  }): Promise<{ items: readonly RatingRecord[]; total: number }> {
    const baseQuery = this.db
      .selectFrom("application_ratings")
      .selectAll()
      .where("application_id", "=", input.applicationId);

    const countResult = await baseQuery
      .select((eb) => eb.fn.countAll<number>().as("total"))
      .executeTakeFirstOrThrow();

    const rows = await baseQuery
      .offset((input.page - 1) * input.pageSize)
      .limit(input.pageSize)
      .orderBy("created_at", "desc")
      .execute();

    return {
      items: rows.map((r) => this.mapRating(r)),
      total: countResult.total,
    };
  }

  async listComments(input: {
    applicationId: string;
    page: number;
    pageSize: number;
  }): Promise<{ items: readonly CommentRecord[]; total: number }> {
    const baseQuery = this.db
      .selectFrom("application_comments")
      .selectAll()
      .where("application_id", "=", input.applicationId)
      .where("parent_comment_id", "is", null);

    const countResult = await baseQuery
      .select((eb) => eb.fn.countAll<number>().as("total"))
      .executeTakeFirstOrThrow();

    const rootRows = await baseQuery
      .offset((input.page - 1) * input.pageSize)
      .limit(input.pageSize)
      .orderBy("created_at", "desc")
      .execute();

    const rootComments = rootRows.map((r) => this.mapComment(r));

    const rootIds = rootComments.map((c) => c.commentId);
    let replyRows: Selectable<DatabaseSchema["application_comments"]>[] = [];
    if (rootIds.length > 0) {
      replyRows = await this.db
        .selectFrom("application_comments")
        .selectAll()
        .where("parent_comment_id", "in", rootIds)
        .orderBy("created_at", "asc")
        .execute();
    }
    const replies = replyRows.map((r) => this.mapComment(r));

    return {
      items: [...rootComments, ...replies],
      total: countResult.total,
    };
  }

  async hideComment(commentId: string): Promise<CommentRecord> {
    const row = await this.db
      .updateTable("application_comments")
      .set({ hidden_at: new Date() })
      .where("comment_id", "=", commentId)
      .returningAll()
      .executeTakeFirstOrThrow();
    return this.mapComment(row);
  }

  async restoreComment(commentId: string): Promise<CommentRecord> {
    const row = await this.db
      .updateTable("application_comments")
      .set({ hidden_at: null })
      .where("comment_id", "=", commentId)
      .returningAll()
      .executeTakeFirstOrThrow();
    return this.mapComment(row);
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

  private mapRating(
    row: Selectable<DatabaseSchema["application_ratings"]>,
  ): RatingRecord {
    return {
      ratingId: row.rating_id,
      applicationId: row.application_id,
      applicationVersionId: row.application_version_id,
      employeeId: row.employee_id,
      stars: row.stars,
      body: row.body,
      displayAnonymously: row.display_anonymously,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapComment(
    row: Selectable<DatabaseSchema["application_comments"]>,
  ): CommentRecord {
    return {
      commentId: row.comment_id,
      applicationId: row.application_id,
      applicationVersionId: row.application_version_id,
      parentCommentId: row.parent_comment_id,
      authorEmployeeId: row.author_employee_id,
      body: row.body,
      displayAnonymously: row.display_anonymously,
      hiddenAt: row.hidden_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapReport(
    row: Selectable<DatabaseSchema["application_reports"]>,
  ): ReportRecord {
    return {
      reportId: row.report_id,
      applicationId: row.application_id,
      commentId: row.comment_id,
      reporterEmployeeId: row.reporter_employee_id,
      reason: row.reason,
      status: row.status,
      resolvedByEmployeeId: row.resolved_by_employee_id,
      resolvedAt: row.resolved_at,
      createdAt: row.created_at,
    };
  }
}
