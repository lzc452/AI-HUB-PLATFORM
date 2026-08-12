import type { DatabaseSchema } from "@ai-hub/database";
import { sql, type Kysely, type Selectable } from "kysely";
import type {
  AuditEventInput,
  AuditEventRecord,
  AuditListInput,
  AuditRepository,
} from "./audit.types.js";

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
        risk: input.risk ?? "none",
        ip_address: input.ipAddress ?? null,
        user_agent: input.userAgent ?? null,
        details: input.details ?? {},
      })
      .execute();
  }

  async createExportJob(input: {
    requestedByEmployeeId: string;
    filterSnapshot: unknown;
  }): Promise<{ exportJobId: string; status: string; createdAt: Date }> {
    const row = await this.db
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
    return {
      exportJobId: row.export_job_id,
      status: row.status,
      createdAt: row.created_at,
    };
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
}
