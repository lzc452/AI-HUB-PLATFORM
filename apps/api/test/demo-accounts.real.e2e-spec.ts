import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  DEMO_ACCOUNT_DEFINITIONS,
  createDatabase,
  runMigrations,
  seedDemoAccounts,
} from "@ai-hub/database";
import { startPostgresTestContainer } from "@ai-hub/testing";
import {
  IdentityService,
  KyselyIdentityRepository,
  KyselyLoginChallengeRepository,
  LoginEncryptionService,
  PasswordService,
} from "@ai-hub/server";
import { ApiModule } from "../src/api.module.js";

const DEMO_PASSWORDS = {
  "DEMO-EMPLOYEE": "Demo-Employee-2026!",
  "DEMO-APP-ADMIN": "Demo-AppAdmin-2026!",
  "DEMO-INNOVATION": "Demo-Innovation-2026!",
  "DEMO-ORG-ADMIN": "Demo-OrgAdmin-2026!",
  "DEMO-SUPER-ADMIN": "Demo-SuperAdmin-2026!",
} as const;

const BASE_EMPLOYEE_PERMISSIONS = [
  "catalog.read",
  "demand.read",
  "notification.read",
] as const;

interface ChallengeResponse {
  keyId: string;
  jwk: JsonWebKey;
  nonce: string;
  expiresAt: string;
}

interface EncryptedLoginEnvelope {
  encryptedPayload: string;
  wrappedKey: string;
  iv: string;
  aad: string;
  keyId: string;
  nonce: string;
}

async function buildEnvelope(
  employeeId: string,
  password: string,
  challenge: ChallengeResponse,
): Promise<EncryptedLoginEnvelope> {
  const aesKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "wrapKey"],
  );
  const rsaKey = await crypto.subtle.importKey(
    "jwk",
    challenge.jwk as JsonWebKey,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["wrapKey"],
  );
  const aad = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(challenge.keyId + challenge.nonce),
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encryptedPayload = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new Uint8Array(aad) },
    aesKey,
    new TextEncoder().encode(
      JSON.stringify({ employeeId, password, deviceLabel: "browser" }),
    ),
  );
  const wrappedKey = await crypto.subtle.wrapKey("raw", aesKey, rsaKey, {
    name: "RSA-OAEP",
  });
  return {
    encryptedPayload: Buffer.from(encryptedPayload).toString("base64url"),
    wrappedKey: Buffer.from(wrappedKey).toString("base64url"),
    iv: Buffer.from(iv).toString("base64url"),
    aad: Buffer.from(aad).toString("base64url"),
    keyId: challenge.keyId,
    nonce: challenge.nonce,
  };
}

describe("real demo account login", () => {
  let db: ReturnType<typeof createDatabase>;
  let stop: (() => Promise<void>) | undefined;
  let app: INestApplication;

  beforeAll(async () => {
    const container = await startPostgresTestContainer();
    stop = container.stop;
    db = createDatabase(container.databaseUrl);
    await runMigrations(db);

    const passwordService = new PasswordService();
    const passwordHashes: Record<string, string> = {};
    for (const account of DEMO_ACCOUNT_DEFINITIONS) {
      passwordHashes[account.employeeId] = await passwordService.hashPassword(
        DEMO_PASSWORDS[account.employeeId as keyof typeof DEMO_PASSWORDS],
      );
    }
    await seedDemoAccounts(db, passwordHashes);

    const encryption = await LoginEncryptionService.generateDev();
    const identity = new IdentityService(
      new KyselyIdentityRepository(db),
      passwordService,
      undefined,
      encryption,
      new KyselyLoginChallengeRepository(db),
    );
    const moduleRef = await Test.createTestingModule({
      imports: [
        ApiModule.forTest({
          databaseCheck: async () => true,
          identity,
        }),
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await db?.destroy();
    await stop?.();
  }, 60_000);

  it.each(DEMO_ACCOUNT_DEFINITIONS)(
    "logs in $employeeId as $roleCodes",
    async (account) => {
      const password =
        DEMO_PASSWORDS[account.employeeId as keyof typeof DEMO_PASSWORDS];

      const identity = new IdentityService(
        new KyselyIdentityRepository(db),
        new PasswordService(),
      );
      const result = await identity.loginWithPassword({
        employeeId: account.employeeId,
        password,
        deviceLabel: "demo-test",
      });

      expect(result.actor).toMatchObject({
        employeeId: account.employeeId,
        roleCodes: account.roleCodes,
        primaryDepartmentId: account.primaryDepartmentId,
        sessionId: expect.any(String),
      });
      expect(result.actor.permissions).toEqual(
        expect.arrayContaining([...BASE_EMPLOYEE_PERMISSIONS]),
      );
      expect(result.session).toMatchObject({
        employeeId: account.employeeId,
        deviceLabel: "demo-test",
        revokedAt: null,
      });
    },
  );

  it("logs in through the password login endpoint", async () => {
    const challengeResponse = await request(app.getHttpServer())
      .get("/internal/identity/login/challenge")
      .expect(200);
    const envelope = await buildEnvelope(
      "DEMO-ORG-ADMIN",
      DEMO_PASSWORDS["DEMO-ORG-ADMIN"],
      challengeResponse.body as ChallengeResponse,
    );

    await request(app.getHttpServer())
      .post("/internal/identity/login/password")
      .send({
        employeeId: "DEMO-ORG-ADMIN",
        envelope,
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          actor: {
            employeeId: "DEMO-ORG-ADMIN",
            roleCodes: ["employee", "organization_admin"],
            permissions: expect.arrayContaining([
              ...BASE_EMPLOYEE_PERMISSIONS,
              "identity.employee.read",
              "identity.department.read",
            ]),
            sessionId: expect.any(String),
          },
          session: {
            employeeId: "DEMO-ORG-ADMIN",
            deviceLabel: "browser",
          },
        });
      });
  });
});
