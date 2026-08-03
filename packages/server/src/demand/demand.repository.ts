import type { CreateDemandInput, DemandStatus } from "@ai-hub/contracts";
import type { DatabaseSchema } from "@ai-hub/database";
import { randomUUID } from "node:crypto";
import { sql, type Kysely, type Selectable } from "kysely";
import { KyselyApplicationRepository } from "../application/application.repository.js";
import type {
  DemandCommentRecord,
  DemandCollaboratorRecord,
  DemandApplicationLinkRecord,
  DemandEntry,
  DemandPilotRecord,
  DemandProgressRecord,
  DemandReportRecord,
  DemandRepository,
} from "./demand.types.js";

type DemandRow = Selectable<DatabaseSchema["ai_demands"]> & {
  like_count: number | string;
  comment_count: number | string;
};
type CommentRow = Selectable<DatabaseSchema["ai_demand_comments"]>;
type ReportRow = Selectable<DatabaseSchema["ai_demand_reports"]>;
type ProgressRow = Selectable<DatabaseSchema["ai_demand_progress_updates"]>;
type PilotRow = Selectable<DatabaseSchema["ai_demand_pilots"]>;

export class KyselyDemandRepository implements DemandRepository {
  constructor(private readonly db: Kysely<DatabaseSchema>) {}

  withTransaction<T>(
    operation: (repository: DemandRepository) => Promise<T>,
  ): Promise<T> {
    return this.db
      .transaction()
      .execute(async (transaction) =>
        operation(new KyselyDemandRepository(transaction)),
      );
  }

  withApplicationTransaction<T>(
    operation: (
      demandRepository: DemandRepository,
      applicationRepository: import("../application/application.types.js").ApplicationRepository,
    ) => Promise<T>,
  ): Promise<T> {
    return this.db
      .transaction()
      .execute(async (transaction) =>
        operation(
          new KyselyDemandRepository(transaction),
          new KyselyApplicationRepository(transaction),
        ),
      );
  }

