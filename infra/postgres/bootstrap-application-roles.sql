\set ON_ERROR_STOP on

-- 本脚本必须由 PostgreSQL 管理员连接到目标业务数据库后执行。
-- 密码只通过 psql 变量注入；不要把值写入文件、命令历史或发布日志。
\if :{?AI_HUB_DATABASE}
\else
  \echo '缺少 psql 变量 AI_HUB_DATABASE'
  \quit 3
\endif
\if :{?AI_HUB_MIGRATION_DB_PASSWORD}
\else
  \echo '缺少 psql 变量 AI_HUB_MIGRATION_DB_PASSWORD'
  \quit 3
\endif
\if :{?AI_HUB_API_DB_PASSWORD}
\else
  \echo '缺少 psql 变量 AI_HUB_API_DB_PASSWORD'
  \quit 3
\endif
\if :{?AI_HUB_WORKER_DB_PASSWORD}
\else
  \echo '缺少 psql 变量 AI_HUB_WORKER_DB_PASSWORD'
  \quit 3
\endif
\if :{?AI_HUB_OBSERVABILITY_DB_PASSWORD}
\else
  \echo '缺少 psql 变量 AI_HUB_OBSERVABILITY_DB_PASSWORD'
  \quit 3
\endif

SELECT format(
  'CREATE ROLE ai_hub_migration LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',
  :'AI_HUB_MIGRATION_DB_PASSWORD'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ai_hub_migration')
\gexec
SELECT format(
  'CREATE ROLE ai_hub_api LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',
  :'AI_HUB_API_DB_PASSWORD'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ai_hub_api')
\gexec
SELECT format(
  'CREATE ROLE ai_hub_worker LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',
  :'AI_HUB_WORKER_DB_PASSWORD'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ai_hub_worker')
\gexec
SELECT format(
  'CREATE ROLE ai_hub_observability LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',
  :'AI_HUB_OBSERVABILITY_DB_PASSWORD'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ai_hub_observability')
\gexec

ALTER ROLE ai_hub_migration
  WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
  PASSWORD :'AI_HUB_MIGRATION_DB_PASSWORD';
ALTER ROLE ai_hub_api
  WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
  PASSWORD :'AI_HUB_API_DB_PASSWORD';
ALTER ROLE ai_hub_worker
  WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
  PASSWORD :'AI_HUB_WORKER_DB_PASSWORD';
ALTER ROLE ai_hub_observability
  WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
  PASSWORD :'AI_HUB_OBSERVABILITY_DB_PASSWORD';

REVOKE CONNECT ON DATABASE :"AI_HUB_DATABASE" FROM PUBLIC;
GRANT CONNECT, CREATE ON DATABASE :"AI_HUB_DATABASE" TO ai_hub_migration;
GRANT CONNECT ON DATABASE :"AI_HUB_DATABASE"
  TO ai_hub_api, ai_hub_worker, ai_hub_observability;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
ALTER SCHEMA public OWNER TO ai_hub_migration;
GRANT USAGE ON SCHEMA public
  TO ai_hub_api, ai_hub_worker, ai_hub_observability;

-- 允许在首次迁移后接管仓库业务对象；扩展成员不会被改动。
DO $bootstrap$
DECLARE
  relation record;
  routine record;
BEGIN
  FOR relation IN
    SELECT class.relkind, namespace.nspname, class.relname
    FROM pg_class AS class
    JOIN pg_namespace AS namespace ON namespace.oid = class.relnamespace
    WHERE namespace.nspname = 'public'
      AND class.relkind IN ('r', 'p', 'S', 'v', 'm', 'f')
      AND NOT EXISTS (
        SELECT 1
        FROM pg_depend AS dependency
        WHERE dependency.classid = 'pg_class'::regclass
          AND dependency.objid = class.oid
          AND dependency.deptype = 'e'
      )
  LOOP
    EXECUTE format(
      'ALTER %s %I.%I OWNER TO ai_hub_migration',
      CASE relation.relkind
        WHEN 'S' THEN 'SEQUENCE'
        WHEN 'v' THEN 'VIEW'
        WHEN 'm' THEN 'MATERIALIZED VIEW'
        WHEN 'f' THEN 'FOREIGN TABLE'
        ELSE 'TABLE'
      END,
      relation.nspname,
      relation.relname
    );
  END LOOP;

  FOR routine IN
    SELECT
      procedure.prokind,
      namespace.nspname,
      procedure.proname,
      pg_get_function_identity_arguments(procedure.oid) AS identity_arguments
    FROM pg_proc AS procedure
    JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND NOT EXISTS (
        SELECT 1
        FROM pg_depend AS dependency
        WHERE dependency.classid = 'pg_proc'::regclass
          AND dependency.objid = procedure.oid
          AND dependency.deptype = 'e'
      )
  LOOP
    EXECUTE format(
      'ALTER %s %I.%I(%s) OWNER TO ai_hub_migration',
      CASE routine.prokind WHEN 'p' THEN 'PROCEDURE' ELSE 'FUNCTION' END,
      routine.nspname,
      routine.proname,
      routine.identity_arguments
    );
  END LOOP;
END
$bootstrap$;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ai_hub_migration;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ai_hub_migration;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ai_hub_api;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ai_hub_api;

-- 审计表只允许 API 追加和读取；Outbox 只允许 API 追加和读取。
DO $protected_tables$
DECLARE
  relation_name text;
BEGIN
  FOR relation_name IN
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND (
        table_name LIKE '%\_audit\_events' ESCAPE '\'
        OR table_name IN ('outbox_events', 'kysely_migration', 'kysely_migration_lock')
      )
  LOOP
    EXECUTE format(
      'REVOKE UPDATE, DELETE ON TABLE public.%I FROM ai_hub_api',
      relation_name
    );
  END LOOP;
END
$protected_tables$;
REVOKE ALL ON TABLE public.kysely_migration, public.kysely_migration_lock
  FROM ai_hub_api;

-- Worker 只处理 Outbox、通知与分析保留任务，不获得通用业务写权限。
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ai_hub_worker;
GRANT SELECT, UPDATE ON TABLE public.outbox_events, public.notifications
  TO ai_hub_worker;
GRANT SELECT ON TABLE
  public.application_review_queue,
  public.applications,
  public.ai_demands,
  public.ai_demand_collaborators,
  public.analytics_export_jobs,
  public.analytics_behavior_events
  TO ai_hub_worker;
GRANT SELECT, INSERT ON TABLE public.analytics_audit_events
  TO ai_hub_worker;
GRANT INSERT ON TABLE public.analytics_behavior_events, public.outbox_events
  TO ai_hub_worker;
GRANT DELETE ON TABLE public.analytics_daily_aggregates
  TO ai_hub_worker;
GRANT SELECT, INSERT, UPDATE ON TABLE public.analytics_daily_aggregates
  TO ai_hub_worker;

DO $retention_function$
BEGIN
  IF to_regprocedure('public.purge_analytics_behavior_events(timestamptz)') IS NOT NULL THEN
    GRANT EXECUTE ON FUNCTION public.purge_analytics_behavior_events(timestamptz)
      TO ai_hub_worker;
  END IF;
END
$retention_function$;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ai_hub_observability;
REVOKE CREATE ON SCHEMA public FROM ai_hub_api, ai_hub_worker, ai_hub_observability;
GRANT pg_monitor TO ai_hub_observability;

ALTER DEFAULT PRIVILEGES FOR ROLE ai_hub_migration IN SCHEMA public
  REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE ai_hub_migration IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE ai_hub_migration IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ai_hub_api;
ALTER DEFAULT PRIVILEGES FOR ROLE ai_hub_migration IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO ai_hub_api;

-- 默认权限会让后续新表先具备 API CRUD；每次 migration 后必须重新运行本脚本，
-- 以重新收紧新增审计/Outbox 表并显式授予 Worker 所需的窄权限。

SELECT json_build_object(
  'database', current_database(),
  'rolesBootstrapped', ARRAY[
    'ai_hub_migration',
    'ai_hub_api',
    'ai_hub_worker',
    'ai_hub_observability'
  ]
) AS bootstrap_result;
