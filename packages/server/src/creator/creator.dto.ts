import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

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
  @ApiProperty({ description: "校验结果", enum: ["passed", "failed"] })
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
