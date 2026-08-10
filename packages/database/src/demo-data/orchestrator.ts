import type { Kysely } from "kysely";
import type { DatabaseSchema } from "../schema.js";
export { cleanDemoData } from "./cleanup.js";
import { cleanDemoData } from "./cleanup.js";
import {
  buildIdentityFixture,
  buildApplicationFixture,
  buildCatalogFixture,
  buildApplicationInteractionFixture,
  buildDemandFixture,
  buildDemandInteractionFixture,
  buildNotificationFixture,
  buildAnalyticsFixture,
} from "./fixtures/index.js";
import type {
  IdentityFixtureData,
  ApplicationFixtureData,
  CatalogFixtureData,
  AppInteractionFixtureData,
  DemandFixtureData,
  DemandInteractionFixtureData,
  NotificationFixtureData,
  AnalyticsFixtureData,
} from "./fixtures/index.js";

// ── public types ──────────────────────────────────────────────────────────────

export type DemoDatasetDomain =
  | "identity"
  | "application"
  | "catalog"
  | "demand"
  | "notification"
  | "analytics";

export interface SeedDemoDatasetOptions {
  anchorDate: Date;
  mode?: "reset" | "upsert";
  domains?: readonly DemoDatasetDomain[];
}

export interface SeedDemoDatasetResult {
  anchorDate: string;
  counts: Readonly<Record<DemoDatasetDomain, number>>;
  durationMs: number;
}

export interface DemoDatasetCheckFailure {
  domain: DemoDatasetDomain;
  message: string;
}

export interface DemoDatasetCheckResult {
  passed: boolean;
  anchorDate: string;
  failures: DemoDatasetCheckFailure[];
  durationMs: number;
}

// ── helpers ───────────────────────────────────────────────────────────────────

interface AllFixtureData {
  identity: IdentityFixtureData;
  application: ApplicationFixtureData;
  catalog: CatalogFixtureData;
  appInteraction: AppInteractionFixtureData;
  demand: DemandFixtureData;
  demandInteraction: DemandInteractionFixtureData;
  notification: NotificationFixtureData;
  analytics: AnalyticsFixtureData;
}

function buildAllFixtures(anchor: Date): AllFixtureData {
  return {
    identity: buildIdentityFixture(anchor),
    application: buildApplicationFixture(anchor),
    catalog: buildCatalogFixture(anchor),
    appInteraction: buildApplicationInteractionFixture(anchor),
    demand: buildDemandFixture(anchor),
    demandInteraction: buildDemandInteractionFixture(anchor),
    notification: buildNotificationFixture(anchor),
    analytics: buildAnalyticsFixture(anchor),
  };
}

// ── upsert helpers ────────────────────────────────────────────────────────────

async function upsertIdentity(
  db: Kysely<DatabaseSchema>,
  data: IdentityFixtureData,
): Promise<void> {
  if (data.departments.length > 0) {
    await db.insertInto("departments").values(data.departments as never)
      .onConflict((oc) => oc.column("department_id").doUpdateSet((eb) => ({
        name: eb.ref("excluded.name"),
        parent_department_id: eb.ref("excluded.parent_department_id"),
        source: eb.ref("excluded.source"),
        updated_at: eb.ref("excluded.updated_at"),
      }))).execute();
  }
  for (const emp of data.employees) {
    await db.insertInto("employees").values(emp as never)
      .onConflict((oc) => oc.column("employee_id").doUpdateSet((eb) => ({
        display_name: eb.ref("excluded.display_name"),
        status: eb.ref("excluded.status"),
        primary_department_id: eb.ref("excluded.primary_department_id"),
        password_reset_required: eb.ref("excluded.password_reset_required"),
        employee_number: eb.ref("excluded.employee_number"),
        updated_at: eb.ref("excluded.updated_at"),
      }))).execute();
  }
  if (data.departmentMemberships.length > 0) {
    await db.insertInto("department_memberships").values(data.departmentMemberships as never)
      .onConflict((oc) => oc.columns(["employee_id", "department_id"]).doUpdateSet((eb) => ({
        is_primary: eb.ref("excluded.is_primary"),
      }))).execute();
  }
  if (data.employeeRoles.length > 0) {
    await db.insertInto("employee_roles").values(data.employeeRoles as never)
      .onConflict((oc) => oc.columns(["employee_id", "role_code"]).doNothing()).execute();
  }
  if (data.identityAuditEvents.length > 0) {
    await db.insertInto("identity_audit_events").values(data.identityAuditEvents as never)
      .onConflict((oc) => oc.column("audit_event_id").doNothing()).execute();
  }
}

