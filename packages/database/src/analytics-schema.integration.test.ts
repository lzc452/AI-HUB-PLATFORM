import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { startPostgresTestContainer } from "@ai-hub/testing";
import { createDatabase, runMigrations } from "./index.js";

describe("Phase 6 analytics schema", () => {
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

  it("stores bounded raw events and rebuildable daily aggregates without tenant state", async () => {
    const tables = await sql<{ table_name: string }>`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name in (
          'analytics_behavior_events',
          'analytics_daily_aggregates',
          'analytics_metric_definitions',
          'analytics_audit_events'
        )
    `.execute(db);

    expect(tables.rows.map((row) => row.table_name).sort()).toEqual([
      "analytics_audit_events",
      "analytics_behavior_events",
      "analytics_daily_aggregates",
      "analytics_metric_definitions",
    ]);

    const tenantColumns = await sql<{ table_name: string }>`
      select table_name
      from information_schema.columns
      where table_schema = 'public'
        and column_name = 'tenant_id'
        and table_name like 'analytics_%'
    `.execute(db);
    expect(tenantColumns.rows).toHaveLength(0);
  });

  it("declares event allow-list, 180-day expiry, idempotency and aggregate keys", async () => {
    const constraints = await sql<{ constraint_name: string }>`
      select constraint_name
      from information_schema.table_constraints
      where table_schema = 'public'
        and constraint_name in (
          'analytics_behavior_events_name_check',
          'analytics_behavior_events_metadata_object_check',
          'analytics_daily_aggregates_pk',
          'analytics_metric_definitions_pk'
        )
      order by constraint_name
    `.execute(db);

    expect(constraints.rows.map((row) => row.constraint_name)).toEqual([
      "analytics_behavior_events_metadata_object_check",
      "analytics_behavior_events_name_check",
      "analytics_daily_aggregates_pk",
      "analytics_metric_definitions_pk",
    ]);

    const indexes = await sql<{ indexname: string }>`
      select indexname
      from pg_indexes
      where schemaname = 'public'
        and tablename = 'analytics_behavior_events'
        and indexname in (
          'analytics_behavior_events_idempotency_key_key',
          'analytics_behavior_events_expiry_idx'
        )
      order by indexname
    `.execute(db);
    expect(indexes.rows.map((row) => row.indexname)).toEqual([
      "analytics_behavior_events_expiry_idx",
      "analytics_behavior_events_idempotency_key_key",
    ]);
  });

  it("prevents physical deletion of raw events and analytics audit records", async () => {
    const triggers = await sql<{ trigger_name: string }>`
      select tg.tgname as trigger_name
      from pg_trigger tg
      join pg_class c on c.oid = tg.tgrelid
      where not tg.tgisinternal
        and c.relname in ('analytics_behavior_events', 'analytics_audit_events')
        and tg.tgname like '%_no_delete'
    `.execute(db);

    expect(triggers.rows.map((row) => row.trigger_name).sort()).toEqual([
      "analytics_audit_events_no_delete",
      "analytics_behavior_events_no_delete",
    ]);

    const purgeFunction = await sql<{ security_type: boolean }>`
      select p.prosecdef as security_type
      from pg_proc p
      where p.proname = 'purge_analytics_behavior_events'
    `.execute(db);
    expect(purgeFunction.rows).toHaveLength(1);
    expect(purgeFunction.rows[0]?.security_type).toBe(true);
  });

  it("stores permissioned export jobs as an auditable lifecycle", async () => {
    const table = await sql<{ table_name: string }>`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name = 'analytics_export_jobs'
    `.execute(db);
    expect(table.rows).toHaveLength(1);

    const constraint = await sql<{ constraint_name: string }>`
      select constraint_name
      from information_schema.table_constraints
      where table_schema = 'public'
        and constraint_name = 'analytics_export_jobs_status_check'
    `.execute(db);
    expect(constraint.rows).toHaveLength(1);
  });

  it("seeds one active version for every fixed metric definition", async () => {
    const definitions = await sql<{
      metric_key: string;
      version: number;
    }>`
      select metric_key, version
      from analytics_metric_definitions
      where is_active = true
      order by metric_key
    `.execute(db);

    expect(definitions.rows).toHaveLength(12);
    expect(definitions.rows.every((row) => row.version === 1)).toBe(true);
  });

  it("provisions the Phase 6 analytics roles through a sequenced migration", async () => {
    const roles = await sql<{ role_code: string }>`
      select role_code
      from roles
      where role_code like 'analytics_%'
      order by role_code
    `.execute(db);
    expect(roles.rows.length).toBeGreaterThanOrEqual(13);
    expect(roles.rows.map((row) => row.role_code)).toContain(
      "analytics_operator",
    );
    expect(roles.rows.map((row) => row.role_code)).toContain(
      "analytics_integration_reader",
    );
  });
});
