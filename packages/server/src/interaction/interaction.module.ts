import type { DatabaseSchema } from "@ai-hub/database";
import { Module, type DynamicModule } from "@nestjs/common";
import type { Kysely } from "kysely";
import { IdentityModule } from "../identity/identity.module.js";
import { IdentityService } from "../identity/identity.service.js";
import { InteractionController } from "./interaction.controller.js";
import { KyselyInteractionRepository } from "./interaction.repository.js";
import { InteractionService } from "./interaction.service.js";
import { INTERACTION_SERVICE } from "./interaction.tokens.js";
import { CatalogVisibilityPolicy } from "../catalog/catalog-visibility.policy.js";
import { KyselyCatalogRepository } from "../catalog/catalog.repository.js";

@Module({})
export class InteractionModule {
  static register(database: Kysely<DatabaseSchema>): DynamicModule {
    return {
      module: InteractionModule,
      imports: [IdentityModule.register(database)],
      controllers: [InteractionController],
      providers: [
        {
          provide: INTERACTION_SERVICE,
          useFactory: (identity: IdentityService) =>
            new InteractionService(
              new KyselyInteractionRepository(database),
              identity,
              new CatalogVisibilityPolicy(
                new KyselyCatalogRepository(database),
              ),
            ),
          inject: [IdentityService],
        },
      ],
      exports: [INTERACTION_SERVICE],
    };
  }

  static forTest(
    interactions: InteractionService,
    identity: IdentityService,
  ): DynamicModule {
    return {
      module: InteractionModule,
      controllers: [InteractionController],
      providers: [
        { provide: INTERACTION_SERVICE, useValue: interactions },
        { provide: IdentityService, useValue: identity },
      ],
      exports: [INTERACTION_SERVICE],
    };
  }
}
