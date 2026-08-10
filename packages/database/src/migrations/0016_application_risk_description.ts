import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    alter table application_catalog_metadata
    add column risk_description text
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    alter table application_catalog_metadata
    drop column if exists risk_description
  `.execute(db);
}