  async createDraft(input: {
    requesterEmployeeId: string;
    title: string;
    problemStatement: string;
    desiredOutcome: string;
    audienceType: CreateDemandInput["audienceType"];
    departmentId: string | null;
    employeeId: string | null;
    includeChildren: boolean;
    displayAnonymously: boolean;
  }): Promise<DemandEntry> {
    const row = await this.db
      .insertInto("ai_demands")
      .values({
        requester_employee_id: input.requesterEmployeeId,
        title: input.title,
        problem_statement: input.problemStatement,
        desired_outcome: input.desiredOutcome,
        status: "draft",
        audience_type: input.audienceType,
        audience_department_id: input.departmentId,
        audience_employee_id: input.employeeId,
        include_children: input.includeChildren,
        display_anonymously: input.displayAnonymously,
        review_reason: null,
        business_value: null,
        implementation_cost: null,
        risk_level: null,
        admin_priority: null,
        priority_score: null,
        priority_explanation: null,
        owner_employee_id: null,
        version: 1,
        merged_into_demand_id: null,
        primary_solution_application_id: null,
        published_at: null,
        closed_at: null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return this.mapRow({
      ...row,
      like_count: 0,
      comment_count: 0,
    });
  }

  async findById(demandId: string): Promise<DemandEntry | null> {
    const row = await this.selectDemand()
      .where("ai_demands.demand_id", "=", demandId)
      .executeTakeFirst();
    return row === undefined ? null : this.mapRow(row);
  }

  async listVisible(input: {
    actor: Parameters<DemandRepository["listVisible"]>[0]["actor"];
    status?: DemandEntry["status"];
    query?: string;
    sortByPriority?: boolean;
  }): Promise<readonly DemandEntry[]> {
    let query = this.selectDemand().where(this.audiencePredicate(input.actor));
    if (input.status !== undefined) {
      query = query.where("ai_demands.status", "=", input.status);
    }
    if (input.query !== undefined && input.query.trim().length > 0) {
      const pattern = `%${input.query.trim()}%`;
      query = query.where(
        sql<boolean>`(
          ai_demands.title ilike ${pattern}
          or ai_demands.problem_statement ilike ${pattern}
          or ai_demands.desired_outcome ilike ${pattern}
        )`,
      );
    }
    const ordered = input.sortByPriority
      ? query.orderBy(sql`ai_demands.priority_score desc nulls last`)
      : query.orderBy("ai_demands.created_at", "desc");
    const rows = await ordered
      .orderBy("ai_demands.created_at", "desc")
      .orderBy("ai_demands.demand_id", "asc")
      .execute();
    return rows.map((row) => this.mapRow(row));
  }

  async findVisible(
    actor: Parameters<DemandRepository["findVisible"]>[0],
    demandId: string,
  ): Promise<DemandEntry | null> {
    const row = await this.selectDemand()
      .where(this.audiencePredicate(actor))
      .where("ai_demands.demand_id", "=", demandId)
      .executeTakeFirst();
    return row === undefined ? null : this.mapRow(row);
  }

  async updateDraft(
    demandId: string,
    expectedVersion: number,
    input: Partial<{
      title: string;
      problemStatement: string;
      desiredOutcome: string;
      audienceType: CreateDemandInput["audienceType"];
      departmentId: string | null;
      employeeId: string | null;
      includeChildren: boolean;
      displayAnonymously: boolean;
    }>,
  ): Promise<DemandEntry> {
    const row = await this.db
      .updateTable("ai_demands")
      .set({
        ...(input.title === undefined ? {} : { title: input.title }),
        ...(input.problemStatement === undefined
          ? {}
          : { problem_statement: input.problemStatement }),
        ...(input.desiredOutcome === undefined
          ? {}
          : { desired_outcome: input.desiredOutcome }),
        ...(input.audienceType === undefined
          ? {}
          : { audience_type: input.audienceType }),
        ...(input.departmentId === undefined
          ? {}
          : { audience_department_id: input.departmentId }),
        ...(input.employeeId === undefined
          ? {}
          : { audience_employee_id: input.employeeId }),
        ...(input.includeChildren === undefined
          ? {}
          : { include_children: input.includeChildren }),
        ...(input.displayAnonymously === undefined
          ? {}
          : { display_anonymously: input.displayAnonymously }),
        status: "draft",
        review_reason: null,
        version: sql`version + 1`,
        updated_at: new Date(),
      })
      .where("demand_id", "=", demandId)
      .where("version", "=", expectedVersion)
      .returningAll()
      .executeTakeFirst();
    if (row === undefined) throw new Error("DEMAND_CONFLICT");
    return this.mapRow({ ...row, like_count: 0, comment_count: 0 });
  }

  async transitionStatus(
    demandId: string,
    status: DemandStatus,
    expectedVersion: number,
    reviewReason: string | null = null,
  ): Promise<DemandEntry> {
    const row = await this.db
      .updateTable("ai_demands")
      .set({
        status,
        review_reason: reviewReason,
        published_at: status === "published" ? new Date() : null,
        version: sql`version + 1`,
        updated_at: new Date(),
      })
      .where("demand_id", "=", demandId)
      .where("version", "=", expectedVersion)
      .returningAll()
      .executeTakeFirst();
    if (row === undefined) throw new Error("DEMAND_CONFLICT");
    return this.mapRow({ ...row, like_count: 0, comment_count: 0 });
  }

  async setPriority(
    demandId: string,
    input: {
      businessValue: number;
      implementationCost: number;
      riskLevel: number;
      adminPriority: number;
    },
    expectedVersion: number,
    score: number,
    explanation: string,
  ): Promise<DemandEntry> {
    const row = await this.db
      .updateTable("ai_demands")
      .set({
        business_value: input.businessValue,
        implementation_cost: input.implementationCost,
        risk_level: input.riskLevel,
        admin_priority: input.adminPriority,
        priority_score: score,
        priority_explanation: explanation,
        version: sql`version + 1`,
        updated_at: new Date(),
      })
      .where("demand_id", "=", demandId)
      .where("version", "=", expectedVersion)
      .returningAll()
      .executeTakeFirst();
    if (row === undefined) throw new Error("DEMAND_CONFLICT");
    return this.mapRow({ ...row, like_count: 0, comment_count: 0 });
  }

  async createProgressUpdate(input: {
    demandId: string;
    authorEmployeeId: string;
    status: DemandEntry["status"];
    title: string;
    body: string;
  }): Promise<DemandProgressRecord> {
    const row = await this.db
      .insertInto("ai_demand_progress_updates")
      .values({
        demand_id: input.demandId,
        author_employee_id: input.authorEmployeeId,
        status: input.status,
        title: input.title,
        body: input.body,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return this.mapProgress(row);
  }

  async listProgressUpdates(
    demandId: string,
  ): Promise<readonly DemandProgressRecord[]> {
    const rows = await this.db
      .selectFrom("ai_demand_progress_updates")
      .selectAll()
      .where("demand_id", "=", demandId)
      .orderBy("created_at", "desc")
      .orderBy("progress_id", "asc")
      .execute();
    return rows.map((row) => this.mapProgress(row));
  }

  async createPilot(input: {
    demandId: string;
    applicationId: string | null;
    name: string;
    startsAt: Date;
    endsAt: Date | null;
    outcome: string | null;
    status: DemandPilotRecord["status"];
    createdByEmployeeId: string;
  }): Promise<DemandPilotRecord> {
    const row = await this.db
      .insertInto("ai_demand_pilots")
      .values({
        demand_id: input.demandId,
        application_id: input.applicationId,
        name: input.name,
        starts_at: input.startsAt,
        ends_at: input.endsAt,
        outcome: input.outcome,
        status: input.status,
        created_by_employee_id: input.createdByEmployeeId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return this.mapPilot(row);
  }

  async updatePilot(
    pilotId: string,
    input: Partial<{
      endsAt: Date | null;
      outcome: string | null;
      status: DemandPilotRecord["status"];
    }>,
  ): Promise<DemandPilotRecord> {
    const row = await this.db
      .updateTable("ai_demand_pilots")
      .set({
        ...(input.endsAt === undefined ? {} : { ends_at: input.endsAt }),
        ...(input.outcome === undefined ? {} : { outcome: input.outcome }),
        ...(input.status === undefined ? {} : { status: input.status }),
        updated_at: new Date(),
      })
      .where("pilot_id", "=", pilotId)
      .returningAll()
      .executeTakeFirst();
    if (row === undefined) throw new Error("DEMAND_PILOT_NOT_FOUND");
    return this.mapPilot(row);
  }

  async mergeDemands(
    sourceDemandId: string,
    targetDemandId: string,
    sourceExpectedVersion: number,
    targetExpectedVersion: number,
  ): Promise<{ source: DemandEntry; target: DemandEntry }> {
    const sourceRow = await this.db
      .updateTable("ai_demands")
      .set({
        status: "merged",
        merged_into_demand_id: targetDemandId,
        version: sql`version + 1`,
        updated_at: new Date(),
      })
      .where("demand_id", "=", sourceDemandId)
      .where("version", "=", sourceExpectedVersion)
      .where("status", "!=", "merged")
      .returningAll()
      .executeTakeFirst();
    if (sourceRow === undefined) throw new Error("DEMAND_CONFLICT");
    const targetRow = await this.db
      .updateTable("ai_demands")
      .set({ version: sql`version + 1`, updated_at: new Date() })
      .where("demand_id", "=", targetDemandId)
      .where("version", "=", targetExpectedVersion)
      .where("status", "!=", "merged")
      .returningAll()
      .executeTakeFirst();
    if (targetRow === undefined) throw new Error("DEMAND_CONFLICT");
    return {
      source: this.mapRow({ ...sourceRow, like_count: 0, comment_count: 0 }),
      target: this.mapRow({ ...targetRow, like_count: 0, comment_count: 0 }),
    };
  }

  async linkApplication(
    demandId: string,
    applicationId: string,
    role: "candidate" | "pilot" | "solution",
    isPrimary: boolean,
    expectedVersion: number,
    linkedByEmployeeId: string,
  ): Promise<DemandApplicationLinkRecord> {
    if (isPrimary) {
      const application = await this.db
        .selectFrom("applications")
        .select("status")
        .where("application_id", "=", applicationId)
        .executeTakeFirst();
      if (application === undefined) {
        throw new Error("DEMAND_APPLICATION_NOT_FOUND");
      }
      if (application.status !== "published") {
        throw new Error(
          "DEMAND_PRIMARY_SOLUTION_REQUIRES_PUBLISHED_APPLICATION",
        );
      }
    }
    const demandRow = await this.db
      .updateTable("ai_demands")
      .set({
        ...(isPrimary
          ? { primary_solution_application_id: applicationId }
          : {}),
        version: sql`version + 1`,
        updated_at: new Date(),
      })
      .where("demand_id", "=", demandId)
      .where("version", "=", expectedVersion)
      .returning("demand_id")
      .executeTakeFirst();
    if (demandRow === undefined) throw new Error("DEMAND_CONFLICT");
    if (isPrimary) {
      await this.db
        .updateTable("ai_demand_applications")
        .set({ is_primary: false })
        .where("demand_id", "=", demandId)
        .where("is_primary", "=", true)
        .execute();
    }
    const existing = await this.db
      .selectFrom("ai_demand_applications")
      .select("application_id")
      .where("demand_id", "=", demandId)
      .where("application_id", "=", applicationId)
      .executeTakeFirst();
    if (existing !== undefined) {
      const row = await this.db
        .updateTable("ai_demand_applications")
        .set({
          role,
          is_primary: isPrimary,
          linked_by_employee_id: linkedByEmployeeId,
        })
        .where("demand_id", "=", demandId)
        .where("application_id", "=", applicationId)
        .returningAll()
        .executeTakeFirstOrThrow();
      return {
        demandId: row.demand_id,
        applicationId: row.application_id,
        role: row.role,
        isPrimary: row.is_primary,
        linkedByEmployeeId: row.linked_by_employee_id,
        createdAt: row.created_at,
      };
    }
    try {
      const row = await this.db
        .insertInto("ai_demand_applications")
        .values({
          demand_id: demandId,
          application_id: applicationId,
          role,
          is_primary: isPrimary,
          linked_by_employee_id: linkedByEmployeeId,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      return {
        demandId: row.demand_id,
        applicationId: row.application_id,
        role: row.role,
        isPrimary: row.is_primary,
        linkedByEmployeeId: row.linked_by_employee_id,
        createdAt: row.created_at,
      };
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "23505"
      ) {
        throw new Error("DEMAND_APPLICATION_LINK_DUPLICATE");
      }
      throw error;
    }
  }

  async listApplicationLinks(
    demandId: string,
  ): Promise<readonly DemandApplicationLinkRecord[]> {
    const rows = await this.db
      .selectFrom("ai_demand_applications")
      .selectAll()
      .where("demand_id", "=", demandId)
      .orderBy("is_primary", "desc")
      .orderBy("application_id", "asc")
      .execute();
    return rows.map((row) => ({
      demandId: row.demand_id,
      applicationId: row.application_id,
      role: row.role,
      isPrimary: row.is_primary,
      linkedByEmployeeId: row.linked_by_employee_id,
      createdAt: row.created_at,
    }));
  }

  async claimOwner(
    demandId: string,
    employeeId: string,
    expectedVersion: number,
  ): Promise<DemandEntry> {
    const row = await this.db
      .updateTable("ai_demands")
      .set({
        owner_employee_id: employeeId,
        version: sql`version + 1`,
        updated_at: new Date(),
      })
      .where("demand_id", "=", demandId)
      .where("owner_employee_id", "is", null)
      .where("version", "=", expectedVersion)
      .returningAll()
      .executeTakeFirst();
    if (row === undefined) throw new Error("DEMAND_CONFLICT");
    await this.db
      .insertInto("ai_demand_collaborators")
      .values({ demand_id: demandId, employee_id: employeeId, role: "owner" })
      .execute();
    return this.mapRow({ ...row, like_count: 0, comment_count: 0 });
  }

  async assignCollaborator(
    demandId: string,
    employeeId: string,
    role: DemandCollaboratorRecord["role"],
    expectedVersion: number,
  ): Promise<DemandCollaboratorRecord> {
    const row = await this.db
      .updateTable("ai_demands")
      .set({ version: sql`version + 1`, updated_at: new Date() })
      .where("demand_id", "=", demandId)
      .where("version", "=", expectedVersion)
      .returning("demand_id")
      .executeTakeFirst();
    if (row === undefined) throw new Error("DEMAND_CONFLICT");
    try {
      const collaborator = await this.db
        .insertInto("ai_demand_collaborators")
        .values({ demand_id: demandId, employee_id: employeeId, role })
        .returningAll()
        .executeTakeFirstOrThrow();
      return {
        demandId: collaborator.demand_id,
        employeeId: collaborator.employee_id,
        role: collaborator.role,
        createdAt: collaborator.created_at,
      };
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "23505"
      ) {
        throw new Error("DEMAND_COLLABORATOR_DUPLICATE");
      }
      throw error;
    }
  }

  async listCollaborators(
    demandId: string,
  ): Promise<readonly DemandCollaboratorRecord[]> {
    const rows = await this.db
      .selectFrom("ai_demand_collaborators")
      .selectAll()
      .where("demand_id", "=", demandId)
      .orderBy("created_at", "asc")
      .orderBy("employee_id", "asc")
      .execute();
    return rows.map((row) => ({
      demandId: row.demand_id,
      employeeId: row.employee_id,
      role: row.role,
      createdAt: row.created_at,
    }));
  }

  async hasLike(demandId: string, employeeId: string): Promise<boolean> {
    const row = await this.db
      .selectFrom("ai_demand_likes")
      .select("demand_id")
      .where("demand_id", "=", demandId)
      .where("employee_id", "=", employeeId)
      .executeTakeFirst();
    return row !== undefined;
  }

  async addLike(demandId: string, employeeId: string): Promise<void> {
    await this.db
      .insertInto("ai_demand_likes")
      .values({ demand_id: demandId, employee_id: employeeId })
      .onConflict((oc) => oc.columns(["demand_id", "employee_id"]).doNothing())
      .execute();
  }

  async removeLike(demandId: string, employeeId: string): Promise<void> {
    await this.db
      .deleteFrom("ai_demand_likes")
      .where("demand_id", "=", demandId)
      .where("employee_id", "=", employeeId)
      .execute();
  }

  async findComment(commentId: string): Promise<DemandCommentRecord | null> {
    const row = await this.db
      .selectFrom("ai_demand_comments")
      .selectAll()
      .where("comment_id", "=", commentId)
      .executeTakeFirst();
    return row === undefined ? null : this.mapComment(row);
  }

  async createComment(
    input: Omit<DemandCommentRecord, "commentId" | "createdAt" | "updatedAt">,
  ): Promise<DemandCommentRecord> {
    const row = await this.db
      .insertInto("ai_demand_comments")
      .values({
        demand_id: input.demandId,
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

  async listComments(
    demandId: string,
  ): Promise<readonly DemandCommentRecord[]> {
    const rows = await this.db
      .selectFrom("ai_demand_comments")
      .selectAll()
      .where("demand_id", "=", demandId)
      .orderBy("created_at", "asc")
      .execute();
    return rows.map((row) => this.mapComment(row));
  }

  async setCommentHidden(
    commentId: string,
    hiddenAt: Date | null,
  ): Promise<void> {
    const result = await this.db
      .updateTable("ai_demand_comments")
      .set({ hidden_at: hiddenAt })
      .where("comment_id", "=", commentId)
      .executeTakeFirst();
    if (Number(result.numUpdatedRows) !== 1) {
      throw new Error("DEMAND_COMMENT_NOT_FOUND");
    }
  }

  async createReport(
    input: Omit<DemandReportRecord, "reportId" | "createdAt">,
  ): Promise<DemandReportRecord> {
    const row = await this.db
      .insertInto("ai_demand_reports")
      .values({
        demand_id: input.demandId,
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
    status: DemandReportRecord["status"],
    employeeId: string,
  ): Promise<DemandReportRecord> {
    const row = await this.db
      .updateTable("ai_demand_reports")
      .set({
        status,
        resolved_by_employee_id: employeeId,
        resolved_at: new Date(),
      })
      .where("report_id", "=", reportId)
      .returningAll()
      .executeTakeFirst();
    if (row === undefined) throw new Error("DEMAND_REPORT_NOT_FOUND");
    return this.mapReport(row);
  }

  async recordAudit(input: {
    demandId: string;
    actorEmployeeId: string;
    eventType: string;
    details?: unknown;
  }): Promise<void> {
    await this.db
      .insertInto("ai_demand_audit_events")
      .values({
        demand_id: input.demandId,
        actor_employee_id: input.actorEmployeeId,
        event_type: input.eventType,
        details: input.details ?? {},
      })
      .execute();
  }

  async emitOutbox(input: {
    demandId: string;
    eventType: string;
  }): Promise<void> {
    await this.db
      .insertInto("outbox_events")
      .values({
        event_type: input.eventType,
        aggregate_type: "ai_demand",
        aggregate_id: input.demandId,
        payload: { demandId: input.demandId },
        idempotency_key: `${input.eventType}:${input.demandId}:${randomUUID()}`,
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

  private selectDemand() {
    return this.db
      .selectFrom("ai_demands")
      .selectAll("ai_demands")
      .select([
        sql<number>`(
          select count(*)::int from ai_demand_likes l
          where l.demand_id = ai_demands.demand_id
        )`.as("like_count"),
        sql<number>`(
          select count(*)::int from ai_demand_comments c
          where c.demand_id = ai_demands.demand_id and c.hidden_at is null
        )`.as("comment_count"),
      ]);
  }

  private audiencePredicate(
    actor: Parameters<DemandRepository["findVisible"]>[0],
  ) {
    const departments =
      actor.departmentIds.length === 0
        ? sql`null`
        : sql.join(
            actor.departmentIds.map((departmentId) => sql`${departmentId}`),
          );
    return sql<boolean>`(
      ai_demands.requester_employee_id = ${actor.employeeId}
      or ai_demands.audience_type = 'all'
      or (
        ai_demands.audience_type = 'employee'
        and ai_demands.audience_employee_id = ${actor.employeeId}
      )
      or (
        ai_demands.audience_type = 'department'
        and (
          ai_demands.audience_department_id in (${departments})
          or (
            ai_demands.include_children = true
            and exists (
              with recursive department_tree as (
                select d.department_id
                from departments d
                where d.department_id = ai_demands.audience_department_id
                union all
                select child.department_id
                from departments child
                inner join department_tree parent
                  on child.parent_department_id = parent.department_id
              )
              select 1
              from department_tree
              where department_id in (${departments})
            )
          )
        )
      )
    )`;
  }

  private mapRow(row: DemandRow): DemandEntry {
    return {
      demandId: row.demand_id,
      requesterEmployeeId: row.requester_employee_id,
      title: row.title,
      problemStatement: row.problem_statement,
      desiredOutcome: row.desired_outcome,
      status: row.status,
      audienceType: row.audience_type,
      audienceDepartmentId: row.audience_department_id,
      audienceEmployeeId: row.audience_employee_id,
      includeChildren: row.include_children,
      displayAnonymously: row.display_anonymously,
      reviewReason: row.review_reason,
      likeCount: Number(row.like_count),
      commentCount: Number(row.comment_count),
      businessValue: row.business_value,
      implementationCost: row.implementation_cost,
      riskLevel: row.risk_level,
      adminPriority: row.admin_priority,
      priorityScore:
        row.priority_score === null ? null : Number(row.priority_score),
      priorityExplanation: row.priority_explanation,
      ownerEmployeeId: row.owner_employee_id,
      primarySolutionApplicationId: row.primary_solution_application_id,
      version: row.version,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapComment(row: CommentRow): DemandCommentRecord {
    return {
      commentId: row.comment_id,
      demandId: row.demand_id,
      parentCommentId: row.parent_comment_id,
      authorEmployeeId: row.author_employee_id,
      body: row.body,
      displayAnonymously: row.display_anonymously,
      hiddenAt: row.hidden_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapProgress(row: ProgressRow): DemandProgressRecord {
    return {
      progressId: row.progress_id,
      demandId: row.demand_id,
      authorEmployeeId: row.author_employee_id,
      status: row.status,
      title: row.title,
      body: row.body,
      createdAt: row.created_at,
    };
  }

  private mapPilot(row: PilotRow): DemandPilotRecord {
    return {
      pilotId: row.pilot_id,
      demandId: row.demand_id,
      applicationId: row.application_id,
      name: row.name,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      outcome: row.outcome,
      status: row.status,
      createdByEmployeeId: row.created_by_employee_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapReport(row: ReportRow): DemandReportRecord {
    return {
      reportId: row.report_id,
      demandId: row.demand_id,
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
