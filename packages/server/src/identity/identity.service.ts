import type {
  ActorContext,
  AuthorizationDecision,
  AuthorizationRequest,
  EmployeeId,
  EncryptedLoginEnvelope,
} from "@ai-hub/contracts";
import { hasPermission } from "@ai-hub/contracts";
import { PasswordService } from "./password.service.js";
import type {
  CreateEmployeeInput,
  DingTalkDirectoryPort,
  DingTalkSyncMode,
  IdentityRepository,
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

  // ── Login encryption ───────────────────────────────────────

  /** Generate an encryption challenge (public JWK + nonce). */
  generateChallenge(): ChallengeContext {
    if (this.encryption === undefined) {
      throw new Error("LOGIN_METHOD_UNAVAILABLE");
    }
    return this.encryption.createChallenge();
  }

  /** Login with an encrypted envelope. */
  async loginWithEncryptedPassword(
    envelope: EncryptedLoginEnvelope,
  ): Promise<LoginResult> {
    if (
      this.encryption === undefined ||
      this.challengeStore === undefined
    ) {
      throw new Error("LOGIN_METHOD_UNAVAILABLE");
    }

    // Consume the nonce (replay protection).
    const nonceHash = createHash("sha256")
      .update(envelope.nonce)
      .digest("hex");
    const consumed = await this.challengeStore.consume(
      nonceHash,
      new Date(Date.now() + 5 * 60 * 1000),
    );
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
