import { Controller, Get, HttpCode, Inject, Res } from "@nestjs/common";

import { HealthReader } from "./health.reader.js";

@Controller("internal/health")
export class HealthController {
  constructor(
    @Inject(HealthReader) private readonly healthReader: HealthReader,
  ) {}

  @Get("live")
  live() {
    return this.healthReader.live();
  }

  @Get("ready")
  @HttpCode(200)
  async ready(
    @Res({ passthrough: true }) response: { status(code: number): unknown },
  ) {
    const snapshot = await this.healthReader.ready();

    if (snapshot.status === "degraded") {
      response.status(503);
    }

    return snapshot;
  }
}
