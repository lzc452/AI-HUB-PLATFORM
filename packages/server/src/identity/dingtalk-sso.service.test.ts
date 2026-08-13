import { describe, expect, it } from "vitest";
import type { ActorContext } from "@ai-hub/contracts";
import type {
  DingTalkSsoTransactionRecord,
  EmployeeRecord,
  IdentityRepository,
  SessionRecord,
} from "./identity.types.js";
import type { DingTalkApiPort } from "./dingtalk-api.client.js";
import { DingTalkSsoService } from "./dingtalk-sso.service.js";

class SsoRepository {
  readonly employees = new Map<string, EmployeeRecord>();
  readonly transactions: DingTalkSsoTransactionRecord[] = [];
  readonly bindings = new Map<string, string>();
  readonly sessions: SessionRecord[] = [];
  private nextTransaction = 1;

  async withTransaction<T>(
    operation: (repository: IdentityRepository) => Promise<T>,
  ): Promise<T> {
    return operation(this as unknown as IdentityRepository);
  }

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
      transactionId: `tx-${this.nextTransaction++}`,
      stateHash: input.stateHash,
      browserContextBindingHash: input.browserContextBindingHash,
      handoffTokenHash: input.handoffTokenHash ?? null,
      returnTo: input.returnTo,
      dingtalkUserId: input.dingtalkUserId ?? null,
      employeeId: input.employeeId ?? null,
      expiresAt: input.expiresAt,
      consumedAt: null,
    };
    this.transactions.push(record);
    return record;
  }

  async findDingTalkSsoTransactionByStateHash(stateHash: string) {
    return (
      this.transactions.find((item) => item.stateHash === stateHash) ?? null
    );
  }

  async findDingTalkSsoTransactionByHandoffHash(handoffHash: string) {
    return (
      this.transactions.find((item) => item.handoffTokenHash === handoffHash) ??
      null
    );
  }

  async consumeDingTalkSsoTransaction(transactionId: string) {
    const transaction = this.transactions.find(
      (item) => item.transactionId === transactionId,
    );
    if (
      transaction === undefined ||
      transaction.consumedAt !== null ||
      transaction.expiresAt.getTime() <= Date.now()
    ) {
      return false;
    }
    transaction.consumedAt = new Date();
    return true;
  }

  async findEmployeeByEmployeeNumber(employeeNumber: string) {
    return (
      [...this.employees.values()].find(
        (employee) => employee.employeeNumber === employeeNumber,
      ) ?? null
    );
  }

  async findEmployeeByDingTalkUserId(dingtalkUserId: string) {
    const employeeId = this.bindings.get(dingtalkUserId);
    return employeeId === undefined
      ? null
      : (this.employees.get(employeeId) ?? null);
  }

  async findEmployee(employeeId: string) {
    return this.employees.get(employeeId) ?? null;
  }

  async activateEmployee(employeeId: string) {
    const employee = this.employees.get(employeeId);
    if (employee !== undefined) employee.status = "active";
  }

  async bindDingTalkUser(employeeId: string, dingtalkUserId: string) {
    this.bindings.set(dingtalkUserId, employeeId);
  }

  async claimDingTalkBinding(employeeId: string, dingtalkUserId: string) {
    const employeeBinding = [...this.bindings.entries()].find(
      ([, boundEmployeeId]) => boundEmployeeId === employeeId,
    );
    const dingtalkBinding = this.bindings.get(dingtalkUserId);
    if (
      (employeeBinding !== undefined &&
        employeeBinding[0] !== dingtalkUserId) ||
      (dingtalkBinding !== undefined && dingtalkBinding !== employeeId)
    ) {
      return false;
    }
    this.bindings.set(dingtalkUserId, employeeId);
    return true;
  }

  async createSession(input: {
    employeeId: string;
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

  async recordAudit(): Promise<void> {}
}

function createService(repository: SsoRepository): DingTalkSsoService {
  const api: DingTalkApiPort = {
    async exchangeCodeForToken() {
      return { accessToken: "access-token", expiresIn: 3600 };
    },
    async getUserInfo() {
      return {
        dingtalkUserId: "open-id-1",
        employeeNumber: " e001 ",
      };
    },
  };
  return new DingTalkSsoService(
    {
      clientId: "client-id",
      clientSecret: "client-secret",
      corpId: "corp-id",
      redirectUri: "https://example.test/callback",
    },
    api,
    repository as unknown as IdentityRepository,
    {
      standardizeEmployeeNumber: (value: string) => value.trim().toUpperCase(),
      getActorContext: async (employeeId: string, sessionId: string) =>
        ({
          employeeId,
          roleCodes: ["employee"],
          permissions: [],
          departmentIds: ["dept-a"],
          primaryDepartmentId: "dept-a",
          sessionId,
        }) satisfies ActorContext,
    } as never,
  );
}

async function startAndCallback(service: DingTalkSsoService) {
  const started = await service.startSso("/marketplace");
  const state = /dingtalk_state=([^;]+)/.exec(started.stateCookie)?.[1];
  const binding = /dingtalk_binding=([^;]+)/.exec(
    started.browserBindingCookie,
  )?.[1];
  return service.handleCallback(state!, "authorization-code", binding, state);
}

describe("DingTalkSsoService", () => {
  it("完整消费 callback handoff 并按 employee_number 建立会话", async () => {
    const repository = new SsoRepository();
    repository.employees.set("employee-uuid", {
      employeeId: "employee-uuid",
      employeeNumber: "E001",
      displayName: "测试员工",
      status: "pending_binding",
      primaryDepartmentId: "dept-a",
      passwordHash: null,
      passwordResetRequired: false,
    });
    const service = createService(repository);
    const started = await service.startSso("/marketplace");
    const state = /dingtalk_state=([^;]+)/.exec(started.stateCookie)?.[1];
    const binding = /dingtalk_binding=([^;]+)/.exec(
      started.browserBindingCookie,
    )?.[1];

    const callback = await service.handleCallback(
      state!,
      "authorization-code",
      binding,
      state,
    );
    const result = await service.completeSso(callback.handoffToken);

    expect(result.actor.employeeId).toBe("employee-uuid");
    expect(repository.bindings.get("open-id-1")).toBe("employee-uuid");
    expect(repository.employees.get("employee-uuid")?.status).toBe("active");
    expect(repository.transactions).toHaveLength(2);
    expect(repository.transactions[1]).toMatchObject({
      dingtalkUserId: "open-id-1",
      employeeId: "employee-uuid",
    });
  });

  it("允许已绑定到同一员工的钉钉账号再次登录", async () => {
    const repository = new SsoRepository();
    const employee: EmployeeRecord = {
      employeeId: "employee-uuid",
      employeeNumber: "E001",
      displayName: "测试员工",
      status: "active",
      primaryDepartmentId: "dept-a",
      passwordHash: null,
      passwordResetRequired: false,
    };
    repository.employees.set(employee.employeeId, employee);
    repository.bindings.set("open-id-1", employee.employeeId);
    const service = createService(repository);
    const started = await service.startSso("/marketplace");
    const state = /dingtalk_state=([^;]+)/.exec(started.stateCookie)?.[1];
    const binding = /dingtalk_binding=([^;]+)/.exec(
      started.browserBindingCookie,
    )?.[1];
    const callback = await service.handleCallback(
      state!,
      "authorization-code",
      binding,
      state,
    );

    await expect(
      service.completeSso(callback.handoffToken),
    ).resolves.toMatchObject({
      actor: { employeeId: employee.employeeId },
    });
  });

  it("拒绝用新的 openId 静默覆盖目标员工已有绑定", async () => {
    const repository = new SsoRepository();
    repository.employees.set("employee-uuid", {
      employeeId: "employee-uuid",
      employeeNumber: "E001",
      displayName: "测试员工",
      status: "active",
      primaryDepartmentId: "dept-a",
      passwordHash: null,
      passwordResetRequired: false,
    });
    repository.bindings.set("open-id-existing", "employee-uuid");
    const service = createService(repository);
    const callback = await startAndCallback(service);

    await expect(service.completeSso(callback.handoffToken)).rejects.toThrow(
      "DINGTALK_SSO_ALREADY_BOUND",
    );
    expect(repository.bindings.get("open-id-existing")).toBe("employee-uuid");
    expect(repository.bindings.has("open-id-1")).toBe(false);
  });
});
