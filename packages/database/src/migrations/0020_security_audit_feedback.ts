import { sql, type Kysely } from "kysely";

/** 统一安全审计、审计导出作业、应用反馈与交付行为状态字段。 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    create table if not exists security_audit_events (
      audit_event_id uuid primary key default gen_random_uuid(),
      trace_id text,
      module text not null,
      action text not null,
      actor_employee_id text,
      subject text,
      result text not null default 'success',
      risk text not null default 'low',
      ip_address text,
      user_agent text,
      details jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    )
  `.execute(db);

  await sql`
    create index if not exists security_audit_events_created_idx
      on security_audit_events(created_at)
  `.execute(db);
  await sql`
    create index if not exists security_audit_events_module_idx
      on security_audit_events(module, created_at)
  `.execute(db);
  await sql`
    create index if not exists security_audit_events_actor_idx
      on security_audit_events(actor_employee_id, created_at)
  `.execute(db);
  await sql`
    create index if not exists security_audit_events_trace_idx
      on security_audit_events(trace_id)
  `.execute(db);

  await sql`
    create table if not exists security_audit_export_jobs (
      export_job_id uuid primary key default gen_random_uuid(),
      requested_by_employee_id text not null,
      filter_snapshot jsonb not null default '{}'::jsonb,
      status text not null default 'queued',
      result_storage_key text,
      expires_at timestamptz,
      failure_code text,
      created_at timestamptz not null default now(),
      completed_at timestamptz
    )
  `.execute(db);

  await sql`
    create table if not exists application_feedback (
      feedback_id uuid primary key default gen_random_uuid(),
      application_id uuid not null references applications(application_id) on delete cascade,
      application_version_id uuid references application_versions(application_version_id) on delete set null,
      creator_employee_id text not null,
      type text not null,
      body text not null,
      status text not null default 'open',
      assignee_employee_id text,
      resolution text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      resolved_at timestamptz
    )
  `.execute(db);

  await sql`
    create index if not exists application_feedback_application_idx
      on application_feedback(application_id, created_at)
  `.execute(db);

  await sql`
    alter table catalog_delivery_actions
      add column if not exists idempotency_key text,
      add column if not exists status text not null default 'initiated',
      add column if not exists completed_at timestamptz,
      add column if not exists failure_code text
  `.execute(db);

  await sql`
    alter table application_comments
      add column if not exists comment_kind text not null default 'user'
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    alter table application_comments
      drop column if exists comment_kind
  `.execute(db);

  await sql`
    alter table catalog_delivery_actions
      drop column if exists idempotency_key,
      drop column if exists status,
      drop column if exists completed_at,
      drop column if exists failure_code
  `.execute(db);

  await sql`drop index if exists application_feedback_application_idx`.execute(
    db,
  );
  await sql`drop table if exists application_feedback`.execute(db);
  await sql`drop table if exists security_audit_export_jobs`.execute(db);
  await sql`drop index if exists security_audit_events_trace_idx`.execute(db);
  await sql`drop index if exists security_audit_events_actor_idx`.execute(db);
  await sql`drop index if exists security_audit_events_module_idx`.execute(db);
  await sql`drop index if exists security_audit_events_created_idx`.execute(db);
  await sql`drop table if exists security_audit_events`.execute(db);
}
