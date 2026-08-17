import type {
  ActorContext,
  AuthorizationDecision,
  AuthorizationRequest,
  DepartmentSummary,
  EmployeeId,
  EncryptedLoginEnvelope,
} from "@ai-hub/contracts";
import {
  PERMISSIONS,
  hasPermission,
  permissionGroupLabel,
} from "@ai-hub/contracts";
import { SYSTEM_ROLE_DEFINITIONS } from "@ai-hub/database";
import { PasswordService } from "./password.service.js";
import type {
  CreateEmployeeInput,
  DingTalkDirectoryPort,
  DingTalkSyncMode,
  IdentityRepository,
  IdentityRoleRecord,
  LoginResult,
  AudienceEvaluator,
} from "./identity.types.js";
import type {
  ChallengeContext,
  LoginEncryptionService,
} from "./login-encryption.service.js";
import type { LoginChallengeStore } from "./login-challenge.store.js";
import { createHash, randomBytes } from "crypto";

const sessionTtlMs = 1000 * 60 * 60 * 24 * 14;
const passwordResetTtlMs = 1000 * 60 * 30;
const loginChallengeTtlMs = 1000 * 60 * 5;

export class IdentityService {
  constructor(
    private readonly repository: IdentityRepository,
    private readonly passwords = new PasswordService(),
    private readonly audienceEvaluator: AudienceEvaluator = (request) =>
      request.audience?.departmentId === undefined ||
      request.actor.departmentIds.includes(request.audience.departmentId),
    private readonly encryption?: LoginEncryptionService,
    private readonly challengeStore?: LoginChallengeStore,
  ) {}

  async createLocalEmployee(
    input: CreateEmployeeInput & { password?: string },
  ) {
    const passwordHash =
      input.password === undefined
        ? (input.passwordHash ?? null)
        : await this.passwords.hashPassword(input.password);

    await this.repository.withTransaction(async (repository) => {
      await repository.createEmployee({
        employeeId: input.employeeId,
        displayName: input.displayName,
        primaryDepartmentId: input.primaryDepartmentId,
        status: input.status ?? "pending_binding",
        passwordHash,
      });
      await repository.assignRole(input.employeeId, "employee");
      await repository.recordAudit({
        actorEmployeeId: null,
        eventType: "identity.employee.created",
        subjectEmployeeId: input.employeeId,
        details: { source: "local" },
      });
    });
  }

  async loginWithPassword(input: {
    employeeId: EmployeeId;
    password: string;
    deviceLabel: string;
  }): Promise<LoginResult> {
    const employee = await this.repository.findEmployee(input.employeeId);
    if (
      employee === null ||
      employee.status !== "active" ||
      employee.passwordHash === null ||
      employee.passwordResetRequired
    ) {
      throw new Error("INVALID_CREDENTIALS");
    }

    if (
      !(await this.passwords.verifyPassword(
        input.password,
        employee.passwordHash,
      ))
    ) {
      throw new Error("INVALID_CREDENTIALS");
    }

    return this.repository.withTransaction(async (repository) => {
      const session = await repository.createSession({
        employeeId: employee.employeeId,
        deviceLabel: input.deviceLabel,
        expiresAt: new Date(Date.now() + sessionTtlMs),
      });
      const actor = await this.getActorContextFromRepository(
        repository,
        employee.employeeId,
        session.sessionId,
      );
      await repository.recordAudit({
        actorEmployeeId: employee.employeeId,
        eventType: "identity.session.created",
        subjectEmployeeId: employee.employeeId,
        details: { deviceLabel: input.deviceLabel },
      });
      return { actor, session };
    });
  }

  async revokeEmployeeSessions(
    actorEmployeeId: EmployeeId,
    subjectEmployeeId: EmployeeId,
    reason: string,
  ): Promise<number> {
    return this.repository.withTransaction(async (repository) => {
      const revoked = await repository.revokeSessions(
        subjectEmployeeId,
        reason,
      );
      await repository.recordAudit({
        actorEmployeeId,
        eventType: "identity.sessions.revoked",
        subjectEmployeeId,
        details: { reason, revoked },
      });
      return revoked;
    });
  }

  async revokeSession(sessionId: string, reason = "logout"): Promise<boolean> {
    return this.repository.withTransaction(async (repository) => {
      const session = await repository.findSession(sessionId);
      const revoked = await repository.revokeSession(sessionId, reason);
      if (revoked) {
        await repository.recordAudit({
          actorEmployeeId: session?.employeeId ?? null,
          eventType: "identity.session.revoked",
          subjectEmployeeId: session?.employeeId ?? null,
          details: { sessionId, reason },
        });
      }
      return revoked;
    });
  }

  // -------------------------------------------------------------------------
  // 组织管理（批次 3）：员工分页/更新、部门 CRUD、角色分配、同步记录
  // -------------------------------------------------------------------------

  async listEmployeesPage(input?: {
    keyword?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(1, input?.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, input?.pageSize ?? 20));
    return this.repository.listEmployeesPage({ ...input, page, pageSize });
  }

