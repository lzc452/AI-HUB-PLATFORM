import type { DatabaseSchema } from "@ai-hub/database";
import { sql, type Kysely, type Selectable } from "kysely";
import type {
  AuditEventInput,
  AuditExportJobRecord,
  AuditEventRecord,
  AuditListInput,
  AuditRepository,
} from "./audit.types.js";
import { randomUUID } from "node:crypto";

export class KyselyAuditRepository implements AuditRepository {
  constructor(private readonly db: Kysely<DatabaseSchema>) {}

  async listEvents(input: AuditListInput): Promise<{
    items: readonly AuditEventRecord[];
    total: number;
  }> {
    const buildQuery = () => {
      let query = this.db.selectFrom("security_audit_events").selectAll();
      const keyword = input.keyword?.trim();
      if (keyword !== undefined && keyword.length > 0) {
        const pattern = `%${keyword}%`;
        query = query.where((eb) =>
          eb.or([
            eb("trace_id", "ilike", pattern),
            eb("actor_employee_id", "ilike", pattern),
            eb("subject", "ilike", pattern),
          ]),
        );
      }
      if (input.module !== undefined) {
        query = query.where("module", "=", input.module);
      }
      if (input.action !== undefined) {
        query = query.where("action", "=", input.action);
      }
      if (input.actorEmployeeId !== undefined) {
        query = query.where("actor_employee_id", "=", input.actorEmployeeId);
      }
      if (input.result !== undefined) {
        query = query.where("result", "=", input.result);
      }
      if (input.risk !== undefined) {
        query = query.where("risk", "=", input.risk);
      }
      if (input.from !== undefined) {
        query = query.where("created_at", ">=", new Date(input.from));
      }
      if (input.to !== undefined) {
        query = query.where("created_at", "<=", new Date(input.to));
      }
      return query;
    };

    const countRow = await this.db
      .selectFrom(() => buildQuery().as("filtered"))
      .select(sql<{ count: number }>`count(*)::int`.as("count"))
      .executeTakeFirst();
    const total = Number(countRow?.count ?? 0);
    const rows = await buildQuery()
      .orderBy("created_at", "desc")
      .limit(input.pageSize)
      .offset((input.page - 1) * input.pageSize)
      .execute();
    return { items: rows.map((row) => this.mapEvent(row)), total };
  }

  async createEvent(input: AuditEventInput): Promise<void> {
    await this.db
      .insertInto("security_audit_events")
      .values({
        trace_id: input.traceId ?? null,
        module: input.module,
        action: input.action,
        actor_employee_id: input.actorEmployeeId ?? null,
        subject: input.subject ?? null,
        result: input.result,
        risk: input.risk ?? "low",
        ip_address: input.ipAddress ?? null,
        user_agent: input.userAgent ?? null,
        details: input.details ?? {},
      })
      .execute();
  }

  async createExportJob(input: {
    requestedByEmployeeId: string;
    filterSnapshot: unknown;
  }): Promise<AuditExportJobRecord> {
    return this.db.transaction().execute(async (transaction) => {
      const row = await transaction
        .insertInto("security_audit_export_jobs")
        .values({
          requested_by_employee_id: input.requestedByEmployeeId,
          filter_snapshot: input.filterSnapshot,
          status: "queued",
          result_storage_key: null,
          expires_at: null,
          failure_code: null,
          completed_at: null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      await transaction
        .insertInto("security_audit_events")
        .values({
          trace_id: null,
          module: "security",
          action: "security.audit.export.requested",
          actor_employee_id: input.requestedByEmployeeId,
          subject: row.export_job_id,
          result: "success",
          risk: "high",
          ip_address: null,
          user_agent: null,
          details: { filterSnapshot: input.filterSnapshot },
        })
        .execute();
      await transaction
        .insertInto("outbox_events")
        .values({
          event_type: "security.audit.export.requested",
          aggregate_type: "security_audit_export",
          aggregate_id: row.export_job_id,
          payload: { exportJobId: row.export_job_id },
          idempotency_key: `security-audit-export:${row.export_job_id}:${randomUUID()}`,
          status: "pending",
          attempts: 0,
          available_at: new Date(),
          claimed_by: null,
          claimed_at: null,
          last_error: null,
          completed_at: null,
        })
        .execute();
      return this.mapExportJob(row);
    });
  }

  async findExportJob(
    exportJobId: string,
  ): Promise<AuditExportJobRecord | null> {
    const row = await this.db
      .selectFrom("security_audit_export_jobs")
      .selectAll()
      .where("export_job_id", "=", exportJobId)
      .executeTakeFirst();
    return row === undefined ? null : this.mapExportJob(row);
  }

  async claimExportJob(
    exportJobId: string,
  ): Promise<AuditExportJobRecord | null> {
    const row = await this.db
      .updateTable("security_audit_export_jobs")
      .set({ status: "processing", failure_code: null })
      .where("export_job_id", "=", exportJobId)
      .where("status", "=", "queued")
      .returningAll()
      .executeTakeFirst();
    return row === undefined ? null : this.mapExportJob(row);
  }

  async completeExportJob(input: {
    exportJobId: string;
    resultStorageKey: string;
    expiresAt: Date;
  }): Promise<AuditExportJobRecord | null> {
    const row = await this.db
      .updateTable("security_audit_export_jobs")
      .set({
        status: "completed",
        result_storage_key: input.resultStorageKey,
        expires_at: input.expiresAt,
        completed_at: new Date(),
        failure_code: null,
      })
      .where("export_job_id", "=", input.exportJobId)
      .where("status", "=", "processing")
      .returningAll()
      .executeTakeFirst();
    return row === undefined ? null : this.mapExportJob(row);
  }

  async failExportJob(input: {
    exportJobId: string;
    failureCode: string;
  }): Promise<AuditExportJobRecord | null> {
    const row = await this.db
      .updateTable("security_audit_export_jobs")
      .set({
        status: "failed",
        failure_code: input.failureCode,
        completed_at: new Date(),
      })
      .where("export_job_id", "=", input.exportJobId)
      .where("status", "=", "processing")
      .returningAll()
      .executeTakeFirst();
    return row === undefined ? null : this.mapExportJob(row);
  }

  private mapEvent(
    row: Selectable<DatabaseSchema["security_audit_events"]>,
  ): AuditEventRecord {
    return {
      auditEventId: row.audit_event_id,
      traceId: row.trace_id,
      module: row.module,
      action: row.action,
      actorEmployeeId: row.actor_employee_id,
      subject: row.subject,
      result: row.result,
      risk: row.risk,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      details: row.details,
      createdAt: row.created_at,
    };
  }

  private mapExportJob(
    row: Selectable<DatabaseSchema["security_audit_export_jobs"]>,
  ): AuditExportJobRecord {
    return {
      exportJobId: row.export_job_id,
      requestedByEmployeeId: row.requested_by_employee_id,
      filterSnapshot: row.filter_snapshot,
      status: row.status as AuditExportJobRecord["status"],
      resultStorageKey: row.result_storage_key,
      expiresAt: row.expires_at,
      failureCode: row.failure_code,
      createdAt: row.created_at,
      completedAt: row.completed_at,
    };
  }
}
