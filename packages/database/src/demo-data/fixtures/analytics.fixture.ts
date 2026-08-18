import type { Insertable } from "kysely";
import type { DatabaseSchema } from "../../schema.js";
import { IDS } from "../ids.js";
import { demoIdempotency } from "../idempotency.js";
import { daysAgo, todayString } from "../time-utils.js";
import { DEMO_ACCOUNT_DEFINITIONS } from "../../demo-seed.js";

// ── types ──────────────────────────────────────────────────────────────────────

export interface AnalyticsFixtureData {
  behaviorEvents: Array<
    Insertable<DatabaseSchema["analytics_behavior_events"]>
  >;
  dailyAggregates: Array<
    Insertable<DatabaseSchema["analytics_daily_aggregates"]>
  >;
  exportJobs: Array<Insertable<DatabaseSchema["analytics_export_jobs"]>>;
  auditEvents: Array<Insertable<DatabaseSchema["analytics_audit_events"]>>;
  outboxEvents: Array<Insertable<DatabaseSchema["outbox_events"]>>;
}

// ── helpers ────────────────────────────────────────────────────────────────────

const EMPS = DEMO_ACCOUNT_DEFINITIONS.map((a) => a.employeeId);
const DEPTS = ["demo-rnd", "demo-innovation", "demo-admin"];

const at = <T>(values: readonly T[], index: number): T => {
  const value = values[index];
  if (value === undefined) {
    throw new Error(`演示 fixture 索引越界: ${index}`);
  }
  return value;
};

function jsonb(value: unknown): unknown {
  return value;
}

// ── event type definitions ─────────────────────────────────────────────────────

const BEHAVIOR_EVENT_TYPES = [
  "application_viewed",
  "application_delivered",
  "application_downloaded",
  "application_liked",
  "application_commented",
  "application_rated",
  "demand_viewed",
  "demand_liked",
  "demand_commented",
  "review_created",
  "review_decided",
  "review_sla_breached",
  "demand_reported",
  "export_requested",
  "assistant_requested",
  "assistant_failed",
  "notification_queued",
  "notification_delivery_retried",
  "feedback_submitted",
  "feedback_resolved",
] as const;

const BEHAVIOR_EVENT_AGGREGATE_TYPES = [
  "application",
  "application",
  "application",
  "application",
  "application",
  "application",
  "ai_demand",
  "ai_demand",
  "ai_demand",
  "review",
  "review",
  "review",
  "ai_demand",
  "export",
  "assistant",
  "assistant",
  "notification",
  "notification",
  "feedback",
  "feedback",
] as const;

// ── builder ────────────────────────────────────────────────────────────────────

