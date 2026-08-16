import type { DatabaseSchema } from "@ai-hub/database";
import { Module, type DynamicModule } from "@nestjs/common";
import type { Kysely } from "kysely";
import { IdentityModule } from "../identity/identity.module.js";
import { IdentityService } from "../identity/identity.service.js";
import { CreatorController } from "./creator.controller.js";
import { KyselyCreatorRepository } from "./creator.repository.js";
import { CreatorService } from "./creator.service.js";
import { CREATOR_SERVICE } from "./creator.tokens.js";

@Module({})
export class CreatorModule {
  static register(database: Kysely<DatabaseSchema>): DynamicModule {
    return {
      module: CreatorModule,
      imports: [IdentityModule.register(database)],
      controllers: [CreatorController],
      providers: [
        {
          provide: CREATOR_SERVICE,
          useFactory: (identity: IdentityService) =>
            new CreatorService(new KyselyCreatorRepository(database), identity),
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