async function upsertApplication(
  db: Kysely<DatabaseSchema>,
  data: ApplicationFixtureData,
): Promise<void> {
  if (data.applications.length > 0) {
    await db.insertInto("applications").values(data.applications as never)
      .onConflict((oc) => oc.column("application_id").doUpdateSet((eb) => ({
        name: eb.ref("excluded.name"), summary: eb.ref("excluded.summary"),
        status: eb.ref("excluded.status"), current_version_id: eb.ref("excluded.current_version_id"),
        updated_at: eb.ref("excluded.updated_at"),
      }))).execute();
  }
  if (data.applicationVersions.length > 0) {
    await db.insertInto("application_versions").values(data.applicationVersions as never)
      .onConflict((oc) => oc.column("application_version_id").doUpdateSet((eb) => ({
        version: eb.ref("excluded.version"), changelog: eb.ref("excluded.changelog"),
        scan_status: eb.ref("excluded.scan_status"),
      }))).execute();
  }
  if (data.applicationDeliveries.length > 0) {
    await db.insertInto("application_deliveries").values(data.applicationDeliveries as never)
      .onConflict((oc) => oc.column("delivery_id").doUpdateSet((eb) => ({
        channel: eb.ref("excluded.channel"), entry_url: eb.ref("excluded.entry_url"),
        enabled: eb.ref("excluded.enabled"), updated_at: eb.ref("excluded.updated_at"),
      }))).execute();
  }
  if (data.applicationReviews.length > 0) {
    await db.insertInto("application_reviews").values(data.applicationReviews as never)
      .onConflict((oc) => oc.column("review_id").doNothing()).execute();
  }
  if (data.applicationReviewQueue.length > 0) {
    await db.insertInto("application_review_queue").values(data.applicationReviewQueue as never)
      .onConflict((oc) => oc.column("review_queue_id").doNothing()).execute();
  }
  if (data.applicationAuditEvents.length > 0) {
    await db.insertInto("application_audit_events").values(data.applicationAuditEvents as never)
      .onConflict((oc) => oc.column("audit_event_id").doNothing()).execute();
  }
}

async function upsertCatalog(
  db: Kysely<DatabaseSchema>,
  data: CatalogFixtureData,
): Promise<void> {
  if (data.categories.length > 0) {
    await db.insertInto("catalog_categories").values(data.categories as never)
      .onConflict((oc) => oc.column("category_id").doUpdateSet((eb) => ({
        name: eb.ref("excluded.name"), sort_order: eb.ref("excluded.sort_order"),
      }))).execute();
  }
  if (data.tags.length > 0) {
    await db.insertInto("catalog_tags").values(data.tags as never)
      .onConflict((oc) => oc.column("tag_id").doUpdateSet((eb) => ({
        name: eb.ref("excluded.name"),
      }))).execute();
  }
  if (data.metadata.length > 0) {
    await db.insertInto("application_catalog_metadata").values(data.metadata as never)
      .onConflict((oc) => oc.column("application_id").doUpdateSet((eb) => ({
        category_id: eb.ref("excluded.category_id"),
        health_status: eb.ref("excluded.health_status"),
        replacement_application_id: eb.ref("excluded.replacement_application_id"),
      }))).execute();
  }
  if (data.audiences.length > 0) {
    await db.insertInto("application_audiences").values(data.audiences as never)
      .onConflict((oc) => oc.column("audience_id").doNothing()).execute();
  }
  if (data.tagLinks.length > 0) {
    await db.insertInto("application_tag_links").values(data.tagLinks as never)
      .onConflict((oc) => oc.columns(["application_id", "tag_id"]).doNothing()).execute();
  }
  if (data.labels.length > 0) {
    await db.insertInto("application_catalog_labels").values(data.labels as never)
      .onConflict((oc) => oc.columns(["application_id", "label"]).doNothing()).execute();
  }
  if (data.deliveryActions.length > 0) {
    await db.insertInto("catalog_delivery_actions").values(data.deliveryActions as never)
      .onConflict((oc) => oc.column("action_id").doNothing()).execute();
  }
}

