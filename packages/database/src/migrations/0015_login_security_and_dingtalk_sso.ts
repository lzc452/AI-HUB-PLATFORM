import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // 1. Add employee_number column to employees table.
  await sql`
    alter table employees
    add column employee_number varchar(128)
  `.execute(db);

  // 2. Detect duplicate standardized employee_numbers before creating unique index.
  const conflicts = await sql<{ cnt: number }>`
    select count(*) as cnt from (
      select upper(trim(employee_number)) as normalized, count(*)
      from employees
      where employee_number is not null
      group by upper(trim(employee_number))
      having count(*) > 1
    ) as dupes
  `.execute(db);

  if (Number(conflicts.rows[0]?.cnt ?? 0) > 0) {
    throw new Error(
      "Duplicate standardized employee_number values detected. " +
        "Resolve conflicts before running this migration.",
    );
  }

  // 3. Create unique functional index on standardized employee_number.
  await sql`
    create unique index idx_employees_employee_number_normalized
    on employees (upper(trim(employee_number)))
    where employee_number is not null
  `.execute(db);

  // 4. Create dingtalk_sso_transactions table.
  await db.schema
    .createTable("dingtalk_sso_transactions")
    .addColumn("transaction_id", "uuid", (column) =>
      column.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("state_hash", "varchar(64)", (column) => column.notNull().unique())
    .addColumn("browser_context_binding_hash", "varchar(64)", (column) =>
      column.notNull(),
    )
    .addColumn("handoff_token_hash", "varchar(64)", (column) => column.unique())
    .addColumn("return_to", "varchar(2048)", (column) => column.notNull())
    .addColumn("dingtalk_user_id", "varchar(128)")
    .addColumn("employee_id", "varchar(64)", (column) =>
      column.references("employees.employee_id"),
    )
    .addColumn("expires_at", "timestamptz", (column) => column.notNull())
    .addColumn("consumed_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`),
    )
    .execute();

  // 5. Index on expires_at for cleanup queries.
  await sql`
    create index idx_dingtalk_sso_transactions_expires_at
    on dingtalk_sso_transactions (expires_at)
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("dingtalk_sso_transactions").ifExists().execute();
  await sql`
    drop index if exists idx_employees_employee_number_normalized
  `.execute(db);
  await sql`
    alter table employees drop column if exists employee_number
  `.execute(db);
}
