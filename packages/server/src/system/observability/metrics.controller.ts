import { Controller, Get, Header, Inject } from "@nestjs/common";

import { ObservabilityMetrics } from "./metrics.js";
import { OBSERVABILITY_METRICS } from "./tokens.js";

@Controller("internal/metrics")
export class MetricsController {
  public constructor(
    @Inject(OBSERVABILITY_METRICS)
    private readonly metrics: ObservabilityMetrics,
  ) {}

  @Get()
  @Header("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
  public getMetrics(): Promise<string> {
    return this.metrics.metricsText();
  }
}
