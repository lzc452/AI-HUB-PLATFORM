import { generateKeyPairSync, randomUUID } from "node:crypto";
import { Test } from "@nestjs/testing";
import { sql } from "kysely";
import { APP_GUARD } from "@nestjs/core";
import type { INestApplication } from "@nestjs/common";
import { createDatabase, runMigrations } from "@ai-hub/database";
import {
  IdentityModule,
  KyselyIdentityRepository,
  PasswordService,
  PermissionGuard,
} from "@ai-hub/server";
import { startPostgresTestContainer } from "@ai-hub/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

async function buildLoginEnvelope(
  employeeId: string,
  password: string,
  challenge: { jwk: JsonWebKey; keyId: string; nonce: string },
) {
  const aes = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt"],
  );
  const rsa = await crypto.subtle.importKey(
    "jwk",
    challenge.jwk,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["wrapKey"],
  );
  const aad = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(challenge.keyId + challenge.nonce),
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: aad },
    aes,
    new TextEncoder().encode(
      JSON.stringify({ employeeId, password, deviceLabel: "browser" }),
    ),
  );
  const wrapped = await crypto.subtle.wrapKey("raw", aes, rsa, {
    name: "RSA-OAEP",
  });
  return {
    encryptedPayload: Buffer.from(encrypted).toString("base64url"),
    wrappedKey: Buffer.from(wrapped).toString("base64url"),
    iv: Buffer.from(iv).toString("base64url"),
    aad: Buffer.from(aad).toString("base64url"),
    keyId: challenge.keyId,
    nonce: challenge.nonce,
  };
}

describe("真实数据库生产私钥与角色停用门禁", () => {
  const suffix = randomUUID();
  const employeeId = `P0-${suffix.toUpperCase()}`;
  const departmentId = `role-dept-${suffix}`;
  const roleCode = `role-read-${suffix}`;
  const password = "Role-Gate-2026!";
  let db: ReturnType<typeof createDatabase>;
  let stop: (() => Promise<void>) | undefined;
  let app: INestApplication;
  let client: ReturnType<typeof request.agent>;
  let repository: KyselyIdentityRepository;

  beforeAll(async () => {
    const container = await startPostgresTestContainer();
    stop = container.stop;
    db = createDatabase(container.databaseUrl);
    await runMigrations(db);
    await db
      .insertInto("departments")
      .values({
        department_id: departmentId,
        name: "门禁测试部门",
        source: "local",
      })
      .execute();
    await db
      .insertInto("employees")
      .values({
        employee_id: employeeId,
        employee_number: employeeId,
        display_name: "门禁测试员工",
        status: "active",
        primary_department_id: departmentId,
        password_hash: await new PasswordService().hashPassword(password),
        password_reset_required: false,
      })
      .execute();
    await db
      .insertInto("roles")
      .values({
        role_code: roleCode,
        name: "门禁员工读取角色",
        permissions: sql<
          string[]
        >`${JSON.stringify(["identity.employee.read"])}::jsonb`,
        is_system: false,
        status: "active",
      })
      .execute();
    await db
      .insertInto("employee_roles")
      .values([
        { employee_id: employeeId, role_code: "employee" },
        { employee_id: employeeId, role_code: roleCode },
      ])
      .execute();
    repository = new KyselyIdentityRepository(db);
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const moduleRef = await Test.createTestingModule({
      imports: [
        IdentityModule.register(db, {
          loginEncryptionPrivateKey: privateKey
            .export({ type: "pkcs8", format: "pem" })
            .toString(),
        }),
      ],
      providers: [{ provide: APP_GUARD, useClass: PermissionGuard }],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    client = request.agent(app.getHttpServer());
    const challenge = await client
      .get("/internal/identity/login/challenge")
      .expect(200);
    const envelope = await buildLoginEnvelope(
      employeeId,
      password,
      challenge.body,
    );
    await client
      .post("/internal/identity/login/password")
      .send({ employeeId, envelope })
      .expect(201);
  }, 60_000);

  afterAll(async () => {
    try {
      await app?.close();
      await db?.destroy();
    } finally {
      await stop?.();
    }
  }, 60_000);

  it("配置生产 PEM 并以浏览器加密协议与 Cookie 访问受保护 API", async () => {
    await client.get("/internal/identity/employees").expect(200);
  });

  it("停用角色立即撤销现有会话权限，同时保留角色分配记录", async () => {
    await db
      .updateTable("roles")
      .set({ status: "disabled" })
      .where("role_code", "=", roleCode)
      .execute();
    try {
      await client.get("/internal/identity/employees").expect(403);
      expect(await repository.listEmployeeIdsWithRole(roleCode)).toEqual([]);
      expect(
        (await repository.listEmployeeRoles(employeeId)).map(
          (role) => role.roleCode,
        ),
      ).toContain(roleCode);
    } finally {
      await db
        .updateTable("roles")
        .set({ status: "active" })
        .where("role_code", "=", roleCode)
        .execute();
    }
    await client.get("/internal/identity/employees").expect(200);
  });

  it("角色广播排除停用员工", async () => {
    await db
      .updateTable("employees")
      .set({ status: "disabled" })
      .where("employee_id", "=", employeeId)
      .execute();
    try {
      expect(await repository.listEmployeeIdsWithRole(roleCode)).toEqual([]);
    } finally {
      await db
        .updateTable("employees")
        .set({ status: "active" })
        .where("employee_id", "=", employeeId)
        .execute();
    }
  });
});