async function upsertAppInteraction(
  db: Kysely<DatabaseSchema>,
  data: AppInteractionFixtureData,
): Promise<void> {
  if (data.applicationLikes.length > 0) {
    await db.insertInto("application_likes").values(data.applicationLikes as never)
      .onConflict((oc) => oc.columns(["application_id", "employee_id"]).doNothing()).execute();
  }
  if (data.applicationRatings.length > 0) {
    await db.insertInto("application_ratings").values(data.applicationRatings as never)
      .onConflict((oc) => oc.column("rating_id").doUpdateSet((eb) => ({
        stars: eb.ref("excluded.stars"), body: eb.ref("excluded.body"),
        updated_at: eb.ref("excluded.updated_at"),
      }))).execute();
  }
  if (data.applicationComments.length > 0) {
    await db.insertInto("application_comments").values(data.applicationComments as never)
      .onConflict((oc) => oc.column("comment_id").doNothing()).execute();
  }
  if (data.applicationReports.length > 0) {
    await db.insertInto("application_reports").values(data.applicationReports as never)
      .onConflict((oc) => oc.column("report_id").doNothing()).execute();
  }
}

async function upsertDemand(
  db: Kysely<DatabaseSchema>,
  data: DemandFixtureData,
): Promise<void> {
  if (data.demands.length > 0) {
    for (const d of data.demands) {
      await db.insertInto("ai_demands").values(d as never)
        .onConflict((oc) => oc.column("demand_id").doUpdateSet((eb) => ({
          title: eb.ref("excluded.title"), problem_statement: eb.ref("excluded.problem_statement"),
          desired_outcome: eb.ref("excluded.desired_outcome"), status: eb.ref("excluded.status"),
          priority_score: eb.ref("excluded.priority_score"), version: eb.ref("excluded.version"),
          updated_at: eb.ref("excluded.updated_at"),
        }))).execute();
    }
  }
  if (data.demandCollaborators.length > 0) {
    await db.insertInto("ai_demand_collaborators").values(data.demandCollaborators as never)
      .onConflict((oc) => oc.columns(["demand_id", "employee_id"]).doNothing()).execute();
  }
  if (data.demandAuditEvents.length > 0) {
    await db.insertInto("ai_demand_audit_events").values(data.demandAuditEvents as never)
      .onConflict((oc) => oc.column("audit_event_id").doNothing()).execute();
  }
}

