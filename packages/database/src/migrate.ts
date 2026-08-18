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
import * as requestReplayNonces from "./migrations/0012_request_replay_nonces.js";
import * as unifiedAuthorization from "./migrations/0013_unified_authorization.js";
import * as demandCommentLikesAndPriority from "./migrations/0014_demand_comment_likes_and_priority.js";
import * as loginSecurityAndDingTalkSso from "./migrations/0015_login_security_and_dingtalk_sso.js";
import * as applicationRiskDescription from "./migrations/0016_application_risk_description.js";
import * as applicationWorkspace from "./migrations/0017_application_workspace.js";
import * as organizationSyncFields from "./migrations/0018_organization_sync_fields.js";
import * as artifactUploads from "./migrations/0019_artifact_uploads.js";
import * as securityAuditFeedback from "./migrations/0020_security_audit_feedback.js";
import * as identityAuthorizationIntegrity from "./migrations/0021_identity_authorization_integrity.js";
import * as outboxClaimLease from "./migrations/0022_outbox_claim_lease.js";
import * as loginChallenges from "./migrations/0023_login_challenges.js";
import * as outboxQuarantine from "./migrations/0024_outbox_quarantine.js";
import * as artifactIntegrity from "./migrations/0025_artifact_integrity.js";
import * as engagementIntegrity from "./migrations/0026_engagement_integrity.js";
import * as securityAuditIntegrity from "./migrations/0027_security_audit_integrity.js";
import * as directorySyncIntegrity from "./migrations/0028_directory_sync_integrity.js";
import * as notificationPayload from "./migrations/0029_notification_payload.js";
import * as catalogReadModelIndexes from "./migrations/0030_catalog_read_model_indexes.js";
import * as artifactRuntimeCompatibility from "./migrations/0031_artifact_runtime_compatibility.js";
import * as analyticsInteractionFeedbackEvents from "./migrations/0032_analytics_interaction_feedback_events.js";
import * as applicationDraft from "./migrations/0033_application_draft.js";
import * as unifiedUpload from "./migrations/0034_unified_upload.js";
import * as versionArtifactNullable from "./migrations/0035_version_artifact_nullable.js";
import * as demandClaimProposalAndPriority from "./migrations/0036_demand_claim_proposal_and_priority.js";
import * as employeeApplicationCreate from "./migrations/0037_employee_application_create.js";
import * as employeeApplicationPublish from "./migrations/0038_employee_application_publish.js";
import * as applicationPublishedReviewState from "./migrations/0039_application_published_review_state.js";
import * as applicationLikesId from "./migrations/0040_application_likes_id.js";
import * as artifactSigned from "./migrations/0041_artifact_signed.js";
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
  "0012_request_replay_nonces": requestReplayNonces,
  "0013_unified_authorization": unifiedAuthorization,
  "0014_demand_comment_likes_and_priority": demandCommentLikesAndPriority,
  "0015_login_security_and_dingtalk_sso": loginSecurityAndDingTalkSso,
  "0016_application_risk_description": applicationRiskDescription,
  "0017_application_workspace": applicationWorkspace,
  "0018_organization_sync_fields": organizationSyncFields,
  "0019_artifact_uploads": artifactUploads,
  "0020_security_audit_feedback": securityAuditFeedback,
  "0021_identity_authorization_integrity": identityAuthorizationIntegrity,
  "0022_outbox_claim_lease": outboxClaimLease,
  "0023_login_challenges": loginChallenges,
  "0024_outbox_quarantine": outboxQuarantine,
  "0025_artifact_integrity": artifactIntegrity,
  "0026_engagement_integrity": engagementIntegrity,
  "0027_security_audit_integrity": securityAuditIntegrity,
  "0028_directory_sync_integrity": directorySyncIntegrity,
  "0029_notification_payload": notificationPayload,
  "0030_catalog_read_model_indexes": catalogReadModelIndexes,
  "0031_artifact_runtime_compatibility": artifactRuntimeCompatibility,
  "0032_analytics_interaction_feedback_events":
    analyticsInteractionFeedbackEvents,
  "0033_application_draft": applicationDraft,
  "0034_unified_upload": unifiedUpload,
  "0035_version_artifact_nullable": versionArtifactNullable,
  "0036_demand_claim_proposal_and_priority": demandClaimProposalAndPriority,
  "0037_employee_application_create": employeeApplicationCreate,
  "0038_employee_application_publish": employeeApplicationPublish,
  "0039_application_published_review_state": applicationPublishedReviewState,
  "0040_application_likes_id": applicationLikesId,
  "0041_artifact_signed": artifactSigned,
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
