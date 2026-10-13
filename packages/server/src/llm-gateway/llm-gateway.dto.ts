import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from "class-validator";
import { PaginationQueryDto } from "../system/http/pagination.dto.js";

/** 创建 API Key 请求（PRD 8.1）。 */
export class CreateApiKeyRequestDto {
  @ApiProperty({
    type: String,
    description: "Key 名称，本人内未撤销 Key 唯一",
    example: "notebook-dev",
    minLength: 1,
    maxLength: 64,
  })
  @IsString()
  @Length(1, 64)
  name!: string;

  @ApiPropertyOptional({
    type: Number,
    description: "有效期天数（1–365）；不传表示长期有效",
    example: 90,
    minimum: 1,
    maximum: 365,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  expiresInDays?: number;

  @ApiPropertyOptional({
    type: Number,
    description: "每分钟请求数上限；不传用平台默认，且不得高于平台上限",
    example: 60,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  rpmLimit?: number;

  @ApiPropertyOptional({
    type: Number,
    description: "每分钟 token 上限；不传用平台默认，且不得高于平台上限",
    example: 100000,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  tpmLimit?: number;

  @ApiPropertyOptional({
    type: Number,
    description: "每日 token 配额；不传用平台默认，且不得高于平台上限",
    example: 2000000,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  dailyTokenLimit?: number;
}

/**
 * 变更 Key 属性请求（PRD 8.1，评审 R1-01 新增）。
 * 显式传 `null` 表示回到平台默认；字段省略表示保持原值。不承载状态变更。
 */
export class UpdateApiKeyRequestDto {
  @ApiPropertyOptional({
    type: String,
    description: "Key 名称（本人内未撤销 Key 唯一）",
    minLength: 1,
    maxLength: 64,
  })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  name?: string;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: "有效期天数（1–365）；null 表示取消有效期",
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  expiresInDays?: number | null;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: "每分钟请求数上限；null 表示回到平台默认",
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  rpmLimit?: number | null;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: "每分钟 token 上限；null 表示回到平台默认",
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  tpmLimit?: number | null;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: "每日 token 配额；null 表示回到平台默认",
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  dailyTokenLimit?: number | null;
}

/** 列表查询（分页复用平台口径，见 system/http/pagination.dto.ts）。 */
export class ListApiKeysQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    type: String,
    enum: ["true", "false"],
    description: "是否包含已撤销（revoked）的 Key；默认 false",
  })
  @IsOptional()
  @IsIn(["true", "false"])
  includeRevoked?: "true" | "false";
}

/** Key 限额；null 表示使用平台默认值。 */
export class ApiKeyLimitsDto {
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: "每分钟请求数上限",
  })
  rpm!: number | null;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: "每分钟 token 上限",
  })
  tpm!: number | null;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: "每日 token 配额",
  })
  dailyTokens!: number | null;
}

/** Key 响应（列表项与详情同构；明文与摘要永不出现在此处）。 */
export class ApiKeySummaryDto {
  @ApiProperty({ type: String, description: "Key ID" })
  keyId!: string;

  @ApiProperty({ type: String, description: "Key 名称" })
  name!: string;

  @ApiProperty({ type: String, description: "展示用前缀（明文前 16 字符）" })
  prefix!: string;

  @ApiProperty({
    type: String,
    enum: ["active", "disabled", "revoked"],
    description: "存储状态",
  })
  status!: string;

  @ApiProperty({
    type: String,
    enum: ["active", "disabled", "revoked", "expired"],
    description: "派生状态（含服务端时钟判定的过期）",
  })
  effectiveStatus!: string;

  @ApiProperty({ type: () => ApiKeyLimitsDto, description: "限额覆盖" })
  limits!: ApiKeyLimitsDto;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: "最近一次成功调用时间",
  })
  lastUsedAt!: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: "过期时间",
  })
  expiresAt!: string | null;

  @ApiProperty({ type: String, description: "创建时间" })
  createdAt!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: "最近一次禁用时间（启用后为 null）",
  })
  disabledAt!: string | null;
}

export class ApiKeyPageDto {
  @ApiProperty({
    type: () => ApiKeySummaryDto,
    isArray: true,
    description: "当前页 Key",
  })
  items!: readonly ApiKeySummaryDto[];

  @ApiProperty({ type: Number, description: "总数" })
  total!: number;

  @ApiProperty({ type: Number, description: "当前页" })
  page!: number;

  @ApiProperty({ type: Number, description: "每页条数" })
  pageSize!: number;
}

/** 创建/轮换响应：`apiKey` 仅此一次返回。 */
export class CreateApiKeyResponseDto extends ApiKeySummaryDto {
  @ApiProperty({
    type: String,
    description: "一次性明文 Key，仅本次响应返回，请立即保存",
    example: "sk-aihub-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  })
  apiKey!: string;
}
