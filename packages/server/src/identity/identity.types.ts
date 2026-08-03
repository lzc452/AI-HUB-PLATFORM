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
  passwordHash: string | null;
  passwordResetRequired: boolean;
}

export interface RoleRecord {
  roleCode: string;
  permissions: readonly string[];
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
  displayName: string;
  primaryDepartmentId: string;
  status?: EmployeeStatus;
  passwordHash?: string | null;
}

export interface IdentityRepository {
  withTransaction<T>(
    operation: (repository: IdentityRepository) => Promise<T>,
  ): Promise<T>;
  createDepartment(input: DepartmentSummary): Promise<void>;
  createEmployee(input: CreateEmployeeInput): Promise<void>;
  assignRole(employeeId: EmployeeId, roleCode: string): Promise<void>;
  findEmployee(employeeId: EmployeeId): Promise<EmployeeRecord | null>;
  listEmployees(): Promise<readonly EmployeeSummary[]>;
  listDepartments(): Promise<readonly DepartmentSummary[]>;
  listEmployeeDepartmentIds(employeeId: EmployeeId): Promise<readonly string[]>;
  listEmployeeRoles(employeeId: EmployeeId): Promise<readonly RoleRecord[]>;
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
}

export interface LoginResult {
  actor: ActorContext;
  session: SessionRecord;
}

export type AudienceEvaluator = (request: AuthorizationRequest) => boolean;

export type { AuthorizationDecision, AuthorizationRequest };
