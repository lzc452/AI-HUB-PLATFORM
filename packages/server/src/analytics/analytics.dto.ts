import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsObject, IsString } from "class-validator";

const DASHBOARD_KEYS = [
  "platform",
  "market",
  "application",
  "innovation",
  "review",
  "department",
  "risk",
  "runtime",
  "integration",
] as const;

/** 分析导出请求。 */
export class AnalyticsExportRequestDto {
  @ApiProperty({ type: String, description: "看板目标", enum: DASHBOARD_KEYS })
  @IsIn(DASHBOARD_KEYS)
  target!: (typeof DASHBOARD_KEYS)[number];

  @ApiProperty({
    type: String,
    description: "起始日期（YYYY-MM-DD）",
    example: "2026-07-01",
  })
  @IsString()
  from!: string;

  @ApiProperty({
    type: String,
    description: "结束日期（YYYY-MM-DD）",
    example: "2026-07-31",
  })
  @IsString()
  to!: string;
}

/** 分析助手请求。 */
export class AnalyticsAssistantRequestDto {
  @ApiProperty({
    type: String,
    description: "问题",
    example: "本周平台应用浏览量是多少？",
  })
  @IsString()
  question!: string;

  @ApiProperty({
    description: "上下文数据",
    type: Object,
    additionalProperties: true,
  })
  @IsObject()
  context!: Readonly<Record<string, unknown>>;
}

/** 日聚合指标。 */
export class DailyAggregateDto {
  @ApiProperty({
    type: String,
    description: "指标键",
    example: "platform.application_views",
  })
  metricKey!: string;

  @ApiPropertyOptional({ type: Number, description: "指标版本", example: 1 })
  metricVersion?: number;

  @ApiProperty({ type: String, description: "聚合日期", example: "2026-07-31" })
  day!: string;

  @ApiProperty({ type: String, description: "受众范围键", example: "all" })
  audienceScopeKey!: string;

  @ApiProperty({ type: Number, description: "指标值", example: 120 })
  value!: number;

  @ApiProperty({ type: Number, description: "来源事件数", example: 120 })
  sourceEventCount!: number;
}

/** 分析看板结果。 */
export class DashboardResultDto {
  @ApiProperty({ type: String, description: "看板键", enum: DASHBOARD_KEYS })
  dashboardKey!: (typeof DASHBOARD_KEYS)[number];

  @ApiProperty({ type: String, description: "起始日期", example: "2026-07-01" })
  from!: string;

  @ApiProperty({ type: String, description: "结束日期", example: "2026-07-31" })
  to!: string;

  @ApiProperty({
    description: "指标列表",
    type: () => DailyAggregateDto,
    isArray: true,
  })
  metrics!: DailyAggregateDto[];
}

/** 导出数据行。 */
export class AnalyticsExportRowDto {
  @ApiProperty({ type: String, description: "聚合 ID" })
  aggregateId!: string;

  @ApiProperty({
    description: "发生时间（ISO 8601）",
    type: String,
    format: "date-time",
  })
  occurredAt!: string;

  @ApiProperty({ type: Number, description: "指标值", example: 5 })
  value!: number;

  @ApiPropertyOptional({
    type: String,
    description: "请求员工工号",
    nullable: true,
  })
  requester?: string | null;
}

/** 分析导出结果。 */
export class AnalyticsExportResultDto {
  @ApiProperty({ type: String, description: "导出任务 ID" })
  exportId!: string;

  @ApiProperty({ type: String, description: "看板目标", enum: DASHBOARD_KEYS })
  target!: (typeof DASHBOARD_KEYS)[number];

  @ApiProperty({ type: String, description: "起始日期", example: "2026-07-01" })
  from!: string;

  @ApiProperty({ type: String, description: "结束日期", example: "2026-07-31" })
  to!: string;

  @ApiProperty({
    description: "导出数据行",
    type: () => AnalyticsExportRowDto,
    isArray: true,
  })
  rows!: AnalyticsExportRowDto[];
}

/** 导出下载结果。 */
export class AnalyticsDownloadResultDto {
  @ApiProperty({ type: Boolean, description: "是否已标记下载", example: true })
  downloaded!: boolean;

  @ApiProperty({ type: String, description: "导出任务 ID" })
  exportId!: string;
}

/** 分析助手响应。 */
export class AnalyticsAssistantResultDto {
  @ApiProperty({
    type: String,
    description: "响应状态",
    enum: ["ok", "degraded"],
  })
  status!: "ok" | "degraded";

  @ApiProperty({
    type: String,
    description: "回答内容",
    example: "本周平台应用浏览量合计 120 次。",
  })
  answer!: string;
}