  async updateEmployee(
    actor: ActorContext,
    employeeId: EmployeeId,
    input: {
      displayName?: string;
      status?: "active" | "disabled" | "pending_binding";
      primaryDepartmentId?: string;
      roleCodes?: readonly string[];
    },
  ): Promise<void> {
    await this.repository.withTransaction(async (repository) => {
      await repository.updateEmployee(employeeId, input);
      if (input.roleCodes !== undefined) {
        await repository.setEmployeeRoles(employeeId, input.roleCodes);
      }
      await repository.recordAudit({
        actorEmployeeId: actor.employeeId,
        eventType: "identity.employee.updated",
        subjectEmployeeId: employeeId,
        details: input,
      });
    });
  }

  async createDepartment(
    actor: ActorContext,
    input: {
      departmentId?: string;
      name: string;
      parentDepartmentId?: string | null;
      source: "local" | "dingtalk";
      managerEmployeeId?: string | null;
      status?: "active" | "disabled";
    },
  ): Promise<void> {
    const departmentId = input.departmentId ?? generateDepartmentId();
    if (input.parentDepartmentId === departmentId) {
      throw new Error("DEPARTMENT_PARENT_CYCLE");
    }
    await this.repository.withTransaction(async (repository) => {
      await repository.createDepartment({
        departmentId,
        name: input.name,
        parentDepartmentId: input.parentDepartmentId ?? null,
        source: input.source,
        status: input.status ?? "active",
        managerEmployeeId: input.managerEmployeeId ?? null,
      });
      await repository.recordAudit({
        actorEmployeeId: actor.employeeId,
        eventType: "identity.department.created",
        subjectEmployeeId: null,
        details: { departmentId },
      });
    });
  }

  async updateDepartment(
    actor: ActorContext,
    departmentId: string,
    input: {
      name?: string;
      parentDepartmentId?: string | null;
      managerEmployeeId?: string | null;
      status?: "active" | "disabled";
    },
  ): Promise<void> {
    if (
      input.parentDepartmentId !== undefined &&
      input.parentDepartmentId === departmentId
    ) {
      throw new Error("DEPARTMENT_PARENT_CYCLE");
    }
    if (input.parentDepartmentId !== undefined && input.parentDepartmentId !== null) {
      const departments = await this.repository.listDepartments();
      const children = new Set<string>();
      const queue = [departmentId];
      while (queue.length > 0) {
        const current = queue.pop()!;
        for (const department of departments) {
          if (department.parentDepartmentId === current && !children.has(department.departmentId)) {
            children.add(department.departmentId);
            queue.push(department.departmentId);
          }
        }
      }
      if (children.has(input.parentDepartmentId)) {
        throw new Error("DEPARTMENT_PARENT_CYCLE");
      }
    }
    await this.repository.withTransaction(async (repository) => {
      await repository.updateDepartment(departmentId, input);
      await repository.recordAudit({
        actorEmployeeId: actor.employeeId,
        eventType: "identity.department.updated",
        subjectEmployeeId: null,
        details: { departmentId, ...input },
      });
    });
  }

  async deleteDepartment(
    actor: ActorContext,
    departmentId: string,
  ): Promise<void> {
    await this.repository.withTransaction(async (repository) => {
      const members = await repository.countDepartmentMembers(departmentId);
      if (members > 0) {
        throw new Error("DEPARTMENT_NOT_EMPTY");
      }
      await repository.deleteDepartment(departmentId);
      await repository.recordAudit({
        actorEmployeeId: actor.employeeId,
        eventType: "identity.department.deleted",
        subjectEmployeeId: null,
        details: { departmentId },
      });
    });
  }

  async setEmployeeRoles(
    actor: ActorContext,
    employeeId: EmployeeId,
    roleCodes: readonly string[],
  ): Promise<void> {
    await this.repository.withTransaction(async (repository) => {
      await repository.setEmployeeRoles(employeeId, roleCodes);
      await repository.recordAudit({
        actorEmployeeId: actor.employeeId,
        eventType: "identity.roles.assigned",
        subjectEmployeeId: employeeId,
        details: { roleCodes },
      });
    });
  }

  async listRoles() {
    if (this.repository.listRoles === undefined) {
      return [] as const;
    }
    return this.repository.listRoles();
  }

  async getOrganizationOverview() {
    const [employees, departments, roles] = await Promise.all([
      this.repository.listEmployees(),
      this.repository.listDepartments(),
      this.listRoles(),
    ]);
    return {
      employees,
      departments,
      roles,
      totals: {
        employees: employees.length,
        activeEmployees: employees.filter(
          (employee) => employee.status === "active",
        ).length,
        departments: departments.length,
        activeDepartments: departments.filter(
          (department) => department.status !== "disabled",
        ).length,
        roles: roles.length,
      },
    };
  }

  async createRole(
    actor: ActorContext,
    input: {
      roleCode?: string;
      name: string;
      permissions: readonly string[];
    },
  ): Promise<void> {
    const roleCode = input.roleCode ?? generateRoleCode();
    if (this.repository.createRole === undefined) {
      throw new Error("ROLE_REPOSITORY_UNAVAILABLE");
    }
    await this.repository.withTransaction(async (repository) => {
      if (repository.createRole === undefined) {
        throw new Error("ROLE_REPOSITORY_UNAVAILABLE");
      }
      await repository.createRole({
        ...input,
        roleCode,
        createdByEmployeeId: actor.employeeId,
      });
      await repository.recordAudit({
        actorEmployeeId: actor.employeeId,
        eventType: "identity.role.created",
        subjectEmployeeId: null,
        details: { roleCode },
      });
    });
  }

