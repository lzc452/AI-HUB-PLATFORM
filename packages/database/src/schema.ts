import type { ColumnType, Generated } from "kysely";

export interface OutboxEventsTable {
  id: Generated<string>;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  payload: unknown;
  idempotency_key: string;
  status: "pending" | "processing" | "completed" | "failed";
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

export interface DingTalkBindingsTable {
  employee_id: string;
  dingtalk_user_id: string;
  bound_at: ColumnType<Date, Date | undefined, never>;
}

export interface DingTalkSyncRunsTable {
  sync_run_id: Generated<string>;
  mode: "event" | "daily" | "manual";
  status: "started" | "completed" | "failed";
  started_at: ColumnType<Date, Date | undefined, never>;
  finished_at: Date | null;
  summary: unknown;
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
  created_at: ColumnType<Date, Date | undefined, never>;
  updated_at: ColumnType<Date, Date | undefined, Date | undefined>;
}

export interface ApplicationVersionsTable {
  application_version_id: Generated<string>;
  application_id: string;
  version: string;
  changelog: string;
  artifact_key: string;
  artifact_sha256: string;
  artifact_signature: string;
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
  created_at: ColumnType<Date, Date | undefined, never>;
  updated_at: ColumnType<Date, Date | undefined, Date | undefined>;
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
  status: "available" | "claimed";
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
  occurred_at: ColumnType<Date, Date | undefined, Date>;
}

export interface ApplicationLikesTable {
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
  hidden_at: Date | null;
  created_at: ColumnType<Date, Date | undefined, never>;
  updated_at: ColumnType<Date, Date | undefined, Date | undefined>;
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

export interface DatabaseSchema {
  outbox_events: OutboxEventsTable;
  departments: DepartmentsTable;
  employees: EmployeesTable;
  department_memberships: DepartmentMembershipsTable;
  roles: RolesTable;
  employee_roles: EmployeeRolesTable;
  user_sessions: UserSessionsTable;
  password_reset_challenges: PasswordResetChallengesTable;
  dingtalk_bindings: DingTalkBindingsTable;
  dingtalk_sync_runs: DingTalkSyncRunsTable;
  identity_audit_events: IdentityAuditEventsTable;
  applications: ApplicationsTable;
  application_versions: ApplicationVersionsTable;
  application_deliveries: ApplicationDeliveriesTable;
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
}
