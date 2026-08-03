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
  "export_requested",
  "assistant_requested",
  "notification_queued",
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
         and current_setting('app.analytics_retention_job', true) = 'on' then
        return old;
      end if;
      raise exception 'ANALYTICS_CONTENT_DELETE_FORBIDDEN';
    end;
    $function$
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
  await db.schema.dropTable("analytics_audit_events").execute();
  await db.schema.dropTable("analytics_metric_definitions").execute();
  await db.schema.dropTable("analytics_daily_aggregates").execute();
  await db.schema.dropTable("analytics_behavior_events").execute();
}
