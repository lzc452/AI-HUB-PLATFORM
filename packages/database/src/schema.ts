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
}
