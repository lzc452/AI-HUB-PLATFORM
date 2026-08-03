import { createDatabase } from "@ai-hub/database";
import { Module, type DynamicModule } from "@nestjs/common";
import { IdentityModule } from "../identity/identity.module.js";
import { IdentityService } from "../identity/identity.service.js";
import { ApplicationController } from "./application.controller.js";
import { KyselyApplicationRepository } from "./application.repository.js";
import { ApplicationService } from "./application.service.js";
import { APPLICATION_SERVICE } from "./application.tokens.js";
import type { ArtifactVerificationPort } from "./storage.port.js";

const unavailableArtifactVerifier: ArtifactVerificationPort = {
  async verifyArtifact() {
    throw new Error("ARTIFACT_VERIFIER_UNAVAILABLE");
  },
};

@Module({})
export class ApplicationModule {
  static registerService(
    databaseUrl: string,
    artifactVerifier: ArtifactVerificationPort = unavailableArtifactVerifier,
  ): DynamicModule {
    const database = createDatabase(databaseUrl);
    return {
      module: ApplicationModule,
      imports: [IdentityModule.register(databaseUrl)],
      providers: [
        {
          provide: APPLICATION_SERVICE,
          useFactory: (identity: IdentityService) =>
            new ApplicationService(
              new KyselyApplicationRepository(database),
              identity,
              artifactVerifier,
            ),
          inject: [IdentityService],
        },
      ],
      exports: [APPLICATION_SERVICE],
    };
  }

  static register(
    databaseUrl: string,
    artifactVerifier: ArtifactVerificationPort = unavailableArtifactVerifier,
  ): DynamicModule {
    return {
      module: ApplicationModule,
      imports: [
        ApplicationModule.registerService(databaseUrl, artifactVerifier),
      ],
      controllers: [ApplicationController],
      providers: [],
      exports: [APPLICATION_SERVICE],
    };
  }

  static forTest(
    application: ApplicationService,
    identity: IdentityService,
    artifactVerifier: ArtifactVerificationPort = unavailableArtifactVerifier,
  ): DynamicModule {
    return {
      module: ApplicationModule,
      controllers: [ApplicationController],
      providers: [
        { provide: APPLICATION_SERVICE, useValue: application },
        { provide: IdentityService, useValue: identity },
        { provide: "ARTIFACT_VERIFIER", useValue: artifactVerifier },
      ],
      exports: [APPLICATION_SERVICE],
    };
  }
}
