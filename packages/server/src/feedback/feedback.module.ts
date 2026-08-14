import type { DatabaseSchema } from "@ai-hub/database";
import { Module, type DynamicModule } from "@nestjs/common";
import type { Kysely } from "kysely";
import { IdentityModule } from "../identity/identity.module.js";
import { IdentityService } from "../identity/identity.service.js";
import { CatalogVisibilityPolicy } from "../catalog/catalog-visibility.policy.js";
import { KyselyCatalogRepository } from "../catalog/catalog.repository.js";
import { FeedbackController } from "./feedback.controller.js";
import { KyselyFeedbackRepository } from "./feedback.repository.js";
import { FeedbackService } from "./feedback.service.js";
import { FEEDBACK_SERVICE } from "./feedback.tokens.js";

@Module({})
export class FeedbackModule {
  static register(database: Kysely<DatabaseSchema>): DynamicModule {
    return {
      module: FeedbackModule,
      imports: [IdentityModule.register(database)],
      controllers: [FeedbackController],
      providers: [
        {
          provide: FEEDBACK_SERVICE,
          useValue: new FeedbackService(
            new KyselyFeedbackRepository(database),
            new CatalogVisibilityPolicy(new KyselyCatalogRepository(database)),
          ),
        },
      ],
      exports: [FEEDBACK_SERVICE],
    };
  }

  static forTest(
    feedback: FeedbackService,
    identity: IdentityService,
  ): DynamicModule {
    return {
      module: FeedbackModule,
      controllers: [FeedbackController],
      providers: [
        { provide: FEEDBACK_SERVICE, useValue: feedback },
        { provide: IdentityService, useValue: identity },
      ],
      exports: [FEEDBACK_SERVICE],
    };
  }
}