export function buildAnalyticsFixture(anchor: Date): AnalyticsFixtureData {
  // ── behavior events (20 types × 2 = 40) ────────────────────────────────────

  const behaviorEvents: AnalyticsFixtureData["behaviorEvents"] = [];
  for (let i = 0; i < 20; i++) {
    for (let j = 0; j < 2; j++) {
      const idx = i * 2 + j;
      const occurredAt = daysAgo(anchor, 29 - idx);
      behaviorEvents.push({
        event_id: at(IDS.behaviorEvent, idx),
        event_name: at(BEHAVIOR_EVENT_TYPES, i),
        aggregate_type: at(BEHAVIOR_EVENT_AGGREGATE_TYPES, i),
        aggregate_id:
          i < 6
            ? at(
                IDS.application.published,
                i % IDS.application.published.length,
              )
            : at(IDS.demand.published, i % IDS.demand.published.length),
        actor_employee_id: at(EMPS, idx % EMPS.length),
        audience_department_id: at(DEPTS, idx % DEPTS.length),
        audience_employee_id:
          j === 0 ? at(EMPS, (idx + 1) % EMPS.length) : null,
        metadata: jsonb({ source: "demo", index: idx }),
        idempotency_key: demoIdempotency("analytics", "behavior", String(idx)),
        occurred_at: occurredAt,
        expires_at: new Date(occurredAt.getTime() + 180 * 24 * 60 * 60 * 1000),
        created_at: occurredAt,
      });
    }
  }

  // ── daily aggregates (30 days × 20 metrics × 3 scopes = 1800) ──────────────

  const dailyAggregates: AnalyticsFixtureData["dailyAggregates"] = [];
  const metricKeys = IDS.analyticsMetric as readonly string[];
  const scopeKeys = IDS.analyticsScope as readonly string[];

  for (let d = 0; d < 30; d++) {
    const dayStr = todayString(daysAgo(anchor, d));
    for (const metricKey of metricKeys) {
      for (const scopeKey of scopeKeys) {
        dailyAggregates.push({
          metric_key: metricKey,
          metric_version: 1,
          day: dayStr,
          audience_scope_key: scopeKey,
          value: Math.round(
            (Math.sin(
              d * 0.3 +
                metricKeys.indexOf(metricKey) * 0.7 +
                scopeKeys.indexOf(scopeKey) * 1.1,
            ) *
              0.5 +
              0.5) *
              100,
          ),
          source_event_count:
            d + metricKeys.indexOf(metricKey) + scopeKeys.indexOf(scopeKey) + 1,
          computed_at: daysAgo(anchor, d),
        });
      }
    }
  }

  // ── export jobs (3) ─────────────────────────────────────────────────────────

  const exportJobs: AnalyticsFixtureData["exportJobs"] = [
    {
      export_id: at(IDS.analyticsExportJob, 0),
      requested_by_employee_id: at(EMPS, 0),
      target: "dashboard_overview",
      from_date: todayString(daysAgo(anchor, 30)),
      to_date: todayString(daysAgo(anchor, 1)),
      status: "completed",
      failure_code: null,
      created_at: daysAgo(anchor, 5),
      completed_at: daysAgo(anchor, 4),
    },
    {
      export_id: at(IDS.analyticsExportJob, 1),
      requested_by_employee_id: at(EMPS, 1),
      target: "demand_metrics",
      from_date: todayString(daysAgo(anchor, 60)),
      to_date: todayString(daysAgo(anchor, 30)),
      status: "queued",
      failure_code: null,
      created_at: daysAgo(anchor, 1),
      completed_at: null,
    },
    {
      export_id: at(IDS.analyticsExportJob, 2),
      requested_by_employee_id: at(EMPS, 1),
      target: "app_usage",
      from_date: todayString(daysAgo(anchor, 90)),
      to_date: todayString(daysAgo(anchor, 60)),
      status: "failed",
      failure_code: "EXPORT_TIMEOUT",
      created_at: daysAgo(anchor, 3),
      completed_at: daysAgo(anchor, 2),
    },
  ];

  // ── analytics audit events (6) ──────────────────────────────────────────────

  const auditEvents: AnalyticsFixtureData["auditEvents"] = [
    {
      audit_event_id: at(IDS.analyticsAuditEvent, 0),
      actor_employee_id: at(EMPS, 0),
      action: "export.created",
      aggregate_type: "analytics_export",
      aggregate_id: at(IDS.analyticsExportJob, 0),
      details: jsonb({ target: "dashboard_overview" }),
      created_at: daysAgo(anchor, 5),
    },
    {
      audit_event_id: at(IDS.analyticsAuditEvent, 1),
      actor_employee_id: at(EMPS, 0),
      action: "export.completed",
      aggregate_type: "analytics_export",
      aggregate_id: at(IDS.analyticsExportJob, 0),
      details: jsonb({ row_count: 1800 }),
      created_at: daysAgo(anchor, 4),
    },
    {
      audit_event_id: at(IDS.analyticsAuditEvent, 2),
      actor_employee_id: at(EMPS, 1),
      action: "export.created",
      aggregate_type: "analytics_export",
      aggregate_id: at(IDS.analyticsExportJob, 1),
      details: jsonb({ target: "demand_metrics" }),
      created_at: daysAgo(anchor, 1),
    },
    {
      audit_event_id: at(IDS.analyticsAuditEvent, 3),
      actor_employee_id: at(EMPS, 1),
      action: "export.created",
      aggregate_type: "analytics_export",
      aggregate_id: at(IDS.analyticsExportJob, 2),
      details: jsonb({ target: "app_usage" }),
      created_at: daysAgo(anchor, 3),
    },
    {
      audit_event_id: at(IDS.analyticsAuditEvent, 4),
      actor_employee_id: at(EMPS, 1),
      action: "export.failed",
      aggregate_type: "analytics_export",
      aggregate_id: at(IDS.analyticsExportJob, 2),
      details: jsonb({ error: "EXPORT_TIMEOUT" }),
      created_at: daysAgo(anchor, 2),
    },
    {
      audit_event_id: at(IDS.analyticsAuditEvent, 5),
      actor_employee_id: at(EMPS, 1),
      action: "dashboard.viewed",
      aggregate_type: "analytics_dashboard",
      aggregate_id: "overview",
      details: jsonb({ dashboard_key: "overview" }),
      created_at: daysAgo(anchor, 0),
    },
  ];

  // ── outbox events (6, varied statuses) ──────────────────────────────────────

  const now = anchor;
  const outboxEvents: AnalyticsFixtureData["outboxEvents"] = [
    {
      id: at(IDS.notification, 14),
      event_type: "analytics.export.completed",
      aggregate_type: "analytics_export",
      aggregate_id: at(IDS.analyticsExportJob, 0),
      payload: jsonb({ export_id: at(IDS.analyticsExportJob, 0) }),
      idempotency_key: demoIdempotency("outbox", "analytics", "0"),
      status: "completed",
      attempts: 1,
      available_at: daysAgo(anchor, 4),
      claimed_by: "worker-1",
      claimed_at: daysAgo(anchor, 4),
      last_error: null,
      created_at: daysAgo(anchor, 5),
      completed_at: daysAgo(anchor, 4),
    },
    {
      id: at(IDS.notification, 15),
      event_type: "analytics.export.requested",
      aggregate_type: "analytics_export",
      aggregate_id: at(IDS.analyticsExportJob, 1),
      payload: jsonb({ export_id: at(IDS.analyticsExportJob, 1) }),
      idempotency_key: demoIdempotency("outbox", "analytics", "1"),
      status: "pending",
      attempts: 0,
      available_at: now,
      claimed_by: null,
      claimed_at: null,
      last_error: null,
      created_at: daysAgo(anchor, 1),
      completed_at: null,
    },
    {
      id: at(IDS.notification, 16),
      event_type: "analytics.export.failed",
      aggregate_type: "analytics_export",
      aggregate_id: at(IDS.analyticsExportJob, 2),
      payload: jsonb({ export_id: at(IDS.analyticsExportJob, 2) }),
      idempotency_key: demoIdempotency("outbox", "analytics", "2"),
      status: "failed",
      attempts: 10,
      available_at: daysAgo(anchor, 2),
      claimed_by: "worker-1",
      claimed_at: daysAgo(anchor, 2),
      last_error: "EXPORT_TIMEOUT",
      created_at: daysAgo(anchor, 3),
      completed_at: null,
    },
    {
      id: at(IDS.notification, 17),
      event_type: "notification.delivery.pending",
      aggregate_type: "notification",
      aggregate_id: at(IDS.notification, 0),
      payload: jsonb({ notification_id: at(IDS.notification, 0) }),
      idempotency_key: demoIdempotency("outbox", "analytics", "3"),
      status: "pending",
      attempts: 0,
      available_at: now,
      claimed_by: null,
      claimed_at: null,
      last_error: null,
      created_at: daysAgo(anchor, 0),
      completed_at: null,
    },
    {
      id: at(IDS.notification, 18),
      event_type: "notification.delivery.processing",
      aggregate_type: "notification",
      aggregate_id: at(IDS.notification, 1),
      payload: jsonb({ notification_id: at(IDS.notification, 1) }),
      idempotency_key: demoIdempotency("outbox", "analytics", "4"),
      status: "processing",
      attempts: 1,
      available_at: daysAgo(anchor, 0),
      claimed_by: "worker-1",
      claimed_at: daysAgo(anchor, 0),
      last_error: null,
      created_at: daysAgo(anchor, 0),
      completed_at: null,
    },
    {
      id: at(IDS.notification, 19),
      event_type: "notification.delivery.failed",
      aggregate_type: "notification",
      aggregate_id: at(IDS.notification, 2),
      payload: jsonb({ notification_id: at(IDS.notification, 2) }),
      idempotency_key: demoIdempotency("outbox", "analytics", "5"),
      status: "failed",
      attempts: 10,
      available_at: daysAgo(anchor, 1),
      claimed_by: "worker-1",
      claimed_at: daysAgo(anchor, 1),
      last_error: "DINGTALK_API_ERROR",
      created_at: daysAgo(anchor, 1),
      completed_at: null,
    },
  ];

  return {
    behaviorEvents,
    dailyAggregates,
    exportJobs,
    auditEvents,
    outboxEvents,
  };
}
