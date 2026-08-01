import {
  type DynamicModule,
  type MiddlewareConsumer,
  Module,
  type NestModule,
  RequestMethod,
} from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { pino, type Logger } from "pino";

import { ProblemDetailsFilter } from "../http/problem-details.filter.js";
import { MetricsController } from "./metrics.controller.js";
import { ObservabilityMetrics } from "./metrics.js";
import { RequestContextMiddleware } from "./request-context.middleware.js";
import { OBSERVABILITY_LOGGER, OBSERVABILITY_METRICS } from "./tokens.js";

export interface ObservabilityModuleOptions {
  logger?: Logger;
  metrics?: ObservabilityMetrics;
}

@Module({})
export class ObservabilityModule implements NestModule {
  public static register(
    options: ObservabilityModuleOptions = {},
  ): DynamicModule {
    const logger = options.logger ?? pino({ enabled: false });
    const metrics = options.metrics ?? new ObservabilityMetrics();

    return {
      module: ObservabilityModule,
      controllers: [MetricsController],
      providers: [
        { provide: OBSERVABILITY_LOGGER, useFactory: () => logger },
        { provide: OBSERVABILITY_METRICS, useFactory: () => metrics },
        RequestContextMiddleware,
        {
          provide: APP_FILTER,
          useFactory: (applicationLogger: Logger) =>
            new ProblemDetailsFilter(applicationLogger),
          inject: [OBSERVABILITY_LOGGER],
        },
      ],
      exports: [OBSERVABILITY_LOGGER, OBSERVABILITY_METRICS],
    };
  }

  public configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestContextMiddleware)
      .forRoutes({ path: "*", method: RequestMethod.ALL });
  }
}
