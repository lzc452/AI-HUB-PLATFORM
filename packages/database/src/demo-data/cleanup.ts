import { sql, type Kysely } from "kysely";
import type { DatabaseSchema } from "../schema.js";

/**
 * Tables to clean in reverse foreign-key dependency order.
 * Each entry defines which demo-data rows to delete.
 *
 * Identification strategy:
 * - UUID PK tables: match on the domain-specific prefix (e.g., applications = "00000001-%")
 * - Identity tables: match on "demo-%" / "DEMO-%" string ID prefixes
 * - Junction tables: match on the FK referencing a demo root entity
 * - Outbox tables: match on "demo:%" idempotency key prefix
 */

interface CleanupStep {
  table: string;
  /** SQL WHERE clause identifying demo rows. */
  where: string;
}

const CLEANUP_ORDER: readonly CleanupStep[] = Object.freeze([
  // ═══ FK LEAF TABLES ═══

  { table: "ai_demand_comment_likes", where: `comment_id::text LIKE '00000011-%'` },
  { table: "ai_demand_reports", where: `demand_id::text LIKE '00000010-%'` },
  { table: "ai_demand_comments", where: `demand_id::text LIKE '00000010-%'` },
  { table: "ai_demand_likes", where: `demand_id::text LIKE '00000010-%'` },
  { table: "ai_demand_progress_updates", where: `demand_id::text LIKE '00000010-%'` },
  { table: "ai_demand_pilots", where: `demand_id::text LIKE '00000010-%'` },
  { table: "ai_demand_applications", where: `demand_id::text LIKE '00000010-%'` },
  { table: "ai_demand_collaborators", where: `demand_id::text LIKE '00000010-%'` },
  { table: "ai_demand_audit_events", where: `demand_id::text LIKE '00000010-%'` },

  { table: "application_reports", where: `application_id::text LIKE '00000001-%'` },
  { table: "application_comments", where: `application_id::text LIKE '00000001-%'` },
  { table: "application_ratings", where: `application_id::text LIKE '00000001-%'` },
  { table: "application_likes", where: `application_id::text LIKE '00000001-%'` },

  { table: "application_tag_links", where: `application_id::text LIKE '00000001-%'` },
  { table: "application_audiences", where: `application_id::text LIKE '00000001-%'` },
  { table: "application_catalog_metadata", where: `application_id::text LIKE '00000001-%'` },
  { table: "application_catalog_labels", where: `application_id::text LIKE '00000001-%'` },
  { table: "catalog_delivery_actions", where: `application_id::text LIKE '00000001-%'` },

  { table: "application_audit_events", where: `application_id::text LIKE '00000001-%'` },
  { table: "application_review_queue", where: `application_id::text LIKE '00000001-%'` },
  { table: "application_reviews", where: `application_id::text LIKE '00000001-%'` },

  { table: "application_deliveries", where: `application_id::text LIKE '00000001-%'` },
  { table: "application_versions", where: `application_id::text LIKE '00000001-%'` },

  // ═══ ROOT ENTITY TABLES ═══

  { table: "applications", where: `application_id::text LIKE '00000001-%'` },
  { table: "ai_demands", where: `demand_id::text LIKE '00000010-%'` },

  { table: "notifications", where: `idempotency_key LIKE 'demo:notification:%'` },

  { table: "analytics_daily_aggregates", where: `metric_key = ANY(ARRAY['app_views','app_likes','app_ratings','app_comments','app_delivery_actions','demand_created','demand_published','demand_completed','demand_likes','demand_comments','active_users','total_events'])` },
  { table: "analytics_behavior_events", where: `idempotency_key LIKE 'demo:analytics:%'` },
  { table: "analytics_audit_events", where: `audit_event_id::text LIKE '00000041-%'` },
  { table: "analytics_export_jobs", where: `export_id::text LIKE '00000042-%'` },

  { table: "outbox_events", where: `idempotency_key LIKE 'demo:outbox:%'` },

  { table: "catalog_tags", where: `tag_id = ANY(ARRAY['ai','attendance','productivity','reporting','collaboration','automation','security','mobile'])` },
  { table: "catalog_categories", where: `category_id = ANY(ARRAY['productivity','ai','reporting','collaboration','automation'])` },

  { table: "identity_audit_events", where: `actor_employee_id LIKE 'DEMO-%'` },
  { table: "employee_roles", where: `employee_id LIKE 'DEMO-%'` },
  { table: "department_memberships", where: `employee_id LIKE 'DEMO-%'` },

  { table: "employees", where: `employee_id LIKE 'DEMO-%'` },
  { table: "departments", where: `department_id LIKE 'demo-%'` },
]);

/**
 * Delete all demo data from the database in reverse foreign-key order.
 *
 * Preserves:
 * - Migration-seeded system roles (roles table)
 * - Migration-seeded metric definitions (analytics_metric_definitions)
 * - Migration bookkeeping (kysely_migration, kysely_migration_lock)
 * - Any non-demo data inserted during local development
 */
export async function cleanDemoData(
  db: Kysely<DatabaseSchema>,
): Promise<void> {
  for (const step of CLEANUP_ORDER) {
    await sql`DELETE FROM ${sql.ref(step.table)} WHERE ${sql.raw(step.where)}`.execute(
      db,
    );
  }
}
