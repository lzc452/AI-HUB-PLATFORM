import { Controller, Get, Header, Inject } from "@nestjs/common";
import {
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from "@nestjs/swagger";

import { ObservabilityMetrics } from "./metrics.js";
import { OBSERVABILITY_METRICS } from "./tokens.js";
import { Public } from "../../authorization/authorization.decorator.js";

@ApiTags("指标")
@Controller("internal/metrics")
@Public()
export class MetricsController {
  public constructor(
    @Inject(OBSERVABILITY_METRICS)
    private readonly metrics: ObservabilityMetrics,
  ) {}

  @Get()
  @Header("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
  @ApiOperation({
    summary: "Prometheus 指标",
    description: "返回 Prometheus 文本格式指标。",
  })
  @ApiProduces("text/plain")
  @ApiOkResponse({
    description: "Prometheus 文本格式指标",
    schema: { type: "string" },
  })
  public getMetrics(): Promise<string> {
    return this.metrics.metricsText();
  }
}
