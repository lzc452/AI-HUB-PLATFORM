import type { DatabaseSchema } from "@ai-hub/database";
import { OutboxStore } from "@ai-hub/database";
import { sql, type Kysely } from "kysely";
import { metricDefinitions } from "./metric-dictionary.js";
import type { DailyAggregate } from "./aggregation.types.js";
import type {
  AnalyticsDashboardRepository,
  DashboardReadInput,
} from "./dashboard.types.js";

const demandScopeSql = sql<string>`case when d.audience_employee_id is not null then 'employee:' || d.audience_employee_id when d.audience_department_id is not null then 'department:' || d.audience_department_id else 'all' end`;

const eventScopeSql = sql<string>`case when e.audience_employee_id is not null then 'employee:' || e.audience_employee_id when e.audience_department_id is not null then 'department:' || e.audience_department_id else 'all' end`;

const utcDaySql = (alias: string) =>
  sql<string>`(${sql.ref(alias)}.created_at at time zone 'UTC')::date`;

// pg 将 date 列解析为 JS Date 对象，先归一化为 YYYY-MM-DD 再用于 Map 键与输出。
const dayKey = (value: unknown): string =>
  value instanceof Date ? value.toISOString().slice(0, 10) : String(value);

export class KyselyAnalyticsDashboardRepository
  implements AnalyticsDashboardRepository
{
  constructor(private readonly db: Kysely<DatabaseSchema>) {}

  withTransaction<T>(
    operation: (repository: AnalyticsDashboardRepository) => Promise<T>,
  ): Promise<T> {
    return this.db
      .transaction()
      .execute(async (transaction) =>
        operation(new KyselyAnalyticsDashboardRepository(transaction)),
      );
  }

  async readDailyAggregates(
    input: DashboardReadInput,
  ): Promise<readonly DailyAggregate[]> {
    let query = this.db
      .selectFrom("analytics_daily_aggregates")
      .selectAll()
      .where("metric_key", "in", input.metricKeys)
      .where("metric_version", "=", 1)
      .where("day", ">=", input.from)
      .where("day", "<", input.to);
    if (input.audienceScopeKeys !== undefined) {
      query = query.where("audience_scope_key", "in", input.audienceScopeKeys);
    } else if (input.audienceScopeKey !== null) {
      query = query.where("audience_scope_key", "=", input.audienceScopeKey);
    }
    const rows = await query
      .orderBy("metric_key")
      .orderBy("day")
      .orderBy("audience_scope_key")
      .execute();
    return rows.map((row) => ({
      metricKey: row.metric_key,
      metricVersion: row.metric_version,
      day: row.day,
      audienceScopeKey: row.audience_scope_key,
      value: Number(row.value),
      sourceEventCount: row.source_event_count,
    }));
  }

  async readDemandValueAggregates(
    input: DashboardReadInput,
  ): Promise<readonly DailyAggregate[]> {
    const from = new Date(input.from);
    const to = new Date(input.to);

    const converted = await this.db
      .selectFrom("ai_demand_audit_events as a")
      .innerJoin("ai_demands as d", "d.demand_id", "a.demand_id")
      .select([
        utcDaySql("a").as("day"),
        demandScopeSql.as("scope"),
        sql<number>`count(*)::int`.as("value"),
      ])
      .where("a.event_type", "=", "demand.status.changed")
      .where(sql`a.details->>'to'`, "=", "converted")
      .where("a.created_at", ">=", from)
      .where("a.created_at", "<", to)
      .groupBy(["day", "scope"])
      .execute();

    const submitted = await this.db
      .selectFrom("ai_demand_audit_events as a")
      .innerJoin("ai_demands as d", "d.demand_id", "a.demand_id")
      .select([
        utcDaySql("a").as("day"),
        demandScopeSql.as("scope"),
        sql<number>`count(*)::int`.as("value"),
      ])
      .where("a.event_type", "=", "demand.submitted")
      .where("a.created_at", ">=", from)
      .where("a.created_at", "<", to)
      .groupBy(["day", "scope"])
      .execute();

    const prioritized = await this.db
      .selectFrom("ai_demand_audit_events as a")
      .innerJoin("ai_demands as d", "d.demand_id", "a.demand_id")
      .select([
        utcDaySql("a").as("day"),
        demandScopeSql.as("scope"),
        sql<number>`round(avg((a.details->>'score')::numeric), 2)::float8`.as(
          "value",
        ),
      ])
      .where("a.event_type", "=", "demand.priority.updated")
      .where(sql`a.details->>'score'`, "is not", null)
      .where("a.created_at", ">=", from)
      .where("a.created_at", "<", to)
      .groupBy(["day", "scope"])
      .execute();

    const pilots = await this.db
      .selectFrom("ai_demand_audit_events as a")
      .innerJoin("ai_demands as d", "d.demand_id", "a.demand_id")
      .select([
        utcDaySql("a").as("day"),
        demandScopeSql.as("scope"),
        sql<number>`count(*)::int`.as("value"),
      ])
      .where("a.event_type", "=", "demand.pilot.updated")
      .where(sql`a.details->>'status'`, "=", "completed")
      .where("a.created_at", ">=", from)
      .where("a.created_at", "<", to)
      .groupBy(["day", "scope"])
      .execute();

    const inScope = (scope: string): boolean => {
      if (input.audienceScopeKeys !== undefined) {
        return input.audienceScopeKeys.includes(scope);
      }
      if (input.audienceScopeKey !== null) {
        return input.audienceScopeKey === scope;
      }
      return true;
    };

    const rows: DailyAggregate[] = [];
    for (const row of converted) {
      if (!inScope(row.scope)) continue;
      rows.push({
        metricKey: "demand.converted_count",
        day: dayKey(row.day),
        audienceScopeKey: row.scope,
        value: row.value,
        sourceEventCount: row.value,
      });
    }
    const submittedByDay = new Map<string, Map<string, number>>();
    for (const row of submitted) {
      if (!inScope(row.scope)) continue;
      const day = dayKey(row.day);
      const byScope = submittedByDay.get(day) ?? new Map();
      byScope.set(row.scope, row.value);
      submittedByDay.set(day, byScope);
    }
    for (const row of converted) {
      if (!inScope(row.scope)) continue;
      const submittedCount =
        submittedByDay.get(dayKey(row.day))?.get(row.scope) ?? 0;
      if (submittedCount <= 0) continue;
      rows.push({
        metricKey: "demand.converted_rate",
        day: dayKey(row.day),
        audienceScopeKey: row.scope,
        value: Number(((row.value / submittedCount) * 100).toFixed(2)),
        sourceEventCount: row.value,
      });
    }
    for (const row of prioritized) {
      if (!inScope(row.scope)) continue;
      rows.push({
        metricKey: "demand.avg_priority_score",
        day: dayKey(row.day),
        audienceScopeKey: row.scope,
        value: row.value,
        sourceEventCount: 0,
      });
    }
    for (const row of pilots) {
      if (!inScope(row.scope)) continue;
      rows.push({
        metricKey: "demand.pilot_completed_count",
        day: dayKey(row.day),
        audienceScopeKey: row.scope,
        value: row.value,
        sourceEventCount: row.value,
      });
    }
    return rows;
  }

  async readApplicationDailyAggregates(
    input: DashboardReadInput,
  ): Promise<readonly DailyAggregate[]> {
    const metricKeys = new Set(input.metricKeys);
    const nameToMetric = new Map<string, string>();
    const eventNames = metricDefinitions.flatMap((definition) => {
      if (!metricKeys.has(definition.metricKey)) return [];
      for (const name of definition.sourceEventNames) {
        nameToMetric.set(name, definition.metricKey);
      }
      return [...definition.sourceEventNames];
    });
    const rows = await this.db
      .selectFrom("analytics_behavior_events as e")
      .select([
        "e.event_name",
        sql<string>`(e.occurred_at at time zone 'UTC')::date`.as("day"),
        eventScopeSql.as("scope"),
        sql<number>`count(distinct e.idempotency_key)::int`.as("value"),
      ])
      .where("e.aggregate_id", "=", input.applicationId ?? "")
      .where("e.event_name", "in", eventNames)
      .where("e.occurred_at", ">=", new Date(input.from))
      .where("e.occurred_at", "<", new Date(input.to))
      .where("e.expires_at", ">", new Date())
      .groupBy(["e.event_name", "day", "scope"])
      .execute();
    return rows
      .map((row) => {
        const metricKey = nameToMetric.get(row.event_name);
        if (metricKey === undefined) return null;
        return {
          metricKey,
          day: dayKey(row.day),
          audienceScopeKey: row.scope,
          value: row.value,
          sourceEventCount: row.value,
        };
      })
      .filter((row): row is DailyAggregate => row !== null);
  }

  async readSnapshotCounts(): Promise<
    readonly { metricKey: string; value: number }[]
  > {
    const [published, pendingReview, pendingClaim, converted, highRisk] =
      await Promise.all([
        this.db
          .selectFrom("applications")
          .select(sql<number>`count(*)::int`.as("value"))
          .where("status", "=", "published")
          .executeTakeFirst(),
        this.db
          .selectFrom("application_review_queue")
          .select(sql<number>`count(*)::int`.as("value"))
          .where("status", "=", "available")
          .executeTakeFirst(),
        this.db
          .selectFrom("ai_demands")
          .select(sql<number>`count(*)::int`.as("value"))
          .where("status", "=", "pending_claim")
          .executeTakeFirst(),
        this.db
          .selectFrom("ai_demands")
          .select(sql<number>`count(*)::int`.as("value"))
          .where("status", "=", "converted")
          .executeTakeFirst(),
        this.db
          .selectFrom("applications as a")
          .select(sql<number>`count(*)::int`.as("value"))
          .where((eb) =>
            eb.or([
              eb.exists(
                eb
                  .selectFrom("application_reports as r")
                  .select("r.report_id")
                  .whereRef("r.application_id", "=", "a.application_id")
                  .where("r.status", "=", "open"),
              ),
              eb.exists(
                eb
                  .selectFrom("application_catalog_metadata as m")
                  .select("m.application_id")
                  .whereRef("m.application_id", "=", "a.application_id")
                  .where("m.health_status", "=", "failed"),
              ),
            ]),
          )
          .executeTakeFirst(),
      ]);
    return [
      {
        metricKey: "platform.published_application_count",
        value: Number(published?.value ?? 0),
      },
      {
        metricKey: "platform.pending_review_count",
        value: Number(pendingReview?.value ?? 0),
      },
      {
        metricKey: "platform.pending_claim_count",
        value: Number(pendingClaim?.value ?? 0),
      },
      {
        metricKey: "demand.converted_count",
        value: Number(converted?.value ?? 0),
      },
      {
        metricKey: "risk.high_risk_application_count",
        value: Number(highRisk?.value ?? 0),
      },
    ];
  }

  async isApplicationOwnerOrMaintainer(
    employeeId: string,
    applicationId: string,
  ): Promise<boolean> {
    const row = await this.db
      .selectFrom("applications")
      .select("application_id")
      .where("application_id", "=", applicationId)
      .where((eb) =>
        eb.or([
          eb("owner_employee_id", "=", employeeId),
          eb("maintainer_employee_id", "=", employeeId),
        ]),
      )
      .executeTakeFirst();
    return row !== undefined;
  }

  async recordAudit(input: {
    actorEmployeeId: string;
    action: string;
    aggregateId: string;
    details: unknown;
  }): Promise<void> {
    await this.db
      .insertInto("analytics_audit_events")
      .values({
        actor_employee_id: input.actorEmployeeId,
        action: input.action,
        aggregate_type: "dashboard",
        aggregate_id: input.aggregateId,
        details: input.details,
      })
      .execute();
  }

  appendOutbox(input: {
    eventType: string;
    aggregateType: string;
    aggregateId: string;
    payload: unknown;
    idempotencyKey: string;
  }): Promise<boolean> {
    return new OutboxStore(this.db).append(input);
  }
}
