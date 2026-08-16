import { sql, type Kysely } from "kysely";

/** 安全审计与导出任务的有限状态约束。 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    update security_audit_export_jobs
       set completed_at = coalesce(completed_at, created_at)
     where status in ('completed', 'failed') and completed_at is null
  `.execute(db);
  await sql`
    alter table security_audit_events
      drop constraint if exists security_audit_events_result_check,
      drop constraint if exists security_audit_events_risk_check
  `.execute(db);
  await sql`
    alter table security_audit_events
      add constraint security_audit_events_result_check
        check (result in ('success', 'failure', 'denied', 'error')),
      add constraint security_audit_events_risk_check
        check (risk in ('low', 'medium', 'high', 'critical'))
  `.execute(db);
  await sql`
    alter table security_audit_export_jobs
      drop constraint if exists security_audit_export_jobs_status_check,
      drop constraint if exists security_audit_export_jobs_completion_check
  `.execute(db);
  await sql`
    alter table security_audit_export_jobs
      add constraint security_audit_export_jobs_status_check
        check (status in ('queued', 'processing', 'completed', 'failed')),
      add constraint security_audit_export_jobs_completion_check
        check ((status in ('completed', 'failed')) = (completed_at is not null))
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`alter table security_audit_export_jobs
    drop constraint if exists security_audit_export_jobs_completion_check,
    drop constraint if exists security_audit_export_jobs_status_check`.execute(
    db,
  );
  await sql`alter table security_audit_events
    drop constraint if exists security_audit_events_risk_check,
    drop constraint if exists security_audit_events_result_check`.execute(db);
}
