import type { ColumnType, Generated } from "kysely";

export interface OutboxEventsTable {
  id: Generated<string>;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  payload: unknown;
  idempotency_key: string;
  status: "pending" | "processing" | "completed" | "failed" | "quarantined";
  attempts: number;
  available_at: ColumnType<Date, Date | undefined, Date>;
  claimed_by: string | null;
  claimed_at: Date | null;
  last_error: string | null;
  created_at: ColumnType<Date, Date | undefined, never>;
  completed_at: Date | null;
}

export interface DepartmentsTable {
  department_id: string;
  name: string;
  parent_department_id: string | null;
  source: "local" | "dingtalk";
  status: ColumnType<
    "active" | "disabled",
    "active" | "disabled" | undefined,
    "active" | "disabled"
  >;
  manager_employee_id: string | null;
  external_id: string | null;
  last_synced_at: Date | null;
  created_at: ColumnType<Date, Date | undefined, never>;
  updated_at: ColumnType<Date, Date | undefined, Date | undefined>;
}

export interface EmployeesTable {
  employee_id: string;
  display_name: string;
  status: "pending_binding" | "active" | "disabled" | "archived";
  primary_department_id: string;
  password_hash: string | null;
  password_reset_required: boolean;
  employee_number: string | null;
  created_at: ColumnType<Date, Date | undefined, never>;
  updated_at: ColumnType<Date, Date | undefined, Date | undefined>;
}

export interface DepartmentMembershipsTable {
  employee_id: string;
  department_id: string;
  is_primary: boolean;
}

export interface RolesTable {
  role_code: string;
  name: string;
  permissions: readonly string[];
  is_system: boolean;
  status: ColumnType<
    "active" | "disabled",
    "active" | "disabled" | undefined,
    "active" | "disabled"
  >;
  created_by_employee_id: string | null;
  created_at: ColumnType<Date, Date | undefined, never>;
  updated_at: ColumnType<Date, Date | undefined, Date | undefined>;
}

export interface EmployeeRolesTable {
  employee_id: string;
  role_code: string;
}

export interface UserSessionsTable {
  session_id: Generated<string>;
  employee_id: string;
  device_label: string;
  created_at: ColumnType<Date, Date | undefined, never>;
  expires_at: Date;
  revoked_at: Date | null;
  revocation_reason: string | null;
}

export interface PasswordResetChallengesTable {
  challenge_id: Generated<string>;
  employee_id: string;
  token_hash: string;
  expires_at: Date;
  consumed_at: Date | null;
  created_at: ColumnType<Date, Date | undefined, never>;
}

export interface RequestReplayNoncesTable {
  nonce_hash: string;
  actor_employee_id: string;
  route: string;
  created_at: ColumnType<Date, Date | undefined, never>;
  expires_at: Date;
}

export interface LoginChallengesTable {
  nonce_hash: string;
  key_id: string;
  expires_at: Date;
  consumed_at: Date | null;
  created_at: ColumnType<Date, Date | undefined, never>;
}

export interface DingTalkBindingsTable {
  employee_id: string;
  dingtalk_user_id: string;
  bound_at: ColumnType<Date, Date | undefined, never>;
}

export interface DingTalkSyncRunsTable {
  sync_run_id: Generated<string>;
  mode: "event" | "daily" | "manual";
  status: "started" | "completed" | "failed" | "cancelled";
  started_at: ColumnType<Date, Date | undefined, never>;
  finished_at: Date | null;
  summary: unknown;
}

export interface IdentitySyncRunItemsTable {
  sync_run_item_id: Generated<string>;
  sync_run_id: string;
  object_type: string;
  object_id: string;
  status: ColumnType<string, string | undefined, string>;
  processed_count: number;
  success_count: number;
  failure_count: number;
  error_code: string | null;
  started_at: Date | null;
  finished_at: Date | null;
  retry_of_item_id: string | null;
  created_at: ColumnType<Date, Date | undefined, never>;
}

export interface IdentitySyncConfigTable {
  id: boolean;
  enabled: boolean;
  schedule: string | null;
  external_org_id: string | null;
  secret_reference: string | null;
  last_updated_by_employee_id: string | null;
  updated_at: ColumnType<Date, Date | undefined, Date | undefined>;
}

