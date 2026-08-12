import { Test } from "@nestjs/testing";
import { IdentityService, type IdentityRepository } from "@ai-hub/server";
import request from "supertest";

import { ApiModule } from "../src/api.module.js";

class ApiIdentityRepository implements IdentityRepository {
  async withTransaction<T>(
    operation: (repository: IdentityRepository) => Promise<T>,
  ): Promise<T> {
    return operation(this);
  }
  async createDepartment(): Promise<void> {}
  async createEmployee(): Promise<void> {}
  async assignRole(): Promise<void> {}
  async findEmployee() {
    return {
      employeeId: "E001",
      displayName: "Ada",
      status: "active" as const,
      primaryDepartmentId: "dept-a",
      passwordHash: null,
      passwordResetRequired: false,
    };
  }
  async listEmployees() {
    return [
      {
        employeeId: "E001",
        displayName: "Ada",
        status: "active" as const,
        primaryDepartmentId: "dept-a",
      },
    ];
  }
  async listDepartments() {
    return [
      {
        departmentId: "dept-a",
        name: "研发部",
        parentDepartmentId: null,
        source: "local" as const,
      },
    ];
  }
  async listEmployeeDepartmentIds() {
    return ["dept-a"];
  }
  async listEmployeeRoles() {
    return [
      {
        roleCode: "organization_admin",
        permissions: [
          "identity.employee.read",
          "identity.department.read",
          "identity.role.read",
          "identity.session.manage",
        ],
      },
    ];
  }
  async findSession() {
    return {
      sessionId: "session-1",
      employeeId: "E001",
      deviceLabel: "browser",
      expiresAt: new Date("2099-08-15T00:00:00.000Z"),
      revokedAt: null,
    };
  }
  async createPasswordResetChallenge() {
    return {
      challengeId: "challenge-1",
      employeeId: "E001",
      tokenHash: "hash",
      expiresAt: new Date("2099-08-15T00:00:00.000Z"),
      consumedAt: null,
    };
  }
  async findPasswordResetChallenge() {
    return null;
  }
  async consumePasswordResetChallenge() {
    return true;
  }
  async updateEmployeePassword(): Promise<void> {}
  async bindDingTalkUser(): Promise<void> {}
  async createDingTalkSyncRun() {
    return "sync-1";
  }
  async completeDingTalkSyncRun(): Promise<void> {}
  async createSession() {
    return {
      sessionId: "session-1",
      employeeId: "E001",
      deviceLabel: "browser",
      expiresAt: new Date("2026-08-15T00:00:00.000Z"),
      revokedAt: null,
    };
  }
  async revokeSessions() {
    return 0;
  }
  async revokeSession() {
    return true;
  }
  async recordAudit(): Promise<void> {}
  // ── New methods ─────────────────────────────────────────────
  async findEmployeeByEmployeeNumber() {
    return null;
  }
  async findEmployeeByDingTalkUserId() {
    return null;
  }
  async createDingTalkSsoTransaction() {
    return {
      transactionId: "sso-tx-1",
      stateHash: "hash",
      browserContextBindingHash: "hash",
      handoffTokenHash: null,
      returnTo: "/",
      dingtalkUserId: null,
      employeeId: null,
      expiresAt: new Date("2099-01-01T00:00:00Z"),
      consumedAt: null,
    };
  }
  async findDingTalkSsoTransactionByStateHash() {
    return null;
  }
  async findDingTalkSsoTransactionByHandoffHash() {
    return null;
  }
  async updateDingTalkSsoTransactionAfterCallback(): Promise<void> {}
  async consumeDingTalkSsoTransaction() {
    return true;
  }
  async activateEmployee(): Promise<void> {}
}

describe("identity endpoints", () => {
  it("lists organization records through the internal API", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ApiModule.forTest({
          databaseCheck: async () => true,
          identity: new IdentityService(new ApiIdentityRepository()),
        }),
      ],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();

    await request(app.getHttpServer())
      .get("/internal/identity/employees")
      .set("x-employee-id", "E001")
      .set("x-session-id", "session-1")
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual([
          {
            employeeId: "E001",
            displayName: "Ada",
            status: "active",
            primaryDepartmentId: "dept-a",
          },
        ]);
      });

    await request(app.getHttpServer())
      .get("/internal/identity/actor")
      .set("x-employee-id", "E001")
      .set("x-session-id", "session-1")
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          employeeId: "E001",
          sessionId: "session-1",
        });
      });

    await request(app.getHttpServer())
      .post("/internal/identity/logout")
      .set("x-employee-id", "E001")
      .set("x-session-id", "session-1")
      .send({ sessionId: "session-1" })
      .expect(204);

    await request(app.getHttpServer())
      .get("/internal/identity/employees/E001/roles")
      .set("x-employee-id", "E001")
      .set("x-session-id", "session-1")
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual([
          {
            roleCode: "organization_admin",
            permissions: [
              "identity.employee.read",
              "identity.department.read",
              "identity.role.read",
              "identity.session.manage",
            ],
          },
        ]);
      });

    await request(app.getHttpServer())
      .post("/internal/identity/employees/E001/revoke-sessions")
      .set("x-employee-id", "E001")
      .set("x-session-id", "session-1")
      .send({ reason: "admin_action" })
      .expect(200)
      .expect(({ body }) => expect(body).toEqual({ revoked: 0 }));

    await app.close();
  });
});
