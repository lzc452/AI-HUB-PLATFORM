import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { startPostgresTestContainer } from "@ai-hub/testing";
import { createDatabase, runMigrations } from "./index.js";

describe("Phase 5 demand schema", () => {
  let db: ReturnType<typeof createDatabase>;
  let stop: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    const container = await startPostgresTestContainer();
    stop = container.stop;
    db = createDatabase(container.databaseUrl);
    await runMigrations(db);
  }, 60_000);

  afterAll(async () => {
    await db?.destroy();
    await stop?.();
  }, 60_000);

  it("creates normalized demand governance tables without tenant state", async () => {
    const tables = await sql<{ table_name: string }>`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name in (
          'ai_demands',
          'ai_demand_collaborators',
          'ai_demand_comments',
          'ai_demand_comment_likes',
          'ai_demand_likes',
          'ai_demand_reports',
          'ai_demand_progress_updates',
          'ai_demand_pilots',
          'ai_demand_applications',
          'ai_demand_audit_events'
        )
    `.execute(db);

    expect(tables.rows.map((row) => row.table_name).sort()).toEqual([
      "ai_demand_applications",
      "ai_demand_audit_events",
      "ai_demand_collaborators",
      "ai_demand_comment_likes",
      "ai_demand_comments",
      "ai_demand_likes",
      "ai_demand_pilots",
      "ai_demand_progress_updates",
      "ai_demand_reports",
      "ai_demands",
    ]);

    const tenantColumns = await sql<{ table_name: string }>`
      select table_name
      from information_schema.columns
      where table_schema = 'public'
        and column_name = 'tenant_id'
        and table_name like 'ai_demand%'
    `.execute(db);
    expect(tenantColumns.rows).toHaveLength(0);
  });

  it("declares bounded state, audience, concurrency and primary-solution constraints", async () => {
    const constraints = await sql<{ constraint_name: string }>`
      select constraint_name
      from information_schema.table_constraints
      where table_schema = 'public'
        and constraint_name in (
          'ai_demands_status_check',
          'ai_demands_audience_check',
          'ai_demands_priority_range_check',
          'ai_demands_priority_score_range_check',
          'ai_demand_comment_likes_pk',
          'ai_demand_collaborators_pk',
          'ai_demand_applications_pk'
        )
      order by constraint_name
    `.execute(db);

    expect(constraints.rows.map((row) => row.constraint_name)).toEqual([
      "ai_demand_applications_pk",
      "ai_demand_collaborators_pk",
      "ai_demand_comment_likes_pk",
      "ai_demands_audience_check",
      "ai_demands_priority_range_check",
      "ai_demands_priority_score_range_check",
      "ai_demands_status_check",
    ]);

    const indexes = await sql<{ indexname: string }>`
      select indexname
      from pg_indexes
      where schemaname = 'public'
        and (
          (tablename = 'ai_demand_applications' and indexname = 'ai_demand_applications_one_primary_idx')
          or (tablename = 'ai_demand_collaborators' and indexname = 'ai_demand_collaborators_one_operator_idx')
        )
      order by indexname
    `.execute(db);
    expect(indexes.rows.map((row) => row.indexname)).toEqual([
      "ai_demand_applications_one_primary_idx",
      "ai_demand_collaborators_one_operator_idx",
    ]);
  });

  it("installs physical-delete protection for demand content", async () => {
    const triggers = await sql<{ trigger_name: string }>`
      select tg.tgname as trigger_name
      from pg_trigger tg
      join pg_class c on c.oid = tg.tgrelid
      where not tg.tgisinternal
        and c.relname like 'ai_demand%'
        and tg.tgname like '%_no_delete'
    `.execute(db);

    expect(triggers.rows.map((row) => row.trigger_name).sort()).toEqual([
      "ai_demand_audit_events_no_delete",
      "ai_demand_claim_proposals_no_delete",
      "ai_demand_comments_no_delete",
      "ai_demand_pilots_no_delete",
      "ai_demand_progress_updates_no_delete",
      "ai_demand_reports_no_delete",
      "ai_demands_no_delete",
    ]);
  });
});