  async updateRole(
    actor: ActorContext,
    roleCode: string,
    input: {
      name?: string;
      permissions?: readonly string[];
      status?: "active" | "disabled";
    },
  ): Promise<void> {
    if (this.repository.updateRole === undefined) {
      throw new Error("ROLE_REPOSITORY_UNAVAILABLE");
    }
    await this.repository.withTransaction(async (repository) => {
      if (repository.updateRole === undefined) {
        throw new Error("ROLE_REPOSITORY_UNAVAILABLE");
      }
      await repository.updateRole(roleCode, input);
      await repository.recordAudit({
        actorEmployeeId: actor.employeeId,
        eventType: "identity.role.updated",
        subjectEmployeeId: null,
        details: { roleCode, ...input },
      });
    });
  }

  async listSyncRuns(limit = 20) {
    return this.repository.listSyncRuns(limit);
  }

  async getSyncConfig() {
    return this.repository.getSyncConfig?.() ?? null;
  }

  async updateSyncConfig(
    actor: ActorContext,
    input: {
      enabled?: boolean;
      schedule?: string | null;
      externalOrgId?: string | null;
    },
  ) {
    if (this.repository.updateSyncConfig === undefined) {
      throw new Error("SYNC_REPOSITORY_UNAVAILABLE");
    }
    const result = await this.repository.withTransaction(async (repository) => {
      if (repository.updateSyncConfig === undefined) {
        throw new Error("SYNC_REPOSITORY_UNAVAILABLE");
      }
      const config = await repository.updateSyncConfig({
        ...input,
        lastUpdatedByEmployeeId: actor.employeeId,
      });
      await repository.recordAudit({
        actorEmployeeId: actor.employeeId,
        eventType: "identity.sync.config.updated",
        subjectEmployeeId: null,
        details: input,
      });
      return config;
    });
    return result;
  }

  async getSyncRun(syncRunId: string) {
    return this.repository.findSyncRun?.(syncRunId) ?? null;
  }

  async listSyncRunItems(syncRunId: string) {
    return this.repository.listSyncRunItems?.(syncRunId) ?? [];
  }

  async createEmployeeByAdmin(
    actor: ActorContext,
    input: {
      employeeId: string;
      displayName: string;
      primaryDepartmentId: string;
      roleCodes?: readonly string[];
      password: string;
      status?: "active" | "disabled" | "pending_binding";
    },
  ): Promise<void> {
    const existing = await this.repository.findEmployee(input.employeeId);
    if (existing !== null) throw new Error("EMPLOYEE_ALREADY_EXISTS");

    const departments = await this.repository.listDepartments();
    if (
      !departments.some(
        (department) => department.departmentId === input.primaryDepartmentId,
      )
    ) {
      throw new Error("DEPARTMENT_NOT_FOUND");
    }

    const roleCodes = input.roleCodes?.length
      ? [...new Set(input.roleCodes)]
      : ["employee"];
    const availableRoles = await this.repository.listRoles?.() ?? [];
    for (const roleCode of roleCodes) {
      if (!availableRoles.some((role) => role.roleCode === roleCode)) {
        throw new Error("ROLE_NOT_FOUND");
      }
    }

    const passwordHash = await this.passwords.hashPassword(input.password);
    await this.repository.withTransaction(async (repository) => {
      await repository.createEmployee({
        employeeId: input.employeeId,
        displayName: input.displayName,
        primaryDepartmentId: input.primaryDepartmentId,
        status: input.status ?? "active",
        passwordHash,
      });
      for (const roleCode of roleCodes) {
        await repository.assignRole(input.employeeId, roleCode);
      }
      await repository.recordAudit({
        actorEmployeeId: actor.employeeId,
        eventType: "identity.employee.created",
        subjectEmployeeId: input.employeeId,
        details: { source: "local", roleCodes },
      });
    });
  }

  async archiveEmployee(actor: ActorContext, employeeId: EmployeeId): Promise<void> {
    await this.repository.withTransaction(async (repository) => {
      await repository.updateEmployee(employeeId, { status: "archived" });
      await repository.revokeSessions(employeeId, "employee_archived");
      await repository.recordAudit({
        actorEmployeeId: actor.employeeId,
        eventType: "identity.employee.archived",
        subjectEmployeeId: employeeId,
        details: {},
      });
    });
  }

  async bulkDisableEmployees(
    actor: ActorContext,
    employeeIds: readonly EmployeeId[],
  ): Promise<number> {
    let disabled = 0;
    await this.repository.withTransaction(async (repository) => {
      for (const employeeId of new Set(employeeIds)) {
        await repository.updateEmployee(employeeId, { status: "disabled" });
        await repository.revokeSessions(employeeId, "employee_disabled");
        await repository.recordAudit({
          actorEmployeeId: actor.employeeId,
          eventType: "identity.employee.disabled",
          subjectEmployeeId: employeeId,
          details: {},
        });
        disabled += 1;
      }
    });
    return disabled;
  }

  async resetEmployeePassword(
    actor: ActorContext,
    employeeId: EmployeeId,
    newPassword: string,
  ): Promise<void> {
    const passwordHash = await this.passwords.hashPassword(newPassword);
    await this.repository.withTransaction(async (repository) => {
      await repository.updateEmployeePassword(employeeId, passwordHash);
      await repository.revokeSessions(employeeId, "password_reset");
      await repository.recordAudit({
        actorEmployeeId: actor.employeeId,
        eventType: "identity.employee.password_reset",
        subjectEmployeeId: employeeId,
        details: {},
      });
    });
  }