export interface IdentityAuditEventsTable {
  audit_event_id: Generated<string>;
  actor_employee_id: string | null;
  event_type: string;
  subject_employee_id: string | null;
  details: unknown;
  created_at: ColumnType<Date, Date | undefined, never>;
}

export interface ApplicationsTable {
  application_id: Generated<string>;
  owner_employee_id: string;
  maintainer_employee_id: string;
  department_id: string;
  name: string;
  summary: string;
  status:
    | "draft"
    | "in_review"
    | "approved"
    | "published"
    | "withdrawn"
    | "archived";
  current_version_id: string | null;
  pending_version_id: string | null;
  created_at: ColumnType<Date, Date | undefined, never>;
  updated_at: ColumnType<Date, Date | undefined, Date | undefined>;
}

export interface ApplicationMaintainersTable {
  application_id: string;
  employee_id: string;
  created_at: ColumnType<Date, Date | undefined, never>;
}

export interface ApplicationVersionsTable {
  application_version_id: Generated<string>;
  application_id: string;
  version: string;
  changelog: string;
  artifact_key: string | null;
  artifact_sha256: string | null;
  artifact_signature: string | null;
  scan_status: "pending" | "passed" | "failed";
  created_by_employee_id: string;
  created_at: ColumnType<Date, Date | undefined, never>;
}

export interface ApplicationDeliveriesTable {
  delivery_id: Generated<string>;
  application_id: string;
  channel: "web" | "desktop" | "mobile" | "mini_program";
  entry_url: string;
  min_client_version: string | null;
  enabled: boolean;
  configuration: unknown;
  updated_by_employee_id: string | null;
  created_at: ColumnType<Date, Date | undefined, never>;
  updated_at: ColumnType<Date, Date | undefined, Date | undefined>;
}

export interface ApplicationAssetsTable {
  asset_id: Generated<string>;
  application_id: string;
  application_version_id: string | null;
  asset_type: "icon" | "screenshot" | "cover" | "attachment" | "qr";
  name: string;
  storage_key: string;
  mime_type: string;
  size_bytes: number;
  sort_order: number;
  sha256: string | null;
  scan_status: ColumnType<
    "pending" | "passed" | "failed",
    "pending" | "passed" | "failed" | undefined,
    "pending" | "passed" | "failed"
  >;
  uploaded_by_employee_id: string | null;
  object_etag: string | null;
  created_at: ColumnType<Date, Date | undefined, never>;
  updated_at: ColumnType<Date, Date | undefined, Date | undefined>;
}

export interface ApplicationArtifactUploadsTable {
  upload_id: Generated<string>;
  application_id: string;
  uploaded_by_employee_id: string;
  object_key: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  kind: ColumnType<string, string | undefined, string>;
  sha256: string | null;
  signature: string | null;
  signed: ColumnType<boolean, boolean | undefined, boolean>;
  part_count: number;
  upload_status: ColumnType<
    "uploading" | "verifying" | "completed" | "failed",
    "uploading" | "verifying" | "completed" | "failed" | undefined,
    "uploading" | "verifying" | "completed" | "failed"
  >;
  scan_status: ColumnType<
    "pending" | "passed" | "failed",
    "pending" | "passed" | "failed" | undefined,
    "pending" | "passed" | "failed"
  >;
  error_code: string | null;
  staging_object_key: string;
  verification_started_at: Date | null;
  verification_attempts: number;
  updated_at: ColumnType<Date, Date | undefined, Date | undefined>;
  expires_at: Date;
  completed_at: Date | null;
  created_at: ColumnType<Date, Date | undefined, never>;
}

export interface DeliveryTargetsTable {
  delivery_target_id: Generated<string>;
  delivery_id: string;
  kind: "desktop" | "mobile" | "miniprogram";
  os: "windows" | "macos" | null;
  platform: "android" | "ios" | "wechat" | "dingtalk" | "alipay" | null;
  arch: string | null;
  app_id: string | null;
  qr_code_asset_id: string | null;
  version_note: string | null;
  enabled: boolean;
  created_at: ColumnType<Date, Date | undefined, never>;
}

export interface ApplicationDeliveryAssetsTable {
  delivery_id: string;
  platform: "web" | "desktop" | "mobile" | "mini_program";
  asset_id: string;
  version: string | null;
  sort_order: number;
  created_at: ColumnType<Date, Date | undefined, never>;
}