async function upsertDemandInteraction(
  db: Kysely<DatabaseSchema>,
  data: DemandInteractionFixtureData,
): Promise<void> {
  if (data.demandComments.length > 0) {
    await db.insertInto("ai_demand_comments").values(data.demandComments as never)
      .onConflict((oc) => oc.column("comment_id").doNothing()).execute();
  }
  if (data.demandLikes.length > 0) {
    await db.insertInto("ai_demand_likes").values(data.demandLikes as never)
      .onConflict((oc) => oc.columns(["demand_id", "employee_id"]).doNothing()).execute();
  }
  if (data.demandCommentLikes.length > 0) {
    await db.insertInto("ai_demand_comment_likes").values(data.demandCommentLikes as never)
      .onConflict((oc) => oc.columns(["comment_id", "employee_id"]).doNothing()).execute();
  }
  if (data.demandReports.length > 0) {
    await db.insertInto("ai_demand_reports").values(data.demandReports as never)
      .onConflict((oc) => oc.column("report_id").doNothing()).execute();
  }
  if (data.demandProgressUpdates.length > 0) {
    await db.insertInto("ai_demand_progress_updates").values(data.demandProgressUpdates as never)
      .onConflict((oc) => oc.column("progress_id").doNothing()).execute();
  }
  if (data.demandPilots.length > 0) {
    await db.insertInto("ai_demand_pilots").values(data.demandPilots as never)
      .onConflict((oc) => oc.column("pilot_id").doNothing()).execute();
  }
  if (data.demandApplications.length > 0) {
    await db.insertInto("ai_demand_applications").values(data.demandApplications as never)
      .onConflict((oc) => oc.columns(["demand_id", "application_id"]).doNothing()).execute();
  }
}

async function upsertNotification(
  db: Kysely<DatabaseSchema>,
  data: NotificationFixtureData,
): Promise<void> {
  if (data.notifications.length > 0) {
    await db.insertInto("notifications").values(data.notifications as never)
      .onConflict((oc) => oc.column("notification_id").doUpdateSet((eb) => ({
        message: eb.ref("excluded.message"), read_at: eb.ref("excluded.read_at"),
        delivery_status: eb.ref("excluded.delivery_status"),
      }))).execute();
  }
}

async function upsertAnalytics(
  db: Kysely<DatabaseSchema>,
  data: AnalyticsFixtureData,
): Promise<void> {
  if (data.behaviorEvents.length > 0) {
    await db.insertInto("analytics_behavior_events").values(data.behaviorEvents as never)
      .onConflict((oc) => oc.column("event_id").doUpdateSet((eb) => ({
        event_name: eb.ref("excluded.event_name"), metadata: eb.ref("excluded.metadata"),
      }))).execute();
  }
  if (data.dailyAggregates.length > 0) {
    await db.insertInto("analytics_daily_aggregates").values(data.dailyAggregates as never)
      .onConflict((oc) => oc.columns(["metric_key", "metric_version", "day", "audience_scope_key"])
        .doUpdateSet((eb) => ({
          value: eb.ref("excluded.value"), source_event_count: eb.ref("excluded.source_event_count"),
          computed_at: eb.ref("excluded.computed_at"),
        }))).execute();
  }
  if (data.exportJobs.length > 0) {
    await db.insertInto("analytics_export_jobs").values(data.exportJobs as never)
      .onConflict((oc) => oc.column("export_id").doUpdateSet((eb) => ({
        status: eb.ref("excluded.status"), failure_code: eb.ref("excluded.failure_code"),
        completed_at: eb.ref("excluded.completed_at"),
      }))).execute();
  }
  if (data.auditEvents.length > 0) {
    await db.insertInto("analytics_audit_events").values(data.auditEvents as never)
      .onConflict((oc) => oc.column("audit_event_id").doNothing()).execute();
  }
  if (data.outboxEvents.length > 0) {
    await db.insertInto("outbox_events").values(data.outboxEvents as never)
      .onConflict((oc) => oc.column("idempotency_key").doNothing()).execute();
  }
}

// ── main entry points ─────────────────────────────────────────────────────────

const ALL_DOMAINS: readonly DemoDatasetDomain[] = [
  "identity", "application", "catalog", "demand", "notification", "analytics",
];

