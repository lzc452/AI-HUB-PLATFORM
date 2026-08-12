import { createDatabase } from "@ai-hub/database";
import { Module, type DynamicModule } from "@nestjs/common";
import { IdentityModule } from "../identity/identity.module.js";
import { IdentityService } from "../identity/identity.service.js";
import { KyselyApplicationRepository } from "../application/application.repository.js";
import { FeedbackController } from "./feedback.controller.js";
import { KyselyFeedbackRepository } from "./feedback.repository.js";
import { FeedbackService } from "./feedback.service.js";
import { FEEDBACK_SERVICE } from "./feedback.tokens.js";

@Module({})
export class FeedbackModule {
  static register(databaseUrl: string): DynamicModule {
    return {
      module: FeedbackModule,
      imports: [IdentityModule.register(databaseUrl)],
      controllers: [FeedbackController],
      providers: [
        {
          provide: FEEDBACK_SERVICE,
          useFactory: () => {
            const database = createDatabase(databaseUrl);
            return new FeedbackService(
              new KyselyFeedbackRepository(database),
              new KyselyApplicationRepository(database),
            );
          },
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