  async listDepartmentMembers(departmentId: string) {
    const employees = await this.repository.listEmployees();
    return employees.filter(
      (employee) => employee.primaryDepartmentId === departmentId,
    );
  }

  async getPermissionCatalog() {
    return buildPermissionCatalog();
  }

  async listRoleTemplates() {
    return SYSTEM_ROLE_DEFINITIONS.map((role) => ({
      roleCode: role.roleCode,
      name: role.name,
      permissions: [...role.permissions],
    }));
  }

  async getRoleDetail(roleCode: string) {
    const role = await this.repository.findRole?.(roleCode);
    if (role === undefined || role === null) throw new Error("ROLE_NOT_FOUND");
    return role;
  }

  async deleteRoleIfUnused(actor: ActorContext, roleCode: string): Promise<void> {
    const role = await this.repository.findRole?.(roleCode);
    if (role === undefined || role === null) throw new Error("ROLE_NOT_FOUND");
    if (role.isSystem) throw new Error("SYSTEM_ROLE_CANNOT_BE_DELETED");
    const members = await this.repository.countRoleMembers?.(roleCode) ?? 0;
    if (members > 0) throw new Error("ROLE_NOT_EMPTY");
    if (this.repository.deleteRole === undefined) {
      throw new Error("ROLE_REPOSITORY_UNAVAILABLE");
    }
    await this.repository.withTransaction(async (repository) => {
      if (repository.deleteRole === undefined) {
        throw new Error("ROLE_REPOSITORY_UNAVAILABLE");
      }
      await repository.deleteRole(roleCode);
      await repository.recordAudit({
        actorEmployeeId: actor.employeeId,
        eventType: "identity.role.deleted",
        subjectEmployeeId: null,
        details: { roleCode },
      });
    });
  }

  async copyRole(
    actor: ActorContext,
    sourceRoleCode: string,
    input: { roleCode: string; name: string },
  ): Promise<void> {
    const source = await this.repository.findRole?.(sourceRoleCode);
    if (source === undefined || source === null) throw new Error("ROLE_NOT_FOUND");
    const existing = await this.repository.findRole?.(input.roleCode);
    if (existing !== undefined && existing !== null) {
      throw new Error("ROLE_ALREADY_EXISTS");
    }
    await this.createRole(actor, {
      roleCode: input.roleCode,
      name: input.name,
      permissions: source.permissions,
    });
  }

  async bulkDisableRoles(
    actor: ActorContext,
    roleCodes: readonly string[],
  ): Promise<number> {
    let disabled = 0;
    for (const roleCode of new Set(roleCodes)) {
      await this.updateRole(actor, roleCode, { status: "disabled" });
      disabled += 1;
    }
    return disabled;
  }

  async runLocalSync(mode: DingTalkSyncMode, departmentId?: string) {
    const syncRunId = await this.repository.createDingTalkSyncRun(mode);
    try {
      await this.repository.withTransaction(async (repository) => {
        const departments = await repository.listDepartments();
        const targets =
          departmentId === undefined
            ? departments
            : departments.filter(
                (department) => department.departmentId === departmentId,
              );
        if (departmentId !== undefined && targets.length === 0) {
          throw new Error("DEPARTMENT_NOT_FOUND");
        }

        const now = new Date();
        let processed = 0;
        for (const department of targets) {
          if (repository.markDepartmentSynced !== undefined) {
            await repository.markDepartmentSynced(department.departmentId, now);
          }
          if (repository.createIdentitySyncRunItem !== undefined) {
            await repository.createIdentitySyncRunItem({
              syncRunId,
              objectType: "department",
              objectId: department.departmentId,
              status: "completed",
              processedCount: department.memberCount ?? 0,
              successCount: department.memberCount ?? 0,
              failureCount: 0,
              startedAt: now,
              finishedAt: now,
            });
          }
          processed += 1;
        }

        if (repository.createIdentitySyncRunItem !== undefined) {
          await repository.createIdentitySyncRunItem({
            syncRunId,
            objectType: "organization",
            objectId: "root",
            status: "completed",
            processedCount: processed,
            successCount: processed,
            failureCount: 0,
            startedAt: now,
            finishedAt: now,
          });
        }
      });

      await this.repository.completeDingTalkSyncRun(syncRunId, "completed", {
        mode,
        departmentId: departmentId ?? null,
      });
      return { syncRunId };
    } catch (error) {
      if (this.repository.updateSyncRunStatus !== undefined) {
        await this.repository.updateSyncRunStatus(syncRunId, "failed", {
          error: error instanceof Error ? error.message : "LOCAL_SYNC_FAILED",
        }).catch(() => undefined);
      }
      throw error;
    }
  }

  async retryLocalSync(syncRunId: string) {
    const run = await this.repository.findSyncRun?.(syncRunId);
    if (run === undefined || run === null) throw new Error("SYNC_RUN_NOT_FOUND");
    return this.runLocalSync(run.mode as DingTalkSyncMode);
  }

