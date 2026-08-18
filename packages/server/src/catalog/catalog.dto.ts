import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";
import { PaginationQueryDto } from "../system/http/pagination.dto.js";

/** 记录目录行为请求。 */
export class CatalogActionRequestDto {
  @ApiProperty({
    type: String,
    description: "行为类型",
    enum: ["web_redirect", "package_download", "qr_display"],
  })
  @IsIn(["web_redirect", "package_download", "qr_display"])
  actionType!: "web_redirect" | "package_download" | "qr_display";

  @ApiPropertyOptional({
    type: String,
    description: "渠道标识",
    example: "web",
  })
  @IsOptional()
  @IsString()
  channel?: string;
}

/** 目录条目。 */
export class CatalogEntryDto {
  @ApiProperty({
    type: String,
    description: "应用 ID",
    example: "00000000-0000-0000-0000-000000000001",
  })
  applicationId!: string;

  @ApiProperty({
    type: String,
    description: "应用名称",
    example: "智能考勤助手",
  })
  name!: string;

  @ApiProperty({
    type: String,
    description: "应用简介",
    example: "面向研发团队的智能考勤与排班应用",
  })
  summary!: string;

  @ApiProperty({
    type: String,
    description: "所属部门 ID",
    example: "demo-rnd",
  })
  departmentId!: string;

  @ApiProperty({
    type: String,
    description: "分类 ID",
    example: "productivity",
  })
  categoryId!: string;

  @ApiProperty({ description: "标签 ID 列表", type: [String] })
  tagIds!: string[];

  @ApiProperty({
    description: "信任标签列表",
    type: [String],
    enum: ["experimental", "verified", "recommended", "deprecated"],
  })
  trustLabels!: readonly (
    | "experimental"
    | "verified"
    | "recommended"
    | "deprecated"
  )[];

  @ApiProperty({ type: String, description: "当前发布版本 ID" })
  currentVersionId!: string;

  @ApiProperty({
    description: "发布时间（ISO 8601）",
    type: String,
    format: "date-time",
  })
  publishedAt!: string;

  @ApiProperty({
    description: "交付渠道列表",
    type: [String],
    enum: ["web", "desktop", "mobile", "mini_program"],
  })
  deliveryChannels!: readonly ("web" | "desktop" | "mobile" | "mini_program")[];

  @ApiProperty({ type: Number, description: "点赞数", example: 5 })
  likeCount!: number;

  @ApiPropertyOptional({ type: Number, description: "评分人数" })
  ratingCount?: number;

  @ApiPropertyOptional({ type: [String], description: "维护人" })
  maintainers?: string[];

  @ApiPropertyOptional({
    type: [Object],
    description: "已通过扫描的附件",
  })
  attachments?: readonly {
    name: string;
    type: string;
    size: string;
  }[];

  @ApiPropertyOptional({ type: Object, description: "当前用户能力" })
  capabilities?: {
    canResolveDelivery: boolean;
    canLike: boolean;
    canRate: boolean;
    canComment: boolean;
    canSubmitFeedback: boolean;
    canModerateComments: boolean;
    canEditRisk: boolean;
  };

  @ApiPropertyOptional({
    description: "平均评分",
    type: Number,
    nullable: true,
    example: 4.5,
  })
  ratingAverage?: number | null;

  @ApiProperty({
    type: String,
    description: "健康状态",
    enum: ["unknown", "healthy", "degraded", "failed"],
  })
  healthStatus!: "unknown" | "healthy" | "degraded" | "failed";

  @ApiPropertyOptional({
    type: String,
    description: "废弃原因",
    nullable: true,
    example: null,
  })
  deprecatedReason?: string | null;

  @ApiPropertyOptional({
    type: String,
    description: "替代应用 ID",
    nullable: true,
  })
  replacementApplicationId?: string | null;
}

/** 目录列表结果。 */
export class CatalogListResultDto {
  @ApiProperty({
    description: "条目列表",
    type: () => CatalogEntryDto,
    isArray: true,
  })
  items!: CatalogEntryDto[];

  @ApiProperty({ type: Number, description: "符合条件的总数", example: 1 })
  total!: number;

  @ApiProperty({ type: Number, description: "当前页码", example: 1 })
  page!: number;

  @ApiProperty({ type: Number, description: "每页数量", example: 20 })
  pageSize!: number;
}

/** 风险说明响应。 */
export class RiskDescriptionDto {
  @ApiProperty({ type: String, description: "风险说明内容" })
  riskDescription!: string;
}

/** 保存风险说明请求。 */
export class SaveRiskDescriptionRequestDto {
  @ApiProperty({ type: String, description: "风险说明内容" })
  @IsString()
  riskDescription!: string;
}

/** 分类摘要。 */
export class CategorySummaryDto {
  @ApiProperty({
    type: String,
    description: "分类 ID",
    example: "productivity",
  })
  categoryId!: string;

  @ApiProperty({ type: String, description: "分类名称", example: "效率工具" })
  name!: string;
}

/** 标签摘要。 */
export class TagSummaryDto {
  @ApiProperty({
    type: String,
    description: "标签 ID",
    example: "ai-assistant",
  })
  tagId!: string;

  @ApiProperty({ type: String, description: "标签名称", example: "AI 助手" })
  name!: string;
}

/** 目录列表查询参数。 */
export class ListCatalogQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ type: String, description: "搜索关键词" })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  query?: string;

  @ApiPropertyOptional({ type: String, description: "分类 ID" })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  categoryId?: string;

  @ApiPropertyOptional({ type: String, description: "应用类型" })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  applicationType?: string;

  @ApiPropertyOptional({
    type: String,
    description: "排序方式",
    enum: ["recommended", "latest", "popular"],
  })
  @IsOptional()
  @IsIn(["recommended", "latest", "popular"])
  sort?: "recommended" | "latest" | "popular";
}
