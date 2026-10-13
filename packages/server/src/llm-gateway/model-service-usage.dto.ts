import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from "class-validator";
import { PaginationQueryDto } from "../system/http/pagination.dto.js";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const RANGES = ["today", "7d", "30d", "custom"] as const;
const STATUSES = ["active", "disabled", "revoked"] as const;

/** 用量汇总查询：三种预设区间 + 自定义（`from`/`to`，跨度 ≤90 天）。 */
export class UsageSummaryQueryDto {
  @ApiPropertyOptional({
    type: String,
    enum: RANGES,
    description: "预设区间；默认 today。custom 时必须提供 from 与 to",
  })
  @IsOptional()
  @IsIn(RANGES)
  range?: (typeof RANGES)[number];

  @ApiPropertyOptional({
    type: String,
    description: "自定义区间起（YYYY-MM-DD）",
  })
  @IsOptional()
  @Matches(DATE_PATTERN, { message: "from 必须为 YYYY-MM-DD" })
  from?: string;

  @ApiPropertyOptional({
    type: String,
    description: "自定义区间止（YYYY-MM-DD，含当日）",
  })
  @IsOptional()
  @Matches(DATE_PATTERN, { message: "to 必须为 YYYY-MM-DD" })
  to?: string;
}

/** 调用明细查询：区间 + 可选筛选。 */
export class CallListQueryDto extends UsageSummaryQueryDto {
  @ApiPropertyOptional({ type: String, description: "按 Key 过滤" })
  @IsOptional()
  @IsString()
  keyId?: string;

  @ApiPropertyOptional({ type: String, description: "按模型过滤（精确匹配）" })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional({
    type: String,
    enum: ["true", "false"],
    description: "只看失败调用（HTTP ≥400，含被配额/熔断拒绝的调用）",
  })
  @IsOptional()
  @IsIn(["true", "false"])
  errorOnly?: "true" | "false";

  @ApiPropertyOptional({ type: Number, description: "页码", minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    type: Number,
    description: "每页条数",
    minimum: 1,
    maximum: 200,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;
}

/** 管理面用量查询：可指定员工，不传即全平台。 */
export class AdminUsageQueryDto extends UsageSummaryQueryDto {
  @ApiPropertyOptional({
    type: String,
    description: "限定员工工号；不传为全平台",
  })
  @IsOptional()
  @IsString()
  employeeId?: string;
}

export class AdminCallListQueryDto extends CallListQueryDto {
  @ApiPropertyOptional({
    type: String,
    description: "限定员工工号；不传为全平台",
  })
  @IsOptional()
  @IsString()
  employeeId?: string;
}

/** 管理面 Key 列表查询。 */
export class AdminKeyListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    type: String,
    description: "限定员工工号；不传为全平台",
  })
  @IsOptional()
  @IsString()
  employeeId?: string;

  @ApiPropertyOptional({
    type: String,
    enum: STATUSES,
    description: "按状态过滤",
  })
  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];
}

// ---- 响应 DTO ----

export class UsageTotalsDto {
  @ApiProperty({ type: Number, description: "调用次数（含失败与拒绝）" })
  calls!: number;

  @ApiProperty({ type: Number, description: "失败调用次数（HTTP ≥400）" })
  errorCalls!: number;

  @ApiProperty({ type: Number, description: "输入 token 合计" })
  promptTokens!: number;

  @ApiProperty({ type: Number, description: "输出 token 合计" })
  completionTokens!: number;

  @ApiProperty({ type: Number, description: "token 合计（配额口径）" })
  totalTokens!: number;
}

export class DailyUsageDto {
  @ApiProperty({
    type: String,
    description: "业务日（Asia/Shanghai，YYYY-MM-DD）",
  })
  usageDate!: string;

  @ApiProperty({ type: Number, description: "当日调用次数" })
  calls!: number;

  @ApiProperty({ type: Number, description: "当日失败次数" })
  errorCalls!: number;

  @ApiProperty({ type: Number, description: "当日 token 合计" })
  totalTokens!: number;
}

