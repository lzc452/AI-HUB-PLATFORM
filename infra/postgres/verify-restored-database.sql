\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

\if :{?EXPECTED_LATEST_MIGRATION}
\else
  \echo '缺少 psql 变量 EXPECTED_LATEST_MIGRATION（必须来自待发布版本）'
  \quit 3
\endif

CREATE TEMP TABLE restore_verified_relation_counts (
  ordinal integer PRIMARY KEY,
  name text NOT NULL,
  row_count bigint NOT NULL
);

-- 只能在已隔离、禁止业务流量写入的恢复目标上执行。

DO $relations$
DECLARE
  current_ordinal integer := 0;
  relation_name text;
  relation_count bigint;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'kysely_migration',
    'kysely_migration_lock',
    'security_audit_events',
    'identity_audit_events',
    'application_audit_events',
    'ai_demand_audit_events',
    'analytics_audit_events',
    'outbox_events',
    'employees',
    'applications',
    'application_versions',
    'ai_demands',
    'analytics_daily_aggregates'
  ]
  LOOP
    current_ordinal := current_ordinal + 1;
    IF to_regclass(format('public.%I', relation_name)) IS NULL THEN
      RAISE EXCEPTION 'RESTORE_RELATION_MISSING: %', relation_name;
    END IF;
    EXECUTE format('SELECT count(*) FROM public.%I', relation_name)
      INTO relation_count;
    INSERT INTO restore_verified_relation_counts (ordinal, name, row_count)
      VALUES (current_ordinal, relation_name, relation_count);
  END LOOP;
END
$relations$;

SELECT CASE
  WHEN (SELECT max(name) FROM kysely_migration) = :'EXPECTED_LATEST_MIGRATION'
  THEN 'migration version verified'
  ELSE CAST(1 / 0 AS text)
END AS migration_verification;

WITH integrity AS (
  SELECT
    (
      SELECT count(*)
      FROM application_versions AS version
      LEFT JOIN applications AS application
        ON application.application_id = version.application_id
      WHERE application.application_id IS NULL
    ) AS "applicationVersionOrphans",
    (
      SELECT count(*)
      FROM ai_demand_applications AS link
      LEFT JOIN ai_demands AS demand ON demand.demand_id = link.demand_id
      LEFT JOIN applications AS application
        ON application.application_id = link.application_id
      WHERE demand.demand_id IS NULL OR application.application_id IS NULL
    ) AS "demandApplicationOrphans",
    (
      SELECT count(*)
      FROM outbox_events
      WHERE status NOT IN ('pending', 'processing', 'completed', 'failed')
    ) AS "invalidOutboxStatuses"
)
SELECT CASE
  WHEN "applicationVersionOrphans" = 0
    AND "demandApplicationOrphans" = 0
    AND "invalidOutboxStatuses" = 0
  THEN json_build_object(
    'integrityChecks', row_to_json(integrity),
    'migrationCount', (SELECT count(*) FROM kysely_migration),
    'latestMigration', (SELECT max(name) FROM kysely_migration),
    'verifiedRelations', (
      SELECT json_agg(
        json_build_object(
          'name', relation.name,
          'kind', 'table',
          'readable', true,
          'rowCount', relation.row_count
        )
        ORDER BY relation.ordinal
      )
      FROM restore_verified_relation_counts AS relation
    )
  )
  ELSE NULL
END AS restore_verification
FROM integrity;

DO $integrity$
DECLARE
  application_version_orphans bigint;
  demand_application_orphans bigint;
  invalid_outbox_statuses bigint;
BEGIN
  SELECT count(*) INTO application_version_orphans
  FROM application_versions AS version
  LEFT JOIN applications AS application
    ON application.application_id = version.application_id
  WHERE application.application_id IS NULL;

  SELECT count(*) INTO demand_application_orphans
  FROM ai_demand_applications AS link
  LEFT JOIN ai_demands AS demand ON demand.demand_id = link.demand_id
  LEFT JOIN applications AS application
    ON application.application_id = link.application_id
  WHERE demand.demand_id IS NULL OR application.application_id IS NULL;

  SELECT count(*) INTO invalid_outbox_statuses
  FROM outbox_events
  WHERE status NOT IN ('pending', 'processing', 'completed', 'failed');

  IF application_version_orphans <> 0
    OR demand_application_orphans <> 0
    OR invalid_outbox_statuses <> 0 THEN
    RAISE EXCEPTION
      'RESTORE_INTEGRITY_CHECK_FAILED: applicationVersionOrphans=%, demandApplicationOrphans=%, invalidOutboxStatuses=%',
      application_version_orphans,
      demand_application_orphans,
      invalid_outbox_statuses;
  END IF;
END
$integrity$;
