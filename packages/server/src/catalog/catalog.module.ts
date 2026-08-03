import { createDatabase } from "@ai-hub/database";
import { Module, type DynamicModule } from "@nestjs/common";
import { IdentityModule } from "../identity/identity.module.js";
import { IdentityService } from "../identity/identity.service.js";
import { CatalogController } from "./catalog.controller.js";
import { KyselyCatalogRepository } from "./catalog.repository.js";
import { CatalogService } from "./catalog.service.js";
import { CATALOG_SERVICE } from "./catalog.tokens.js";
import { AnalyticsEventService } from "../analytics/analytics.service.js";
import { KyselyAnalyticsEventRepository } from "../analytics/analytics.repository.js";

@Module({})
export class CatalogModule {
  static register(databaseUrl: string): DynamicModule {
    return {
      module: CatalogModule,
      imports: [IdentityModule.register(databaseUrl)],
      controllers: [CatalogController],
      providers: [
        {
          provide: CATALOG_SERVICE,
          useFactory: () => {
            const database = createDatabase(databaseUrl);
            return new CatalogService(
              new KyselyCatalogRepository(database),
              new AnalyticsEventService(
                new KyselyAnalyticsEventRepository(database),
              ),
            );
          },
        },
      ],
      exports: [CATALOG_SERVICE],
    };
  }

  static forTest(
    catalog: CatalogService,
    identity: IdentityService,
  ): DynamicModule {
    return {
      module: CatalogModule,
      controllers: [CatalogController],
      providers: [
        { provide: CATALOG_SERVICE, useValue: catalog },
        { provide: IdentityService, useValue: identity },
      ],
      exports: [CATALOG_SERVICE],
    };
  }
}
