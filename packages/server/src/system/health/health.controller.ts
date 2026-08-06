import { Controller, Get, HttpCode, Inject, Res } from "@nestjs/common";
import {
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";

import { HealthReader } from "./health.reader.js";
import { HealthSnapshotDto } from "./health.dto.js";

@ApiTags("健康检查")
@Controller("internal/health")
export class HealthController {
  constructor(
    @Inject(HealthReader) private readonly healthReader: HealthReader,
  ) {}

  @Get("live")
  @ApiOperation({ summary: "存活探针" })
  @ApiOkResponse({ description: "进程存活", type: HealthSnapshotDto })
  live() {
    return this.healthReader.live();
  }

  @Get("ready")
  @HttpCode(200)
  @ApiOperation({
    summary: "就绪探针",
    description: "检查依赖（如数据库）是否就绪。",
  })
  @ApiOkResponse({ description: "服务就绪", type: HealthSnapshotDto })
  @ApiResponse({
    status: 503,
    description: "服务降级（依赖不可用）",
    type: HealthSnapshotDto,
  })
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
