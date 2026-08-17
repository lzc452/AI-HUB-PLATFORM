import type {
  DepartmentSummary,
  EmployeeId,
  EmployeeSummary,
} from "@ai-hub/contracts";
import type { DatabaseSchema } from "@ai-hub/database";
import { sql, type Kysely } from "kysely";
import type {
  CreateEmployeeInput,
  EmployeeRecord,
  IdentityRepository,
  RoleRecord,
  SessionRecord,
  PasswordResetChallengeRecord,
  DingTalkSyncMode,
  IdentityAuditEventRecord,
  IdentityRoleRecord,
  IdentitySyncConfigRecord,
  IdentitySyncRunItemRecord,
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
        employee_number: input.employeeNumber ?? input.employeeId,
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
      employeeNumber: row.employee_number,
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
    return this.enrichEmployeeSummaries(rows);
  }

  async listDepartments(): Promise<readonly DepartmentSummary[]> {
    const rows = await this.db
      .selectFrom("departments")
      .select([
        "department_id",
        "name",
        "parent_department_id",
        "source",
        "status",
        "manager_employee_id",
        "last_synced_at",
      ])
      .orderBy("department_id")
      .execute();
    const memberCounts = await this.db
      .selectFrom("department_memberships")
      .select("department_id")
      .select(sql<{ count: number }>`count(*)::int`.as("member_count"))
      .groupBy("department_id")
      .execute();
    const applicationCounts = await this.db
      .selectFrom("applications")
      .select("department_id")
      .select(sql<{ count: number }>`count(*)::int`.as("application_count"))
      .groupBy("department_id")
      .execute();
    const memberCountByDepartment = new Map(
      memberCounts.map((row) => [row.department_id, Number(row.member_count)]),
    );
    const applicationCountByDepartment = new Map(
      applicationCounts.map((row) => [
        row.department_id,
        Number(row.application_count),
      ]),
    );
    return rows.map((row) => ({
      departmentId: row.department_id,
      name: row.name,
      parentDepartmentId: row.parent_department_id,
      source: row.source,
      status: row.status,
      managerEmployeeId: row.manager_employee_id,
      lastSyncedAt: row.last_synced_at?.toISOString() ?? null,
      memberCount: memberCountByDepartment.get(row.department_id) ?? 0,
      applicationCount:
        applicationCountByDepartment.get(row.department_id) ?? 0,
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

  async listRoles(): Promise<readonly IdentityRoleRecord[]> {
    const rows = await this.db
      .selectFrom("roles")
      .leftJoin(
        "employees",
        "employees.employee_id",
        "roles.created_by_employee_id",
      )
      .select([
        "roles.role_code",
        "roles.name",
        "roles.permissions",
        "roles.is_system",
        "roles.status",
        "roles.created_by_employee_id",
        "roles.created_at",
        "roles.updated_at",
        "employees.display_name as creator_name",
      ])
      .orderBy("roles.name")
      .execute();
    const counts = await this.db
      .selectFrom("employee_roles")
      .select("role_code")
      .select(sql<{ count: number }>`count(*)::int`.as("member_count"))
      .groupBy("role_code")
      .execute();
    const countByRole = new Map(
      counts.map((row) => [row.role_code, Number(row.member_count)]),
    );
    return rows.map((row) => ({
      roleCode: row.role_code,
      name: row.name,
      permissions: row.permissions,
      isSystem: row.is_system,
      status: row.status,
      createdByEmployeeId: row.created_by_employee_id,
      creatorName: row.creator_name,
      memberCount: countByRole.get(row.role_code) ?? 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  async createRole(input: {
    roleCode: string;
    name: string;
    permissions: readonly string[];
    createdByEmployeeId: EmployeeId;
  }): Promise<void> {
    await this.db
      .insertInto("roles")
      .values({
        role_code: input.roleCode,
        name: input.name,
        permissions: input.permissions,
        is_system: false,
        status: "active",
        created_by_employee_id: input.createdByEmployeeId,
      })
      .execute();
  }

  async updateRole(
    roleCode: string,
    input: {
      name?: string;
      permissions?: readonly string[];
      status?: "active" | "disabled";
    },
  ): Promise<void> {
    await this.db
      .updateTable("roles")
      .set({
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.permissions === undefined
          ? {}
          : { permissions: input.permissions }),
        ...(input.status === undefined ? {} : { status: input.status }),
        updated_at: new Date(),
      })
      .where("role_code", "=", roleCode)
      .execute();
  }

  async listEmployeesPage(input?: {
    keyword?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ items: readonly EmployeeSummary[]; total: number }> {
    const keyword = input?.keyword?.trim();
    const buildQuery = () => {
      let query = this.db
        .selectFrom("employees")
        .select([
          "employee_id",
          "display_name",
          "status",
          "primary_department_id",
        ]);
      if (keyword !== undefined && keyword.length > 0) {
        const pattern = `%${keyword}%`;
        query = query.where((eb) =>
          eb.or([
            eb("employee_id", "ilike", pattern),
            eb("display_name", "ilike", pattern),
          ]),
        );
      }
      return query;
    };
    const countRow = await this.db
      .selectFrom(() => buildQuery().as("filtered"))
      .select(sql<{ count: number }>`count(*)::int`.as("count"))
      .executeTakeFirst();
    const total = Number(countRow?.count ?? 0);
    const page = input?.page ?? 1;
    const pageSize = input?.pageSize ?? 20;
    const rows = await buildQuery()
      .orderBy("employee_id")
      .limit(pageSize)
      .offset((page - 1) * pageSize)
      .execute();
    return {
      items: await this.enrichEmployeeSummaries(rows),
      total,
    };
  }

  private async enrichEmployeeSummaries(
    rows: readonly {
      employee_id: string;
      display_name: string;
      status: "pending_binding" | "active" | "disabled" | "archived";
      primary_department_id: string;
    }[],
  ): Promise<readonly EmployeeSummary[]> {
    if (rows.length === 0) return [];
    const employeeIds = rows.map((row) => row.employee_id);
    const [roleRows, sessionRows] = await Promise.all([
      this.db
        .selectFrom("employee_roles")
        .innerJoin("roles", "roles.role_code", "employee_roles.role_code")
        .select(["employee_roles.employee_id", "roles.name", "roles.role_code"])
        .where("employee_roles.employee_id", "in", employeeIds)
        .where("roles.status", "=", "active")
        .orderBy("roles.role_code")
        .execute(),
      this.db
        .selectFrom("user_sessions")
        .select([
          "employee_id",
          sql<Date | null>`max(created_at)`.as("last_login_at"),
        ])
        .where("employee_id", "in", employeeIds)
        .groupBy("employee_id")
        .execute(),
    ]);
    const rolesByEmployee = new Map<string, string[]>();
    for (const role of roleRows) {
      const names = rolesByEmployee.get(role.employee_id) ?? [];
      names.push(role.name);
      rolesByEmployee.set(role.employee_id, names);
    }
    const loginByEmployee = new Map(
      sessionRows.map((session) => [
        session.employee_id,
        session.last_login_at,
      ]),
    );
    return rows.map((row) => {
      const lastLoginAt = loginByEmployee.get(row.employee_id);
      return {
        employeeId: row.employee_id,
        displayName: row.display_name,
        status: row.status,
        primaryDepartmentId: row.primary_department_id,
        roleNames: rolesByEmployee.get(row.employee_id) ?? [],
        lastLoginAt: lastLoginAt?.toISOString() ?? null,
      };
    });
  }

  async updateEmployee(
    employeeId: EmployeeId,
    input: {
      displayName?: string;
      status?: "pending_binding" | "active" | "disabled" | "archived";
      primaryDepartmentId?: string;
    },
  ): Promise<void> {
    await this.db
      .updateTable("employees")
      .set({
        ...(input.displayName === undefined
          ? {}
          : { display_name: input.displayName }),
        ...(input.status === undefined ? {} : { status: input.status }),
        ...(input.primaryDepartmentId === undefined
          ? {}
          : { primary_department_id: input.primaryDepartmentId }),
      })
      .where("employee_id", "=", employeeId)
      .execute();

    if (input.primaryDepartmentId !== undefined) {
      await this.db
        .updateTable("department_memberships")
        .set({ is_primary: false })
        .where("employee_id", "=", employeeId)
        .where("department_id", "!=", input.primaryDepartmentId)
        .execute();
      await this.db
        .insertInto("department_memberships")
        .values({
          employee_id: employeeId,
          department_id: input.primaryDepartmentId,
          is_primary: true,
        })
        .onConflict((conflict) =>
          conflict.columns(["employee_id", "department_id"]).doUpdateSet({
            is_primary: true,
          }),
        )
        .execute();
    }
  }

  async updateDepartment(
    departmentId: string,
    input: { name?: string; parentDepartmentId?: string | null },
  ): Promise<void> {
    await this.db
      .updateTable("departments")
      .set({
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.parentDepartmentId === undefined
          ? {}
          : { parent_department_id: input.parentDepartmentId }),
      })
      .where("department_id", "=", departmentId)
      .execute();
  }

  async deleteDepartment(departmentId: string): Promise<number> {
    const result = await this.db
      .deleteFrom("departments")
      .where("department_id", "=", departmentId)
      .executeTakeFirst();
    return Number(result.numDeletedRows ?? 0);
  }

  async countDepartmentMembers(departmentId: string): Promise<number> {
    const row = await this.db
      .selectFrom("department_memberships")
      .select(sql<{ count: number }>`count(*)::int`.as("count"))
      .where("department_id", "=", departmentId)
      .executeTakeFirst();
    return Number(row?.count ?? 0);
  }

  async setEmployeeRoles(
    employeeId: EmployeeId,
    roleCodes: readonly string[],
  ): Promise<void> {
    await this.db
      .deleteFrom("employee_roles")
      .where("employee_id", "=", employeeId)
      .execute();
    if (roleCodes.length > 0) {
      await this.db
        .insertInto("employee_roles")
        .values(
          roleCodes.map((roleCode) => ({
            employee_id: employeeId,
            role_code: roleCode,
          })),
        )
        .execute();
    }
  }

  async listSyncRuns(limit = 20): Promise<
    readonly {
      syncRunId: string;
      mode: string;
      status: string;
      startedAt: Date;
      completedAt: Date | null;
      summary: unknown;
    }[]
  > {
    const rows = await this.db
      .selectFrom("dingtalk_sync_runs")
      .select([
        "sync_run_id",
        "mode",
        "status",
        "started_at",
        "finished_at",
        "summary",
      ])
      .orderBy("started_at", "desc")
      .limit(limit)
      .execute();
    return rows.map((row) => ({
      syncRunId: row.sync_run_id,
      mode: row.mode,
      status: row.status,
      startedAt: row.started_at,
      completedAt: row.finished_at,
      summary: row.summary,
    }));
  }

  async findSyncRun(syncRunId: string) {
    const row = await this.db
      .selectFrom("dingtalk_sync_runs")
      .select([
        "sync_run_id",
        "mode",
        "status",
        "started_at",
        "finished_at",
        "summary",
      ])
      .where("sync_run_id", "=", syncRunId)
      .executeTakeFirst();
    return row === undefined
      ? null
      : {
          syncRunId: row.sync_run_id,
          mode: row.mode,
          status: row.status,
          startedAt: row.started_at,
          completedAt: row.finished_at,
          summary: row.summary,
        };
  }

  async listSyncRunItems(
    syncRunId: string,
  ): Promise<readonly IdentitySyncRunItemRecord[]> {
    const rows = await this.db
      .selectFrom("identity_sync_run_items")
      .select([
        "sync_run_item_id",
        "sync_run_id",
        "object_type",
        "object_id",
        "status",
        "processed_count",
        "success_count",
        "failure_count",
        "error_code",
        "started_at",
        "finished_at",
      ])
      .where("sync_run_id", "=", syncRunId)
      .orderBy("created_at")
      .execute();
    return rows.map((row) => ({
      syncRunItemId: row.sync_run_item_id,
      syncRunId: row.sync_run_id,
      objectType: row.object_type,
      objectId: row.object_id,
      status: row.status,
      processedCount: row.processed_count,
      successCount: row.success_count,
      failureCount: row.failure_count,
      errorCode: row.error_code,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
    }));
  }

  async getSyncConfig(): Promise<IdentitySyncConfigRecord | null> {
    const row = await this.db
      .selectFrom("identity_sync_config")
      .select([
        "enabled",
        "schedule",
        "external_org_id",
        "last_updated_by_employee_id",
        "updated_at",
      ])
      .where("id", "=", true)
      .executeTakeFirst();
    return row === undefined
      ? null
      : {
          enabled: row.enabled,
          schedule: row.schedule,
          externalOrgId: row.external_org_id,
          lastUpdatedByEmployeeId: row.last_updated_by_employee_id,
          updatedAt: row.updated_at,
        };
  }

  async updateSyncConfig(input: {
    enabled?: boolean;
    schedule?: string | null;
    externalOrgId?: string | null;
    lastUpdatedByEmployeeId: EmployeeId;
  }): Promise<IdentitySyncConfigRecord> {
    await this.db
      .insertInto("identity_sync_config")
      .values({
        id: true,
        enabled: input.enabled ?? false,
        schedule: input.schedule ?? null,
        external_org_id: input.externalOrgId ?? null,
        secret_reference: null,
        last_updated_by_employee_id: input.lastUpdatedByEmployeeId,
      })
      .onConflict((oc) =>
        oc.column("id").doUpdateSet({
          ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
          ...(input.schedule === undefined ? {} : { schedule: input.schedule }),
          ...(input.externalOrgId === undefined
            ? {}
            : { external_org_id: input.externalOrgId }),
          last_updated_by_employee_id: input.lastUpdatedByEmployeeId,
          updated_at: new Date(),
        }),
      )
      .execute();
    const updated = await this.getSyncConfig();
    if (updated === null) throw new Error("SYNC_CONFIG_NOT_FOUND");
    return updated;
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

  async claimDingTalkBinding(
    employeeId: EmployeeId,
    dingtalkUserId: string,
  ): Promise<boolean> {
    await this.db
      .insertInto("dingtalk_bindings")
      .values({ employee_id: employeeId, dingtalk_user_id: dingtalkUserId })
      .onConflict((conflict) => conflict.doNothing())
      .execute();
    const exact = await this.db
      .selectFrom("dingtalk_bindings")
      .select("employee_id")
      .where("employee_id", "=", employeeId)
      .where("dingtalk_user_id", "=", dingtalkUserId)
      .executeTakeFirst();
    return exact !== undefined;
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
      .where(sql`upper(trim(employee_number))`, "=", employeeNumber)
      .executeTakeFirst();
    if (row === undefined) return null;
    return {
      employeeId: row.employee_id,
      employeeNumber: row.employee_number,
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
      employeeNumber: row.employee_number,
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
    dingtalkUserId?: string;
    employeeId?: string;
    expiresAt: Date;
  }): Promise<import("./identity.types.js").DingTalkSsoTransactionRecord> {
    const row = await this.db
      .insertInto("dingtalk_sso_transactions")
      .values({
        state_hash: input.stateHash,
        browser_context_binding_hash: input.browserContextBindingHash,
        handoff_token_hash: input.handoffTokenHash ?? null,
        return_to: input.returnTo,
        dingtalk_user_id: input.dingtalkUserId ?? null,
        employee_id: input.employeeId ?? null,
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
