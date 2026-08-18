import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString } from "class-validator";

/** 创建应用反馈请求。 */
export class CreateFeedbackRequestDto {
  @ApiProperty({
    type: String,
    description: "反馈类型",
    enum: ["bug", "suggestion", "content_issue"],
  })
  @IsIn(["bug", "suggestion", "content_issue"])
  type!: "bug" | "suggestion" | "content_issue";

  @ApiProperty({
    type: String,
    description: "反馈内容",
    example: "登录页在移动端宽度下按钮溢出",
  })
  @IsString()
  body!: string;
}

/** 更新反馈处理状态请求。 */
export class UpdateFeedbackRequestDto {
  @ApiProperty({
    type: String,
    description: "处理状态",
    enum: ["open", "in_progress", "resolved", "closed"],
  })
  @IsIn(["open", "in_progress", "resolved", "closed"])
  status!: "open" | "in_progress" | "resolved" | "closed";

  @ApiPropertyOptional({
    type: String,
    description: "处理说明（结单时建议填写）",
  })
  @IsOptional()
  @IsString()
  resolution?: string;
}

/** 应用反馈记录。 */
export class FeedbackDto {
  @ApiProperty({ type: String, description: "反馈 ID" })
  feedbackId!: string;

  @ApiProperty({ type: String, description: "应用 ID" })
  applicationId!: string;

  @ApiPropertyOptional({ type: String, nullable: true, description: "版本 ID" })
  applicationVersionId?: string | null;

  @ApiProperty({ type: String, description: "创建者工号" })
  creatorEmployeeId!: string;

  @ApiProperty({
    type: String,
    description: "反馈类型",
    enum: ["bug", "suggestion", "content_issue"],
  })
  type!: "bug" | "suggestion" | "content_issue";

  @ApiProperty({ type: String, description: "反馈内容" })
  body!: string;

  @ApiProperty({
    type: String,
    description: "处理状态",
    enum: ["open", "in_progress", "resolved", "closed"],
  })
  status!: "open" | "in_progress" | "resolved" | "closed";

  @ApiPropertyOptional({ type: String, nullable: true, description: "处理人" })
  assigneeEmployeeId?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: "处理说明",
  })
  resolution?: string | null;

  @ApiProperty({ type: String, description: "创建时间（ISO 8601）" })
  createdAt!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: "解决时间（ISO 8601）",
  })
  resolvedAt?: string | null;
}
