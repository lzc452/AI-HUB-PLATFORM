import { sql, type Kysely } from "kysely";

/**
 * 需求价值看板（demand_value）按 (event_type, created_at) 从
 * ai_demand_audit_events 按日聚合（converted/submitted/priority.updated/
 * pilot.updated），原表仅有 PK，避免逐条 seq scan。
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    create index if not exists ai_demand_audit_events_type_created_idx
    on ai_demand_audit_events (event_type, created_at)
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    drop index if exists ai_demand_audit_events_type_created_idx
  `.execute(db);
}
