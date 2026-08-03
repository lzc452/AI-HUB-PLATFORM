import { Migrator, type Kysely, type Migration } from "kysely";
import * as systemFoundation from "./migrations/0001_system_foundation.js";
import * as identityOrganizationAuthorization from "./migrations/0002_identity_organization_authorization.js";
import * as applicationDeliveryReview from "./migrations/0003_application_delivery_review.js";
import * as catalogInteraction from "./migrations/0004_catalog_interaction.js";
import * as notificationCreator from "./migrations/0005_notification_creator.js";
import type { DatabaseSchema } from "./schema.js";

const migrations: Readonly<Record<string, Migration>> = {
  "0001_system_foundation": systemFoundation,
  "0002_identity_organization_authorization": identityOrganizationAuthorization,
  "0003_application_delivery_review": applicationDeliveryReview,
  "0004_catalog_interaction": catalogInteraction,
  "0005_notification_creator": notificationCreator,
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
