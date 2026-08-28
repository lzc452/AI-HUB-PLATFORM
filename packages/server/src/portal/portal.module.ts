import type { DatabaseSchema } from "@ai-hub/database";
import { Module, type DynamicModule } from "@nestjs/common";
import type { Kysely } from "kysely";
import { APPLICATION_SERVICE } from "../application/application.tokens.js";
import type { ApplicationService } from "../application/application.service.js";
import { PortalController } from "./portal.controller.js";
import { KyselyPortalRepository } from "./portal.repository.js";
import { PortalService } from "./portal.service.js";
import { PORTAL_SERVICE } from "./portal.tokens.js";

@Module({})
export class PortalModule {
  static register(
    database: Kysely<DatabaseSchema>,
    applicationModule: DynamicModule,
  ): DynamicModule {
    const repository = new KyselyPortalRepository(database);
    return {
      module: PortalModule,
      imports: [applicationModule],
      controllers: [PortalController],
      providers: [
        { provide: KyselyPortalRepository, useValue: repository },
        {
          provide: PORTAL_SERVICE,
          useFactory: (
            portalRepository: KyselyPortalRepository,
            applications: ApplicationService,
          ) => new PortalService(portalRepository, applications),
          inject: [KyselyPortalRepository, APPLICATION_SERVICE],
        },
      ],
      exports: [PORTAL_SERVICE],
    };
  }

  static forTest(service: PortalService): DynamicModule {
    return {
      module: PortalModule,
      controllers: [PortalController],
      providers: [{ provide: PORTAL_SERVICE, useValue: service }],
      exports: [PORTAL_SERVICE],
    };
  }
}
