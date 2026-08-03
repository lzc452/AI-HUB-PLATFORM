import { createDatabase } from "@ai-hub/database";
import { Module, type DynamicModule } from "@nestjs/common";
import { IdentityModule } from "../identity/identity.module.js";
import { IdentityService } from "../identity/identity.service.js";
import { InteractionController } from "./interaction.controller.js";
import { KyselyInteractionRepository } from "./interaction.repository.js";
import { InteractionService } from "./interaction.service.js";
import { INTERACTION_SERVICE } from "./interaction.tokens.js";

@Module({})
export class InteractionModule {
  static register(databaseUrl: string): DynamicModule {
    return {
      module: InteractionModule,
      imports: [IdentityModule.register(databaseUrl)],
      controllers: [InteractionController],
      providers: [
        {
          provide: INTERACTION_SERVICE,
          useFactory: (identity: IdentityService) =>
            new InteractionService(
              new KyselyInteractionRepository(createDatabase(databaseUrl)),
              identity,
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
