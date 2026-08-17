import { sql, type Kysely } from "kysely";

/** 组织角色与同步配置的引用、计数和单例约束。 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    delete from identity_sync_config where id is distinct from true
  `.execute(db);
  await sql`
    alter table identity_sync_config
      drop constraint if exists identity_sync_config_singleton_check
  `.execute(db);
  await sql`
    alter table identity_sync_config
      add constraint identity_sync_config_singleton_check check (id = true)
  `.execute(db);
  await sql`
    alter table identity_sync_run_items
      drop constraint if exists identity_sync_run_items_status_check,
      drop constraint if exists identity_sync_run_items_counts_check
  `.execute(db);
  await sql`
    alter table identity_sync_run_items
      add constraint identity_sync_run_items_status_check
        check (status in ('pending', 'processing', 'completed', 'failed')),
      add constraint identity_sync_run_items_counts_check
        check (processed_count >= 0 and success_count >= 0 and failure_count >= 0)
  `.execute(db);
  await sql`
    do $$ begin
      if not exists (select 1 from pg_constraint where conname = 'roles_created_by_employee_fk') then
        alter table roles
          add constraint roles_created_by_employee_fk
          foreign key (created_by_employee_id) references employees(employee_id)
          on delete restrict not valid;
      end if;
      if not exists (select 1 from pg_constraint where conname = 'identity_sync_config_updater_fk') then
        alter table identity_sync_config
          add constraint identity_sync_config_updater_fk
          foreign key (last_updated_by_employee_id) references employees(employee_id)
          on delete restrict not valid;
      end if;
    end $$;
  `.execute(db);
  await sql`alter table roles validate constraint roles_created_by_employee_fk`.execute(
    db,
  );
  await sql`alter table identity_sync_config validate constraint identity_sync_config_updater_fk`.execute(
    db,
  );
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`alter table identity_sync_config drop constraint if exists identity_sync_config_updater_fk`.execute(
    db,
  );
  await sql`alter table roles drop constraint if exists roles_created_by_employee_fk`.execute(
    db,
  );
  await sql`alter table identity_sync_run_items
    drop constraint if exists identity_sync_run_items_counts_check,
    drop constraint if exists identity_sync_run_items_status_check`.execute(db);
  await sql`alter table identity_sync_config drop constraint if exists identity_sync_config_singleton_check`.execute(
    db,
  );
}
