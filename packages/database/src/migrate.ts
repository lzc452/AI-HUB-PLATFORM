import { Migrator, type Kysely, type Migration } from "kysely";
import * as systemFoundation from "./migrations/0001_system_foundation.js";
import * as identityOrganizationAuthorization from "./migrations/0002_identity_organization_authorization.js";
import * as applicationDeliveryReview from "./migrations/0003_application_delivery_review.js";
import * as catalogInteraction from "./migrations/0004_catalog_interaction.js";
import * as notificationCreator from "./migrations/0005_notification_creator.js";
import * as aiDemandInnovation from "./migrations/0006_ai_demand_innovation.js";
import * as demandCollaborationConstraints from "./migrations/0007_demand_collaboration_constraints.js";
import * as analyticsEvents from "./migrations/0008_analytics_events.js";
import * as analyticsExports from "./migrations/0009_analytics_exports.js";
import * as analyticsRoles from "./migrations/0010_analytics_roles.js";
import * as analyticsAggregateVersions from "./migrations/0011_analytics_aggregate_versions.js";
import type { DatabaseSchema } from "./schema.js";

const migrations: Readonly<Record<string, Migration>> = {
  "0001_system_foundation": systemFoundation,
  "0002_identity_organization_authorization": identityOrganizationAuthorization,
  "0003_application_delivery_review": applicationDeliveryReview,
  "0004_catalog_interaction": catalogInteraction,
  "0005_notification_creator": notificationCreator,
  "0006_ai_demand_innovation": aiDemandInnovation,
  "0007_demand_collaboration_constraints": demandCollaborationConstraints,
  "0008_analytics_events": analyticsEvents,
  "0009_analytics_exports": analyticsExports,
  "0010_analytics_roles": analyticsRoles,
  "0011_analytics_aggregate_versions": analyticsAggregateVersions,
};

export async function runMigrations(db: Kysely<DatabaseSchema>): Promise<void> {
  const migrator = new Migrator({
    db,
    provider: {
      getMigrations: async () => migrations,
    },
  });
  const { error } = await migrator.migrateToLatest();

  if (error !== undefined) {
    throw error;
  }
}
