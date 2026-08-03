import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("departments")
    .addColumn("department_id", "varchar(64)", (column) => column.primaryKey())
    .addColumn("name", "varchar(120)", (column) => column.notNull())
    .addColumn("parent_department_id", "varchar(64)")
    .addColumn("source", "varchar(16)", (column) => column.notNull())
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`),
    )
    .addColumn("updated_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await sql`alter table departments add constraint departments_source_check check (source in ('local', 'dingtalk'))`.execute(
    db,
  );

  await db.schema
    .createTable("employees")
    .addColumn("employee_id", "varchar(64)", (column) => column.primaryKey())
    .addColumn("display_name", "varchar(120)", (column) => column.notNull())
    .addColumn("status", "varchar(32)", (column) => column.notNull())
    .addColumn("primary_department_id", "varchar(64)", (column) =>
      column.notNull().references("departments.department_id"),
    )
    .addColumn("password_hash", "varchar(255)")
    .addColumn("password_reset_required", "boolean", (column) =>
      column.notNull().defaultTo(false),
    )
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`),
    )
    .addColumn("updated_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await sql`alter table employees add constraint employees_status_check check (status in ('pending_binding', 'active', 'disabled', 'archived'))`.execute(
    db,
  );

  await db.schema
    .createTable("department_memberships")
    .addColumn("employee_id", "varchar(64)", (column) =>
      column.notNull().references("employees.employee_id"),
    )
    .addColumn("department_id", "varchar(64)", (column) =>
      column.notNull().references("departments.department_id"),
    )
    .addColumn("is_primary", "boolean", (column) =>
      column.notNull().defaultTo(false),
    )
    .addPrimaryKeyConstraint("department_memberships_pk", [
      "employee_id",
      "department_id",
    ])
    .execute();

  await db.schema
    .createTable("roles")
    .addColumn("role_code", "varchar(64)", (column) => column.primaryKey())
    .addColumn("name", "varchar(120)", (column) => column.notNull())
    .addColumn("permissions", "jsonb", (column) => column.notNull())
    .addColumn("is_system", "boolean", (column) =>
      column.notNull().defaultTo(false),
    )
    .execute();

  await db.schema
    .createTable("employee_roles")
    .addColumn("employee_id", "varchar(64)", (column) =>
      column.notNull().references("employees.employee_id"),
    )
    .addColumn("role_code", "varchar(64)", (column) =>
      column.notNull().references("roles.role_code"),
    )
    .addPrimaryKeyConstraint("employee_roles_pk", ["employee_id", "role_code"])
    .execute();

  await db.schema
    .createTable("user_sessions")
    .addColumn("session_id", "uuid", (column) =>
      column.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("employee_id", "varchar(64)", (column) =>
      column.notNull().references("employees.employee_id"),
    )
    .addColumn("device_label", "varchar(120)", (column) => column.notNull())
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`),
    )
    .addColumn("expires_at", "timestamptz", (column) => column.notNull())
    .addColumn("revoked_at", "timestamptz")
    .addColumn("revocation_reason", "varchar(120)")
    .execute();

  await db.schema
    .createTable("dingtalk_bindings")
    .addColumn("employee_id", "varchar(64)", (column) =>
      column.primaryKey().references("employees.employee_id"),
    )
    .addColumn("dingtalk_user_id", "varchar(128)", (column) =>
      column.notNull().unique(),
    )
    .addColumn("bound_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createTable("password_reset_challenges")
    .addColumn("challenge_id", "uuid", (column) =>
      column.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("employee_id", "varchar(64)", (column) =>
      column.notNull().references("employees.employee_id"),
    )
    .addColumn("token_hash", "varchar(128)", (column) =>
      column.notNull().unique(),
    )
    .addColumn("expires_at", "timestamptz", (column) => column.notNull())
    .addColumn("consumed_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createTable("dingtalk_sync_runs")
    .addColumn("sync_run_id", "uuid", (column) =>
      column.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("mode", "varchar(16)", (column) => column.notNull())
    .addColumn("status", "varchar(16)", (column) => column.notNull())
    .addColumn("started_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`),
    )
    .addColumn("finished_at", "timestamptz")
    .addColumn("summary", "jsonb", (column) => column.notNull())
    .execute();

  await db.schema
    .createTable("identity_audit_events")
    .addColumn("audit_event_id", "uuid", (column) =>
      column.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("actor_employee_id", "varchar(64)")
    .addColumn("event_type", "varchar(120)", (column) => column.notNull())
    .addColumn("subject_employee_id", "varchar(64)")
    .addColumn("details", "jsonb", (column) => column.notNull())
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await sql`
    insert into roles (role_code, name, permissions, is_system)
    values
      ('employee', '普通员工', '["marketplace.read"]'::jsonb, true),
      ('organization_admin', '组织管理员', '["identity.manage", "identity.read"]'::jsonb, true),
      ('super_admin', '超级管理员', '["*"]'::jsonb, true)
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("identity_audit_events").execute();
  await db.schema.dropTable("dingtalk_sync_runs").execute();
  await db.schema.dropTable("dingtalk_bindings").execute();
  await db.schema.dropTable("password_reset_challenges").execute();
  await db.schema.dropTable("user_sessions").execute();
  await db.schema.dropTable("employee_roles").execute();
  await db.schema.dropTable("roles").execute();
  await db.schema.dropTable("department_memberships").execute();
  await db.schema.dropTable("employees").execute();
  await db.schema.dropTable("departments").execute();
}
