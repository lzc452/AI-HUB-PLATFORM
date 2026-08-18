import { describe, expect, it } from "vitest";
import type {
  ActorContext,
  DepartmentSummary,
  EmployeeId,
  EncryptedLoginEnvelope,
} from "@ai-hub/contracts";
import { SYSTEM_ROLE_DEFINITIONS } from "@ai-hub/database";
import { IdentityService, parseCsv } from "./identity.service.js";
import { PasswordService } from "./password.service.js";
import type {
  CreateEmployeeInput,
  DingTalkSsoTransactionRecord,
  EmployeeRecord,
  IdentityRepository,
  RoleRecord,
  PasswordResetChallengeRecord,
  SessionRecord,
} from "./identity.types.js";
import type { LoginEncryptionService } from "./login-encryption.service.js";
import type { LoginChallengeStore } from "./login-challenge.store.js";

class MemoryIdentityRepository implements IdentityRepository {
  readonly departments = new Map<string, DepartmentSummary>();
  readonly employees = new Map<EmployeeId, EmployeeRecord>();
  readonly roles = new Map<EmployeeId, RoleRecord[]>();
  readonly sessions: SessionRecord[] = [];
  readonly passwordResetChallenges: PasswordResetChallengeRecord[] = [];
  readonly dingtalkBindings = new Map<EmployeeId, string>();
  readonly ssoTransactions: DingTalkSsoTransactionRecord[] = [];

  async withTransaction<T>(
    operation: (repository: IdentityRepository) => Promise<T>,
  ): Promise<T> {
    return operation(this);
  }
  readonly audits: string[] = [];

  async createDepartment(input: DepartmentSummary): Promise<void> {
    this.departments.set(input.departmentId, input);
  }

  async createEmployee(input: CreateEmployeeInput): Promise<void> {
    this.employees.set(input.employeeId, {
      employeeId: input.employeeId,
      employeeNumber: input.employeeNumber ?? input.employeeId,
      displayName: input.displayName,
      status: input.status ?? "pending_binding",
      primaryDepartmentId: input.primaryDepartmentId,
      passwordHash: input.passwordHash ?? null,
      passwordResetRequired: false,
    });
  }

  async assignRole(employeeId: EmployeeId, roleCode: string): Promise<void> {
    this.roles.set(employeeId, [
      ...(this.roles.get(employeeId) ?? []),
      { roleCode, permissions: [] },
    ]);
  }

  async findEmployee(employeeId: EmployeeId): Promise<EmployeeRecord | null> {
    return this.employees.get(employeeId) ?? null;
  }

  async findEmployeeByEmployeeNumber(
    employeeNumber: string,
  ): Promise<EmployeeRecord | null> {
    return (
      [...this.employees.values()].find(
        (e) => e.employeeId === employeeNumber,
      ) ?? null
    );
  }

  async findEmployeeByDingTalkUserId(
    dingtalkUserId: string,
  ): Promise<EmployeeRecord | null> {
    const employeeId = this.dingtalkBindings.get(dingtalkUserId);
    if (employeeId === undefined) return null;
    return this.employees.get(employeeId) ?? null;
  }

  async listEmployees() {
    return [...this.employees.values()];
  }

  async listDepartments() {
    return [...this.departments.values()];
  }

  async listEmployeeDepartmentIds(
    employeeId: EmployeeId,
  ): Promise<readonly string[]> {
    return [this.employees.get(employeeId)?.primaryDepartmentId ?? "missing"];
  }

  async listEmployeeRoles(
    employeeId: EmployeeId,
  ): Promise<readonly RoleRecord[]> {
    return this.roles.get(employeeId) ?? [];
  }

  async listEmployeeIdsWithRole(roleCode: string): Promise<string[]> {
    return [...this.roles.entries()]
      .filter(([, roleRecords]) =>
        roleRecords.some((record) => record.roleCode === roleCode),
      )
      .map(([employeeId]) => employeeId);
  }

