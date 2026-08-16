import { ApiProperty } from "@nestjs/swagger";

/** 健康检查快照。 */
export class HealthSnapshotDto {
  @ApiProperty({
    type: String,
    description: "整体状态",
    enum: ["ok", "degraded"],
  })
  status!: "ok" | "degraded";

  @ApiProperty({
    description: "各依赖检查结果",
    type: Object,
    additionalProperties: { type: "string", enum: ["up", "down"] },
  })
  checks!: Readonly<Record<string, "up" | "down">>;

  @ApiProperty({
    description: "检查时间（ISO 8601）",
    type: String,
    format: "date-time",
    example: "2026-08-06T00:00:00.000Z",
  })
  timestamp!: string;
}
