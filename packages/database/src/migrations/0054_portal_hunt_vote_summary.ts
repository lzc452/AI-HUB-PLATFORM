import { sql, type Kysely } from "kysely";
import type { DatabaseSchema } from "../schema.js";

export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await db.schema
    .alterTable("portal_content_pages")
    .addColumn("summary", "text", (column) => column.notNull().defaultTo(""))
    .execute();

  await sql`
      with ranked as (
        select vote_id,
          row_number() over (
            partition by period_id, employee_id
            order by updated_at desc, vote_id desc
          ) as rank
        from portal_app_hunt_votes
        where active = true
      )
      update portal_app_hunt_votes v
      set active = false, updated_at = now()
      from ranked r
      where v.vote_id = r.vote_id and r.rank > 1
    `.execute(db);
  await db.schema
    .createIndex("portal_app_hunt_votes_period_employee_active_uq")
    .on("portal_app_hunt_votes")
    .columns(["period_id", "employee_id"])
    .where(sql<boolean>`active = true`)
    .unique()
    .execute();

  await sql`
    update portal_content_pages
    set summary = case page_key
      when 'tutorials' then '从发现资源到发布审核，快速掌握 AI Hub Portal。'
      when 'about' then '让经过验证的 AI 能力在企业内被安全地发现与复用。'
      when 'updates' then '了解 Portal 最新功能、体验优化和安全能力。'
      else summary end
    where page_key in ('tutorials', 'about', 'updates')
  `.execute(db);
}

export async function down(db: Kysely<DatabaseSchema>): Promise<void> {
  await db.schema
    .dropIndex("portal_app_hunt_votes_period_employee_active_uq")
    .ifExists()
    .execute();
  await db.schema
    .alterTable("portal_content_pages")
    .dropColumn("summary")
    .execute();
}
