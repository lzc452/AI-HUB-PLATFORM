import type {
  ActorContext,
  AuthorizationDecision,
  AuthorizationRequest,
  DepartmentSummary,
  EmployeeId,
  EmployeeSummary,
} from "@ai-hub/contracts";

export type EmployeeStatus = EmployeeSummary["status"];

export interface EmployeeRecord extends EmployeeSummary {
  employeeNumber?: string | null;
  passwordHash: string | null;
  passwordResetRequired: boolean;
}

export interface RoleRecord {
  roleCode: string;
  permissions: readonly string[];
}

export interface IdentityRoleRecord extends RoleRecord {
  name: string;
  isSystem: boolean;
  status: "active" | "disabled";
  createdByEmployeeId: string | null;
  creatorName: string | null;
  memberCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IdentitySyncConfigRecord {
  enabled: boolean;
  schedule: string | null;
  externalOrgId: string | null;
  lastUpdatedByEmployeeId: string | null;
  updatedAt: Date;
}

export interface IdentitySyncRunItemRecord {
  syncRunItemId: string;
  syncRunId: string;
  objectType: string;
  objectId: string;
  status: string;
  processedCount: number;
  successCount: number;
  failureCount: number;
  errorCode: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
}

export interface SessionRecord {
  sessionId: string;
  employeeId: EmployeeId;
  deviceLabel: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface PasswordResetChallengeRecord {
  challengeId: string;
  employeeId: EmployeeId;
  tokenHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
}

export type DingTalkSyncMode = "event" | "daily" | "manual";

export interface DingTalkEmployeeSnapshot {
  employeeId: EmployeeId;
  displayName: string;
  primaryDepartmentId: string;
  dingtalkUserId: string;
}

export interface DingTalkDirectorySnapshot {
  departments: readonly DepartmentSummary[];
  employees: readonly DingTalkEmployeeSnapshot[];
}

export interface DingTalkDirectoryPort {
  fetchDirectory(): Promise<DingTalkDirectorySnapshot>;
}

export interface CreateEmployeeInput {
  employeeId: EmployeeId;
  employeeNumber?: string;
  displayName: string;
  primaryDepartmentId: string;
  status?: EmployeeStatus;
  passwordHash?: string | null;
}

export type Auditor = (input: {
  actorEmployeeId: EmployeeId | null;
  eventType: string;
  subjectEmployeeId: EmployeeId | null;
  details: unknown;
}) => Promise<void>;

export interface IdentityAuditEventRecord {
  auditEventId: string;
  actorEmployeeId: string | null;
  eventType: string;
  subjectEmployeeId: string | null;
  details: unknown;
  createdAt: Date;
}

export interface IdentityRepository {
  withTransaction<T>(
    operation: (repository: IdentityRepository) => Promise<T>,
  ): Promise<T>;
  createDepartment(input: DepartmentSummary): Promise<void>;
  createEmployee(input: CreateEmployeeInput): Promise<void>;
  assignRole(employeeId: EmployeeId, roleCode: string): Promise<void>;
  findEmployee(employeeId: EmployeeId): Promise<EmployeeRecord | null>;
  /** Lookup employee by standardized employee_number (already uppercase-trimmed). */
  findEmployeeByEmployeeNumber(
    employeeNumber: string,
  ): Promise<EmployeeRecord | null>;
  /** Find who a DingTalk user ID is bound to. */
  findEmployeeByDingTalkUserId(
    dingtalkUserId: string,
  ): Promise<EmployeeRecord | null>;
  listEmployees(): Promise<readonly EmployeeSummary[]>;
  listDepartments(): Promise<readonly DepartmentSummary[]>;
  listEmployeeDepartmentIds(employeeId: EmployeeId): Promise<readonly string[]>;
  listEmployeeRoles(employeeId: EmployeeId): Promise<readonly RoleRecord[]>;
  /** List employee IDs that currently hold the given role code. */
  listEmployeeIdsWithRole(roleCode: string): Promise<string[]>;
  listRoles?(): Promise<readonly IdentityRoleRecord[]>;
  createRole?(input: {
    roleCode: string;
    name: string;
    permissions: readonly string[];
    createdByEmployeeId: EmployeeId;
  }): Promise<void>;
  updateRole?(
    roleCode: string,
    input: {
      name?: string;
      permissions?: readonly string[];
      status?: "active" | "disabled";
    },
  ): Promise<void>;
  findRole?(roleCode: string): Promise<IdentityRoleRecord | null>;
  deleteRole?(roleCode: string): Promise<void>;
  copyRole?(input: {
    roleCode: string;
    name: string;
    permissions: readonly string[];
    createdByEmployeeId: EmployeeId;
    sourceRoleCode: string;
  }): Promise<void>;
  countRoleMembers?(roleCode: string): Promise<number>;
  getSyncConfig?(): Promise<IdentitySyncConfigRecord | null>;
  updateSyncConfig?(input: {
    enabled?: boolean;
    schedule?: string | null;
    externalOrgId?: string | null;
    lastUpdatedByEmployeeId: EmployeeId;
  }): Promise<IdentitySyncConfigRecord>;
  findSyncRun?(syncRunId: string): Promise<{
    syncRunId: string;
    mode: string;
    status: string;
    startedAt: Date;
    completedAt: Date | null;
    summary: unknown;
  } | null>;
  listSyncRunItems?(
    syncRunId: string,
  ): Promise<readonly IdentitySyncRunItemRecord[]>;
  listEmployeesPage(input?: {
    keyword?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{
    items: readonly EmployeeSummary[];
    total: number;
  }>;
  updateEmployee(
    employeeId: EmployeeId,
    input: {
      displayName?: string;
      status?: "pending_binding" | "active" | "disabled" | "archived";
      primaryDepartmentId?: string;
    },
  ): Promise<void>;
  updateDepartment(
    departmentId: string,
    input: {
      name?: string;
      parentDepartmentId?: string | null;
      managerEmployeeId?: string | null;
      status?: "active" | "disabled";
    },
  ): Promise<void>;
  deleteDepartment(departmentId: string): Promise<number>;
  countDepartmentMembers(departmentId: string): Promise<number>;
  setEmployeeRoles(
    employeeId: EmployeeId,
    roleCodes: readonly string[],
  ): Promise<void>;
  listSyncRuns(limit?: number): Promise<
    readonly {
      syncRunId: string;
      mode: string;
      status: string;
      startedAt: Date;
      completedAt: Date | null;
      summary: unknown;
    }[]
  >;
  createIdentitySyncRunItem?(input: {
    syncRunId: string;
    objectType: string;
    objectId: string;
    status: string;
    processedCount: number;
    successCount: number;
    failureCount: number;
    errorCode?: string | null;
    startedAt?: Date | null;
    finishedAt?: Date | null;
  }): Promise<void>;
  updateSyncRunStatus?(
    syncRunId: string,
    status: "started" | "completed" | "failed" | "cancelled",
    summary?: unknown,
  ): Promise<void>;
  markDepartmentSynced?(departmentId: string, syncedAt: Date): Promise<void>;
  findSession(sessionId: string): Promise<SessionRecord | null>;
  createPasswordResetChallenge(input: {
    employeeId: EmployeeId;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<PasswordResetChallengeRecord>;
  findPasswordResetChallenge(
    tokenHash: string,
  ): Promise<PasswordResetChallengeRecord | null>;
  consumePasswordResetChallenge(challengeId: string): Promise<boolean>;
  updateEmployeePassword(
    employeeId: EmployeeId,
    passwordHash: string,
  ): Promise<void>;
  bindDingTalkUser(
    employeeId: EmployeeId,
    dingtalkUserId: string,
  ): Promise<void>;
  claimDingTalkBinding(
    employeeId: EmployeeId,
    dingtalkUserId: string,
  ): Promise<boolean>;
  createDingTalkSyncRun(mode: DingTalkSyncMode): Promise<string>;
  completeDingTalkSyncRun(
    syncRunId: string,
    status: "completed" | "failed",
    summary: unknown,
  ): Promise<void>;
  createSession(input: {
    employeeId: EmployeeId;
    deviceLabel: string;
    expiresAt: Date;
  }): Promise<SessionRecord>;
  revokeSessions(employeeId: EmployeeId, reason: string): Promise<number>;
  revokeSession(sessionId: string, reason: string): Promise<boolean>;
  recordAudit(input: {
    actorEmployeeId: EmployeeId | null;
    eventType: string;
    subjectEmployeeId: EmployeeId | null;
    details: unknown;
  }): Promise<void>;
  listAuditEvents?(input?: {
    eventType?: string;
    limit?: number;
  }): Promise<readonly IdentityAuditEventRecord[]>;
  // ── DingTalk SSO ───────────────────────────────────────────
  createDingTalkSsoTransaction(input: {
    stateHash: string;
    browserContextBindingHash: string;
    handoffTokenHash?: string;
    returnTo: string;
    dingtalkUserId?: string;
    employeeId?: string;
    expiresAt: Date;
  }): Promise<DingTalkSsoTransactionRecord>;
  findDingTalkSsoTransactionByStateHash(
    stateHash: string,
  ): Promise<DingTalkSsoTransactionRecord | null>;
  findDingTalkSsoTransactionByHandoffHash(
    handoffHash: string,
  ): Promise<DingTalkSsoTransactionRecord | null>;
  consumeDingTalkSsoTransaction(transactionId: string): Promise<boolean>;
  activateEmployee(employeeId: EmployeeId): Promise<void>;
}

export interface DingTalkSsoTransactionRecord {
  transactionId: string;
  stateHash: string;
  browserContextBindingHash: string;
  handoffTokenHash: string | null;
  returnTo: string;
  dingtalkUserId: string | null;
  employeeId: string | null;
  expiresAt: Date;
  consumedAt: Date | null;
}

export interface LoginResult {
  actor: ActorContext;
  session: SessionRecord;
}

export type AudienceEvaluator = (request: AuthorizationRequest) => boolean;

export type { AuthorizationDecision, AuthorizationRequest };