export async function seedDemoDataset(
  db: Kysely<DatabaseSchema>,
  options: SeedDemoDatasetOptions,
): Promise<SeedDemoDatasetResult> {
  const startedAt = Date.now();
  const domains = options.domains ?? ALL_DOMAINS;
  const fixtures = buildAllFixtures(options.anchorDate);

  await db.transaction().execute(async (trx) => {
    if (options.mode === "reset") await cleanDemoData(trx);

    if (domains.includes("identity")) await upsertIdentity(trx, fixtures.identity);
    if (domains.includes("application")) await upsertApplication(trx, fixtures.application);
    if (domains.includes("catalog")) {
      await upsertCatalog(trx, fixtures.catalog);
      await upsertAppInteraction(trx, fixtures.appInteraction);
    }
    if (domains.includes("demand")) {
      await upsertDemand(trx, fixtures.demand);
      await upsertDemandInteraction(trx, fixtures.demandInteraction);
    }
    if (domains.includes("notification")) await upsertNotification(trx, fixtures.notification);
    if (domains.includes("analytics")) await upsertAnalytics(trx, fixtures.analytics);
  });

  const counts: Record<DemoDatasetDomain, number> = {
    identity: fixtures.identity.departments.length + fixtures.identity.employees.length,
    application: fixtures.application.applications.length + fixtures.application.applicationVersions.length + fixtures.application.applicationDeliveries.length,
    catalog: fixtures.catalog.categories.length + fixtures.catalog.tags.length + fixtures.catalog.metadata.length,
    demand: fixtures.demand.demands.length + fixtures.demand.demandCollaborators.length,
    notification: fixtures.notification.notifications.length,
    analytics: fixtures.analytics.behaviorEvents.length + fixtures.analytics.dailyAggregates.length,
  };

  return {
    anchorDate: options.anchorDate.toISOString(),
    counts: Object.freeze(counts) as Readonly<Record<DemoDatasetDomain, number>>,
    durationMs: Date.now() - startedAt,
  };
}

export async function checkDemoDataset(
  db: Kysely<DatabaseSchema>,
  options: { anchorDate: Date; domains?: readonly DemoDatasetDomain[] },
): Promise<DemoDatasetCheckResult> {
  const startedAt = Date.now();
  const failures: DemoDatasetCheckFailure[] = [];
  const domains = options.domains ?? ALL_DOMAINS;

  const expectedCounts: Record<DemoDatasetDomain, number> = {
    identity: 5, application: 20, catalog: 10, demand: 18, notification: 15, analytics: 30,
  };

  for (const domain of domains) {
    try {
      let count = 0;
      switch (domain) {
        case "identity":
          count = (await db.selectFrom("employees").select(db.fn.countAll<number>().as("c"))
            .where("employee_id", "like", "DEMO-%").executeTakeFirstOrThrow()).c as number;
          break;
        case "application":
          count = (await db.selectFrom("applications").select(db.fn.countAll<number>().as("c"))
            .executeTakeFirstOrThrow()).c as number;
          break;
        case "catalog":
          count = (await db.selectFrom("application_catalog_metadata").select(db.fn.countAll<number>().as("c"))
            .executeTakeFirstOrThrow()).c as number;
          break;
        case "demand":
          count = (await db.selectFrom("ai_demands").select(db.fn.countAll<number>().as("c"))
            .executeTakeFirstOrThrow()).c as number;
          break;
        case "notification":
          count = (await db.selectFrom("notifications").select(db.fn.countAll<number>().as("c"))
            .where("idempotency_key", "like", "demo:%").executeTakeFirstOrThrow()).c as number;
          break;
        case "analytics":
          count = (await db.selectFrom("analytics_behavior_events").select(db.fn.countAll<number>().as("c"))
            .where("idempotency_key", "like", "demo:%").executeTakeFirstOrThrow()).c as number;
          break;
      }
      if (count !== expectedCounts[domain]) {
        failures.push({ domain, message: `Expected ${expectedCounts[domain]}, found ${count}` });
      }
    } catch (err) {
      failures.push({ domain, message: `Query failed: ${String(err)}` });
    }
  }

  return {
    passed: failures.length === 0,
    anchorDate: options.anchorDate.toISOString(),
    failures,
    durationMs: Date.now() - startedAt,
  };
}
