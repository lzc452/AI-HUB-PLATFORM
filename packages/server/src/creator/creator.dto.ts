import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import type { CreatorApplicationRecord } from "./creator.types.js";

/** 版本差异。 */
export class CreatorVersionDiffDto {
  @ApiProperty({ type: String, description: "起始版本", example: "1.0.0" })
  fromVersion!: string;

  @ApiProperty({ type: String, description: "目标版本", example: "1.1.0" })
  toVersion!: string;

  @ApiProperty({ description: "变更字段列表", type: [String] })
  changedFields!: string[];
}

/** 校验报告。 */
export class CreatorValidationReportDto {
  @ApiProperty({
    type: String,
    description: "校验结果",
    enum: ["passed", "failed"],
  })
  status!: "passed" | "failed";

  @ApiProperty({
    description: "校验项列表",
    type: "array",
    items: {
      type: "object",
      properties: {
        name: { type: "string" },
        status: { type: "string", enum: ["passed", "failed"] },
      },
      required: ["name", "status"],
    },
  })
  checks!: readonly { name: string; status: "passed" | "failed" }[];
}

/** 聚合指标。 */
export class CreatorAggregateMetricsDto {
  @ApiProperty({ type: Number, description: "网页跳转次数", example: 12 })
  redirectCount!: number;

  @ApiProperty({ type: Number, description: "包下载次数", example: 8 })
  downloadCount!: number;

  @ApiProperty({ type: Number, description: "二维码展示次数", example: 3 })
  qrDisplayCount!: number;

  @ApiProperty({ type: Number, description: "点赞数", example: 5 })
  likeCount!: number;

  @ApiPropertyOptional({
    description: "平均评分",
    type: Number,
    nullable: true,
    example: 4.5,
  })
  ratingAverage?: number | null;

  @ApiProperty({ type: Number, description: "评审次数", example: 2 })
  reviewCount!: number;
}

/** 创作者应用摘要。 */
export class CreatorSummaryDto {
  @ApiProperty({ description: "版本差异", type: () => CreatorVersionDiffDto })
  versionDiff!: CreatorVersionDiffDto;

  @ApiProperty({
    description: "校验报告",
    type: () => CreatorValidationReportDto,
  })
  validationReport!: CreatorValidationReportDto;

  @ApiProperty({
    description: "聚合指标",
    type: () => CreatorAggregateMetricsDto,
  })
  metrics!: CreatorAggregateMetricsDto;
}

/** 我的应用列表条目。 */
export class CreatorApplicationItemDto {
  @ApiProperty({ type: String, description: "应用 ID", example: "app-1" })
  applicationId!: string;

  @ApiProperty({
    type: String,
    description: "应用名称",
    example: "智能考勤助手",
  })
  name!: string;

  @ApiProperty({
    type: String,
    description: "应用状态",
    enum: [
      "draft",
      "in_review",
      "approved",
      "published",
      "withdrawn",
      "archived",
    ],
  })
  status!: CreatorApplicationRecord["status"];

  @ApiProperty({
    type: String,
    description: "分类 ID",
    example: "productivity",
  })
  categoryId!: string;

  @ApiProperty({ description: "标签 ID 列表", type: [String] })
  tagIds!: string[];

  @ApiPropertyOptional({
    description: "发布时间（ISO 8601，未发布为 null）",
    type: String,
    format: "date-time",
    nullable: true,
    example: "2026-08-01T00:00:00.000Z",
  })
  publishedAt?: string | null;

  @ApiPropertyOptional({
    description: "平均评分",
    type: Number,
    nullable: true,
    example: 4.5,
  })
  ratingAverage?: number | null;

  @ApiProperty({ type: Number, description: "点赞数", example: 5 })
  likeCount!: number;
}

/** 我的应用列表结果。 */
export class CreatorApplicationListDto {
  @ApiProperty({
    description: "应用列表",
    type: () => CreatorApplicationItemDto,
    isArray: true,
  })
  items!: CreatorApplicationItemDto[];

  @ApiProperty({ type: Number, description: "当前页码", example: 1 })
  page!: number;

  @ApiProperty({ type: Number, description: "每页数量", example: 20 })
  pageSize!: number;

  @ApiProperty({ type: Number, description: "符合条件的总数", example: 2 })
  total!: number;
}
