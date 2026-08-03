import { describe, expect, it } from "vitest";
import type { DepartmentSummary, EmployeeId } from "@ai-hub/contracts";
import { IdentityService } from "./identity.service.js";
import { PasswordService } from "./password.service.js";
import type {
  CreateEmployeeInput,
  EmployeeRecord,
  IdentityRepository,
  RoleRecord,
  PasswordResetChallengeRecord,
  SessionRecord,
} from "./identity.types.js";

class MemoryIdentityRepository implements IdentityRepository {
  readonly departments = new Map<string, DepartmentSummary>();
  readonly employees = new Map<EmployeeId, EmployeeRecord>();
  readonly roles = new Map<EmployeeId, RoleRecord[]>();
  readonly sessions: SessionRecord[] = [];
  readonly passwordResetChallenges: PasswordResetChallengeRecord[] = [];
  readonly dingtalkBindings = new Map<EmployeeId, string>();

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
    this.dingtalkBindings.set(employeeId, dingtalkUserId);
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
}

describe("IdentityService", () => {
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
      roleCodes: ["organization_admin"],
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
});