  async listEmployeesPage(input?: {
    keyword?: string;
    page?: number;
    pageSize?: number;
  }) {
    const keyword = input?.keyword?.trim().toLowerCase();
    const all = [...this.employees.values()].filter((employee) => {
      if (keyword === undefined || keyword.length === 0) return true;
      return (
        employee.employeeId.toLowerCase().includes(keyword) ||
        employee.displayName.toLowerCase().includes(keyword)
      );
    });
    const page = input?.page ?? 1;
    const pageSize = input?.pageSize ?? 20;
    return {
      items: all
        .slice((page - 1) * pageSize, page * pageSize)
        .map((employee) => ({
          employeeId: employee.employeeId,
          displayName: employee.displayName,
          status: employee.status,
          primaryDepartmentId: employee.primaryDepartmentId,
        })),
      total: all.length,
    };
  }

  async updateEmployee(
    employeeId: EmployeeId,
    input: {
      displayName?: string;
      status?: EmployeeRecord["status"];
      primaryDepartmentId?: string;
    },
  ): Promise<void> {
    const current = this.employees.get(employeeId);
    if (current !== undefined) {
      this.employees.set(employeeId, { ...current, ...input });
    }
  }

  async updateDepartment(
    departmentId: string,
    input: { name?: string; parentDepartmentId?: string | null },
  ): Promise<void> {
    const current = this.departments.get(departmentId);
    if (current !== undefined) {
      this.departments.set(departmentId, { ...current, ...input });
    }
  }

  async deleteDepartment(departmentId: string): Promise<number> {
    return this.departments.delete(departmentId) ? 1 : 0;
  }

  async countDepartmentMembers(departmentId: string): Promise<number> {
    return [...this.employees.values()].filter(
      (employee) => employee.primaryDepartmentId === departmentId,
    ).length;
  }

  async setEmployeeRoles(
    employeeId: EmployeeId,
    roleCodes: readonly string[],
  ): Promise<void> {
    this.roles.set(
      employeeId,
      roleCodes.map((roleCode) => ({ roleCode, permissions: [] })),
    );
  }

  async listSyncRuns() {
    return [];
  }

  async findSession(sessionId: string): Promise<SessionRecord | null> {
    return (
      this.sessions.find((session) => session.sessionId === sessionId) ?? null
    );
  }