export interface ApplicationVersionSnapshotsTable {
  snapshot_id: Generated<string>;
  application_version_id: string;
  payload: unknown;
  created_at: ColumnType<Date, Date | undefined, never>;
}

export interface ApplicationValidationChecksTable {
  validation_check_id: Generated<string>;
  application_version_id: string;
  check_code: string;
  label: string;
  status: "passed" | "safe" | "warning" | "info" | "failed";
  detail: string | null;
  created_at: ColumnType<Date, Date | undefined, never>;
}

export interface ApplicationReviewsTable {
  review_id: Generated<string>;
  application_id: string;
  application_version_id: string;
  reviewer_employee_id: string;
  application_owner_employee_id: string;
  decision: "approve" | "reject" | "request_changes";
  comment: string;
  created_at: ColumnType<Date, Date | undefined, never>;
}

export interface ApplicationReviewQueueTable {
  review_queue_id: Generated<string>;
  application_id: string;
  application_version_id: string;
  status: "available" | "claimed" | "completed";
  source_status: string | null;
  claimed_by_employee_id: string | null;
  claimed_at: Date | null;
  sla_due_at: Date;
  created_at: ColumnType<Date, Date | undefined, never>;
}

export interface ApplicationAuditEventsTable {
  audit_event_id: Generated<string>;
  application_id: string;
  application_version_id: string | null;
  actor_employee_id: string | null;
  event_type: string;
  details: unknown;
  created_at: ColumnType<Date, Date | undefined, never>;
}

export interface CatalogCategoriesTable {
  category_id: string;
  name: string;
  sort_order: number;
  enabled: boolean;
  is_hot: boolean;
}

export interface CatalogTagsTable {
  tag_id: string;
  name: string;
  enabled: boolean;
}

export interface ApplicationAudiencesTable {
  audience_id: Generated<string>;
  application_id: string;
  audience_type: "all" | "department" | "employee";
  department_id: string | null;
  employee_id: string | null;
  include_children: boolean;
}

export interface ApplicationTagLinksTable {
  application_id: string;
  tag_id: string;
}

export interface ApplicationCatalogMetadataTable {
  application_id: string;
  category_id: string;
  application_type: string;
  search_name: string;
  search_summary: string;
  search_pinyin: string;
  search_initials: string;
  recommendation_rank: number;
  health_status: "unknown" | "healthy" | "degraded" | "failed";
  deprecated_reason: string | null;
  replacement_application_id: string | null;
  risk_description: string | null;
}

export interface ApplicationCatalogLabelsTable {
  application_id: string;
  label: string;
}

export interface CatalogDeliveryActionsTable {
  action_id: Generated<string>;
  application_id: string;
  application_version_id: string | null;
  actor_employee_id: string;
  action_type: "web_redirect" | "package_download" | "qr_display";
  channel: string | null;
  idempotency_key: string | null;
  status: ColumnType<
    "initiated" | "served" | "failed",
    "initiated" | "served" | "failed" | undefined,
    "initiated" | "served" | "failed"
  >;
  completed_at: Date | null;
  failure_code: string | null;
  occurred_at: ColumnType<Date, Date | undefined, Date>;
}

export interface ApplicationLikesTable {
  like_id: Generated<number>;
  application_id: string;
  employee_id: string;
  created_at: ColumnType<Date, Date | undefined, never>;
}

export interface ApplicationRatingsTable {
  rating_id: Generated<string>;
  application_id: string;
  application_version_id: string;
  employee_id: string;
  stars: number;
  body: string | null;
  display_anonymously: boolean;
  created_at: ColumnType<Date, Date | undefined, never>;
  updated_at: ColumnType<Date, Date | undefined, Date | undefined>;
}

export interface ApplicationCommentsTable {
  comment_id: Generated<string>;
  application_id: string;
  application_version_id: string;
  parent_comment_id: string | null;
  author_employee_id: string;
  body: string;
  display_anonymously: boolean;
  comment_kind: ColumnType<
    "user" | "official",
    "user" | "official" | undefined,
    "user" | "official"
  >;
  hidden_at: Date | null;
  created_at: ColumnType<Date, Date | undefined, never>;
  updated_at: ColumnType<Date, Date | undefined, Date | undefined>;
}

