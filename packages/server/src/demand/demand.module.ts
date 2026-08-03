import { createDatabase } from "@ai-hub/database";
import { Module, type DynamicModule } from "@nestjs/common";
import { IdentityModule } from "../identity/identity.module.js";
import { IdentityService } from "../identity/identity.service.js";
import { DemandController } from "./demand.controller.js";
import { KyselyDemandRepository } from "./demand.repository.js";
import { DemandService } from "./demand.service.js";
import { DEMAND_SERVICE } from "./demand.tokens.js";

@Module({})
export class DemandModule {
  static register(databaseUrl: string): DynamicModule {
    return {
      module: DemandModule,
      imports: [IdentityModule.register(databaseUrl)],
      controllers: [DemandController],
      providers: [
        {
          provide: DEMAND_SERVICE,
          useFactory: (identity: IdentityService) =>
            new DemandService(
              new KyselyDemandRepository(createDatabase(databaseUrl)),
              identity,
            ),
          inject: [IdentityService],
        },
      ],
      exports: [DEMAND_SERVICE],
    };
  }

  static forTest(
    demands: DemandService,
    identity: IdentityService,
  ): DynamicModule {
    return {
      module: DemandModule,
      controllers: [DemandController],
      providers: [
        { provide: DEMAND_SERVICE, useValue: demands },
        { provide: IdentityService, useValue: identity },
      ],
      exports: [DEMAND_SERVICE],
    };
  }
}
