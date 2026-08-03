import { sql, type Kysely } from "kysely";

const behaviorEventNames = [
  "application_viewed",
  "application_delivered",
  "application_downloaded",
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
] as const;

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("analytics_behavior_events")
    .addColumn("event_id", "uuid", (column) =>
      column.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("event_name", "varchar(64)", (column) => column.notNull())
    .addColumn("aggregate_type", "varchar(32)", (column) => column.notNull())
    .addColumn("aggregate_id", "varchar(128)", (column) => column.notNull())
    .addColumn("actor_employee_id", "varchar(64)", (column) =>
      column.references("employees.employee_id"),
    )
    .addColumn("audience_department_id", "varchar(64)", (column) =>
      column.references("departments.department_id"),
    )
    .addColumn("audience_employee_id", "varchar(64)", (column) =>
      column.references("employees.employee_id"),
    )
    .addColumn("metadata", "jsonb", (column) =>
      column.notNull().defaultTo(sql`'{}'::jsonb`),
    )
    .addColumn("idempotency_key", "varchar(255)", (column) =>
      column.notNull().unique(),
    )
    .addColumn("occurred_at", "timestamptz", (column) => column.notNull())
    .addColumn("expires_at", "timestamptz", (column) => column.notNull())
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await sql`
    alter table analytics_behavior_events
    add constraint analytics_behavior_events_name_check
    check (event_name in (${sql.join(behaviorEventNames.map((name) => sql.lit(name)))}))
  `.execute(db);
  await sql`
    alter table analytics_behavior_events
    add constraint analytics_behavior_events_metadata_object_check
    check (jsonb_typeof(metadata) = 'object')
  `.execute(db);
  await sql`
    alter table analytics_behavior_events
    add constraint analytics_behavior_events_retention_check
    check (expires_at = occurred_at + interval '180 days')
  `.execute(db);

  await db.schema
    .createTable("analytics_daily_aggregates")
    .addColumn("metric_key", "varchar(128)", (column) => column.notNull())
    .addColumn("day", "date", (column) => column.notNull())
    .addColumn("audience_scope_key", "varchar(128)", (column) =>
      column.notNull(),
    )
    .addColumn("value", "numeric(18, 3)", (column) => column.notNull())
    .addColumn("source_event_count", "integer", (column) => column.notNull())
    .addColumn("computed_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`),
    )
    .addPrimaryKeyConstraint("analytics_daily_aggregates_pk", [
      "metric_key",
      "day",
      "audience_scope_key",
    ])
    .execute();

  await db.schema
    .createTable("analytics_metric_definitions")
    .addColumn("metric_key", "varchar(128)", (column) => column.notNull())
    .addColumn("version", "integer", (column) => column.notNull())
    .addColumn("label", "varchar(200)", (column) => column.notNull())
    .addColumn("source_event_names", sql`text[]`, (column) => column.notNull())
    .addColumn("formula", "text", (column) => column.notNull())
    .addColumn("time_range", "varchar(16)", (column) => column.notNull())
    .addColumn("required_permission", "varchar(120)", (column) =>
      column.notNull(),
    )
    .addColumn("audience_rule", "text", (column) => column.notNull())
    .addColumn("recompute_method", "text", (column) => column.notNull())
    .addColumn("is_active", "boolean", (column) =>
      column.notNull().defaultTo(true),
    )
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`),
    )
    .addPrimaryKeyConstraint("analytics_metric_definitions_pk", [
      "metric_key",
      "version",
    ])
    .execute();

  await db.schema
    .createTable("analytics_audit_events")
    .addColumn("audit_event_id", "uuid", (column) =>
      column.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("actor_employee_id", "varchar(64)", (column) =>
      column.references("employees.employee_id"),
    )
    .addColumn("action", "varchar(120)", (column) => column.notNull())
    .addColumn("aggregate_type", "varchar(32)", (column) => column.notNull())
    .addColumn("aggregate_id", "varchar(128)", (column) => column.notNull())
    .addColumn("details", "jsonb", (column) => column.notNull())
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await sql`
    insert into analytics_metric_definitions (
      metric_key, version, label, source_event_names, formula, time_range,
      required_permission, audience_rule, recompute_method
    ) values
      ('platform.application_views', 1, 'Application views', ARRAY['application_viewed']::text[], 'count(distinct idempotency_key) grouped by UTC day and audience scope', '180d', 'analytics:platform:read', 'all authorized employees', 'Read retained raw events and replace the requested daily rows.'),
      ('market.application_deliveries', 1, 'Application deliveries', ARRAY['application_delivered']::text[], 'count(distinct idempotency_key) grouped by UTC day and audience scope', '180d', 'analytics:market:read', 'published application audience', 'Read retained raw events and replace the requested daily rows.'),
      ('application.downloads', 1, 'Application downloads', ARRAY['application_downloaded']::text[], 'count(distinct idempotency_key) grouped by UTC day and audience scope', '180d', 'analytics:application:read', 'application audience without access-list detail', 'Read retained raw events and replace the requested daily rows.'),
      ('innovation.demand_views', 1, 'Demand views', ARRAY['demand_viewed']::text[], 'count(distinct idempotency_key) grouped by UTC day and audience scope', '180d', 'analytics:innovation:read', 'demand audience predicates', 'Read retained raw events and replace the requested daily rows.'),
      ('review.decisions', 1, 'Review decisions', ARRAY['review_decided']::text[], 'count(distinct idempotency_key) grouped by UTC day and audience scope', '180d', 'analytics:review:read', 'review operator scope', 'Read retained raw events and replace the requested daily rows.'),
      ('review.sla_breaches', 1, 'Review SLA breaches', ARRAY['review_sla_breached']::text[], 'count(distinct idempotency_key) grouped by UTC day and audience scope', '180d', 'analytics:review:read', 'review operator scope', 'Read retained raw events and replace the requested daily rows.'),
      ('department.demand_views', 1, 'Department demand views', ARRAY['demand_viewed']::text[], 'count(distinct idempotency_key) grouped by UTC day and audience scope', '180d', 'analytics:department:read', 'actor department scope only', 'Read retained raw events and replace the requested daily rows.'),
      ('risk.reported_interactions', 1, 'Reported interactions', ARRAY['demand_reported']::text[], 'count(distinct idempotency_key) grouped by UTC day and audience scope', '180d', 'analytics:risk:read', 'risk operator scope without identity projection', 'Read retained raw events and replace the requested daily rows.'),
      ('runtime.notification_queued', 1, 'Queued notifications', ARRAY['notification_queued']::text[], 'count(distinct idempotency_key) grouped by UTC day and audience scope', '180d', 'analytics:runtime:read', 'aggregate delivery status only', 'Read retained raw events and replace the requested daily rows.'),
      ('runtime.notification_retries', 1, 'Notification delivery retries', ARRAY['notification_delivery_retried']::text[], 'count(distinct idempotency_key) grouped by UTC day and audience scope', '180d', 'analytics:runtime:read', 'aggregate delivery status only', 'Read retained raw events and replace the requested daily rows.'),
      ('integration.assistant_requests', 1, 'Assistant requests', ARRAY['assistant_requested']::text[], 'count(distinct idempotency_key) grouped by UTC day and audience scope', '180d', 'analytics:integration:read', 'authorized assistant aggregate scope', 'Read retained raw events and replace the requested daily rows.'),
      ('integration.assistant_failures', 1, 'Assistant failures', ARRAY['assistant_failed']::text[], 'count(distinct idempotency_key) grouped by UTC day and audience scope', '180d', 'analytics:integration:read', 'authorized assistant aggregate scope', 'Read retained raw events and replace the requested daily rows.')
    on conflict (metric_key, version) do nothing
  `.execute(db);

  await db.schema
    .createIndex("analytics_behavior_events_expiry_idx")
    .on("analytics_behavior_events")
    .columns(["expires_at", "occurred_at"])
    .execute();
  await db.schema
    .createIndex("analytics_behavior_events_aggregate_idx")
    .on("analytics_behavior_events")
    .columns(["aggregate_type", "aggregate_id", "occurred_at"])
    .execute();

  await sql`
    create or replace function prevent_analytics_delete()
    returns trigger
    language plpgsql
    as $function$
    begin
      if TG_TABLE_NAME = 'analytics_behavior_events'
         and current_setting('app.analytics_retention_job', true) = 'on'
         and current_user = (
           select pg_get_userbyid(proowner)
           from pg_proc
           where proname = 'purge_analytics_behavior_events'
             and pronargs = 1
           limit 1
         ) then
        return old;
      end if;
      raise exception 'ANALYTICS_CONTENT_DELETE_FORBIDDEN';
    end;
    $function$
  `.execute(db);
  await sql`
    create or replace function purge_analytics_behavior_events(cutoff timestamptz)
    returns integer
    language plpgsql
    security definer
    set search_path = public, pg_temp
    as $function$
    declare deleted_count integer;
    begin
      if cutoff > clock_timestamp() then
        raise exception 'ANALYTICS_RETENTION_CUTOFF_IN_FUTURE';
      end if;
      perform set_config('app.analytics_retention_job', 'on', true);
      delete from analytics_behavior_events where expires_at <= cutoff;
      get diagnostics deleted_count = row_count;
      return deleted_count;
    end;
    $function$
  `.execute(db);
  await sql`
    revoke all on function purge_analytics_behavior_events(timestamptz) from public
  `.execute(db);
  await sql`
    grant execute on function purge_analytics_behavior_events(timestamptz) to current_user
  `.execute(db);
  await sql`
    create trigger analytics_behavior_events_no_delete
    before delete on analytics_behavior_events
    for each row execute function prevent_analytics_delete()
  `.execute(db);
  await sql`
    create trigger analytics_audit_events_no_delete
    before delete on analytics_audit_events
    for each row execute function prevent_analytics_delete()
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    drop trigger if exists analytics_audit_events_no_delete on analytics_audit_events
  `.execute(db);
  await sql`
    drop trigger if exists analytics_behavior_events_no_delete on analytics_behavior_events
  `.execute(db);
  await sql`drop function if exists prevent_analytics_delete()`.execute(db);
  await sql`
    drop function if exists purge_analytics_behavior_events(timestamptz)
  `.execute(db);
  await db.schema.dropTable("analytics_audit_events").execute();
  await db.schema.dropTable("analytics_metric_definitions").execute();
  await db.schema.dropTable("analytics_daily_aggregates").execute();
  await db.schema.dropTable("analytics_behavior_events").execute();
}
