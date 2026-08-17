import { sql, type Kysely } from "kysely";

const expandedEventNames = [
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

const legacyEventNames = expandedEventNames.filter(
  (name) =>
    name !== "application_liked" &&
    name !== "application_commented" &&
    name !== "application_rated" &&
    name !== "feedback_submitted" &&
    name !== "feedback_resolved",
);

/** 新增 read model 指标定义（快照型 source_event_names 为空数组）。 */
const newMetricDefinitions = [
  {
    metricKey: "platform.active_employee_count",
    label: "Monthly active employees",
    sourceEventNames: ["application_viewed", "demand_viewed"],
    formula: "count(distinct actor) grouped by UTC day and audience scope",
    requiredPermission: "analytics.platform.read",
    audienceRule: "all authorized employees",
  },
  {
    metricKey: "platform.active_application_count",
    label: "Active applications",
    sourceEventNames: ["application_viewed", "application_delivered"],
    formula: "count(distinct aggregate) grouped by UTC day and audience scope",
    requiredPermission: "analytics.platform.read",
    audienceRule: "published application audience",
  },
  {
    metricKey: "platform.delivery_action_count",
    label: "Delivery actions",
    sourceEventNames: ["application_delivered"],
    formula:
      "count(distinct idempotency_key) grouped by UTC day and audience scope",
    requiredPermission: "analytics.platform.read",
    audienceRule: "published application audience",
  },
  {
    metricKey: "platform.published_application_count",
    label: "Published applications",
    sourceEventNames: [],
    formula: "read model snapshot query with date-range scope",
    requiredPermission: "analytics.platform.read",
    audienceRule: "platform scope snapshot",
  },
  {
    metricKey: "platform.pending_review_count",
    label: "Pending reviews",
    sourceEventNames: [],
    formula: "read model snapshot query with date-range scope",
    requiredPermission: "analytics.platform.read",
    audienceRule: "platform scope snapshot",
  },
  {
    metricKey: "platform.pending_claim_count",
    label: "Pending demand claims",
    sourceEventNames: [],
    formula: "read model snapshot query with date-range scope",
    requiredPermission: "analytics.platform.read",
    audienceRule: "platform scope snapshot",
  },
  {
    metricKey: "application.likes",
    label: "Application likes",
    sourceEventNames: ["application_liked"],
    formula:
      "count(distinct idempotency_key) grouped by UTC day and audience scope",
    requiredPermission: "analytics.application.read",
    audienceRule: "application audience without access-list detail",
  },
  {
    metricKey: "application.comments",
    label: "Application comments",
    sourceEventNames: ["application_commented"],
    formula:
      "count(distinct idempotency_key) grouped by UTC day and audience scope",
    requiredPermission: "analytics.application.read",
    audienceRule: "application audience without access-list detail",
  },
  {
    metricKey: "application.ratings",
    label: "Application ratings",
    sourceEventNames: ["application_rated"],
    formula:
      "count(distinct idempotency_key) grouped by UTC day and audience scope",
    requiredPermission: "analytics.application.read",
    audienceRule: "application audience without access-list detail",
  },
  {
    metricKey: "risk.feedback_submissions",
    label: "Feedback submissions",
    sourceEventNames: ["feedback_submitted"],
    formula:
      "count(distinct idempotency_key) grouped by UTC day and audience scope",
    requiredPermission: "analytics.risk.read",
    audienceRule: "risk operator scope without identity projection",
  },
  {
    metricKey: "risk.feedback_resolutions",
    label: "Feedback resolutions",
    sourceEventNames: ["feedback_resolved"],
    formula:
      "count(distinct idempotency_key) grouped by UTC day and audience scope",
    requiredPermission: "analytics.risk.read",
    audienceRule: "risk operator scope without identity projection",
  },
] as const;

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    alter table analytics_behavior_events
      drop constraint if exists analytics_behavior_events_name_check,
      add constraint analytics_behavior_events_name_check
      check (event_name in (${sql.join(expandedEventNames.map((name) => sql.lit(name)))}))
  `.execute(db);

  for (const definition of newMetricDefinitions) {
    await sql`
      insert into analytics_metric_definitions (
        metric_key, version, label, source_event_names, formula, time_range,
        required_permission, audience_rule, recompute_method
      ) values (
        ${definition.metricKey}, 1, ${definition.label},
        array[${sql.join(definition.sourceEventNames.map((name) => sql.lit(name)))}]::text[],
        ${definition.formula}, '180d',
        ${definition.requiredPermission}, ${definition.audienceRule},
        'Read retained raw events and replace the requested daily rows.'
      )
      on conflict (metric_key, version) do nothing
    `.execute(db);
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    delete from analytics_metric_definitions
    where metric_key in (${sql.join(newMetricDefinitions.map((definition) => sql.lit(definition.metricKey)))})
  `.execute(db);
  await sql`
    alter table analytics_behavior_events
      drop constraint if exists analytics_behavior_events_name_check,
      add constraint analytics_behavior_events_name_check
      check (event_name in (${sql.join(legacyEventNames.map((name) => sql.lit(name)))}))
  `.execute(db);
}
