import { createDatabase } from "@ai-hub/database";
import { Module, type DynamicModule } from "@nestjs/common";
import { IdentityController } from "./identity.controller.js";
import { KyselyIdentityRepository } from "./identity.repository.js";
import { IdentityService } from "./identity.service.js";
import { PasswordService } from "./password.service.js";

export const IDENTITY_SERVICE = Symbol("IDENTITY_SERVICE");

@Module({})
export class IdentityModule {
  static register(databaseUrl: string): DynamicModule {
    const db = createDatabase(databaseUrl);
    return {
      module: IdentityModule,
      controllers: [IdentityController],
      providers: [
        PasswordService,
        {
          provide: IdentityService,
          useFactory: (passwords: PasswordService) =>
            new IdentityService(new KyselyIdentityRepository(db), passwords),
          inject: [PasswordService],
        },
      ],
      exports: [IdentityService],
    };
  }

  static forTest(identity: IdentityService): DynamicModule {
    return {
      module: IdentityModule,
      controllers: [IdentityController],
      providers: [{ provide: IdentityService, useValue: identity }],
      exports: [IdentityService],
    };
  }
}
