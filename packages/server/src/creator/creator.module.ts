import { createDatabase } from "@ai-hub/database";
import { Module, type DynamicModule } from "@nestjs/common";
import { IdentityModule } from "../identity/identity.module.js";
import { IdentityService } from "../identity/identity.service.js";
import { CreatorController } from "./creator.controller.js";
import { KyselyCreatorRepository } from "./creator.repository.js";
import { CreatorService } from "./creator.service.js";
import { CREATOR_SERVICE } from "./creator.tokens.js";

@Module({})
export class CreatorModule {
  static register(databaseUrl: string): DynamicModule {
    return {
      module: CreatorModule,
      imports: [IdentityModule.register(databaseUrl)],
      controllers: [CreatorController],
      providers: [
        {
          provide: CREATOR_SERVICE,
          useFactory: (identity: IdentityService) =>
            new CreatorService(
              new KyselyCreatorRepository(createDatabase(databaseUrl)),
              identity,
            ),
          inject: [IdentityService],
        },
      ],
      exports: [CREATOR_SERVICE],
    };
  }

  static forTest(
    creator: CreatorService,
    identity: IdentityService,
  ): DynamicModule {
    return {
      module: CreatorModule,
      controllers: [CreatorController],
      providers: [
        { provide: CREATOR_SERVICE, useValue: creator },
        { provide: IdentityService, useValue: identity },
      ],
      exports: [CREATOR_SERVICE],
    };
  }
}
