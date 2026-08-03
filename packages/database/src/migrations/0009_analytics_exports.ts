import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("analytics_export_jobs")
    .addColumn("export_id", "uuid", (column) => column.primaryKey())
    .addColumn("requested_by_employee_id", "varchar(64)", (column) =>
      column.notNull().references("employees.employee_id"),
    )
    .addColumn("target", "varchar(32)", (column) => column.notNull())
    .addColumn("from_date", "date", (column) => column.notNull())
    .addColumn("to_date", "date", (column) => column.notNull())
    .addColumn("status", "varchar(16)", (column) =>
      column.notNull().defaultTo("queued"),
    )
    .addColumn("failure_code", "varchar(120)")
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`),
    )
    .addColumn("completed_at", "timestamptz")
    .execute();

  await sql`
    alter table analytics_export_jobs
    add constraint analytics_export_jobs_status_check
    check (status in ('queued', 'running', 'completed', 'failed'))
  `.execute(db);
  await db.schema
    .createIndex("analytics_export_jobs_requested_idx")
    .on("analytics_export_jobs")
    .columns(["requested_by_employee_id", "created_at"])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("analytics_export_jobs").execute();
}
