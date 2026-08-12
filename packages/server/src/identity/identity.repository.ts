import type {
  DepartmentSummary,
  EmployeeId,
  EmployeeSummary,
} from "@ai-hub/contracts";
import type { DatabaseSchema } from "@ai-hub/database";
import type { Kysely } from "kysely";
import type {
  CreateEmployeeInput,
  EmployeeRecord,
  IdentityRepository,
  RoleRecord,
  SessionRecord,
  PasswordResetChallengeRecord,
  DingTalkSyncMode,
  IdentityAuditEventRecord,
} from "./identity.types.js";

export class KyselyIdentityRepository implements IdentityRepository {
  constructor(private readonly db: Kysely<DatabaseSchema>) {}

  withTransaction<T>(
    operation: (repository: IdentityRepository) => Promise<T>,
  ): Promise<T> {
    return this.db
      .transaction()
      .execute(async (transaction) =>
        operation(new KyselyIdentityRepository(transaction)),
      );
  }

  async createDepartment(input: DepartmentSummary): Promise<void> {
    await this.db
      .insertInto("departments")
      .values({
        department_id: input.departmentId,
        name: input.name,
        parent_department_id: input.parentDepartmentId,
        source: input.source,
      })
      .onConflict((oc) =>
        oc.column("department_id").doUpdateSet({
          name: input.name,
          parent_department_id: input.parentDepartmentId,
          source: input.source,
          updated_at: new Date(),
        }),
      )
      .execute();
  }

  async createEmployee(input: CreateEmployeeInput): Promise<void> {
    await this.db
      .insertInto("employees")
      .values({
        employee_id: input.employeeId,
        display_name: input.displayName,
        status: input.status ?? "pending_binding",
        primary_department_id: input.primaryDepartmentId,
        password_hash: input.passwordHash ?? null,
        password_reset_required: false,
      })
      .execute();

    await this.db
      .insertInto("department_memberships")
      .values({
        employee_id: input.employeeId,
        department_id: input.primaryDepartmentId,
        is_primary: true,
      })
      .execute();
  }

  async assignRole(employeeId: EmployeeId, roleCode: string): Promise<void> {
    await this.db
      .insertInto("employee_roles")
      .values({ employee_id: employeeId, role_code: roleCode })
      .onConflict((oc) => oc.columns(["employee_id", "role_code"]).doNothing())
      .execute();
  }

  async findEmployee(employeeId: EmployeeId): Promise<EmployeeRecord | null> {
    const row = await this.db
      .selectFrom("employees")
      .selectAll()
      .where("employee_id", "=", employeeId)
      .executeTakeFirst();
    if (row === undefined) {
      return null;
    }

    return {
      employeeId: row.employee_id,
      displayName: row.display_name,
      status: row.status,
      primaryDepartmentId: row.primary_department_id,
      passwordHash: row.password_hash,
      passwordResetRequired: row.password_reset_required,
    };
  }

  async listEmployees(): Promise<readonly EmployeeSummary[]> {
    const rows = await this.db
      .selectFrom("employees")
      .select([
        "employee_id",
        "display_name",
        "status",
        "primary_department_id",
      ])
      .orderBy("employee_id")
      .execute();
    return rows.map((row) => ({
      employeeId: row.employee_id,
      displayName: row.display_name,
      status: row.status,
      primaryDepartmentId: row.primary_department_id,
    }));
  }

  async listDepartments(): Promise<readonly DepartmentSummary[]> {
    const rows = await this.db
      .selectFrom("departments")
      .select(["department_id", "name", "parent_department_id", "source"])
      .orderBy("department_id")
      .execute();
    return rows.map((row) => ({
      departmentId: row.department_id,
      name: row.name,
      parentDepartmentId: row.parent_department_id,
      source: row.source,
    }));
  }