  async createPasswordResetChallenge(input: {
    employeeId: EmployeeId;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<PasswordResetChallengeRecord> {
    const challenge = {
      challengeId: `challenge-${this.passwordResetChallenges.length + 1}`,
      employeeId: input.employeeId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      consumedAt: null,
    };
    this.passwordResetChallenges.push(challenge);
    return challenge;
  }

  async findPasswordResetChallenge(
    tokenHash: string,
  ): Promise<PasswordResetChallengeRecord | null> {
    return (
      this.passwordResetChallenges.find(
        (challenge) => challenge.tokenHash === tokenHash,
      ) ?? null
    );
  }

  async consumePasswordResetChallenge(challengeId: string): Promise<boolean> {
    const challenge = this.passwordResetChallenges.find(
      (candidate) => candidate.challengeId === challengeId,
    );
    if (
      challenge === undefined ||
      challenge.consumedAt !== null ||
      challenge.expiresAt.getTime() <= Date.now()
    ) {
      return false;
    }
    challenge.consumedAt = new Date();
    return true;
  }

  async updateEmployeePassword(
    employeeId: EmployeeId,
    passwordHash: string,
  ): Promise<void> {
    const employee = this.employees.get(employeeId);
    if (employee === undefined) {
      throw new Error("EMPLOYEE_NOT_FOUND");
    }
    this.employees.set(employeeId, {
      ...employee,
      passwordHash,
      passwordResetRequired: false,
    });
  }

  async bindDingTalkUser(
    employeeId: EmployeeId,
    dingtalkUserId: string,
  ): Promise<void> {
    this.dingtalkBindings.set(dingtalkUserId, employeeId);
  }

  async claimDingTalkBinding(
    employeeId: EmployeeId,
    dingtalkUserId: string,
  ): Promise<boolean> {
    const employeeBinding = [...this.dingtalkBindings.entries()].find(
      ([, boundEmployeeId]) => boundEmployeeId === employeeId,
    );
    const dingtalkBinding = this.dingtalkBindings.get(dingtalkUserId);
    if (
      (employeeBinding !== undefined &&
        employeeBinding[0] !== dingtalkUserId) ||
      (dingtalkBinding !== undefined && dingtalkBinding !== employeeId)
    ) {
      return false;
    }
    this.dingtalkBindings.set(dingtalkUserId, employeeId);
    return true;
  }

  async createDingTalkSyncRun(): Promise<string> {
    return "sync-1";
  }

  async completeDingTalkSyncRun(): Promise<void> {}

  async createSession(input: {
    employeeId: EmployeeId;
    deviceLabel: string;
    expiresAt: Date;
  }): Promise<SessionRecord> {
    const session = {
      sessionId: `session-${this.sessions.length + 1}`,
      employeeId: input.employeeId,
      deviceLabel: input.deviceLabel,
      expiresAt: input.expiresAt,
      revokedAt: null,
    };
    this.sessions.push(session);
    return session;
  }

  async revokeSessions(employeeId: EmployeeId): Promise<number> {
    let revoked = 0;
    for (const session of this.sessions) {
      if (session.employeeId === employeeId && session.revokedAt === null) {
        session.revokedAt = new Date();
        revoked += 1;
      }
    }
    return revoked;
  }

  async revokeSession(sessionId: string): Promise<boolean> {
    const session = this.sessions.find(
      (candidate) => candidate.sessionId === sessionId,
    );
    if (session === undefined || session.revokedAt !== null) {
      return false;
    }
    session.revokedAt = new Date();
    return true;
  }

  async recordAudit(input: { eventType: string }): Promise<void> {
    this.audits.push(input.eventType);
  }

  // ── SSO stubs ───────────────────────────────────────────────

  async createDingTalkSsoTransaction(input: {
    stateHash: string;
    browserContextBindingHash: string;
    handoffTokenHash?: string;
    returnTo: string;
    dingtalkUserId?: string;
    employeeId?: string;
    expiresAt: Date;
  }): Promise<DingTalkSsoTransactionRecord> {
    const record: DingTalkSsoTransactionRecord = {
      transactionId: `ssotx-${this.ssoTransactions.length + 1}`,
      stateHash: input.stateHash,
      browserContextBindingHash: input.browserContextBindingHash,
      handoffTokenHash: input.handoffTokenHash ?? null,
      returnTo: input.returnTo,
      dingtalkUserId: input.dingtalkUserId ?? null,
      employeeId: input.employeeId ?? null,
      expiresAt: input.expiresAt,
      consumedAt: null,
    };
    this.ssoTransactions.push(record);
    return record;
  }

  async findDingTalkSsoTransactionByStateHash(
    stateHash: string,
  ): Promise<DingTalkSsoTransactionRecord | null> {
    return (
      this.ssoTransactions.find((tx) => tx.stateHash === stateHash) ?? null
    );
  }

  async findDingTalkSsoTransactionByHandoffHash(
    handoffHash: string,
  ): Promise<DingTalkSsoTransactionRecord | null> {
    return (
      this.ssoTransactions.find((tx) => tx.handoffTokenHash === handoffHash) ??
      null
    );
  }

  async consumeDingTalkSsoTransaction(transactionId: string): Promise<boolean> {
    const tx = this.ssoTransactions.find(
      (t) => t.transactionId === transactionId,
    );
    if (
      tx === undefined ||
      tx.consumedAt !== null ||
      tx.expiresAt.getTime() <= Date.now()
    ) {
      return false;
    }
    tx.consumedAt = new Date();
    return true;
  }

  async activateEmployee(employeeId: EmployeeId): Promise<void> {
    const employee = this.employees.get(employeeId);
    if (employee !== undefined && employee.status === "pending_binding") {
      this.employees.set(employeeId, {
        ...employee,
        status: "active",
      });
    }
  }
}

/** 解密 mock：nonce 以 "b" 开头归属账号 B001，否则归属 A001。 */
const fakeEncryption = {
  async decryptEnvelope(envelope: EncryptedLoginEnvelope) {
    return {
      employeeId: envelope.nonce.startsWith("b") ? "B001" : "A001",
      password: "not-checked",
      deviceLabel: "browser",
    };
  },
};

const fakeChallengeStore = {
  async issue() {
    return new Date();
  },
  async consume() {
    return true;
  },
};

function envelopeFor(nonce: string): EncryptedLoginEnvelope {
  return {
    keyId: "k",
    nonce,
    encryptedPayload: "",
    wrappedKey: "",
    iv: "",
    aad: "",
  };
}

function serviceWithLoginThrottle() {
  return new IdentityService(
    new MemoryIdentityRepository(),
    new PasswordService(),
    undefined,
    fakeEncryption as unknown as LoginEncryptionService,
    fakeChallengeStore as unknown as LoginChallengeStore,
  );
}

describe("IdentityService", () => {
  it("parses CSV values with embedded quotes and commas", () => {
    expect(parseCsv('a,b,"c,d","he said ""hi"""\ne,f,g,h')).toEqual([
      ["a", "b", "c,d", 'he said "hi"'],
      ["e", "f", "g", "h"],
    ]);
  });

  it("builds a grouped permission catalog from contracts", async () => {
    const service = new IdentityService(new MemoryIdentityRepository());
    const catalog = await service.getPermissionCatalog();
    expect(catalog.length).toBeGreaterThan(0);
    expect(catalog.every((group) => group.children.length > 0)).toBe(true);
  });

  it("runs a local sync and records a completed sync run", async () => {
    const repository = new MemoryIdentityRepository();
    await repository.createDepartment({
      departmentId: "dept-a",
      name: "研发部",
      parentDepartmentId: null,
      source: "local",
    });
    const service = new IdentityService(repository);
    const result = await service.runLocalSync("manual");
    expect(result.syncRunId).toBe("sync-1");
  });

  it("logs in an active password employee and builds ActorContext", async () => {
    const repository = new MemoryIdentityRepository();
    await repository.createDepartment({
      departmentId: "dept-a",
      name: "研发部",
      parentDepartmentId: null,
      source: "local",
    });
    const service = new IdentityService(repository, new PasswordService());
    await service.createLocalEmployee({
      employeeId: "E001",
      displayName: "Ada",
      primaryDepartmentId: "dept-a",
      status: "active",
      password: "Correct-123",
    });
    await repository.assignRole("E001", "organization_admin");

    const result = await service.loginWithPassword({
      employeeId: "E001",
      password: "Correct-123",
      deviceLabel: "Windows Edge",
    });

    expect(result.actor).toMatchObject({
      employeeId: "E001",
      roleCodes: ["employee", "organization_admin"],
      departmentIds: ["dept-a"],
      primaryDepartmentId: "dept-a",
      sessionId: "session-1",
    });
  });

  it("rejects disabled employees without revealing account state", async () => {
    const repository = new MemoryIdentityRepository();
    const service = new IdentityService(repository, new PasswordService());
    await service.createLocalEmployee({
      employeeId: "E002",
      displayName: "Grace",
      primaryDepartmentId: "dept-a",
      status: "disabled",
      password: "Correct-123",
    });

    await expect(
      service.loginWithPassword({
        employeeId: "E002",
        password: "Correct-123",
        deviceLabel: "browser",
      }),
    ).rejects.toThrow("INVALID_CREDENTIALS");
  });

  it("rejects the 6th password login attempt for the same account within a minute", async () => {
    const service = serviceWithLoginThrottle();
    // 前 5 次通过账号限流（到达密码校验 → INVALID_CREDENTIALS）
    for (let i = 0; i < 5; i++) {
      await expect(
        service.loginWithEncryptedPassword(envelopeFor(`a${i}`)),
      ).rejects.toThrow("INVALID_CREDENTIALS");
    }
    // 第 6 次在密码校验之前被账号限流拒绝
    await expect(
      service.loginWithEncryptedPassword(envelopeFor("a5")),
    ).rejects.toThrow("LOGIN_RATE_LIMITED");
  });

  it("does not let one account's attempts consume another account's quota", async () => {
    const service = serviceWithLoginThrottle();
    // 账号 B 连续尝试 5 次，占满自己的配额
    for (let i = 0; i < 5; i++) {
      await expect(
        service.loginWithEncryptedPassword(envelopeFor(`b${i}`)),
      ).rejects.toThrow("INVALID_CREDENTIALS");
    }
    // 账号 A 的首次尝试不受 B 的影响（仍到达密码校验）
    await expect(
      service.loginWithEncryptedPassword(envelopeFor("a0")),
    ).rejects.toThrow("INVALID_CREDENTIALS");
    // 账号 B 第 6 次 → 429 语义错误码
    await expect(
      service.loginWithEncryptedPassword(envelopeFor("b5")),
    ).rejects.toThrow("LOGIN_RATE_LIMITED");
  });

  it("uses persisted role permissions for custom authorization", async () => {
    const repository = new MemoryIdentityRepository();
    repository.roles.set("E003", [
      { roleCode: "catalog_editor", permissions: ["catalog.publish"] },
    ]);
    const service = new IdentityService(repository);

    await expect(
      service.authorize({
        actor: {
          employeeId: "E003",
          roleCodes: ["catalog_editor"],
          permissions: ["catalog.publish"],
          departmentIds: ["dept-a"],
          primaryDepartmentId: "dept-a",
          sessionId: "session-1",
        },
        action: "publish",
        resourceType: "catalog",
      }),
    ).resolves.toEqual({
      allowed: true,
      reasonCode: "ALLOW_ROLE_PERMISSION",
    });
  });

  it("allows system-role employees to queue notifications (notification.create)", async () => {
    // 生产装配：角色权限来自 roles 表（迁移 0044 将 employee 与
    // SYSTEM_ROLE_DEFINITIONS 对齐），矩阵 queue → NotificationService.createForEvent
    // → authorize({ action: "create", resourceType: "notification" })。
    const employeePermissions = [
      ...(SYSTEM_ROLE_DEFINITIONS.find((role) => role.roleCode === "employee")
        ?.permissions ?? []),
    ];
    const repository = new MemoryIdentityRepository();
    repository.roles.set("E020", [
      { roleCode: "employee", permissions: employeePermissions },
    ]);
    const service = new IdentityService(repository);

    await expect(
      service.authorize({
        actor: {
          employeeId: "E020",
          roleCodes: ["employee"],
          permissions: employeePermissions,
          departmentIds: ["dept-a"],
          primaryDepartmentId: "dept-a",
          sessionId: "session-20",
        },
        action: "create",
        resourceType: "notification",
      }),
    ).resolves.toEqual({
      allowed: true,
      reasonCode: "ALLOW_ROLE_PERMISSION",
    });
  });

  it("denies authorization when the audience evaluator rejects the request", async () => {
    const repository = new MemoryIdentityRepository();
    repository.roles.set("E004", [
      { roleCode: "catalog_editor", permissions: ["catalog.publish"] },
    ]);
    const service = new IdentityService(
      repository,
      new PasswordService(),
      (request) => request.audience?.departmentId === "dept-a",
    );

    await expect(
      service.authorize({
        actor: {
          employeeId: "E004",
          roleCodes: ["catalog_editor"],
          permissions: ["catalog.publish"],
          departmentIds: ["dept-a"],
          primaryDepartmentId: "dept-a",
          sessionId: "session-1",
        },
        action: "publish",
        resourceType: "catalog",
        audience: { departmentId: "dept-b" },
      }),
    ).resolves.toEqual({
      allowed: false,
      reasonCode: "DENY_AUDIENCE",
    });
  });

  it("denies unauthorized requests with a generic reason", async () => {
    const service = new IdentityService(new MemoryIdentityRepository());

    await expect(
      service.authorize({
        actor: {
          employeeId: "E001",
          roleCodes: ["employee"],
          permissions: [],
          departmentIds: ["dept-a"],
          primaryDepartmentId: "dept-a",
          sessionId: "session-1",
        },
        action: "read",
        resourceType: "identity",
        resourceId: "E999",
      }),
    ).resolves.toEqual({
      allowed: false,
      reasonCode: "DENY_NOT_AUTHORIZED",
    });
  });

  it("allows wildcard permissions without consulting resource existence", async () => {
    const service = new IdentityService(new MemoryIdentityRepository());

    await expect(
      service.authorize({
        actor: {
          employeeId: "E010",
          roleCodes: ["super_admin"],
          permissions: ["*"],
          departmentIds: [],
          primaryDepartmentId: "dept-a",
          sessionId: "session-10",
        },
        action: "delete",
        resourceType: "missing-resource",
        resourceId: "does-not-exist",
      }),
    ).resolves.toEqual({
      allowed: true,
      reasonCode: "ALLOW_ROLE_PERMISSION",
    });
  });

  it("rejects an expired session before building actor context", async () => {
    const repository = new MemoryIdentityRepository();
    await repository.createEmployee({
      employeeId: "E005",
      displayName: "Lin",
      primaryDepartmentId: "dept-a",
      status: "active",
      passwordHash: null,
    });
    repository.sessions.push({
      sessionId: "expired-session",
      employeeId: "E005",
      deviceLabel: "browser",
      expiresAt: new Date(Date.now() - 1_000),
      revokedAt: null,
    });
    const service = new IdentityService(repository);

    await expect(
      service.getActorContext("E005", "expired-session"),
    ).rejects.toThrow("SESSION_INVALID");
  });

  it("only logs out the session belonging to the current actor", async () => {
    const repository = new MemoryIdentityRepository();
    await repository.createEmployee({
      employeeId: "E011",
      displayName: "Owner",
      primaryDepartmentId: "dept-a",
      status: "active",
      passwordHash: null,
    });
    await repository.createEmployee({
      employeeId: "E012",
      displayName: "Other",
      primaryDepartmentId: "dept-a",
      status: "active",
      passwordHash: null,
    });
    repository.sessions.push(
      {
        sessionId: "owner-session",
        employeeId: "E011",
        deviceLabel: "browser",
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
      },
      {
        sessionId: "other-session",
        employeeId: "E012",
        deviceLabel: "browser",
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
      },
    );
    const service = new IdentityService(repository);

    await expect(
      service.logout({
        employeeId: "E011",
        roleCodes: ["employee"],
        permissions: [],
        departmentIds: ["dept-a"],
        primaryDepartmentId: "dept-a",
        sessionId: "owner-session",
      }),
    ).resolves.toBe(true);
    await expect(
      service.revokeSessionForActor(
        {
          employeeId: "E011",
          roleCodes: ["employee"],
          permissions: [],
          departmentIds: ["dept-a"],
          primaryDepartmentId: "dept-a",
          sessionId: "owner-session",
        },
        "other-session",
      ),
    ).resolves.toBe(false);
    expect(repository.sessions[1]?.revokedAt).toBeNull();
  });

  it("creates and consumes a password reset challenge while revoking sessions", async () => {
    const repository = new MemoryIdentityRepository();
    await repository.createEmployee({
      employeeId: "E006",
      displayName: "Mina",
      primaryDepartmentId: "dept-a",
      status: "active",
      passwordHash: null,
    });
    const service = new IdentityService(repository);
    const challenge = await service.requestPasswordReset("E006");
    await service.completePasswordReset({
      token: challenge.token,
      newPassword: "New-Password-123",
    });

    expect(repository.employees.get("E006")?.passwordHash).not.toBeNull();
    expect(repository.audits).toContain("identity.password_reset.completed");
  });

  it("does not consume a reset challenge when the replacement password is invalid", async () => {
    const repository = new MemoryIdentityRepository();
    await repository.createEmployee({
      employeeId: "E009",
      displayName: "Nora",
      primaryDepartmentId: "dept-a",
      status: "active",
      passwordHash: null,
    });
    const service = new IdentityService(repository);
    const challenge = await service.requestPasswordReset("E009");

    await expect(
      service.completePasswordReset({
        token: challenge.token,
        newPassword: "short",
      }),
    ).rejects.toThrow("PASSWORD_TOO_SHORT");
    await expect(
      service.completePasswordReset({
        token: challenge.token,
        newPassword: "Valid-Password-123",
      }),
    ).resolves.toBeUndefined();
  });

  it("syncs a DingTalk directory without overwriting an existing local profile", async () => {
    const repository = new MemoryIdentityRepository();
    await repository.createEmployee({
      employeeId: "E007",
      displayName: "Local Name",
      primaryDepartmentId: "dept-local",
      status: "active",
      passwordHash: null,
    });
    const service = new IdentityService(repository);
    const sync = service as unknown as {
      syncDingTalkDirectory(
        port: {
          fetchDirectory(): Promise<{
            departments: readonly DepartmentSummary[];
            employees: readonly {
              employeeId: EmployeeId;
              displayName: string;
              primaryDepartmentId: string;
              dingtalkUserId: string;
            }[];
          }>;
        },
        mode: "manual" | "daily" | "event",
      ): Promise<{ createdEmployees: number }>;
    };

    const result = await sync.syncDingTalkDirectory(
      {
        async fetchDirectory() {
          return {
            departments: [
              {
                departmentId: "dept-dingtalk",
                name: "DingTalk Engineering",
                parentDepartmentId: null,
                source: "dingtalk" as const,
              },
            ],
            employees: [
              {
                employeeId: "E007",
                displayName: "DingTalk Name",
                primaryDepartmentId: "dept-dingtalk",
                dingtalkUserId: "dt-007",
              },
              {
                employeeId: "E008",
                displayName: "New Employee",
                primaryDepartmentId: "dept-dingtalk",
                dingtalkUserId: "dt-008",
              },
            ],
          };
        },
      },
      "manual",
    );

    expect(result.createdEmployees).toBe(1);
    expect(repository.employees.get("E007")?.displayName).toBe("Local Name");
    expect(repository.employees.get("E008")?.displayName).toBe("New Employee");
    expect(repository.audits).toContain("identity.dingtalk.sync.completed");
  });

  it("records a failed DingTalk sync for later audit", async () => {
    const repository = new MemoryIdentityRepository();
    const service = new IdentityService(repository);

    await expect(
      service.syncDingTalkDirectory(
        {
          async fetchDirectory() {
            throw new Error("DINGTALK_UNAVAILABLE");
          },
        },
        "daily",
      ),
    ).rejects.toThrow("DINGTALK_UNAVAILABLE");

    expect(repository.audits).toContain("identity.dingtalk.sync.failed");
  });

  it("lists employee IDs that hold a given role code", async () => {
    const repository = new MemoryIdentityRepository();
    const service = new IdentityService(repository, new PasswordService());
    await service.createLocalEmployee({
      employeeId: "E101",
      displayName: "Requester",
      primaryDepartmentId: "dept-a",
      status: "active",
    });
    await service.createLocalEmployee({
      employeeId: "E102",
      displayName: "Operator",
      primaryDepartmentId: "dept-a",
      status: "active",
    });
    await repository.assignRole("E102", "demand_operator");

    expect(await service.listEmployeeIdsWithRole("demand_operator")).toEqual([
      "E102",
    ]);
    expect(await service.listEmployeeIdsWithRole("application_admin")).toEqual(
      [],
    );
  });

  // -------------------------------------------------------------------------
  // V1 角色收敛：所有分配通道只允许 ASSIGNABLE_ROLE_CODES（employee / super_admin）
  // -------------------------------------------------------------------------

  const adminActor = {
    employeeId: "E001",
  } as unknown as ActorContext;

  it("rejects CSV import rows that assign non-assignable V1 roles", async () => {
    const repository = new MemoryIdentityRepository();
    await repository.createDepartment({
      departmentId: "dept-a",
      name: "研发部",
      parentDepartmentId: null,
      source: "local",
    });
    const service = new IdentityService(repository, new PasswordService());

    const result = await service.applyEmployeeImport(adminActor, [
      {
        employeeId: "E200",
        displayName: "导入用户",
        primaryDepartmentId: "dept-a",
        roleCodes: ["application_admin"],
        password: "Import-123",
        status: "active",
      },
    ]);

    expect(result.created).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.errors[0]).toContain("ROLE_NOT_ASSIGNABLE_IN_V1");
    expect(await repository.findEmployee("E200")).toBeNull();
  });

  it("rejects granting non-assignable roles to a normal user via setEmployeeRoles", async () => {
    const repository = new MemoryIdentityRepository();
    await repository.createEmployee({
      employeeId: "E201",
      displayName: "Role Target",
      primaryDepartmentId: "dept-a",
      status: "active",
      passwordHash: null,
    });
    await repository.assignRole("E201", "employee");
    const service = new IdentityService(repository);

    await expect(
      service.setEmployeeRoles(adminActor, "E201", [
        "employee",
        "application_admin",
      ]),
    ).rejects.toThrow("ROLE_NOT_ASSIGNABLE_IN_V1");
  });

  it("preserves legacy roles when setEmployeeRoles grants assignable ones", async () => {
    const repository = new MemoryIdentityRepository();
    await repository.createEmployee({
      employeeId: "E205",
      displayName: "Legacy Plus",
      primaryDepartmentId: "dept-a",
      status: "active",
      passwordHash: null,
    });
    await repository.assignRole("E205", "application_admin");
    const service = new IdentityService(repository);

    await expect(
      service.setEmployeeRoles(adminActor, "E205", [
        "application_admin",
        "employee",
      ]),
    ).resolves.toBeUndefined();
    expect(
      (await repository.listEmployeeRoles("E205")).map((role) => role.roleCode),
    ).toEqual(["application_admin", "employee"]);
  });

  it("allows clearing all roles via setEmployeeRoles", async () => {
    const repository = new MemoryIdentityRepository();
    await repository.createEmployee({
      employeeId: "E206",
      displayName: "Clear Target",
      primaryDepartmentId: "dept-a",
      status: "active",
      passwordHash: null,
    });
    await repository.assignRole("E206", "application_admin");
    const service = new IdentityService(repository);

    await expect(
      service.setEmployeeRoles(adminActor, "E206", []),
    ).resolves.toBeUndefined();
    expect(await repository.listEmployeeRoles("E206")).toEqual([]);
  });

  it("allows assigning employee and super_admin via setEmployeeRoles", async () => {
    const repository = new MemoryIdentityRepository();
    await repository.createEmployee({
      employeeId: "E202",
      displayName: "Assignable Target",
      primaryDepartmentId: "dept-a",
      status: "active",
      passwordHash: null,
    });
    const service = new IdentityService(repository);

    await expect(
      service.setEmployeeRoles(adminActor, "E202", ["employee", "super_admin"]),
    ).resolves.toBeUndefined();
    expect(
      (await repository.listEmployeeRoles("E202")).map((role) => role.roleCode),
    ).toEqual(["employee", "super_admin"]);
  });

  it("keeps existing non-assignable roles when editing other fields without roleCodes", async () => {
    const repository = new MemoryIdentityRepository();
    await repository.createEmployee({
      employeeId: "E203",
      displayName: "Legacy Holder",
      primaryDepartmentId: "dept-a",
      status: "active",
      passwordHash: null,
    });
    await repository.assignRole("E203", "application_admin");
    const service = new IdentityService(repository);

    await service.updateEmployee(adminActor, "E203", { displayName: "新名字" });

    expect(
      (await repository.listEmployeeRoles("E203")).map((role) => role.roleCode),
    ).toEqual(["application_admin"]);
  });

  it("preserves legacy roles when updateEmployee re-sends them with assignable codes", async () => {
    const repository = new MemoryIdentityRepository();
    await repository.createEmployee({
      employeeId: "E207",
      displayName: "Edit Legacy",
      primaryDepartmentId: "dept-a",
      status: "active",
      passwordHash: null,
    });
    await repository.assignRole("E207", "application_admin");
    const service = new IdentityService(repository);

    // 前端编辑流：roleCodes = 存量 legacy 编码 + 可分发编码
    await service.updateEmployee(adminActor, "E207", {
      displayName: "编辑后姓名",
      roleCodes: ["application_admin", "employee"],
    });

    expect(
      (await repository.listEmployeeRoles("E207")).map((role) => role.roleCode),
    ).toEqual(["application_admin", "employee"]);
    expect(repository.employees.get("E207")?.displayName).toBe("编辑后姓名");
  });

  it("rejects employee creation with non-assignable V1 roles", async () => {
    const repository = new MemoryIdentityRepository();
    await repository.createDepartment({
      departmentId: "dept-a",
      name: "研发部",
      parentDepartmentId: null,
      source: "local",
    });
    const service = new IdentityService(repository, new PasswordService());

    await expect(
      service.createEmployeeByAdmin(adminActor, {
        employeeId: "E204",
        displayName: "New Admin",
        primaryDepartmentId: "dept-a",
        roleCodes: ["organization_admin"],
        password: "Create-123",
        status: "active",
      }),
    ).rejects.toThrow("ROLE_NOT_ASSIGNABLE_IN_V1");
    expect(await repository.findEmployee("E204")).toBeNull();
  });
});