export class ModelUsageDto {
  @ApiProperty({ type: String, description: "模型名" })
  model!: string;

  @ApiProperty({ type: Number, description: "调用次数" })
  calls!: number;

  @ApiProperty({ type: Number, description: "失败次数" })
  errorCalls!: number;

  @ApiProperty({ type: Number, description: "token 合计" })
  totalTokens!: number;
}

export class KeyUsageDto {
  @ApiProperty({ type: String, description: "Key ID" })
  keyId!: string;

  @ApiProperty({ type: String, description: "Key 名称" })
  keyName!: string;

  @ApiProperty({ type: String, description: "Key 当前状态" })
  keyStatus!: string;

  @ApiProperty({ type: Number, description: "调用次数" })
  calls!: number;

  @ApiProperty({ type: Number, description: "失败次数" })
  errorCalls!: number;

  @ApiProperty({ type: Number, description: "token 合计" })
  totalTokens!: number;
}

export class UsageSummaryDto {
  @ApiProperty({ type: String, description: "生效区间标识" })
  range!: string;

  @ApiProperty({ type: String, description: "区间起（业务日）" })
  fromDate!: string;

  @ApiProperty({ type: String, description: "区间止（业务日，含当日）" })
  toDate!: string;

  @ApiProperty({
    type: Boolean,
    description:
      "true 表示当日读数来自事实表实时兜底（聚合 worker 尚未覆盖当日），看板应提示「当日为实时数据」",
  })
  todayPartial!: boolean;

  @ApiProperty({ type: () => UsageTotalsDto, description: "区间合计" })
  totals!: UsageTotalsDto;

  @ApiProperty({
    type: () => DailyUsageDto,
    isArray: true,
    description: "日趋势",
  })
  daily!: DailyUsageDto[];

  @ApiProperty({
    type: () => ModelUsageDto,
    isArray: true,
    description: "按模型构成",
  })
  byModel!: ModelUsageDto[];

  @ApiProperty({
    type: () => KeyUsageDto,
    isArray: true,
    description: "按 Key 构成",
  })
  byKey!: KeyUsageDto[];
}

export class CallDetailDto {
  @ApiProperty({ type: String, description: "调用记录 ID" })
  callId!: string;

  @ApiProperty({ type: String, description: "Key ID" })
  keyId!: string;

  @ApiProperty({ type: String, description: "员工工号" })
  employeeId!: string;

  @ApiProperty({
    type: String,
    enum: ["chat_completions", "embeddings", "models"],
    description: "端点",
  })
  endpoint!: string;

  @ApiProperty({
    type: String,
    description: "模型名（取上游响应，回退请求值）",
  })
  model!: string;

  @ApiProperty({ type: Boolean, description: "是否流式" })
  stream!: boolean;

  @ApiProperty({ type: Number, description: "输入 token" })
  promptTokens!: number;

  @ApiProperty({ type: Number, description: "输出 token" })
  completionTokens!: number;

  @ApiProperty({ type: Number, description: "token 合计" })
  totalTokens!: number;

  @ApiProperty({ type: Number, description: "耗时（毫秒）" })
  durationMs!: number;

  @ApiProperty({ type: Number, description: "HTTP 状态码（499=客户端断流）" })
  statusCode!: number;

  @ApiPropertyOptional({ type: String, nullable: true, description: "错误码" })
  errorCode!: string | null;

  @ApiProperty({
    type: Boolean,
    description: "token 是否为本地估算（上游未返回 usage）",
  })
  usageEstimated!: boolean;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: "请求追踪 ID",
  })
  traceId!: string | null;

  @ApiProperty({ type: String, description: "请求开始时刻（ISO 8601）" })
  requestedAt!: string;
}

export class CallPageDto {
  @ApiProperty({
    type: () => CallDetailDto,
    isArray: true,
    description: "当前页记录",
  })
  items!: CallDetailDto[];

  @ApiProperty({ type: Number, description: "总条数" })
  total!: number;

  @ApiProperty({ type: Number, description: "当前页" })
  page!: number;

  @ApiProperty({ type: Number, description: "每页条数" })
  pageSize!: number;
}