  async cancelSyncRun(syncRunId: string): Promise<void> {
    const run = await this.repository.findSyncRun?.(syncRunId);
    if (run === undefined || run === null) throw new Error("SYNC_RUN_NOT_FOUND");
    if (run.status === "completed" || run.status === "failed" || run.status === "cancelled") {
      throw new Error("SYNC_RUN_NOT_CANCELLABLE");
    }
    await this.repository.updateSyncRunStatus?.(syncRunId, "cancelled", {
      cancelledAt: new Date().toISOString(),
    });
  }

  async previewEmployeeImport(rows: readonly Record<string, string>[]) {
    const departments = await this.repository.listDepartments();
    const roles = await this.repository.listRoles?.() ?? [];
    const departmentLookup = buildDepartmentLookup(departments);
    const roleLookup = buildRoleLookup(roles);
    const normalized: Array<{
      employeeId: string;
      displayName: string;
      primaryDepartmentId: string;
      roleCodes: string[];
      password: string | null;
      status: "active" | "disabled" | "pending_binding";
    }> = [];
    const errors: string[] = [];

    for (const [index, row] of rows.entries()) {
      const employeeId = row.employeeId?.trim();
      const displayName = row.displayName?.trim();
      const department = resolveDepartment(
        row.primaryDepartmentId,
        departmentLookup,
      );
      const status = normalizeEmployeeStatus(row.status);
      const roleCodes = normalizeRoleCodes(row.roleCodes, roleLookup);
      if (!employeeId || !displayName || !department || !status) {
        errors.push(`第 ${index + 1} 行字段缺失或无法识别`);
        continue;
      }
      normalized.push({
        employeeId,
        displayName,
        primaryDepartmentId: department,
        roleCodes,
        password: row.password?.trim() || null,
        status,
      });
    }

    const preview = await Promise.all(
      normalized.map(async (incoming) => {
        const existing = await this.repository.findEmployee(incoming.employeeId);
        const conflicts: Record<
          string,
          { current: string; incoming: string }
        > = {};
        if (existing !== null) {
          compareIfDifferent(
            conflicts,
            "displayName",
            existing.displayName,
            incoming.displayName,
          );
          compareIfDifferent(
            conflicts,
            "primaryDepartmentId",
            existing.primaryDepartmentId,
            incoming.primaryDepartmentId,
          );
          const existingRoles = [...(await this.repository.listEmployeeRoles(incoming.employeeId))]
            .map((role) => role.roleCode)
            .sort();
          compareIfDifferent(
            conflicts,
            "roleCodes",
            existingRoles.join(","),
            [...incoming.roleCodes].sort().join(","),
          );
          compareIfDifferent(
            conflicts,
            "status",
            existing.status,
            incoming.status,
          );
        }
        return {
          ...incoming,
          passwordProvided: incoming.password !== null,
          password: incoming.password,
          exists: existing !== null,
          conflicts,
        };
      }),
    );

    return {
      rows: preview,
      summary: {
        total: preview.length,
        create: preview.filter((row) => !row.exists).length,
        update: preview.filter((row) => row.exists).length,
        invalid: errors.length,
      },
      errors,
    };
  }

  async applyEmployeeImport(
    actor: ActorContext,
    rows: readonly {
      employeeId: string;
      displayName: string;
      primaryDepartmentId: string;
      roleCodes?: readonly string[];
      password?: string | null;
      status?: "active" | "disabled" | "pending_binding";
    }[],
  ) {
    let created = 0;
    let updated = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const row of rows) {
      try {
        const existing = await this.repository.findEmployee(row.employeeId);
        const roleCodes = row.roleCodes?.length
          ? [...new Set(row.roleCodes)]
          : ["employee"];
        if (existing === null) {
          if (!row.password) throw new Error("PASSWORD_REQUIRED");
          const passwordHash = await this.passwords.hashPassword(row.password);
          await this.repository.withTransaction(async (repository) => {
            await repository.createEmployee({
              employeeId: row.employeeId,
              displayName: row.displayName,
              primaryDepartmentId: row.primaryDepartmentId,
              status: row.status ?? "active",
              passwordHash,
            });
            for (const roleCode of roleCodes) {
              await repository.assignRole(row.employeeId, roleCode);
            }
            await repository.recordAudit({
              actorEmployeeId: actor.employeeId,
              eventType: "identity.employee.imported",
              subjectEmployeeId: row.employeeId,
              details: { source: "csv" },
            });
          });
          created += 1;
        } else {
          await this.repository.withTransaction(async (repository) => {
            await repository.updateEmployee(row.employeeId, {
              displayName: row.displayName,
              primaryDepartmentId: row.primaryDepartmentId,
              status: row.status ?? "active",
            });
            await repository.setEmployeeRoles(row.employeeId, roleCodes);
            if (row.password) {
              const passwordHash = await this.passwords.hashPassword(row.password);
              await repository.updateEmployeePassword(row.employeeId, passwordHash);
            }
            await repository.recordAudit({
              actorEmployeeId: actor.employeeId,
              eventType: "identity.employee.imported",
              subjectEmployeeId: row.employeeId,
              details: { source: "csv", updated: true },
            });
          });
          updated += 1;
        }
      } catch (error) {
        failed += 1;
        errors.push(
          `${row.employeeId}: ${error instanceof Error ? error.message : "IMPORT_FAILED"}`,
        );
      }
    }

