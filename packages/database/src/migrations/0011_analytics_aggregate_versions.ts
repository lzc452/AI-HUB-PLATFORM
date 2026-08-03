import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("analytics_daily_aggregates")
    .addColumn("metric_version", "integer", (column) =>
      column.notNull().defaultTo(1),
    )
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("analytics_daily_aggregates")
    .dropColumn("metric_version")
    .execute();
}