export interface SecurityAuditEventsTable {
  audit_event_id: Generated<string>;
  trace_id: string | null;
  module: string;
  action: string;
  actor_employee_id: string | null;
  subject: string | null;
  result: ColumnType<string, string | undefined, string>;
  risk: ColumnType<string, string | undefined, string>;
  ip_address: string | null;
  user_agent: string | null;
  details: unknown;
  created_at: ColumnType<Date, Date | undefined, never>;
}

export interface SecurityAuditExportJobsTable {
  export_job_id: Generated<string>;
  requested_by_employee_id: string;
  filter_snapshot: unknown;
  status: ColumnType<string, string | undefined, string>;
  result_storage_key: string | null;
  expires_at: Date | null;
  failure_code: string | null;
  created_at: ColumnType<Date, Date | undefined, never>;
  completed_at: Date | null;
}

export interface ApplicationFeedbackTable {
  feedback_id: Generated<string>;
  application_id: string;
  application_version_id: string | null;
  creator_employee_id: string;
  type: "bug" | "suggestion" | "content_issue";
  body: string;
  status: ColumnType<
    "open" | "in_progress" | "resolved" | "closed",
    "open" | "in_progress" | "resolved" | "closed" | undefined,
    "open" | "in_progress" | "resolved" | "closed"
  >;
  assignee_employee_id: string | null;
  resolution: string | null;
  created_at: ColumnType<Date, Date | undefined, never>;
  updated_at: ColumnType<Date, Date | undefined, Date | undefined>;
  resolved_at: Date | null;
}

export interface ApplicationReportsTable {
  report_id: Generated<string>;
  application_id: string;
  comment_id: string;
  reporter_employee_id: string;
  reason: string;
  status: "open" | "dismissed" | "hidden" | "restored";
  resolved_by_employee_id: string | null;
  resolved_at: Date | null;
  created_at: ColumnType<Date, Date | undefined, never>;
}

export interface NotificationsTable {
  notification_id: Generated<string>;
  recipient_employee_id: string;
  event_type: string;
  aggregate_id: string;
  idempotency_key: string;
  message: string;
  payload: unknown;
  read_at: Date | null;
  delivery_status: "pending" | "sent" | "retry" | "failed";
  delivery_attempts: number;
  last_delivery_error: string | null;
  next_attempt_at: Date | null;
  created_at: ColumnType<Date, Date | undefined, never>;
}

export interface AiDemandsTable {
  demand_id: Generated<string>;
  requester_employee_id: string;
  title: string;
  problem_statement: string;
  business_scenario: string | null;
  impact: string | null;
  desired_outcome: string;
  current_workaround: string | null;
  data_sensitivity: string | null;
  ai_solution_idea: string | null;
  status:
    | "draft"
    | "pending_review"
    | "rejected"
    | "pending_claim"
    | "claimed"
    | "validating"
    | "pilot"
    | "converted"
    | "closed"
    | "merged";
  audience_type: "all" | "department" | "employee";
  audience_department_id: string | null;
  audience_employee_id: string | null;
  include_children: boolean;
  display_anonymously: boolean;
  review_reason: string | null;
  business_value: number | null;
  implementation_cost: number | null;
  risk_level: number | null;
  admin_priority: number | null;
  impacted_headcount: number | null;
  usage_frequency: number | null;
  strategic_fit: number | null;
  technical_feasibility: number | null;
  data_compliance_risk: number | null;
  priority_score: number | null;
  priority_explanation: string | null;
  confirmed_priority: "high" | "medium" | "low" | null;
  priority_adjustment_reason: string | null;
  owner_employee_id: string | null;
  version: number;
  merged_into_demand_id: string | null;
  primary_solution_application_id: string | null;
  published_at: Date | null;
  closed_at: Date | null;
  created_at: ColumnType<Date, Date | undefined, never>;
  updated_at: ColumnType<Date, Date | undefined, Date | undefined>;
}

export interface AiDemandCollaboratorsTable {
  demand_id: string;
  employee_id: string;
  role: "owner" | "collaborator" | "operator";
  created_at: ColumnType<Date, Date | undefined, never>;
}

export interface AiDemandCommentsTable {
  comment_id: Generated<string>;
  demand_id: string;
  parent_comment_id: string | null;
  author_employee_id: string;
  body: string;
  display_anonymously: boolean;
  hidden_at: Date | null;
  created_at: ColumnType<Date, Date | undefined, never>;
  updated_at: ColumnType<Date, Date | undefined, Date | undefined>;
}

