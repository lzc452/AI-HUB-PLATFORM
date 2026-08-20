import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsBoolean,
  IsIn,
  ValidateIf,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  Max,
} from "class-validator";
import { PaginationQueryDto } from "../system/http/pagination.dto.js";

/** 应用评分请求。 */
export class RatingRequestDto {
  @ApiProperty({ type: Number, description: "评分（1-5 星）", example: 5 })
  @IsNumber()
  @Min(1)
  @Max(5)
  stars!: number;

  @ApiPropertyOptional({
    type: String,
    description: "评分内容",
    example: "体验很好",
  })
  @IsOptional()
  @IsString()
  body?: string;

  @ApiPropertyOptional({
    type: Boolean,
    description: "是否匿名展示",
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  displayAnonymously?: boolean;
}

/** 应用评论请求。 */
export class CommentRequestDto {
  @ApiProperty({
    type: String,
    description: "父评论 ID，根评论为 null",
    nullable: true,
  })
  @IsString()
  @ValidateIf((_o, v) => v !== null)
  parentCommentId!: string | null;

  @ApiProperty({
    type: String,
    description: "评论内容",
    example: "请问支持批量导入吗？",
  })
  @IsString()
  body!: string;

  @ApiPropertyOptional({
    type: Boolean,
    description: "是否匿名展示（官方回复强制实名）",
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  displayAnonymously?: boolean;
}

/** 举报请求。 */
export class ReportRequestDto {
  @ApiProperty({
    type: String,
    description: "举报原因",
    example: "包含不当内容",
  })
  @IsString()
  reason!: string;
}

/** 处理举报请求。 */
export class ResolveReportRequestDto {
  @ApiProperty({
    type: String,
    description: "处理结果",
    enum: ["dismissed", "hidden", "restored"],
  })
  @IsIn(["dismissed", "hidden", "restored"])
  status!: "dismissed" | "hidden" | "restored";
}

/** 评分记录。 */
export class RatingRecordDto {
  @ApiProperty({ type: String, description: "评分 ID" })
  ratingId!: string;

  @ApiProperty({ type: String, description: "应用 ID" })
  applicationId!: string;

  @ApiProperty({ type: String, description: "应用版本 ID" })
  applicationVersionId!: string;

  @ApiProperty({
    type: String,
    description: "评分人员工工号",
    example: "DEMO-EMPLOYEE",
  })
  employeeId!: string;

  @ApiProperty({ type: Number, description: "评分（1-5 星）", example: 5 })
  stars!: number;

  @ApiPropertyOptional({
    type: String,
    description: "评分内容",
    nullable: true,
    example: "体验很好",
  })
  body?: string | null;

  @ApiProperty({ type: Boolean, description: "是否匿名展示", example: false })
  displayAnonymously!: boolean;

  @ApiPropertyOptional({
    description: "评分员工账号状态（disabled/archived 视为已停用）",
    enum: ["pending_binding", "active", "disabled", "archived"],
    nullable: true,
  })
  authorStatus?: "pending_binding" | "active" | "disabled" | "archived" | null;

  @ApiProperty({
    description: "创建时间（ISO 8601）",
    type: String,
    format: "date-time",
  })
  createdAt!: string;

  @ApiProperty({
    description: "更新时间（ISO 8601）",
    type: String,
    format: "date-time",
  })
  updatedAt!: string;
}

/** 评论记录。 */
export class CommentRecordDto {
  @ApiProperty({ type: String, description: "评论 ID" })
  commentId!: string;

  @ApiProperty({ type: String, description: "应用 ID" })
  applicationId!: string;

  @ApiProperty({ type: String, description: "应用版本 ID" })
  applicationVersionId!: string;

  @ApiPropertyOptional({
    type: String,
    description: "父评论 ID，根评论为 null",
    nullable: true,
  })
  parentCommentId?: string | null;

  @ApiProperty({
    type: String,
    description: "作者员工工号",
    example: "DEMO-EMPLOYEE",
  })
  authorEmployeeId!: string;

  @ApiProperty({
    type: String,
    description: "评论内容",
    example: "请问支持批量导入吗？",
  })
  body!: string;

  @ApiProperty({ type: Boolean, description: "是否匿名展示", example: false })
  displayAnonymously!: boolean;

  @ApiPropertyOptional({
    description: "作者员工账号状态（disabled/archived 视为已停用）",
    enum: ["pending_binding", "active", "disabled", "archived"],
    nullable: true,
  })
  authorStatus?: "pending_binding" | "active" | "disabled" | "archived" | null;

  @ApiPropertyOptional({
    description: "评论类型：user=普通评论，official=官方回复",
    enum: ["user", "official"],
  })
  commentKind?: "user" | "official";

  @ApiPropertyOptional({
    description: "隐藏时间（ISO 8601），未隐藏为 null",
    type: String,
    format: "date-time",
    nullable: true,
  })
  hiddenAt?: string | null;

  @ApiProperty({
    description: "创建时间（ISO 8601）",
    type: String,
    format: "date-time",
  })
  createdAt!: string;

  @ApiProperty({
    description: "更新时间（ISO 8601）",
    type: String,
    format: "date-time",
  })
  updatedAt!: string;
}

/** 举报记录。 */
export class ReportRecordDto {
  @ApiProperty({ type: String, description: "举报 ID" })
  reportId!: string;

  @ApiProperty({ type: String, description: "应用 ID" })
  applicationId!: string;

  @ApiProperty({ type: String, description: "被举报评论 ID" })
  commentId!: string;

  @ApiProperty({
    type: String,
    description: "举报人员工工号",
    example: "DEMO-EMPLOYEE",
  })
  reporterEmployeeId!: string;

  @ApiProperty({
    type: String,
    description: "举报原因",
    example: "包含不当内容",
  })
  reason!: string;

  @ApiProperty({
    type: String,
    description: "处理状态",
    enum: ["open", "dismissed", "hidden", "restored"],
  })
  status!: "open" | "dismissed" | "hidden" | "restored";

  @ApiPropertyOptional({
    type: String,
    description: "处理人员工工号",
    nullable: true,
  })
  resolvedByEmployeeId?: string | null;

  @ApiPropertyOptional({
    description: "处理时间（ISO 8601）",
    type: String,
    format: "date-time",
    nullable: true,
  })
  resolvedAt?: string | null;

  @ApiProperty({
    description: "创建时间（ISO 8601）",
    type: String,
    format: "date-time",
  })
  createdAt!: string;
}

/** 分页评分列表。 */
export class PaginatedRatingsDto {
  @ApiProperty({ description: "评分列表", type: [RatingRecordDto] })
  items!: RatingRecordDto[];

  @ApiProperty({ type: Number, description: "总数" })
  total!: number;
}

/** 分页评论列表。 */
export class PaginatedCommentsDto {
  @ApiProperty({ description: "评论列表（含回复）", type: [CommentRecordDto] })
  items!: CommentRecordDto[];

  @ApiProperty({ type: Number, description: "根评论总数" })
  total!: number;
}

/** 评论列表查询参数。 */
export class ListCommentsQueryDto extends PaginationQueryDto {}

/** 评分列表查询参数。 */
export class ListRatingsQueryDto extends PaginationQueryDto {}
