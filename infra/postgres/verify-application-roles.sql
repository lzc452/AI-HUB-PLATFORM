\set ON_ERROR_STOP on

DO $verify$
DECLARE
  role_name text;
  relation record;
BEGIN
  FOREACH role_name IN ARRAY ARRAY[
    'ai_hub_migration',
    'ai_hub_api',
    'ai_hub_worker',
    'ai_hub_observability'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_roles
      WHERE rolname = role_name
        AND rolcanlogin
        AND NOT rolsuper
        AND NOT rolcreatedb
        AND NOT rolcreaterole
        AND NOT rolreplication
        AND NOT rolbypassrls
    ) THEN
      RAISE EXCEPTION 'POSTGRES_ROLE_ATTRIBUTES_INVALID: %', role_name;
    END IF;
  END LOOP;

  IF NOT has_schema_privilege('ai_hub_migration', 'public', 'CREATE') THEN
    RAISE EXCEPTION 'MIGRATION_SCHEMA_CREATE_REQUIRED';
  END IF;
  IF has_schema_privilege('ai_hub_api', 'public', 'CREATE')
    OR has_schema_privilege('ai_hub_worker', 'public', 'CREATE')
    OR has_schema_privilege('ai_hub_observability', 'public', 'CREATE') THEN
    RAISE EXCEPTION 'RUNTIME_SCHEMA_CREATE_FORBIDDEN';
  END IF;

  FOR relation IN
    SELECT class.relname
    FROM pg_class AS class
    JOIN pg_namespace AS namespace ON namespace.oid = class.relnamespace
    JOIN pg_roles AS owner ON owner.oid = class.relowner
    WHERE namespace.nspname = 'public'
      AND class.relkind IN ('r', 'p', 'S', 'v', 'm', 'f')
      AND owner.rolname <> 'ai_hub_migration'
      AND NOT EXISTS (
        SELECT 1
        FROM pg_depend AS dependency
        WHERE dependency.classid = 'pg_class'::regclass
          AND dependency.objid = class.oid
          AND dependency.deptype = 'e'
      )
  LOOP
    RAISE EXCEPTION 'MIGRATION_OWNER_REQUIRED: %', relation.relname;
  END LOOP;

  IF NOT (
    has_table_privilege('ai_hub_api', 'public.applications', 'SELECT')
    AND has_table_privilege('ai_hub_api', 'public.applications', 'INSERT')
    AND has_table_privilege('ai_hub_api', 'public.applications', 'UPDATE')
    AND has_table_privilege('ai_hub_api', 'public.applications', 'DELETE')
  ) THEN
    RAISE EXCEPTION 'API_CRUD_PRIVILEGES_REQUIRED';
  END IF;

  IF has_table_privilege('ai_hub_api', 'public.security_audit_events', 'UPDATE')
    OR has_table_privilege('ai_hub_api', 'public.security_audit_events', 'DELETE')
    OR has_table_privilege('ai_hub_api', 'public.outbox_events', 'UPDATE')
    OR has_table_privilege('ai_hub_api', 'public.outbox_events', 'DELETE')
    OR has_table_privilege('ai_hub_api', 'public.kysely_migration', 'SELECT') THEN
    RAISE EXCEPTION 'API_PROTECTED_TABLE_PRIVILEGES_TOO_BROAD';
  END IF;

  IF NOT (
    has_table_privilege('ai_hub_worker', 'public.outbox_events', 'SELECT')
    AND has_table_privilege('ai_hub_worker', 'public.outbox_events', 'UPDATE')
    AND has_table_privilege('ai_hub_worker', 'public.notifications', 'SELECT')
    AND has_table_privilege('ai_hub_worker', 'public.notifications', 'UPDATE')
    AND has_table_privilege('ai_hub_worker', 'public.analytics_behavior_events', 'INSERT')
    AND has_table_privilege('ai_hub_worker', 'public.analytics_audit_events', 'INSERT')
    AND has_table_privilege('ai_hub_worker', 'public.analytics_daily_aggregates', 'SELECT')
    AND has_table_privilege('ai_hub_worker', 'public.analytics_daily_aggregates', 'INSERT')
    AND has_table_privilege('ai_hub_worker', 'public.analytics_daily_aggregates', 'UPDATE')
    AND has_table_privilege('ai_hub_worker', 'public.analytics_daily_aggregates', 'DELETE')
  ) THEN
    RAISE EXCEPTION 'WORKER_RUNTIME_PRIVILEGES_INCOMPLETE';
  END IF;
  IF has_table_privilege('ai_hub_worker', 'public.applications', 'UPDATE')
    OR has_table_privilege('ai_hub_worker', 'public.outbox_events', 'DELETE') THEN
    RAISE EXCEPTION 'WORKER_PRIVILEGES_TOO_BROAD';
  END IF;

  IF NOT pg_has_role('ai_hub_observability', 'pg_monitor', 'MEMBER') THEN
    RAISE EXCEPTION 'OBSERVABILITY_PG_MONITOR_REQUIRED';
  END IF;
  IF has_table_privilege('ai_hub_observability', 'public.applications', 'SELECT')
    OR has_table_privilege('ai_hub_observability', 'public.outbox_events', 'SELECT') THEN
    RAISE EXCEPTION 'OBSERVABILITY_BUSINESS_TABLE_ACCESS_FORBIDDEN';
  END IF;
END
$verify$;

SELECT json_build_object(
  'ok', true,
  'database', current_database(),
  'roles', ARRAY[
    'ai_hub_migration',
    'ai_hub_api',
    'ai_hub_worker',
    'ai_hub_observability'
  ]
) AS role_verification;
