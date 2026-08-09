import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("ai_demand_comment_likes")
    .addColumn("comment_id", "uuid", (column) =>
      column
        .notNull()
        .references("ai_demand_comments.comment_id")
        .onDelete("cascade"),
    )
    .addColumn("employee_id", "varchar(64)", (column) =>
      column.notNull().references("employees.employee_id").onDelete("cascade"),
    )
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`),
    )
    .addPrimaryKeyConstraint("ai_demand_comment_likes_pk", [
      "comment_id",
      "employee_id",
    ])
    .execute();

  await sql`
    update ai_demands
    set priority_score = round((
      0.40 * business_value
      + 0.30 * admin_priority
      + 0.15 * (6 - implementation_cost)
      + 0.15 * (6 - risk_level)
    )::numeric, 1),
    priority_explanation = concat(
      '0.40*businessValue=', business_value,
      ' + 0.30*adminPriority=', admin_priority,
      ' + 0.15*(6-implementationCost=', implementation_cost,
      ') + 0.15*(6-riskLevel=', risk_level,
      ') = ', round((
        0.40 * business_value
        + 0.30 * admin_priority
        + 0.15 * (6 - implementation_cost)
        + 0.15 * (6 - risk_level)
      )::numeric, 1)
    )
    where business_value is not null
      and admin_priority is not null
      and implementation_cost is not null
      and risk_level is not null
  `.execute(db);

  await sql`
    alter table ai_demands
    add constraint ai_demands_priority_score_range_check
    check (priority_score is null or priority_score between 1.0 and 5.0)
  `.execute(db);

  await sql`
    drop trigger if exists ai_demand_collaborators_no_delete on ai_demand_collaborators
  `.execute(db);
  await sql`
    drop trigger if exists ai_demand_applications_no_delete on ai_demand_applications
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    alter table ai_demands
    drop constraint if exists ai_demands_priority_score_range_check
  `.execute(db);
  await db.schema.dropTable("ai_demand_comment_likes").execute();

  for (const table of ["ai_demand_collaborators", "ai_demand_applications"]) {
    await sql`
      create trigger ${sql.raw(`${table}_no_delete`)}
      before delete on ${sql.raw(table)}
      for each row execute function prevent_ai_demand_content_delete()
    `.execute(db);
  }
}
