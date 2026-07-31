import { Module, type DynamicModule } from "@nestjs/common";

import { HealthController } from "./health.controller.js";
import { HealthReader, type DatabaseHealthCheck } from "./health.reader.js";

export const DATABASE_HEALTH_CHECK = Symbol("DATABASE_HEALTH_CHECK");

@Module({})
export class HealthModule {
  static register(databaseCheck: DatabaseHealthCheck): DynamicModule {
    return {
      module: HealthModule,
      controllers: [HealthController],
      providers: [
        { provide: DATABASE_HEALTH_CHECK, useValue: databaseCheck },
        {
          provide: HealthReader,
          useFactory: (check: DatabaseHealthCheck) => new HealthReader(check),
          inject: [DATABASE_HEALTH_CHECK],
        },
      ],
      exports: [HealthReader],
    };
  }
}
