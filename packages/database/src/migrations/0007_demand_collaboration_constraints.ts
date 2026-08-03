import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    create unique index ai_demand_collaborators_one_operator_idx
    on ai_demand_collaborators (demand_id)
    where role = 'operator'
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    drop index if exists ai_demand_collaborators_one_operator_idx
  `.execute(db);
}
