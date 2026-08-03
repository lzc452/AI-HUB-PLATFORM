import { sql, type Kysely } from "kysely";

const demandStatuses = [
  "draft",
  "pending_review",
  "rejected",
  "published",
  "in_progress",
  "pilot",
  "completed",
  "closed",
  "merged",
] as const;

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("ai_demands")
    .addColumn("demand_id", "uuid", (column) =>
      column.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("requester_employee_id", "varchar(64)", (column) =>
      column.notNull().references("employees.employee_id"),
    )
    .addColumn("title", "varchar(200)", (column) => column.notNull())
    .addColumn("problem_statement", "text", (column) => column.notNull())
    .addColumn("desired_outcome", "text", (column) => column.notNull())
    .addColumn("status", "varchar(32)", (column) =>
      column.notNull().defaultTo("draft"),
    )
    .addColumn("audience_type", "varchar(16)", (column) =>
      column.notNull().defaultTo("all"),
    )
    .addColumn("audience_department_id", "varchar(64)", (column) =>
      column.references("departments.department_id"),
    )
    .addColumn("audience_employee_id", "varchar(64)", (column) =>
      column.references("employees.employee_id"),
    )
    .addColumn("include_children", "boolean", (column) =>
      column.notNull().defaultTo(false),
    )
    .addColumn("display_anonymously", "boolean", (column) =>
      column.notNull().defaultTo(false),
    )
    .addColumn("review_reason", "text")
    .addColumn("business_value", "integer")
    .addColumn("implementation_cost", "integer")
    .addColumn("risk_level", "integer")
    .addColumn("admin_priority", "integer")
    .addColumn("priority_score", "numeric(8, 3)")
    .addColumn("priority_explanation", "text")
    .addColumn("owner_employee_id", "varchar(64)", (column) =>
      column.references("employees.employee_id"),
    )
    .addColumn("version", "integer", (column) => column.notNull().defaultTo(1))
    .addColumn("merged_into_demand_id", "uuid")
    .addColumn("primary_solution_application_id", "uuid", (column) =>
      column.references("applications.application_id"),
    )
    .addColumn("published_at", "timestamptz")
    .addColumn("closed_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`),
    )
    .addColumn("updated_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await sql`
    alter table ai_demands
    add constraint ai_demands_status_check
    check (status in (${sql.join(demandStatuses.map((status) => sql.lit(status)))}))
  `.execute(db);
  await sql`
    alter table ai_demands
    add constraint ai_demands_audience_check
    check (
      (audience_type = 'all' and audience_department_id is null and audience_employee_id is null)
      or (audience_type = 'department' and audience_department_id is not null and audience_employee_id is null)
      or (audience_type = 'employee' and audience_department_id is null and audience_employee_id is not null)
    )
  `.execute(db);
  await sql`
    alter table ai_demands
    add constraint ai_demands_priority_range_check
    check (
      (business_value is null or business_value between 1 and 5)
      and (implementation_cost is null or implementation_cost between 1 and 5)
      and (risk_level is null or risk_level between 1 and 5)
      and (admin_priority is null or admin_priority between 1 and 5)
    )
  `.execute(db);
  await db.schema
    .alterTable("ai_demands")
    .addForeignKeyConstraint(
      "ai_demands_merged_into_fk",
      ["merged_into_demand_id"],
      "ai_demands",
      ["demand_id"],
    )
    .execute();

  await db.schema
    .createTable("ai_demand_collaborators")
    .addColumn("demand_id", "uuid", (column) =>
      column.notNull().references("ai_demands.demand_id"),
    )
    .addColumn("employee_id", "varchar(64)", (column) =>
      column.notNull().references("employees.employee_id"),
    )
    .addColumn("role", "varchar(16)", (column) => column.notNull())
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`),
    )
    .addPrimaryKeyConstraint("ai_demand_collaborators_pk", [
      "demand_id",
      "employee_id",
    ])
    .execute();
  await sql`
    alter table ai_demand_collaborators
    add constraint ai_demand_collaborators_role_check
    check (role in ('owner', 'collaborator', 'operator'))
  `.execute(db);

  await db.schema
    .createTable("ai_demand_comments")
    .addColumn("comment_id", "uuid", (column) =>
      column.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("demand_id", "uuid", (column) =>
      column.notNull().references("ai_demands.demand_id"),
    )
    .addColumn("parent_comment_id", "uuid")
    .addColumn("author_employee_id", "varchar(64)", (column) =>
      column.notNull().references("employees.employee_id"),
    )
    .addColumn("body", "text", (column) => column.notNull())
    .addColumn("display_anonymously", "boolean", (column) =>
      column.notNull().defaultTo(false),
    )
    .addColumn("hidden_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`),
    )
    .addColumn("updated_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`),
    )
    .addForeignKeyConstraint(
      "ai_demand_comments_parent_fk",
      ["parent_comment_id"],
      "ai_demand_comments",
      ["comment_id"],
    )
    .execute();

  await db.schema
    .createTable("ai_demand_reports")
    .addColumn("report_id", "uuid", (column) =>
      column.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("demand_id", "uuid", (column) =>
      column.notNull().references("ai_demands.demand_id"),
    )
    .addColumn("comment_id", "uuid", (column) =>
      column.references("ai_demand_comments.comment_id"),
    )
    .addColumn("reporter_employee_id", "varchar(64)", (column) =>
      column.notNull().references("employees.employee_id"),
    )
    .addColumn("reason", "text", (column) => column.notNull())
    .addColumn("status", "varchar(16)", (column) =>
      column.notNull().defaultTo("open"),
    )
    .addColumn("resolved_by_employee_id", "varchar(64)", (column) =>
      column.references("employees.employee_id"),
    )
    .addColumn("resolved_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`),
    )
    .execute();
  await sql`
    alter table ai_demand_reports
    add constraint ai_demand_reports_status_check
    check (status in ('open', 'dismissed', 'hidden', 'restored'))
  `.execute(db);

  await db.schema
    .createTable("ai_demand_progress_updates")
    .addColumn("progress_id", "uuid", (column) =>
      column.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("demand_id", "uuid", (column) =>
      column.notNull().references("ai_demands.demand_id"),
    )
    .addColumn("author_employee_id", "varchar(64)", (column) =>
      column.notNull().references("employees.employee_id"),
    )
    .addColumn("status", "varchar(32)", (column) => column.notNull())
    .addColumn("title", "varchar(200)", (column) => column.notNull())
    .addColumn("body", "text", (column) => column.notNull())
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createTable("ai_demand_pilots")
    .addColumn("pilot_id", "uuid", (column) =>
      column.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("demand_id", "uuid", (column) =>
      column.notNull().references("ai_demands.demand_id"),
    )
    .addColumn("application_id", "uuid", (column) =>
      column.references("applications.application_id"),
    )
    .addColumn("name", "varchar(200)", (column) => column.notNull())
    .addColumn("starts_at", "timestamptz", (column) => column.notNull())
    .addColumn("ends_at", "timestamptz")
    .addColumn("outcome", "text")
    .addColumn("status", "varchar(16)", (column) =>
      column.notNull().defaultTo("planned"),
    )
    .addColumn("created_by_employee_id", "varchar(64)", (column) =>
      column.notNull().references("employees.employee_id"),
    )
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`),
    )
    .addColumn("updated_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`),
    )
    .execute();
  await sql`
    alter table ai_demand_pilots
    add constraint ai_demand_pilots_status_check
    check (status in ('planned', 'running', 'completed', 'cancelled'))
  `.execute(db);

  await db.schema
    .createTable("ai_demand_applications")
    .addColumn("demand_id", "uuid", (column) =>
      column.notNull().references("ai_demands.demand_id"),
    )
    .addColumn("application_id", "uuid", (column) =>
      column.notNull().references("applications.application_id"),
    )
    .addColumn("role", "varchar(16)", (column) => column.notNull())
    .addColumn("is_primary", "boolean", (column) =>
      column.notNull().defaultTo(false),
    )
    .addColumn("linked_by_employee_id", "varchar(64)", (column) =>
      column.notNull().references("employees.employee_id"),
    )
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`),
    )
    .addPrimaryKeyConstraint("ai_demand_applications_pk", [
      "demand_id",
      "application_id",
    ])
    .execute();
  await sql`
    alter table ai_demand_applications
    add constraint ai_demand_applications_role_check
    check (role in ('candidate', 'pilot', 'solution'))
  `.execute(db);
  await sql`
    create unique index ai_demand_applications_one_primary_idx
    on ai_demand_applications (demand_id)
    where is_primary = true
  `.execute(db);

  await db.schema
    .createTable("ai_demand_audit_events")
    .addColumn("audit_event_id", "uuid", (column) =>
      column.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("demand_id", "uuid", (column) =>
      column.notNull().references("ai_demands.demand_id"),
    )
    .addColumn("actor_employee_id", "varchar(64)", (column) =>
      column.references("employees.employee_id"),
    )
    .addColumn("event_type", "varchar(120)", (column) => column.notNull())
    .addColumn("details", "jsonb", (column) => column.notNull())
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createIndex("ai_demands_status_created_idx")
    .on("ai_demands")
    .columns(["status", "created_at"])
    .execute();
  await db.schema
    .createIndex("ai_demands_audience_department_idx")
    .on("ai_demands")
    .columns(["audience_type", "audience_department_id"])
    .execute();
  await db.schema
    .createIndex("ai_demand_comments_demand_idx")
    .on("ai_demand_comments")
    .columns(["demand_id", "created_at"])
    .execute();
  await db.schema
    .createIndex("ai_demand_reports_status_idx")
    .on("ai_demand_reports")
    .columns(["status", "created_at"])
    .execute();

  await sql`
    create or replace function prevent_ai_demand_content_delete()
    returns trigger
    language plpgsql
    as $function$
    begin
      raise exception 'AI_DEMAND_CONTENT_DELETE_FORBIDDEN';
    end;
    $function$
  `.execute(db);

  for (const table of [
    "ai_demands",
    "ai_demand_collaborators",
    "ai_demand_comments",
    "ai_demand_reports",
    "ai_demand_progress_updates",
    "ai_demand_pilots",
    "ai_demand_applications",
    "ai_demand_audit_events",
  ]) {
    await sql`
      create trigger ${sql.raw(`${table}_no_delete`)}
      before delete on ${sql.raw(table)}
      for each row execute function prevent_ai_demand_content_delete()
    `.execute(db);
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  for (const table of [
    "ai_demand_audit_events",
    "ai_demand_applications",
    "ai_demand_pilots",
    "ai_demand_progress_updates",
    "ai_demand_reports",
    "ai_demand_comments",
    "ai_demand_collaborators",
  ]) {
    await sql`
      drop trigger if exists ${sql.raw(`${table}_no_delete`)} on ${sql.raw(table)}
    `.execute(db);
  }
  await sql`
    drop trigger if exists ai_demands_no_delete on ai_demands
  `.execute(db);
  await sql`drop function if exists prevent_ai_demand_content_delete()`.execute(
    db,
  );
  await db.schema.dropTable("ai_demand_audit_events").execute();
  await db.schema.dropTable("ai_demand_applications").execute();
  await db.schema.dropTable("ai_demand_pilots").execute();
  await db.schema.dropTable("ai_demand_progress_updates").execute();
  await db.schema.dropTable("ai_demand_reports").execute();
  await db.schema.dropTable("ai_demand_comments").execute();
  await db.schema.dropTable("ai_demand_collaborators").execute();
  await db.schema
    .alterTable("ai_demands")
    .dropConstraint("ai_demands_merged_into_fk")
    .execute();
  await db.schema.dropTable("ai_demands").execute();
}
