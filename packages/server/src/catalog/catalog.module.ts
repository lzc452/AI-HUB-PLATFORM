import type { DatabaseSchema } from "@ai-hub/database";
import { Module, type DynamicModule, type Provider } from "@nestjs/common";
import type { Kysely } from "kysely";
import { IdentityModule } from "../identity/identity.module.js";
import { IdentityService } from "../identity/identity.service.js";
import { ApplicationModule } from "../application/application.module.js";
import { APPLICATION_SERVICE } from "../application/application.tokens.js";
import type { ApplicationService } from "../application/application.service.js";
import { DiskObjectStorage } from "../application/storage.disk.js";
import { CatalogController } from "./catalog.controller.js";
import { KyselyCatalogRepository } from "./catalog.repository.js";
import { CatalogService } from "./catalog.service.js";
import { CATALOG_SERVICE } from "./catalog.tokens.js";
import { AnalyticsEventService } from "../analytics/analytics.service.js";
import { KyselyAnalyticsEventRepository } from "../analytics/analytics.repository.js";

@Module({})
export class CatalogModule {
  static register(
    database: Kysely<DatabaseSchema>,
    storage?: DiskObjectStorage,
  ): DynamicModule {
    return {
      module: CatalogModule,
      imports: [
        IdentityModule.register(database),
        ApplicationModule.registerService(database),
      ],
      controllers: [CatalogController],
      providers: [
        ...(storage === undefined
          ? []
          : [{ provide: DiskObjectStorage, useValue: storage }]),
        {
          provide: CATALOG_SERVICE,
          useValue: new CatalogService(
            new KyselyCatalogRepository(database),
            new AnalyticsEventService(
              new KyselyAnalyticsEventRepository(database),
            ),
          ),
        },
      ],
      exports: [CATALOG_SERVICE],
    };
  }

  static forTest(
    catalog: CatalogService,
    identity: IdentityService,
    application?: ApplicationService,
  ): DynamicModule {
    const providers: Provider[] = [
      { provide: CATALOG_SERVICE, useValue: catalog },
      { provide: IdentityService, useValue: identity },
    ];
    if (application) {
      providers.push({ provide: APPLICATION_SERVICE, useValue: application });
    }
    return {
      module: CatalogModule,
      controllers: [CatalogController],
      providers,
      exports: [CATALOG_SERVICE],
    };
  }
}
