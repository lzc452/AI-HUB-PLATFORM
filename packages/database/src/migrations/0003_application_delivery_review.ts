import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("applications")
    .addColumn("application_id", "uuid", (column) =>
      column.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("owner_employee_id", "varchar(64)", (column) =>
      column.notNull().references("employees.employee_id"),
    )
    .addColumn("maintainer_employee_id", "varchar(64)", (column) =>
      column.notNull().references("employees.employee_id"),
    )
    .addColumn("department_id", "varchar(64)", (column) =>
      column.notNull().references("departments.department_id"),
    )
    .addColumn("name", "varchar(160)", (column) => column.notNull())
    .addColumn("summary", "text", (column) => column.notNull())
    .addColumn("status", "varchar(32)", (column) =>
      column.notNull().defaultTo("draft"),
    )
    .addColumn("current_version_id", "uuid")
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`),
    )
    .addColumn("updated_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await sql`
    alter table applications
    add constraint applications_status_check
    check (status in ('draft', 'in_review', 'approved', 'published', 'withdrawn', 'archived'))
  `.execute(db);

  await db.schema
    .createTable("application_versions")
    .addColumn("application_version_id", "uuid", (column) =>
      column.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("application_id", "uuid", (column) =>
      column.notNull().references("applications.application_id"),
    )
    .addColumn("version", "varchar(64)", (column) => column.notNull())
    .addColumn("changelog", "text", (column) => column.notNull())
    .addColumn("artifact_key", "varchar(255)", (column) => column.notNull())
    .addColumn("artifact_sha256", "varchar(64)", (column) => column.notNull())
    .addColumn("artifact_signature", "text", (column) => column.notNull())
    .addColumn("scan_status", "varchar(16)", (column) =>
      column.notNull().defaultTo("pending"),
    )
    .addColumn("created_by_employee_id", "varchar(64)", (column) =>
      column.notNull().references("employees.employee_id"),
    )
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`),
    )
    .addUniqueConstraint("application_versions_application_id_version_unique", [
      "application_id",
      "version",
    ])
    .execute();

  await sql`
    alter table application_versions
    add constraint application_versions_scan_status_check
    check (scan_status in ('pending', 'passed', 'failed'))
  `.execute(db);

  await sql`
    alter table applications
    add constraint applications_current_version_fk
    foreign key (current_version_id)
    references application_versions(application_version_id)
  `.execute(db);

  await db.schema
    .createTable("application_deliveries")
    .addColumn("delivery_id", "uuid", (column) =>
      column.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("application_id", "uuid", (column) =>
      column.notNull().references("applications.application_id"),
    )
    .addColumn("channel", "varchar(32)", (column) => column.notNull())
    .addColumn("entry_url", "text", (column) => column.notNull())
    .addColumn("min_client_version", "varchar(64)")
    .addColumn("enabled", "boolean", (column) =>
      column.notNull().defaultTo(true),
    )
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`),
    )
    .addColumn("updated_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`),
    )
    .addUniqueConstraint(
      "application_deliveries_application_id_channel_unique",
      ["application_id", "channel"],
    )
    .execute();

  await sql`
    alter table application_deliveries
    add constraint application_deliveries_channel_check
    check (channel in ('web', 'desktop', 'mobile', 'mini_program'))
  `.execute(db);

  await db.schema
    .createTable("application_reviews")
    .addColumn("review_id", "uuid", (column) =>
      column.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("application_id", "uuid", (column) =>
      column.notNull().references("applications.application_id"),
    )
    .addColumn("application_version_id", "uuid", (column) =>
      column
        .notNull()
        .references("application_versions.application_version_id"),
    )
    .addColumn("reviewer_employee_id", "varchar(64)", (column) =>
      column.notNull().references("employees.employee_id"),
    )
    .addColumn("application_owner_employee_id", "varchar(64)", (column) =>
      column.notNull().references("employees.employee_id"),
    )
    .addColumn("decision", "varchar(32)", (column) => column.notNull())
    .addColumn("comment", "text", (column) => column.notNull())
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await sql`
    alter table application_reviews
    add constraint application_reviews_decision_check
    check (decision in ('approve', 'reject', 'request_changes'))
  `.execute(db);

  await db.schema
    .createTable("application_review_queue")
    .addColumn("review_queue_id", "uuid", (column) =>
      column.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("application_id", "uuid", (column) =>
      column.notNull().references("applications.application_id"),
    )
    .addColumn("application_version_id", "uuid", (column) =>
      column
        .notNull()
        .unique()
        .references("application_versions.application_version_id"),
    )
    .addColumn("status", "varchar(16)", (column) =>
      column.notNull().defaultTo("available"),
    )
    .addColumn("claimed_by_employee_id", "varchar(64)", (column) =>
      column.references("employees.employee_id"),
    )
    .addColumn("claimed_at", "timestamptz")
    .addColumn("sla_due_at", "timestamptz", (column) => column.notNull())
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await sql`
    alter table application_review_queue
    add constraint application_review_queue_status_check
    check (status in ('available', 'claimed'))
  `.execute(db);

  await sql`
    alter table application_reviews
    add constraint application_reviews_reviewer_not_owner_check
    check (reviewer_employee_id <> application_owner_employee_id)
  `.execute(db);

  await db.schema
    .createTable("application_audit_events")
    .addColumn("audit_event_id", "uuid", (column) =>
      column.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("application_id", "uuid", (column) =>
      column.notNull().references("applications.application_id"),
    )
    .addColumn("application_version_id", "uuid", (column) =>
      column.references("application_versions.application_version_id"),
    )
    .addColumn("actor_employee_id", "varchar(64)", (column) =>
      column.references("employees.employee_id"),
    )
    .addColumn("event_type", "varchar(120)", (column) => column.notNull())
    .addColumn("details", "jsonb", (column) =>
      column.notNull().defaultTo(sql`'{}'::jsonb`),
    )
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await sql`
    create or replace function prevent_application_version_artifact_mutation()
    returns trigger
    language plpgsql
    as $function$
    begin
      if new.artifact_sha256 is distinct from old.artifact_sha256
        or new.artifact_signature is distinct from old.artifact_signature then
        raise exception 'APPLICATION_ARTIFACT_IMMUTABLE';
      end if;
      return new;
    end;
    $function$
  `.execute(db);

  await sql`
    create trigger application_versions_artifact_immutable
    before update on application_versions
    for each row execute function prevent_application_version_artifact_mutation()
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    drop trigger if exists application_versions_artifact_immutable
    on application_versions
  `.execute(db);
  await sql`
    drop function if exists prevent_application_version_artifact_mutation()
  `.execute(db);
  await db.schema.dropTable("application_audit_events").execute();
  await db.schema.dropTable("application_review_queue").execute();
  await db.schema.dropTable("application_reviews").execute();
  await db.schema.dropTable("application_deliveries").execute();
  await db.schema
    .alterTable("applications")
    .dropConstraint("applications_current_version_fk")
    .execute();
  await db.schema.dropTable("application_versions").execute();
  await db.schema.dropTable("applications").execute();
}
