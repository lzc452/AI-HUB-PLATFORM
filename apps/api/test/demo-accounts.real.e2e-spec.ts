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

    const identity = new IdentityService(
      new KyselyIdentityRepository(db),
      passwordService,
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
      expect(result.session).toMatchObject({
        employeeId: account.employeeId,
        deviceLabel: "demo-test",
        revokedAt: null,
      });
    },
  );

  it("logs in through the password login endpoint", async () => {
    await request(app.getHttpServer())
      .post("/internal/identity/login/password")
      .send({
        employeeId: "DEMO-ORG-ADMIN",
        password: DEMO_PASSWORDS["DEMO-ORG-ADMIN"],
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          actor: {
            employeeId: "DEMO-ORG-ADMIN",
            roleCodes: ["organization_admin"],
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
