import type { DatabaseSchema } from "@ai-hub/database";
import { randomUUID } from "node:crypto";
import { type Kysely, type Selectable } from "kysely";
import type {
  ApplicationTeamRecord,
  CommentRecord,
  EmployeeStatus,
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

  async addLike(applicationId: string, employeeId: string): Promise<string> {
    const inserted = await this.db
      .insertInto("application_likes")
      .values({ application_id: applicationId, employee_id: employeeId })
      .onConflict((oc) =>
        oc.columns(["application_id", "employee_id"]).doNothing(),
      )
      .returning("like_id")
      .executeTakeFirst();
    if (inserted !== undefined) return String(inserted.like_id);
    // 并发插入冲突：onConflict doNothing 无返回行，对方事务已提交（READ COMMITTED
    // 下行可见）——查询现有行的 like_id 并返回，使冲突路径与插入路径对同一 like
    // 行产生同一个幂等键，避免同一 like 被行为事件计两次。
    const existing = await this.db
      .selectFrom("application_likes")
      .select("like_id")
      .where("application_id", "=", applicationId)
      .where("employee_id", "=", employeeId)
      .executeTakeFirst();
    if (existing === undefined) {
      // 冲突检测到行存在、但查询时行已被并发删除：无法取得该行的 like_id，
      // 此时抛错比退化为独立键更安全（独立键会造成重复计数）。
      throw new Error("LIKE_ROW_NOT_FOUND_ON_CONFLICT");
    }
    return String(existing.like_id);
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
    return this.mapRating(row, await this.employeeStatusOf(row.employee_id));
  }

  async findComment(commentId: string): Promise<CommentRecord | null> {
    const row = await this.db
      .selectFrom("application_comments")
      .selectAll()
      .where("comment_id", "=", commentId)
      .executeTakeFirst();
    if (row === undefined) return null;
    return this.mapComment(
      row,
      await this.employeeStatusOf(row.author_employee_id),
    );
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
        comment_kind: input.commentKind,
        hidden_at: input.hiddenAt,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return this.mapComment(
      row,
      await this.employeeStatusOf(row.author_employee_id),
    );
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

  async findReport(reportId: string): Promise<ReportRecord | null> {
    const row = await this.db
      .selectFrom("application_reports")
      .selectAll()
      .where("report_id", "=", reportId)
      .executeTakeFirst();
    return row === undefined ? null : this.mapReport(row);
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
      .leftJoin(
        "employees",
        "employees.employee_id",
        "application_ratings.employee_id",
      )
      .select([
        "application_ratings.rating_id",
        "application_ratings.application_id",
        "application_ratings.application_version_id",
        "application_ratings.employee_id",
        "application_ratings.stars",
        "application_ratings.body",
        "application_ratings.display_anonymously",
        "application_ratings.created_at",
        "application_ratings.updated_at",
        "employees.status as author_status",
      ])
      .where("application_id", "=", input.applicationId);

    const countResult = await this.db
      .selectFrom("application_ratings")
      .select((eb) => eb.fn.countAll<number>().as("total"))
      .where("application_id", "=", input.applicationId)
      .executeTakeFirstOrThrow();

    const rows = await baseQuery
      .offset((input.page - 1) * input.pageSize)
      .limit(input.pageSize)
      .orderBy("application_ratings.created_at", "desc")
      .execute();

    return {
      items: rows.map((r) => this.mapRating(r, r.author_status)),
      total: countResult.total,
    };
  }

  async listComments(input: {
    applicationId: string;
    page: number;
    pageSize: number;
  }): Promise<{ items: readonly CommentRecord[]; total: number }> {
    const commentColumns = [
      "application_comments.comment_id",
      "application_comments.application_id",
      "application_comments.application_version_id",
      "application_comments.parent_comment_id",
      "application_comments.author_employee_id",
      "application_comments.body",
      "application_comments.display_anonymously",
      "application_comments.comment_kind",
      "application_comments.hidden_at",
      "application_comments.created_at",
      "application_comments.updated_at",
      "employees.status as author_status",
    ] as const;

    const baseQuery = this.db
      .selectFrom("application_comments")
      .leftJoin(
        "employees",
        "employees.employee_id",
        "application_comments.author_employee_id",
      )
      .select(commentColumns)
      .where("application_id", "=", input.applicationId)
      .where("parent_comment_id", "is", null);

    const countResult = await this.db
      .selectFrom("application_comments")
      .select((eb) => eb.fn.countAll<number>().as("total"))
      .where("application_id", "=", input.applicationId)
      .where("parent_comment_id", "is", null)
      .executeTakeFirstOrThrow();

    const rootRows = await baseQuery
      .offset((input.page - 1) * input.pageSize)
      .limit(input.pageSize)
      .orderBy("application_comments.created_at", "desc")
      .execute();

    const rootComments = rootRows.map((r) =>
      this.mapComment(r, r.author_status),
    );

    const rootIds = rootComments.map((c) => c.commentId);
    let replyRows: Array<
      Selectable<DatabaseSchema["application_comments"]> & {
        author_status: EmployeeStatus | null;
      }
    > = [];
    if (rootIds.length > 0) {
      replyRows = await this.db
        .selectFrom("application_comments")
        .leftJoin(
          "employees",
          "employees.employee_id",
          "application_comments.author_employee_id",
        )
        .select(commentColumns)
        .where("parent_comment_id", "in", rootIds)
        .orderBy("application_comments.created_at", "asc")
        .execute();
    }
    const replies = replyRows.map((r) => this.mapComment(r, r.author_status));

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
    return this.mapComment(
      row,
      await this.employeeStatusOf(row.author_employee_id),
    );
  }

  async restoreComment(commentId: string): Promise<CommentRecord> {
    const row = await this.db
      .updateTable("application_comments")
      .set({ hidden_at: null })
      .where("comment_id", "=", commentId)
      .returningAll()
      .executeTakeFirstOrThrow();
    return this.mapComment(
      row,
      await this.employeeStatusOf(row.author_employee_id),
    );
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
    idempotencyKey?: string;
  }): Promise<void> {
    await this.db
      .insertInto("outbox_events")
      .values({
        event_type: input.eventType,
        aggregate_type: "application",
        aggregate_id: input.applicationId,
        payload: { applicationId: input.applicationId },
        idempotency_key:
          input.idempotencyKey ??
          `${input.eventType}:${input.applicationId}:${randomUUID()}`,
        status: "pending",
        attempts: 0,
        available_at: new Date(),
        claimed_by: null,
        claimed_at: null,
        last_error: null,
        completed_at: null,
      })
      .onConflict((oc) => oc.column("idempotency_key").doNothing())
      .execute();
  }

  private mapRating(
    row: Selectable<DatabaseSchema["application_ratings"]>,
    authorStatus: EmployeeStatus | null = null,
  ): RatingRecord {
    return {
      ratingId: row.rating_id,
      applicationId: row.application_id,
      applicationVersionId: row.application_version_id,
      employeeId: row.employee_id,
      stars: row.stars,
      body: row.body,
      displayAnonymously: row.display_anonymously,
      authorStatus,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapComment(
    row: Selectable<DatabaseSchema["application_comments"]>,
    authorStatus: EmployeeStatus | null = null,
  ): CommentRecord {
    return {
      commentId: row.comment_id,
      applicationId: row.application_id,
      applicationVersionId: row.application_version_id,
      parentCommentId: row.parent_comment_id,
      authorEmployeeId: row.author_employee_id,
      body: row.body,
      displayAnonymously: row.display_anonymously,
      commentKind: row.comment_kind,
      hiddenAt: row.hidden_at,
      authorStatus,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /** 员工账号状态（disabled/archived 视为已停用）；员工行缺失时为 null。 */
  private async employeeStatusOf(
    employeeId: string,
  ): Promise<EmployeeStatus | null> {
    const row = await this.db
      .selectFrom("employees")
      .select("status")
      .where("employee_id", "=", employeeId)
      .executeTakeFirst();
    return row?.status ?? null;
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