export interface AiDemandLikesTable {
  demand_id: string;
  employee_id: string;
  created_at: ColumnType<Date, Date | undefined, never>;
}

export interface AiDemandCommentLikesTable {
  comment_id: string;
  employee_id: string;
  created_at: ColumnType<Date, Date | undefined, never>;
}

export interface AiDemandReportsTable {
  report_id: Generated<string>;
  demand_id: string;
  comment_id: string | null;
  reporter_employee_id: string;
  reason: string;
  status: "open" | "dismissed" | "hidden" | "restored";
  resolved_by_employee_id: string | null;
  resolved_at: Date | null;
  created_at: ColumnType<Date, Date | undefined, never>;
}

export interface AiDemandProgressUpdatesTable {
  progress_id: Generated<string>;
  demand_id: string;
  author_employee_id: string;
  status: AiDemandsTable["status"];
  title: string;
  body: string;
  created_at: ColumnType<Date, Date | undefined, never>;
}

export interface AiDemandPilotsTable {
  pilot_id: Generated<string>;
  demand_id: string;
  application_id: string | null;
  name: string;
  starts_at: Date;
  ends_at: Date | null;
  outcome: string | null;
  status: "planned" | "running" | "completed" | "cancelled";
  created_by_employee_id: string;
  created_at: ColumnType<Date, Date | undefined, never>;
  updated_at: ColumnType<Date, Date | undefined, Date | undefined>;
}

export interface AiDemandApplicationsTable {
  demand_id: string;
  application_id: string;
  role: "candidate" | "pilot" | "solution";
  is_primary: boolean;
  linked_by_employee_id: string;
  created_at: ColumnType<Date, Date | undefined, never>;
}

export interface AiDemandAuditEventsTable {
  audit_event_id: Generated<string>;
  demand_id: string;
  actor_employee_id: string | null;
  event_type: string;
  details: unknown;
  created_at: ColumnType<Date, Date | undefined, never>;
}

export interface AiDemandClaimProposalsTable {
  proposal_id: Generated<string>;
  demand_id: string;
  proposer_employee_id: string;
  owner_employee_id: string;
  collaborator_employee_ids: string[];
  approach: string;
  estimated_validation_duration: string;
  resource_needs: string;
  preference: string | null;
  status: "proposed" | "selected" | "rejected" | "withdrawn";
  created_at: ColumnType<Date, Date | undefined, never>;
  updated_at: ColumnType<Date, Date | undefined, Date | undefined>;
}

export interface AiDemandAttachmentsTable {
  attachment_id: Generated<string>;
  demand_id: string | null;
  storage_key: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  sha256: string | null;
  uploaded_by_employee_id: string;
  created_at: ColumnType<Date, Date | undefined, never>;
}

export interface AnalyticsBehaviorEventsTable {
  event_id: Generated<string>;
  event_name: string;
  aggregate_type: string;
  aggregate_id: string;
  actor_employee_id: string | null;
  audience_department_id: string | null;
  audience_employee_id: string | null;
  metadata: unknown;
  idempotency_key: string;
  occurred_at: Date;
  expires_at: Date;
  created_at: ColumnType<Date, Date | undefined, never>;
}

export interface AnalyticsDailyAggregatesTable {
  metric_key: string;
  metric_version: number;
  day: string;
  audience_scope_key: string;
  value: number;
  source_event_count: number;
  computed_at: ColumnType<Date, Date | undefined, Date>;
}

export interface AnalyticsMetricDefinitionsTable {
  metric_key: string;
  version: number;
  label: string;
  source_event_names: readonly string[];
  formula: string;
  time_range: string;
  required_permission: string;
  audience_rule: string;
  recompute_method: string;
  is_active: boolean;
  created_at: ColumnType<Date, Date | undefined, never>;
}

export interface AnalyticsAuditEventsTable {
  audit_event_id: Generated<string>;
  actor_employee_id: string | null;
  action: string;
  aggregate_type: string;
  aggregate_id: string;
  details: unknown;
  created_at: ColumnType<Date, Date | undefined, never>;
}

export interface AnalyticsExportJobsTable {
  export_id: string;
  requested_by_employee_id: string;
  target: string;
  from_date: string;
  to_date: string;
  status: "queued" | "running" | "completed" | "failed";
  failure_code: string | null;
  created_at: ColumnType<Date, Date | undefined, never>;
  completed_at: Date | null;
}