    return { created, updated, failed, errors };
  }

  async previewDepartmentImport(rows: readonly Record<string, string>[]) {
    const departments = await this.repository.listDepartments();
    const employees = await this.repository.listEmployees();
    const employeeIds = new Set(employees.map((employee) => employee.employeeId));
    const departmentLookup = buildDepartmentLookup(departments);
    const preview = [];
    const errors: string[] = [];

    for (const [index, row] of rows.entries()) {
      const departmentId = row.departmentId?.trim();
      const name = row.name?.trim();
      const parentDepartmentId = resolveDepartment(
        row.parentDepartmentId,
        departmentLookup,
      );
      const managerEmployeeId = row.managerEmployeeId?.trim() || null;
      const status = row.status === "停用" ? "disabled" : "active";
      if (!departmentId || !name) {
        errors.push(`第 ${index + 1} 行缺少部门 ID 或名称`);
        continue;
      }
      if (managerEmployeeId !== null && !employeeIds.has(managerEmployeeId)) {
        errors.push(`第 ${index + 1} 行负责人工号不存在`);
        continue;
      }
      const existing = departments.find(
        (department) => department.departmentId === departmentId,
      );
      const conflicts: Record<
        string,
        { current: string; incoming: string }
      > = {};
      if (existing) {
        compareIfDifferent(conflicts, "name", existing.name, name);
        compareIfDifferent(
          conflicts,
          "parentDepartmentId",
          existing.parentDepartmentId ?? "",
          parentDepartmentId ?? "",
        );
        compareIfDifferent(
          conflicts,
          "managerEmployeeId",
          existing.managerEmployeeId ?? "",
          managerEmployeeId ?? "",
        );
        compareIfDifferent(
          conflicts,
          "status",
          existing.status ?? "active",
          status,
        );
      }
      preview.push({
        departmentId,
        name,
        parentDepartmentId,
        managerEmployeeId,
        status,
        exists: existing !== undefined,
        conflicts,
      });
    }

    return {
      rows: preview,
      summary: {
        total: preview.length,
        create: preview.filter((row) => !row.exists).length,
        update: preview.filter((row) => row.exists).length,
        invalid: errors.length,
      },
      errors,
    };
  }

  async applyDepartmentImport(
    actor: ActorContext,
    rows: readonly {
      departmentId: string;
      name: string;
      parentDepartmentId?: string | null;
      managerEmployeeId?: string | null;
      status?: "active" | "disabled";
    }[],
  ) {
    let created = 0;
    let updated = 0;
    let failed = 0;
    const errors: string[] = [];
    const existingDepartments = await this.repository.listDepartments();

    for (const row of rows) {
      try {
        const exists = existingDepartments.some(
          (department) => department.departmentId === row.departmentId,
        );
        await this.repository.withTransaction(async (repository) => {
          await repository.createDepartment({
            departmentId: row.departmentId,
            name: row.name,
            parentDepartmentId: row.parentDepartmentId ?? null,
            source: "local",
            status: row.status ?? "active",
            managerEmployeeId: row.managerEmployeeId ?? null,
          });
          await repository.recordAudit({
            actorEmployeeId: actor.employeeId,
            eventType: exists
              ? "identity.department.updated"
              : "identity.department.created",
            subjectEmployeeId: null,
            details: { departmentId: row.departmentId, source: "csv" },
          });
        });
        if (exists) updated += 1;
        else created += 1;
      } catch (error) {
        failed += 1;
        errors.push(
          `${row.departmentId}: ${error instanceof Error ? error.message : "IMPORT_FAILED"}`,
        );
      }
    }

    return { created, updated, failed, errors };
  }

  /** 仅撤销当前调用者自己的会话，避免 logout 接口被用来注销他人会话。 */
  async logout(actor: ActorContext): Promise<boolean> {
    return this.revokeSessionForActor(actor, actor.sessionId);
  }

  async revokeSessionForActor(
    actor: ActorContext,
    sessionId: string,
    reason = "logout",
  ): Promise<boolean> {
    if (sessionId !== actor.sessionId) {
      return false;
    }
    const session = await this.repository.findSession(sessionId);
    if (session === null || session.employeeId !== actor.employeeId) {
      return false;
    }
    return this.revokeSession(sessionId, reason);
  }

  async requestPasswordReset(employeeId: EmployeeId): Promise<{
    challengeId: string;
    token: string;
    expiresAt: Date;
  }> {
    const employee = await this.repository.findEmployee(employeeId);
    if (employee === null) {
      throw new Error("EMPLOYEE_NOT_FOUND");
    }

    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + passwordResetTtlMs);
    const challenge = await this.repository.withTransaction(
      async (repository) => {
        const created = await repository.createPasswordResetChallenge({
          employeeId,
          tokenHash: this.hashResetToken(token),
          expiresAt,
        });
        await repository.recordAudit({
          actorEmployeeId: null,
          eventType: "identity.password_reset.requested",
          subjectEmployeeId: employeeId,
          details: { challengeId: created.challengeId },
        });
        return created;
      },
    );
    return { challengeId: challenge.challengeId, token, expiresAt };
  }

  async completePasswordReset(input: {
    token: string;
    newPassword: string;
  }): Promise<void> {
    const challenge = await this.repository.findPasswordResetChallenge(
      this.hashResetToken(input.token),
    );
    if (
      challenge === null ||
      challenge.consumedAt !== null ||
      challenge.expiresAt.getTime() <= Date.now()
    ) {
      throw new Error("INVALID_RESET_CHALLENGE");
    }

    const passwordHash = await this.passwords.hashPassword(input.newPassword);
    await this.repository.withTransaction(async (repository) => {
      const consumed = await repository.consumePasswordResetChallenge(
        challenge.challengeId,
      );
      if (!consumed) {
        throw new Error("INVALID_RESET_CHALLENGE");
      }

      await repository.updateEmployeePassword(
        challenge.employeeId,
        passwordHash,
      );
      const revoked = await repository.revokeSessions(
        challenge.employeeId,
        "password_reset",
      );
      await repository.recordAudit({
        actorEmployeeId: null,
        eventType: "identity.password_reset.completed",
        subjectEmployeeId: challenge.employeeId,
        details: { revoked },
      });
    });
  }

  private hashResetToken(token: string): string {
    return createHash("sha256").update(token, "utf8").digest("hex");
  }

  async syncDingTalkDirectory(
    port: DingTalkDirectoryPort,
    mode: DingTalkSyncMode,
  ): Promise<{
    syncRunId: string;
    createdEmployees: number;
    boundEmployees: number;
  }> {
    const syncRunId = await this.repository.createDingTalkSyncRun(mode);
    try {
      const snapshot = await port.fetchDirectory();
      return this.repository.withTransaction(async (repository) => {
        for (const department of snapshot.departments) {
          await repository.createDepartment(department);
        }

        let createdEmployees = 0;
        for (const employee of snapshot.employees) {
          const existing = await repository.findEmployee(employee.employeeId);
          if (existing === null) {
            await repository.createEmployee({
              employeeId: employee.employeeId,
              displayName: employee.displayName,
              primaryDepartmentId: employee.primaryDepartmentId,
              status: "pending_binding",
              passwordHash: null,
            });
            createdEmployees += 1;
          }
          await repository.assignRole(employee.employeeId, "employee");
          await repository.bindDingTalkUser(
            employee.employeeId,
            employee.dingtalkUserId,
          );
        }

        const summary = {
          departments: snapshot.departments.length,
          employees: snapshot.employees.length,
          createdEmployees,
        };
        await repository.completeDingTalkSyncRun(
          syncRunId,
          "completed",
          summary,
        );
        await repository.recordAudit({
          actorEmployeeId: null,
          eventType: "identity.dingtalk.sync.completed",
          subjectEmployeeId: null,
          details: { syncRunId, mode, ...summary },
        });
        return {
          syncRunId,
          createdEmployees,
          boundEmployees: snapshot.employees.length,
        };
      });
    } catch (error) {
      await this.repository.withTransaction(async (repository) => {
        await repository.completeDingTalkSyncRun(syncRunId, "failed", {
          error: error instanceof Error ? error.name : "UNKNOWN_ERROR",
        });
        await repository.recordAudit({
          actorEmployeeId: null,
          eventType: "identity.dingtalk.sync.failed",
          subjectEmployeeId: null,
          details: { syncRunId, mode },
        });
      });
      throw error;
    }
  }

  async getActorContext(
    employeeId: EmployeeId,
    sessionId: string,
  ): Promise<ActorContext> {
    return this.getActorContextFromRepository(
      this.repository,
      employeeId,
      sessionId,
    );
  }

  private async getActorContextFromRepository(
    repository: IdentityRepository,
    employeeId: EmployeeId,
    sessionId: string,
  ): Promise<ActorContext> {
    const session = await repository.findSession(sessionId);
    if (
      session === null ||
      session.employeeId !== employeeId ||
      session.revokedAt !== null ||
      session.expiresAt.getTime() <= Date.now()
    ) {
      throw new Error("SESSION_INVALID");
    }

    const employee = await repository.findEmployee(employeeId);
    if (employee === null || employee.status !== "active") {
      throw new Error("ACTOR_NOT_ACTIVE");
    }

    const [departmentIds, roles] = await Promise.all([
      repository.listEmployeeDepartmentIds(employeeId),
      repository.listEmployeeRoles(employeeId),
    ]);

    return {
      employeeId,
      displayName: employee.displayName,
      roleCodes: roles
        .map((role) => role.roleCode)
        .sort((left, right) => {
          if (left === "employee") return right === "employee" ? 0 : -1;
          if (right === "employee") return 1;
          return left.localeCompare(right);
        }),
      permissions: [
        ...new Set(roles.flatMap((role) => role.permissions)),
      ].sort(),
      departmentIds,
      primaryDepartmentId: employee.primaryDepartmentId,
      sessionId,
    };
  }

  async authorize(
    request: AuthorizationRequest,
  ): Promise<AuthorizationDecision> {
    if (!this.audienceEvaluator(request)) {
      return { allowed: false, reasonCode: "DENY_AUDIENCE" };
    }

    const roleRecords = await this.repository.listEmployeeRoles(
      request.actor.employeeId,
    );
    const persistedPermissions = [
      ...(request.actor.permissions ?? []),
      ...roleRecords.flatMap((role) => role.permissions),
    ];
    if (persistedPermissions.includes("*")) {
      return { allowed: true, reasonCode: "ALLOW_ROLE_PERMISSION" };
    }
    const permission =
      request.permission ?? `${request.resourceType}.${request.action}`;
    if (
      hasPermission(
        { permissions: [...new Set(persistedPermissions)] },
        permission,
      )
    ) {
      return { allowed: true, reasonCode: "ALLOW_ROLE_PERMISSION" };
    }

    return { allowed: false, reasonCode: "DENY_NOT_AUTHORIZED" };
  }

  listEmployees() {
    return this.repository.listEmployees();
  }

  listDepartments() {
    return this.repository.listDepartments();
  }

  listEmployeeRoles(employeeId: EmployeeId) {
    return this.repository.listEmployeeRoles(employeeId);
  }

  listAuditEvents(input?: { eventType?: string; limit?: number }) {
    if (this.repository.listAuditEvents === undefined) {
      return Promise.resolve([]);
    }
    return this.repository.listAuditEvents(input);
  }

  // ── Login encryption ───────────────────────────────────────

  /** Generate an encryption challenge (public JWK + nonce). */
  async generateChallenge(): Promise<ChallengeContext> {
    if (this.encryption === undefined || this.challengeStore === undefined) {
      throw new Error("LOGIN_METHOD_UNAVAILABLE");
    }
    const challenge = this.encryption.createChallenge();
    const expiresAt = await this.challengeStore.issue({
      nonceHash: challenge.nonceHash,
      keyId: challenge.keyId,
      ttlMs: loginChallengeTtlMs,
    });
    return { ...challenge, expiresAt };
  }

  /** Login with an encrypted envelope. */
  async loginWithEncryptedPassword(
    envelope: EncryptedLoginEnvelope,
  ): Promise<LoginResult> {
    if (this.encryption === undefined || this.challengeStore === undefined) {
      throw new Error("LOGIN_METHOD_UNAVAILABLE");
    }

    // Consume the nonce (replay protection).
    const nonceHash = createHash("sha256").update(envelope.nonce).digest("hex");
    const consumed = await this.challengeStore.consume({
      nonceHash,
      keyId: envelope.keyId,
    });
    if (!consumed) {
      throw new Error("LOGIN_REPLAY_DETECTED");
    }

    const payload = await this.encryption.decryptEnvelope(
      envelope,
      envelope.nonce,
    );

    return this.loginWithPassword({
      employeeId: payload.employeeId,
      password: payload.password,
      deviceLabel: payload.deviceLabel,
    });
  }

  // ── DingTalk SSO helpers ───────────────────────────────────

  /** Standardize an employee number for lookup: trim + uppercase. */
  standardizeEmployeeNumber(raw: string): string {
    return raw.trim().toUpperCase();
  }
}

