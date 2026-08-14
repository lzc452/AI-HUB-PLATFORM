import { sql, type Kysely } from "kysely";

const newStatuses = [
  "draft",
  "pending_review",
  "rejected",
  "pending_claim",
  "claimed",
  "validating",
  "pilot",
  "converted",
  "closed",
  "merged",
] as const;

export async function up(db: Kysely<unknown>): Promise<void> {
  // 1. 移除旧状态检查约束（状态值将迁移为 10 态）。
  await sql`alter table ai_demands drop constraint if exists ai_demands_status_check`.execute(db);

  // 2. 新增 9 组表单字段对应的列（可空，兼容存量数据；新提交由服务层强制非空）。
  await db.schema
    .alterTable("ai_demands")
    .addColumn("business_scenario", "text")
    .addColumn("impact", "text")
    .addColumn("current_workaround", "text")
    .addColumn("data_sensitivity", "text")
    .addColumn("ai_solution_idea", "text")
    .execute();

  // 3. 新增 7 维优先级列 + 管理员确认字段（旧 4 维列保留但弃用）。
  await db.schema
    .alterTable("ai_demands")
    .addColumn("impacted_headcount", "integer")
    .addColumn("usage_frequency", "integer")
    .addColumn("strategic_fit", "integer")
    .addColumn("technical_feasibility", "integer")
    .addColumn("data_compliance_risk", "integer")
    .addColumn("confirmed_priority", "varchar(16)")
    .addColumn("priority_adjustment_reason", "text")
    .execute();

  // 4. 状态值迁移：published → pending_claim，in_progress → claimed，completed → converted。
  await sql`update ai_demands set status = 'pending_claim' where status = 'published'`.execute(db);
  await sql`update ai_demands set status = 'claimed' where status = 'in_progress'`.execute(db);
  await sql`update ai_demands set status = 'converted' where status = 'completed'`.execute(db);

  // 5. 重建状态检查约束（10 态）。
  await sql`
    alter table ai_demands
    add constraint ai_demands_status_check
    check (status in (${sql.join(newStatuses.map((status) => sql.lit(status)))}))
  `.execute(db);

  // 6. 新增 7 维优先级范围与管理员确认约束。
  await sql`
    alter table ai_demands
    add constraint ai_demands_priority7_range_check
    check (
      (impacted_headcount is null or impacted_headcount between 1 and 5)
      and (usage_frequency is null or usage_frequency between 1 and 5)
      and (strategic_fit is null or strategic_fit between 1 and 5)
      and (technical_feasibility is null or technical_feasibility between 1 and 5)
      and (data_compliance_risk is null or data_compliance_risk between 1 and 5)
    )
  `.execute(db);
  await sql`
    alter table ai_demands
    add constraint ai_demands_confirmed_priority_check
    check (confirmed_priority is null or confirmed_priority in ('high', 'medium', 'low'))
  `.execute(db);

  // 7. 认领方案表（多方案、管理员确认、解除重开）。
  await db.schema
    .createTable("ai_demand_claim_proposals")
    .addColumn("proposal_id", "uuid", (column) =>
      column.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("demand_id", "uuid", (column) =>
      column.notNull().references("ai_demands.demand_id"),
    )
    .addColumn("proposer_employee_id", "varchar(64)", (column) =>
      column.notNull().references("employees.employee_id"),
    )
    .addColumn("owner_employee_id", "varchar(64)", (column) =>
      column.notNull().references("employees.employee_id"),
    )
    .addColumn("collaborator_employee_ids", "jsonb", (column) =>
      column.notNull().defaultTo(sql`'[]'::jsonb`),
    )
    .addColumn("approach", "text", (column) => column.notNull())
    .addColumn("estimated_validation_duration", "varchar(200)", (column) =>
      column.notNull(),
    )
    .addColumn("resource_needs", "text", (column) => column.notNull())
    .addColumn("preference", "text")
    .addColumn("status", "varchar(16)", (column) =>
      column.notNull().defaultTo("proposed"),
    )
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`),
    )
    .addColumn("updated_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`),
    )
    .execute();
  await sql`
    alter table ai_demand_claim_proposals
    add constraint ai_demand_claim_proposals_status_check
    check (status in ('proposed', 'selected', 'rejected', 'withdrawn'))
  `.execute(db);
  await db.schema
    .createIndex("ai_demand_claim_proposals_demand_idx")
    .on("ai_demand_claim_proposals")
    .columns(["demand_id", "created_at"])
    .execute();

  // 8. 需求附件表（自持元数据；上传时 demand_id 暂空，提交表单时回填）。
  await db.schema
    .createTable("ai_demand_attachments")
    .addColumn("attachment_id", "uuid", (column) =>
      column.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("demand_id", "uuid", (column) =>
      column.references("ai_demands.demand_id"),
    )
    .addColumn("storage_key", "text", (column) => column.notNull())
    .addColumn("file_name", "varchar(255)", (column) => column.notNull())
    .addColumn("mime_type", "varchar(128)", (column) => column.notNull())
    .addColumn("size_bytes", "integer", (column) => column.notNull())
    .addColumn("sha256", "char(64)")
    .addColumn("uploaded_by_employee_id", "varchar(64)", (column) =>
      column.notNull().references("employees.employee_id"),
    )
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`),
    )
    .execute();
  await db.schema
    .createIndex("ai_demand_attachments_demand_idx")
    .on("ai_demand_attachments")
    .columns(["demand_id", "created_at"])
    .execute();

  // 认领方案为只追加记录，物理删除由触发器阻止（撤回走状态变更）。
  await sql`
    create trigger ai_demand_claim_proposals_no_delete
    before delete on ai_demand_claim_proposals
    for each row execute function prevent_ai_demand_content_delete()
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`drop trigger if exists ai_demand_claim_proposals_no_delete on ai_demand_claim_proposals`.execute(db);
  await db.schema.dropTable("ai_demand_attachments").execute();
  await db.schema.dropTable("ai_demand_claim_proposals").execute();

  await sql`alter table ai_demands drop constraint if exists ai_demands_confirmed_priority_check`.execute(db);
  await sql`alter table ai_demands drop constraint if exists ai_demands_priority7_range_check`.execute(db);
  await sql`alter table ai_demands drop constraint if exists ai_demands_status_check`.execute(db);

  await sql`update ai_demands set status = 'published' where status = 'pending_claim'`.execute(db);
  await sql`update ai_demands set status = 'in_progress' where status = 'claimed'`.execute(db);
  await sql`update ai_demands set status = 'completed' where status = 'converted'`.execute(db);

  await sql`
    alter table ai_demands
    add constraint ai_demands_status_check
    check (status in ('draft', 'pending_review', 'rejected', 'published', 'in_progress', 'pilot', 'completed', 'closed', 'merged'))
  `.execute(db);

  await db.schema
    .alterTable("ai_demands")
    .dropColumn("priority_adjustment_reason")
    .dropColumn("confirmed_priority")
    .dropColumn("data_compliance_risk")
    .dropColumn("technical_feasibility")
    .dropColumn("strategic_fit")
    .dropColumn("usage_frequency")
    .dropColumn("impacted_headcount")
    .dropColumn("ai_solution_idea")
    .dropColumn("data_sensitivity")
    .dropColumn("current_workaround")
    .dropColumn("impact")
    .dropColumn("business_scenario")
    .execute();
}
