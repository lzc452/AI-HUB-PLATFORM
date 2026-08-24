import type { DatabaseSchema } from "@ai-hub/database";
import { Module, type DynamicModule } from "@nestjs/common";
import type { Kysely } from "kysely";
import { PortalController } from "./portal.controller.js";
import { KyselyPortalRepository } from "./portal.repository.js";
import { PortalService } from "./portal.service.js";
import { PORTAL_SERVICE } from "./portal.tokens.js";

@Module({})
export class PortalModule {
  static register(database: Kysely<DatabaseSchema>): DynamicModule {
    const repository = new KyselyPortalRepository(database);
    return {
      module: PortalModule,
      controllers: [PortalController],
      providers: [
        { provide: KyselyPortalRepository, useValue: repository },
        { provide: PORTAL_SERVICE, useValue: new PortalService(repository) },
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