function buildPermissionCatalog() {
  const groups = new Map<string, string[]>();
  for (const permission of Object.values(PERMISSIONS)) {
    const group = permission.split(".")[0]!;
    const existing = groups.get(group) ?? [];
    existing.push(permission);
    groups.set(group, existing);
  }
  return [...groups.entries()].map(([group, children]) => ({
    key: group,
    title: permissionGroupLabel(group),
    children: children.sort(),
  }));
}

function generateDepartmentId(): string {
  return `dept-${randomBytes(6).toString("hex")}`;
}

function generateRoleCode(): string {
  return `role_${randomBytes(5).toString("hex")}`;
}

function buildDepartmentLookup(departments: readonly DepartmentSummary[]) {
  const byId = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const department of departments) {
    byId.set(department.departmentId, department.departmentId);
    byName.set(department.name, department.departmentId);
  }
  return { byId, byName };
}

function buildRoleLookup(roles: readonly IdentityRoleRecord[]) {
  const byCode = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const role of roles) {
    byCode.set(role.roleCode, role.roleCode);
    byName.set(role.name, role.roleCode);
  }
  return { byCode, byName };
}

function resolveDepartment(
  value: string | undefined,
  lookup: { byId: Map<string, string>; byName: Map<string, string> },
): string | null {
  const normalized = value?.trim() ?? "";
  if (normalized.length === 0) return null;
  return (
    lookup.byId.get(normalized) ??
    lookup.byName.get(normalized) ??
    null
  );
}

function normalizeEmployeeStatus(
  value: string | undefined,
): "active" | "disabled" | "pending_binding" | null {
  if (value === undefined || value.trim() === "") return "active";
  const normalized = value.trim();
  if (normalized === "启用") return "active";
  if (normalized === "停用") return "disabled";
  if (normalized === "待绑定") return "pending_binding";
  if (normalized === "active") return "active";
  if (normalized === "disabled") return "disabled";
  if (normalized === "pending_binding") return "pending_binding";
  return null;
}

function normalizeRoleCodes(
  value: string | undefined,
  lookup: { byCode: Map<string, string>; byName: Map<string, string> },
): string[] {
  if (value === undefined || value.trim() === "") return ["employee"];
  const parts = value
    .split(/[,，、]/)
    .map((part) => part.trim())
    .filter(Boolean);
  return [
    ...new Set(
      parts.map((part) => lookup.byCode.get(part) ?? lookup.byName.get(part) ?? part),
    ),
  ];
}

function compareIfDifferent(
  target: Record<string, { current: string; incoming: string }>,
  key: string,
  current: string,
  incoming: string,
): void {
  if (current !== incoming) {
    target[key] = { current, incoming };
  }
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
