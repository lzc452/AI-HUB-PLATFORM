import { createDatabase } from "@ai-hub/database";
import { Module, type DynamicModule } from "@nestjs/common";
import { IdentityController } from "./identity.controller.js";
import { KyselyIdentityRepository } from "./identity.repository.js";
import { IdentityService } from "./identity.service.js";
import { PasswordService } from "./password.service.js";
import { LoginEncryptionService } from "./login-encryption.service.js";
import { InMemoryLoginChallengeStore } from "./login-challenge.store.js";
import { KyselyLoginChallengeRepository } from "./login-challenge.repository.js";
import { DingTalkSsoService } from "./dingtalk-sso.service.js";
import { DingTalkApiClient } from "./dingtalk-api.client.js";
import { SecurityController } from "./security.controller.js";
import { AuditService } from "../system/security/audit.service.js";
import { KyselyAuditRepository } from "../system/security/audit.repository.js";

export const IDENTITY_SERVICE = Symbol("IDENTITY_SERVICE");

export interface IdentityModuleOptions {
  loginEncryptionPrivateKey?: string;
  dingtalkSso?: {
    clientId: string;
    clientSecret: string;
    corpId: string;
    redirectUri: string;
  };
}

@Module({})
export class IdentityModule {
  static register(
    databaseUrl: string,
    options?: IdentityModuleOptions,
  ): DynamicModule {
    const db = createDatabase(databaseUrl);
    const providers: DynamicModule["providers"] = [
      {
        provide: AuditService,
        useValue: new AuditService(new KyselyAuditRepository(db)),
      },
      PasswordService,
      {
        provide: LoginEncryptionService,
        useFactory: async () => {
          if (options?.loginEncryptionPrivateKey !== undefined) {
            return LoginEncryptionService.fromPem(
              options.loginEncryptionPrivateKey,
            );
          }
          return LoginEncryptionService.generateDev();
        },
      },
      {
        provide: InMemoryLoginChallengeStore,
        useValue: new KyselyLoginChallengeRepository(db),
      },
      {
        provide: IdentityService,
        useFactory: (
          passwords: PasswordService,
          encryption: LoginEncryptionService,
          challengeStore: InMemoryLoginChallengeStore,
        ) =>
          new IdentityService(
            new KyselyIdentityRepository(db),
            passwords,
            undefined,
            encryption,
            challengeStore,
          ),
        inject: [
          PasswordService,
          LoginEncryptionService,
          InMemoryLoginChallengeStore,
        ],
      },
    ];

    // Conditionally register DingTalk SSO.
    if (options?.dingtalkSso !== undefined) {
      const ssoConfig = options.dingtalkSso;
      providers.push({
        provide: DingTalkApiClient,
        useFactory: () =>
          new DingTalkApiClient(ssoConfig.clientId, ssoConfig.clientSecret),
      });
      providers.push({
        provide: DingTalkSsoService,
        useFactory: (api: DingTalkApiClient, identity: IdentityService) =>
          new DingTalkSsoService(
            {
              clientId: ssoConfig.clientId,
              clientSecret: ssoConfig.clientSecret,
              corpId: ssoConfig.corpId,
              redirectUri: ssoConfig.redirectUri,
            },
            api,
            new KyselyIdentityRepository(db),
            identity,
          ),
        inject: [DingTalkApiClient, IdentityService],
      });
    }

    return {
      module: IdentityModule,
      controllers: [IdentityController, SecurityController],
      providers,
      exports: [IdentityService],
    };
  }

  static forTest(identity: IdentityService): DynamicModule {
    return {
      module: IdentityModule,
      controllers: [IdentityController, SecurityController],
      providers: [
        { provide: IdentityService, useValue: identity },
        {
          provide: AuditService,
          useValue: {
            listEvents: async () => ({ items: [], total: 0 }),
            createExportJob: async () => ({
              exportJobId: "job-test",
              status: "queued",
              createdAt: new Date(),
            }),
            recordEvent: async () => undefined,
          } as unknown as AuditService,
        },
      ],
      exports: [IdentityService],
    };
  }
}
