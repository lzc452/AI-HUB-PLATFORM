import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("catalog_categories")
    .addColumn("category_id", "varchar(64)", (column) => column.primaryKey())
    .addColumn("name", "varchar(120)", (column) => column.notNull())
    .addColumn("sort_order", "integer", (column) =>
      column.notNull().defaultTo(0),
    )
    .addColumn("enabled", "boolean", (column) =>
      column.notNull().defaultTo(true),
    )
    .execute();

  await db.schema
    .createTable("catalog_tags")
    .addColumn("tag_id", "varchar(64)", (column) => column.primaryKey())
    .addColumn("name", "varchar(120)", (column) => column.notNull())
    .addColumn("enabled", "boolean", (column) =>
      column.notNull().defaultTo(true),
    )
    .execute();

  await db.schema
    .createTable("application_audiences")
    .addColumn("audience_id", "uuid", (column) =>
      column.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("application_id", "uuid", (column) =>
      column.notNull().references("applications.application_id"),
    )
    .addColumn("audience_type", "varchar(16)", (column) => column.notNull())
    .addColumn("department_id", "varchar(64)", (column) =>
      column.references("departments.department_id"),
    )
    .addColumn("employee_id", "varchar(64)", (column) =>
      column.references("employees.employee_id"),
    )
    .addColumn("include_children", "boolean", (column) =>
      column.notNull().defaultTo(false),
    )
    .execute();

  await sql`
    alter table application_audiences
    add constraint application_audiences_type_check
    check (audience_type in ('all', 'department', 'employee'))
  `.execute(db);
  await sql`
    alter table application_audiences
    add constraint application_audiences_target_check
    check (
      (audience_type = 'all' and department_id is null and employee_id is null)
      or (audience_type = 'department' and department_id is not null and employee_id is null)
      or (audience_type = 'employee' and department_id is null and employee_id is not null)
    )
  `.execute(db);

  await db.schema
    .createTable("application_tag_links")
    .addColumn("application_id", "uuid", (column) =>
      column.notNull().references("applications.application_id"),
    )
    .addColumn("tag_id", "varchar(64)", (column) =>
      column.notNull().references("catalog_tags.tag_id"),
    )
    .addPrimaryKeyConstraint("application_tag_links_pk", [
      "application_id",
      "tag_id",
    ])
    .execute();

  await db.schema
    .createTable("application_catalog_metadata")
    .addColumn("application_id", "uuid", (column) =>
      column.primaryKey().references("applications.application_id"),
    )
    .addColumn("category_id", "varchar(64)", (column) =>
      column.notNull().references("catalog_categories.category_id"),
    )
    .addColumn("application_type", "varchar(32)", (column) =>
      column.notNull(),
    )
    .addColumn("search_name", "text", (column) => column.notNull())
    .addColumn("search_summary", "text", (column) => column.notNull())
    .addColumn("search_pinyin", "text", (column) => column.notNull())
    .addColumn("search_initials", "text", (column) => column.notNull())
    .addColumn("recommendation_rank", "integer", (column) =>
      column.notNull().defaultTo(0),
    )
    .addColumn("health_status", "varchar(16)", (column) =>
      column.notNull().defaultTo("unknown"),
    )
    .addColumn("deprecated_reason", "text")
    .addColumn("replacement_application_id", "uuid", (column) =>
      column.references("applications.application_id"),
    )
    .execute();

  await sql`
    alter table application_catalog_metadata
    add constraint application_catalog_metadata_health_check
    check (health_status in ('unknown', 'healthy', 'degraded', 'failed'))
  `.execute(db);

  await db.schema
    .createTable("application_catalog_labels")
    .addColumn("application_id", "uuid", (column) =>
      column.notNull().references("applications.application_id"),
    )
    .addColumn("label", "varchar(32)", (column) => column.notNull())
    .addPrimaryKeyConstraint("application_catalog_labels_pk", [
      "application_id",
      "label",
    ])
    .execute();

  await db.schema
    .createTable("catalog_delivery_actions")
    .addColumn("action_id", "uuid", (column) =>
      column.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("application_id", "uuid", (column) =>
      column.notNull().references("applications.application_id"),
    )
    .addColumn("application_version_id", "uuid", (column) =>
      column.references("application_versions.application_version_id"),
    )
    .addColumn("actor_employee_id", "varchar(64)", (column) =>
      column.notNull().references("employees.employee_id"),
    )
    .addColumn("action_type", "varchar(32)", (column) => column.notNull())
    .addColumn("channel", "varchar(32)")
    .addColumn("occurred_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await sql`
    alter table catalog_delivery_actions
    add constraint catalog_delivery_actions_type_check
    check (action_type in ('web_redirect', 'package_download', 'qr_display'))
  `.execute(db);

  await db.schema
    .createTable("application_likes")
    .addColumn("application_id", "uuid", (column) =>
      column.notNull().references("applications.application_id"),
    )
    .addColumn("employee_id", "varchar(64)", (column) =>
      column.notNull().references("employees.employee_id"),
    )
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`),
    )
    .addPrimaryKeyConstraint("application_likes_pk", [
      "application_id",
      "employee_id",
    ])
    .execute();

  await db.schema
    .createTable("application_ratings")
    .addColumn("rating_id", "uuid", (column) =>
      column.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("application_id", "uuid", (column) =>
      column.notNull().references("applications.application_id"),
    )
    .addColumn("application_version_id", "uuid", (column) =>
      column.notNull().references("application_versions.application_version_id"),
    )
    .addColumn("employee_id", "varchar(64)", (column) =>
      column.notNull().references("employees.employee_id"),
    )
    .addColumn("stars", "integer", (column) => column.notNull())
    .addColumn("body", "text")
    .addColumn("display_anonymously", "boolean", (column) =>
      column.notNull().defaultTo(false),
    )
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`),
    )
    .addColumn("updated_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`),
    )
    .addUniqueConstraint("application_ratings_employee_application_unique", [
      "application_id",
      "employee_id",
    ])
    .execute();
  await sql`
    alter table application_ratings
    add constraint application_ratings_stars_check check (stars between 1 and 5)
  `.execute(db);

  await db.schema
    .createTable("application_comments")
    .addColumn("comment_id", "uuid", (column) =>
      column.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("application_id", "uuid", (column) =>
      column.notNull().references("applications.application_id"),
    )
    .addColumn("application_version_id", "uuid", (column) =>
      column.notNull().references("application_versions.application_version_id"),
    )
    .addColumn("parent_comment_id", "uuid")
    .addColumn("author_employee_id", "varchar(64)", (column) =>
      column.notNull().references("employees.employee_id"),
    )
    .addColumn("body", "text", (column) => column.notNull())
    .addColumn("display_anonymously", "boolean", (column) =>
      column.notNull().defaultTo(false),
    )
    .addColumn("hidden_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`),
    )
    .addColumn("updated_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`),
    )
    .addForeignKeyConstraint(
      "application_comments_parent_fk",
      ["parent_comment_id"],
      "application_comments",
      ["comment_id"],
    )
    .execute();

  await db.schema
    .createTable("application_reports")
    .addColumn("report_id", "uuid", (column) =>
      column.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("application_id", "uuid", (column) =>
      column.notNull().references("applications.application_id"),
    )
    .addColumn("comment_id", "uuid", (column) =>
      column.notNull().references("application_comments.comment_id"),
    )
    .addColumn("reporter_employee_id", "varchar(64)", (column) =>
      column.notNull().references("employees.employee_id"),
    )
    .addColumn("reason", "text", (column) => column.notNull())
    .addColumn("status", "varchar(16)", (column) =>
      column.notNull().defaultTo("open"),
    )
    .addColumn("resolved_by_employee_id", "varchar(64)", (column) =>
      column.references("employees.employee_id"),
    )
    .addColumn("resolved_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`),
    )
    .execute();
  await sql`
    alter table application_reports
    add constraint application_reports_status_check
    check (status in ('open', 'dismissed', 'hidden', 'restored'))
  `.execute(db);

  await db.schema
    .createIndex("application_catalog_metadata_search_name_idx")
    .on("application_catalog_metadata")
    .column("search_name")
    .execute();
  await db.schema
    .createIndex("application_catalog_metadata_search_pinyin_idx")
    .on("application_catalog_metadata")
    .column("search_pinyin")
    .execute();
  await db.schema
    .createIndex("application_catalog_metadata_search_initials_idx")
    .on("application_catalog_metadata")
    .column("search_initials")
    .execute();
  await db.schema
    .createIndex("catalog_delivery_actions_application_idx")
    .on("catalog_delivery_actions")
    .columns(["application_id", "action_type", "occurred_at"])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex("catalog_delivery_actions_application_idx").execute();
  await db.schema
    .dropIndex("application_catalog_metadata_search_initials_idx")
    .execute();
  await db.schema
    .dropIndex("application_catalog_metadata_search_pinyin_idx")
    .execute();
  await db.schema
    .dropIndex("application_catalog_metadata_search_name_idx")
    .execute();
  await db.schema.dropTable("application_reports").execute();
  await db.schema.dropTable("application_comments").execute();
  await db.schema.dropTable("application_ratings").execute();
  await db.schema.dropTable("application_likes").execute();
  await db.schema.dropTable("catalog_delivery_actions").execute();
  await db.schema.dropTable("application_catalog_labels").execute();
  await db.schema.dropTable("application_catalog_metadata").execute();
  await db.schema.dropTable("application_tag_links").execute();
  await db.schema.dropTable("application_audiences").execute();
  await db.schema.dropTable("catalog_tags").execute();
  await db.schema.dropTable("catalog_categories").execute();
}
