import { sql, type Kysely } from "kysely";

/** 互动与反馈的状态、权限相关数据完整性约束。 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    update application_feedback
       set resolved_at = coalesce(resolved_at, updated_at),
           resolution = coalesce(resolution, '历史数据已迁移')
     where status in ('resolved', 'closed')
       and (resolved_at is null or resolution is null)
  `.execute(db);

  await sql`
    alter table application_feedback
      drop constraint if exists application_feedback_type_check,
      drop constraint if exists application_feedback_status_check,
      drop constraint if exists application_feedback_resolution_check
  `.execute(db);
  await sql`
    alter table application_feedback
      add constraint application_feedback_type_check
        check (type in ('bug', 'suggestion', 'content_issue')),
      add constraint application_feedback_status_check
        check (status in ('open', 'in_progress', 'resolved', 'closed')),
      add constraint application_feedback_resolution_check
        check ((status in ('resolved', 'closed')) = (resolved_at is not null)
          and ((status in ('resolved', 'closed')) = (resolution is not null)))
  `.execute(db);

  await sql`
    alter table application_comments
      drop constraint if exists application_comments_kind_check
  `.execute(db);
  await sql`
    alter table application_comments
      add constraint application_comments_kind_check
        check (comment_kind in ('user', 'official'))
  `.execute(db);

  await sql`
    do $$ begin
      if not exists (select 1 from pg_constraint where conname = 'application_feedback_creator_fk') then
        alter table application_feedback
          add constraint application_feedback_creator_fk
          foreign key (creator_employee_id) references employees(employee_id)
          on delete restrict not valid;
      end if;
      if not exists (select 1 from pg_constraint where conname = 'application_feedback_assignee_fk') then
        alter table application_feedback
          add constraint application_feedback_assignee_fk
          foreign key (assignee_employee_id) references employees(employee_id)
          on delete restrict not valid;
      end if;
    end $$;
  `.execute(db);
  await sql`alter table application_feedback validate constraint application_feedback_creator_fk`.execute(
    db,
  );
  await sql`alter table application_feedback validate constraint application_feedback_assignee_fk`.execute(
    db,
  );
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`alter table application_feedback drop constraint if exists application_feedback_assignee_fk`.execute(
    db,
  );
  await sql`alter table application_feedback drop constraint if exists application_feedback_creator_fk`.execute(
    db,
  );
  await sql`alter table application_comments drop constraint if exists application_comments_kind_check`.execute(
    db,
  );
  await sql`alter table application_feedback
    drop constraint if exists application_feedback_resolution_check,
    drop constraint if exists application_feedback_status_check,
    drop constraint if exists application_feedback_type_check`.execute(db);
}
