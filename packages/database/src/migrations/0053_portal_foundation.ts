import { sql, type Kysely } from "kysely";

/** AI Hub Portal 一期独立资源、互动、内容与策展数据。 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    create table portal_skills (
      skill_id uuid primary key default gen_random_uuid(),
      owner_employee_id varchar(64) not null references employees(employee_id),
      skill_slug varchar(120) not null,
      name varchar(160) not null,
      summary text not null,
      metadata jsonb not null default '{}'::jsonb,
      status varchar(24) not null default 'draft',
      current_version_id uuid null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint portal_skills_owner_slug_unique unique(owner_employee_id, skill_slug),
      constraint portal_skills_status_check check(status in ('draft','in_review','approved','published','withdrawn','archived'))
    );
    create table portal_skill_versions (
      skill_version_id uuid primary key default gen_random_uuid(),
      skill_id uuid not null references portal_skills(skill_id) on delete cascade,
      version varchar(64) not null,
      changelog text not null default '',
      metadata jsonb not null default '{}'::jsonb,
      scan_status varchar(16) not null default 'pending',
      created_by_employee_id varchar(64) not null references employees(employee_id),
      created_at timestamptz not null default now(),
      constraint portal_skill_versions_unique unique(skill_id, version),
      constraint portal_skill_versions_scan_check check(scan_status in ('pending','passed','failed'))
    );
    alter table portal_skills add constraint portal_skills_current_version_fk foreign key(current_version_id) references portal_skill_versions(skill_version_id);
    create table portal_skill_files (
      skill_file_id uuid primary key default gen_random_uuid(),
      skill_version_id uuid not null references portal_skill_versions(skill_version_id) on delete cascade,
      name varchar(255) not null,
      storage_key text not null,
      mime_type varchar(160) not null,
      size_bytes bigint not null,
      sha256 varchar(64),
      scan_status varchar(16) not null default 'pending',
      created_at timestamptz not null default now(),
      constraint portal_skill_files_scan_check check(scan_status in ('pending','passed','failed'))
    );

    create table portal_plugins (
      plugin_id uuid primary key default gen_random_uuid(),
      owner_employee_id varchar(64) not null references employees(employee_id),
      plugin_slug varchar(120) not null,
      name varchar(160) not null,
      summary text not null,
      metadata jsonb not null default '{}'::jsonb,
      status varchar(24) not null default 'draft',
      current_version_id uuid null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint portal_plugins_owner_slug_unique unique(owner_employee_id, plugin_slug),
      constraint portal_plugins_status_check check(status in ('draft','in_review','approved','published','withdrawn','archived'))
    );
    create table portal_plugin_versions (
      plugin_version_id uuid primary key default gen_random_uuid(),
      plugin_id uuid not null references portal_plugins(plugin_id) on delete cascade,
      version varchar(64) not null,
      changelog text not null default '',
      metadata jsonb not null default '{}'::jsonb,
      scan_status varchar(16) not null default 'pending',
      created_by_employee_id varchar(64) not null references employees(employee_id),
      created_at timestamptz not null default now(),
      constraint portal_plugin_versions_unique unique(plugin_id, version),
      constraint portal_plugin_versions_scan_check check(scan_status in ('pending','passed','failed'))
    );
    alter table portal_plugins add constraint portal_plugins_current_version_fk foreign key(current_version_id) references portal_plugin_versions(plugin_version_id);

    create table portal_mcps (
      mcp_id uuid primary key default gen_random_uuid(),
      owner_employee_id varchar(64) not null references employees(employee_id),
      mcp_slug varchar(120) not null unique,
      name varchar(160) not null,
      summary text not null,
      metadata jsonb not null default '{}'::jsonb,
      status varchar(24) not null default 'draft',
      current_version_id uuid null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint portal_mcps_status_check check(status in ('draft','in_review','approved','published','withdrawn','archived'))
    );
    create table portal_mcp_versions (
      mcp_version_id uuid primary key default gen_random_uuid(),
      mcp_id uuid not null references portal_mcps(mcp_id) on delete cascade,
      version varchar(64) not null,
      changelog text not null default '',
      metadata jsonb not null default '{}'::jsonb,
      scan_status varchar(16) not null default 'pending',
      created_by_employee_id varchar(64) not null references employees(employee_id),
      created_at timestamptz not null default now(),
      constraint portal_mcp_versions_unique unique(mcp_id, version),
      constraint portal_mcp_versions_scan_check check(scan_status in ('pending','passed','failed'))
    );
    alter table portal_mcps add constraint portal_mcps_current_version_fk foreign key(current_version_id) references portal_mcp_versions(mcp_version_id);

    create table portal_skill_packages (
      skill_package_id uuid primary key default gen_random_uuid(),
      owner_employee_id varchar(64) not null references employees(employee_id),
      package_slug varchar(120) not null unique,
      name varchar(160) not null,
      summary text not null,
      status varchar(24) not null default 'draft',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint portal_skill_packages_status_check check(status in ('draft','in_review','approved','published','withdrawn','archived'))
    );
    create table portal_skill_package_items (
      skill_package_id uuid not null references portal_skill_packages(skill_package_id) on delete cascade,
      skill_id uuid not null references portal_skills(skill_id),
      sort_order integer not null default 0,
      primary key(skill_package_id, skill_id)
    );

    create table portal_app_hunt_periods (
      period_id uuid primary key default gen_random_uuid(),
      name varchar(160) not null,
      starts_at timestamptz not null,
      ends_at timestamptz not null,
      status varchar(16) not null default 'scheduled',
      created_at timestamptz not null default now(),
      constraint portal_app_hunt_periods_status_check check(status in ('scheduled','active','closed')),
      constraint portal_app_hunt_periods_range_check check(ends_at > starts_at)
    );
    create table portal_app_hunt_entries (
      entry_id uuid primary key default gen_random_uuid(),
      period_id uuid not null references portal_app_hunt_periods(period_id) on delete cascade,
      application_id uuid not null references applications(application_id),
      nominated_by_employee_id varchar(64) not null references employees(employee_id),
      created_at timestamptz not null default now(),
      constraint portal_app_hunt_entries_unique unique(period_id, application_id)
    );
    create table portal_app_hunt_votes (
      vote_id uuid primary key default gen_random_uuid(),
      period_id uuid not null references portal_app_hunt_periods(period_id) on delete cascade,
      entry_id uuid not null references portal_app_hunt_entries(entry_id) on delete cascade,
      employee_id varchar(64) not null references employees(employee_id),
      active boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint portal_app_hunt_votes_unique unique(period_id, entry_id, employee_id)
    );

    create table portal_department_profiles (
      department_id varchar(64) primary key references departments(department_id) on delete cascade,
      description text not null default '',
      cover_storage_key text,
      metadata jsonb not null default '{}'::jsonb,
      updated_by_employee_id varchar(64) references employees(employee_id),
      updated_at timestamptz not null default now()
    );
    create table portal_favorites (
      favorite_id uuid primary key default gen_random_uuid(),
      employee_id varchar(64) not null references employees(employee_id),
      resource_type varchar(16) not null,
      resource_id uuid not null,
      created_at timestamptz not null default now(),
      constraint portal_favorites_resource_check check(resource_type in ('app','skill','plugin','mcp')),
      constraint portal_favorites_unique unique(employee_id, resource_type, resource_id)
    );
    create table portal_resource_comments (
      comment_id uuid primary key default gen_random_uuid(),
      resource_type varchar(16) not null,
      resource_id uuid not null,
      parent_comment_id uuid references portal_resource_comments(comment_id),
      author_employee_id varchar(64) not null references employees(employee_id),
      body text not null,
      hidden_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint portal_resource_comments_resource_check check(resource_type in ('skill','plugin','mcp')),
      constraint portal_resource_comments_body_check check(length(btrim(body)) between 1 and 4000)
    );
    create table portal_content_pages (
      page_key varchar(80) primary key,
      title varchar(200) not null,
      body_markdown text not null,
      status varchar(16) not null default 'draft',
      updated_by_employee_id varchar(64) references employees(employee_id),
      published_at timestamptz,
      updated_at timestamptz not null default now(),
      constraint portal_content_pages_status_check check(status in ('draft','published','archived'))
    );
    create table portal_curations (
      curation_id uuid primary key default gen_random_uuid(),
      slot_key varchar(80) not null,
      resource_type varchar(24) not null,
      resource_id varchar(120) not null,
      sort_order integer not null default 0,
      enabled boolean not null default true,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint portal_curations_unique unique(slot_key, resource_type, resource_id)
    );

    create or replace function portal_validate_resource_comment_parent()
    returns trigger language plpgsql as $$
    declare parent_row portal_resource_comments%rowtype;
    begin
      if new.parent_comment_id is null then return new; end if;
      select * into parent_row from portal_resource_comments where comment_id = new.parent_comment_id;
      if not found or parent_row.resource_type <> new.resource_type or parent_row.resource_id <> new.resource_id then
        raise exception 'PORTAL_PARENT_COMMENT_NOT_FOUND' using errcode = '23514';
      end if;
      if parent_row.parent_comment_id is not null then
        raise exception 'PORTAL_REPLY_DEPTH_EXCEEDED' using errcode = '23514';
      end if;
      return new;
    end $$;
    create trigger portal_resource_comments_parent_guard
      before insert or update of parent_comment_id, resource_type, resource_id
      on portal_resource_comments for each row
      execute function portal_validate_resource_comment_parent();

    create or replace function portal_validate_skill_package_item()
    returns trigger language plpgsql as $$
    begin
      if not exists(select 1 from portal_skills where skill_id = new.skill_id and status = 'published') then
        raise exception 'PORTAL_SKILL_PACKAGE_REQUIRES_PUBLISHED_SKILL' using errcode = '23514';
      end if;
      return new;
    end $$;
    create trigger portal_skill_package_items_published_guard
      before insert or update of skill_id on portal_skill_package_items for each row
      execute function portal_validate_skill_package_item();

    create index portal_skills_status_updated_idx on portal_skills(status, updated_at desc);
    create index portal_plugins_status_updated_idx on portal_plugins(status, updated_at desc);
    create index portal_mcps_status_updated_idx on portal_mcps(status, updated_at desc);
    create index portal_favorites_employee_created_idx on portal_favorites(employee_id, created_at desc);
    create index portal_resource_comments_resource_idx on portal_resource_comments(resource_type, resource_id, created_at desc);
    create index portal_resource_comments_author_idx on portal_resource_comments(author_employee_id, created_at desc);
    create index portal_resource_comments_parent_idx on portal_resource_comments(parent_comment_id) where parent_comment_id is not null;
    create index application_comments_author_created_idx on application_comments(author_employee_id, created_at desc);
    create index application_comments_parent_idx on application_comments(parent_comment_id) where parent_comment_id is not null;
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    drop index if exists application_comments_parent_idx;
    drop index if exists application_comments_author_created_idx;
    drop table if exists portal_curations;
    drop table if exists portal_content_pages;
    drop trigger if exists portal_resource_comments_parent_guard on portal_resource_comments;
    drop function if exists portal_validate_resource_comment_parent();
    drop table if exists portal_resource_comments;
    drop table if exists portal_favorites;
    drop table if exists portal_department_profiles;
    drop table if exists portal_app_hunt_votes;
    drop table if exists portal_app_hunt_entries;
    drop table if exists portal_app_hunt_periods;
    drop trigger if exists portal_skill_package_items_published_guard on portal_skill_package_items;
    drop function if exists portal_validate_skill_package_item();
    drop table if exists portal_skill_package_items;
    drop table if exists portal_skill_packages;
    alter table if exists portal_mcps drop constraint if exists portal_mcps_current_version_fk;
    drop table if exists portal_mcp_versions;
    drop table if exists portal_mcps;
    alter table if exists portal_plugins drop constraint if exists portal_plugins_current_version_fk;
    drop table if exists portal_plugin_versions;
    drop table if exists portal_plugins;
    drop table if exists portal_skill_files;
    alter table if exists portal_skills drop constraint if exists portal_skills_current_version_fk;
    drop table if exists portal_skill_versions;
    drop table if exists portal_skills;
  `.execute(db);
}