export interface DatabaseSchema {
  outbox_events: OutboxEventsTable;
  departments: DepartmentsTable;
  employees: EmployeesTable;
  department_memberships: DepartmentMembershipsTable;
  roles: RolesTable;
  employee_roles: EmployeeRolesTable;
  user_sessions: UserSessionsTable;
  password_reset_challenges: PasswordResetChallengesTable;
  request_replay_nonces: RequestReplayNoncesTable;
  login_challenges: LoginChallengesTable;
  dingtalk_bindings: DingTalkBindingsTable;
  dingtalk_sync_runs: DingTalkSyncRunsTable;
  identity_sync_run_items: IdentitySyncRunItemsTable;
  identity_sync_config: IdentitySyncConfigTable;
  identity_audit_events: IdentityAuditEventsTable;
  applications: ApplicationsTable;
  application_maintainers: ApplicationMaintainersTable;
  application_versions: ApplicationVersionsTable;
  application_deliveries: ApplicationDeliveriesTable;
  application_assets: ApplicationAssetsTable;
  application_artifact_uploads: ApplicationArtifactUploadsTable;
  application_delivery_assets: ApplicationDeliveryAssetsTable;
  delivery_targets: DeliveryTargetsTable;
  application_version_snapshots: ApplicationVersionSnapshotsTable;
  application_validation_checks: ApplicationValidationChecksTable;
  application_reviews: ApplicationReviewsTable;
  application_review_queue: ApplicationReviewQueueTable;
  application_audit_events: ApplicationAuditEventsTable;
  catalog_categories: CatalogCategoriesTable;
  catalog_tags: CatalogTagsTable;
  application_audiences: ApplicationAudiencesTable;
  application_tag_links: ApplicationTagLinksTable;
  application_catalog_metadata: ApplicationCatalogMetadataTable;
  application_catalog_labels: ApplicationCatalogLabelsTable;
  catalog_delivery_actions: CatalogDeliveryActionsTable;
  application_likes: ApplicationLikesTable;
  application_ratings: ApplicationRatingsTable;
  application_comments: ApplicationCommentsTable;
  application_reports: ApplicationReportsTable;
  application_feedback: ApplicationFeedbackTable;
  security_audit_events: SecurityAuditEventsTable;
  security_audit_export_jobs: SecurityAuditExportJobsTable;
  notifications: NotificationsTable;
  ai_demands: AiDemandsTable;
  ai_demand_collaborators: AiDemandCollaboratorsTable;
  ai_demand_comments: AiDemandCommentsTable;
  ai_demand_likes: AiDemandLikesTable;
  ai_demand_comment_likes: AiDemandCommentLikesTable;
  ai_demand_reports: AiDemandReportsTable;
  ai_demand_progress_updates: AiDemandProgressUpdatesTable;
  ai_demand_pilots: AiDemandPilotsTable;
  ai_demand_applications: AiDemandApplicationsTable;
  ai_demand_audit_events: AiDemandAuditEventsTable;
  ai_demand_claim_proposals: AiDemandClaimProposalsTable;
  ai_demand_attachments: AiDemandAttachmentsTable;
  analytics_behavior_events: AnalyticsBehaviorEventsTable;
  analytics_daily_aggregates: AnalyticsDailyAggregatesTable;
  analytics_metric_definitions: AnalyticsMetricDefinitionsTable;
  analytics_audit_events: AnalyticsAuditEventsTable;
  analytics_export_jobs: AnalyticsExportJobsTable;
  dingtalk_sso_transactions: DingTalkSsoTransactionsTable;
  application_drafts: ApplicationDraftsTable;
}

export interface DingTalkSsoTransactionsTable {
  transaction_id: Generated<string>;
  state_hash: string;
  browser_context_binding_hash: string;
  handoff_token_hash: string | null;
  return_to: string;
  dingtalk_user_id: string | null;
  employee_id: string | null;
  expires_at: Date;
  consumed_at: Date | null;
  created_at: ColumnType<Date, Date | undefined, never>;
}

export interface ApplicationDraftsTable {
  application_id: string;
  draft: unknown;
  created_at: ColumnType<Date, Date | undefined, never>;
  updated_at: ColumnType<Date, Date | undefined, Date | undefined>;
}