  async listEmployeeDepartmentIds(
    employeeId: EmployeeId,
  ): Promise<readonly string[]> {
    const rows = await this.db
      .selectFrom("department_memberships")
      .select("department_id")
      .where("employee_id", "=", employeeId)
      .execute();
    return rows.map((row) => row.department_id);
  }

  async listEmployeeRoles(
    employeeId: EmployeeId,
  ): Promise<readonly RoleRecord[]> {
    const rows = await this.db
      .selectFrom("employee_roles")
      .innerJoin("roles", "roles.role_code", "employee_roles.role_code")
      .select(["roles.role_code", "roles.permissions"])
      .where("employee_roles.employee_id", "=", employeeId)
      .execute();
    return rows.map((row) => ({
      roleCode: row.role_code,
      permissions: row.permissions,
    }));
  }

  async findSession(sessionId: string): Promise<SessionRecord | null> {
    const row = await this.db
      .selectFrom("user_sessions")
      .selectAll()
      .where("session_id", "=", sessionId)
      .executeTakeFirst();
    if (row === undefined) {
      return null;
    }
    return {
      sessionId: row.session_id,
      employeeId: row.employee_id,
      deviceLabel: row.device_label,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
    };
  }

  async createPasswordResetChallenge(input: {
    employeeId: EmployeeId;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<PasswordResetChallengeRecord> {
    const row = await this.db
      .insertInto("password_reset_challenges")
      .values({
        employee_id: input.employeeId,
        token_hash: input.tokenHash,
        expires_at: input.expiresAt,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return {
      challengeId: row.challenge_id,
      employeeId: row.employee_id,
      tokenHash: row.token_hash,
      expiresAt: row.expires_at,
      consumedAt: row.consumed_at,
    };
  }

  async findPasswordResetChallenge(
    tokenHash: string,
  ): Promise<PasswordResetChallengeRecord | null> {
    const row = await this.db
      .selectFrom("password_reset_challenges")
      .selectAll()
      .where("token_hash", "=", tokenHash)
      .executeTakeFirst();
    if (row === undefined) {
      return null;
    }
    return {
      challengeId: row.challenge_id,
      employeeId: row.employee_id,
      tokenHash: row.token_hash,
      expiresAt: row.expires_at,
      consumedAt: row.consumed_at,
    };
  }

  async consumePasswordResetChallenge(challengeId: string): Promise<boolean> {
    const result = await this.db
      .updateTable("password_reset_challenges")
      .set({ consumed_at: new Date() })
      .where("challenge_id", "=", challengeId)
      .where("consumed_at", "is", null)
      .where("expires_at", ">", new Date())
      .executeTakeFirst();
    return Number(result.numUpdatedRows) === 1;
  }

  async updateEmployeePassword(
    employeeId: EmployeeId,
    passwordHash: string,
  ): Promise<void> {
    await this.db
      .updateTable("employees")
      .set({ password_hash: passwordHash, password_reset_required: false })
      .where("employee_id", "=", employeeId)
      .execute();
  }

  async bindDingTalkUser(
    employeeId: EmployeeId,
    dingtalkUserId: string,
  ): Promise<void> {
    await this.db
      .insertInto("dingtalk_bindings")
      .values({ employee_id: employeeId, dingtalk_user_id: dingtalkUserId })
      .onConflict((oc) =>
        oc.column("employee_id").doUpdateSet({
          dingtalk_user_id: dingtalkUserId,
        }),
      )
      .execute();
  }

  async createDingTalkSyncRun(mode: DingTalkSyncMode): Promise<string> {
    const row = await this.db
      .insertInto("dingtalk_sync_runs")
      .values({ mode, status: "started", summary: {} })
      .returning("sync_run_id")
      .executeTakeFirstOrThrow();
    return row.sync_run_id;
  }

  async completeDingTalkSyncRun(
    syncRunId: string,
    status: "completed" | "failed",
    summary: unknown,
  ): Promise<void> {
    await this.db
      .updateTable("dingtalk_sync_runs")
      .set({ status, summary, finished_at: new Date() })
      .where("sync_run_id", "=", syncRunId)
      .execute();
  }

  async createSession(input: {
    employeeId: EmployeeId;
    deviceLabel: string;
    expiresAt: Date;
  }): Promise<SessionRecord> {
    const row = await this.db
      .insertInto("user_sessions")
      .values({
        employee_id: input.employeeId,
        device_label: input.deviceLabel,
        expires_at: input.expiresAt,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return {
      sessionId: row.session_id,
      employeeId: row.employee_id,
      deviceLabel: row.device_label,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
    };
  }

  async revokeSessions(
    employeeId: EmployeeId,
    reason: string,
  ): Promise<number> {
    const result = await this.db
      .updateTable("user_sessions")
      .set({ revoked_at: new Date(), revocation_reason: reason })
      .where("employee_id", "=", employeeId)
      .where("revoked_at", "is", null)
      .executeTakeFirst();
    return Number(result.numUpdatedRows);
  }

  async revokeSession(sessionId: string, reason: string): Promise<boolean> {
    const result = await this.db
      .updateTable("user_sessions")
      .set({ revoked_at: new Date(), revocation_reason: reason })
      .where("session_id", "=", sessionId)
      .where("revoked_at", "is", null)
      .executeTakeFirst();
    return Number(result.numUpdatedRows) === 1;
  }

  async recordAudit(input: {
    actorEmployeeId: EmployeeId | null;
    eventType: string;
    subjectEmployeeId: EmployeeId | null;
    details: unknown;
  }): Promise<void> {
    await this.db
      .insertInto("identity_audit_events")
      .values({
        actor_employee_id: input.actorEmployeeId,
        event_type: input.eventType,
        subject_employee_id: input.subjectEmployeeId,
        details: input.details,
      })
      .execute();
  }

  async listAuditEvents(
    input: {
      eventType?: string;
      limit?: number;
    } = {},
  ): Promise<readonly IdentityAuditEventRecord[]> {
    let query = this.db
      .selectFrom("identity_audit_events")
      .selectAll()
      .orderBy("created_at", "desc");
    if (input.eventType !== undefined && input.eventType.length > 0) {
      query = query.where("event_type", "=", input.eventType);
    }
    const rows = await query
      .limit(Math.min(Math.max(input.limit ?? 100, 1), 500))
      .execute();
    return rows.map((row) => ({
      auditEventId: row.audit_event_id,
      actorEmployeeId: row.actor_employee_id,
      eventType: row.event_type,
      subjectEmployeeId: row.subject_employee_id,
      details: row.details,
      createdAt: row.created_at,
    }));
  }

  // ── employee_number / DingTalk SSO ─────────────────────────

  async findEmployeeByEmployeeNumber(
    employeeNumber: string,
  ): Promise<EmployeeRecord | null> {
    const row = await this.db
      .selectFrom("employees")
      .selectAll()
      .where("employee_id", "=", employeeNumber)
      .executeTakeFirst();
    if (row === undefined) return null;
    return {
      employeeId: row.employee_id,
      displayName: row.display_name,
      status: row.status,
      primaryDepartmentId: row.primary_department_id,
      passwordHash: row.password_hash,
      passwordResetRequired: row.password_reset_required,
    };
  }

  async findEmployeeByDingTalkUserId(
    dingtalkUserId: string,
  ): Promise<EmployeeRecord | null> {
    const row = await this.db
      .selectFrom("dingtalk_bindings")
      .innerJoin(
        "employees",
        "employees.employee_id",
        "dingtalk_bindings.employee_id",
      )
      .selectAll("employees")
      .where("dingtalk_bindings.dingtalk_user_id", "=", dingtalkUserId)
      .executeTakeFirst();
    if (row === undefined) return null;
    return {
      employeeId: row.employee_id,
      displayName: row.display_name,
      status: row.status,
      primaryDepartmentId: row.primary_department_id,
      passwordHash: row.password_hash,
      passwordResetRequired: row.password_reset_required,
    };
  }

  async createDingTalkSsoTransaction(input: {
    stateHash: string;
    browserContextBindingHash: string;
    handoffTokenHash?: string;
    returnTo: string;
    expiresAt: Date;
  }): Promise<import("./identity.types.js").DingTalkSsoTransactionRecord> {
    const row = await this.db
      .insertInto("dingtalk_sso_transactions")
      .values({
        state_hash: input.stateHash,
        browser_context_binding_hash: input.browserContextBindingHash,
        handoff_token_hash: input.handoffTokenHash ?? null,
        return_to: input.returnTo,
        expires_at: input.expiresAt,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return {
      transactionId: row.transaction_id,
      stateHash: row.state_hash,
      browserContextBindingHash: row.browser_context_binding_hash,
      handoffTokenHash: row.handoff_token_hash,
      returnTo: row.return_to,
      dingtalkUserId: row.dingtalk_user_id,
      employeeId: row.employee_id,
      expiresAt: row.expires_at,
      consumedAt: row.consumed_at,
    };
  }

  async findDingTalkSsoTransactionByStateHash(
    stateHash: string,
  ): Promise<
    import("./identity.types.js").DingTalkSsoTransactionRecord | null
  > {
    const row = await this.db
      .selectFrom("dingtalk_sso_transactions")
      .selectAll()
      .where("state_hash", "=", stateHash)
      .executeTakeFirst();
    if (row === undefined) return null;
    return {
      transactionId: row.transaction_id,
      stateHash: row.state_hash,
      browserContextBindingHash: row.browser_context_binding_hash,
      handoffTokenHash: row.handoff_token_hash,
      returnTo: row.return_to,
      dingtalkUserId: row.dingtalk_user_id,
      employeeId: row.employee_id,
      expiresAt: row.expires_at,
      consumedAt: row.consumed_at,
    };
  }

  async findDingTalkSsoTransactionByHandoffHash(
    handoffHash: string,
  ): Promise<
    import("./identity.types.js").DingTalkSsoTransactionRecord | null
  > {
    const row = await this.db
      .selectFrom("dingtalk_sso_transactions")
      .selectAll()
      .where("handoff_token_hash", "=", handoffHash)
      .executeTakeFirst();
    if (row === undefined) return null;
    return {
      transactionId: row.transaction_id,
      stateHash: row.state_hash,
      browserContextBindingHash: row.browser_context_binding_hash,
      handoffTokenHash: row.handoff_token_hash,
      returnTo: row.return_to,
      dingtalkUserId: row.dingtalk_user_id,
      employeeId: row.employee_id,
      expiresAt: row.expires_at,
      consumedAt: row.consumed_at,
    };
  }

  async updateDingTalkSsoTransactionAfterCallback(
    transactionId: string,
    dingtalkUserId: string,
  ): Promise<void> {
    await this.db
      .updateTable("dingtalk_sso_transactions")
      .set({ dingtalk_user_id: dingtalkUserId })
      .where("transaction_id", "=", transactionId)
      .execute();
  }

  async consumeDingTalkSsoTransaction(transactionId: string): Promise<boolean> {
    const result = await this.db
      .updateTable("dingtalk_sso_transactions")
      .set({ consumed_at: new Date() })
      .where("transaction_id", "=", transactionId)
      .where("consumed_at", "is", null)
      .where("expires_at", ">", new Date())
      .executeTakeFirst();
    return Number(result.numUpdatedRows) === 1;
  }

  async activateEmployee(employeeId: EmployeeId): Promise<void> {
    await this.db
      .updateTable("employees")
      .set({ status: "active" })
      .where("employee_id", "=", employeeId)
      .where("status", "=", "pending_binding")
      .execute();
  }
}
