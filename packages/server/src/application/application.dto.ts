import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/** 创建应用请求。 */
export class CreateApplicationRequestDto {
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

  @ApiPropertyOptional({
    type: String,
    description: "维护人员工工号，缺省为当前调用者",
    example: "DEMO-APP-ADMIN",
  })
  maintainerEmployeeId?: string;

  @ApiPropertyOptional({
    type: String,
    description: "所属部门 ID",
    example: "demo-rnd",
  })
  departmentId?: string;
}

/** 创建应用版本请求。 */
export class CreateVersionRequestDto {
  @ApiProperty({ type: String, description: "版本号", example: "1.0.0" })
  version!: string;

  @ApiProperty({ type: String, description: "变更说明", example: "首次发布" })
  changelog!: string;

  @ApiProperty({
    type: String,
    description: "制品对象存储键",
    example: "apps/app-1/1.0.0.zip",
  })
  artifactKey!: string;

  @ApiProperty({
    type: String,
    description: "制品 SHA-256",
    example: "a".repeat(64),
  })
  artifactSha256!: string;

  @ApiProperty({
    type: String,
    description: "制品签名",
    example: "signature-base64",
  })
  artifactSignature!: string;

  @ApiProperty({ description: "扫描状态", enum: ["passed"] })
  scanStatus!: "passed";
}

/** 配置交付渠道请求。 */
export class ConfigureDeliveryRequestDto {
  @ApiProperty({
    type: String,
    description: "入口地址",
    example: "https://apps.example.com/attendance",
  })
  entryUrl!: string;

  @ApiPropertyOptional({
    type: String,
    description: "最低客户端版本",
    example: "1.0.0",
  })
  minClientVersion?: string;

  @ApiProperty({ type: Boolean, description: "是否启用", example: true })
  enabled!: boolean;
}

/** 提交评审结论请求。 */
export class ReviewRequestDto {
  @ApiProperty({
    description: "评审结论",
    enum: ["approve", "reject", "request_changes"],
  })
  decision!: "approve" | "reject" | "request_changes";

  @ApiProperty({
    type: String,
    description: "评审意见",
    example: "版本通过，可以发布。",
  })
  comment!: string;
}

/** 发布应用请求。 */
export class PublishRequestDto {
  @ApiProperty({ type: String, description: "待发布的应用版本 ID" })
  applicationVersionId!: string;
}

/** 撤回应用请求。 */
export class WithdrawRequestDto {
  @ApiProperty({
    type: String,
    description: "撤回原因",
    example: "版本存在兼容性问题",
  })
  reason!: string;
}

/** 回滚应用请求。 */
export class RollbackRequestDto {
  @ApiProperty({ type: String, description: "回滚目标版本 ID" })
  applicationVersionId!: string;
}

/** 应用记录。 */
export class ApplicationDto {
  @ApiProperty({
    type: String,
    description: "应用 ID",
    example: "00000000-0000-0000-0000-000000000001",
  })
  applicationId!: string;

  @ApiProperty({
    type: String,
    description: "所有者员工工号",
    example: "DEMO-APP-ADMIN",
  })
  ownerEmployeeId!: string;

  @ApiProperty({
    type: String,
    description: "维护人员工工号",
    example: "DEMO-EMPLOYEE",
  })
  maintainerEmployeeId!: string;

  @ApiProperty({
    type: String,
    description: "所属部门 ID",
    example: "demo-rnd",
  })
  departmentId!: string;

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
  status!:
    | "draft"
    | "in_review"
    | "approved"
    | "published"
    | "withdrawn"
    | "archived";

  @ApiPropertyOptional({
    type: String,
    description: "当前发布版本 ID",
    nullable: true,
  })
  currentVersionId?: string | null;
}

/** 应用版本记录。 */
export class ApplicationVersionDto {
  @ApiProperty({ type: String, description: "版本 ID" })
  applicationVersionId!: string;

  @ApiProperty({ type: String, description: "应用 ID" })
  applicationId!: string;

  @ApiProperty({ type: String, description: "版本号", example: "1.0.0" })
  version!: string;

  @ApiProperty({ type: String, description: "变更说明", example: "首次发布" })
  changelog!: string;

  @ApiProperty({
    type: String,
    description: "制品对象存储键",
    example: "apps/app-1/1.0.0.zip",
  })
  artifactKey!: string;

  @ApiProperty({
    type: String,
    description: "制品 SHA-256",
    example: "a".repeat(64),
  })
  artifactSha256!: string;

  @ApiProperty({
    type: String,
    description: "制品签名",
    example: "signature-base64",
  })
  artifactSignature!: string;

  @ApiProperty({
    description: "扫描状态",
    enum: ["pending", "passed", "failed"],
  })
  scanStatus!: "pending" | "passed" | "failed";

  @ApiProperty({
    type: String,
    description: "创建人员工工号",
    example: "DEMO-APP-ADMIN",
  })
  createdByEmployeeId!: string;

  @ApiProperty({
    description: "创建时间（ISO 8601）",
    type: String,
    format: "date-time",
  })
  createdAt!: string;
}

/** 交付渠道记录。 */
export class DeliveryDto {
  @ApiProperty({ type: String, description: "交付记录 ID" })
  deliveryId!: string;

  @ApiProperty({ type: String, description: "应用 ID" })
  applicationId!: string;

  @ApiProperty({
    description: "交付渠道",
    enum: ["web", "desktop", "mobile", "mini_program"],
  })
  channel!: "web" | "desktop" | "mobile" | "mini_program";

  @ApiProperty({
    type: String,
    description: "入口地址",
    example: "https://apps.example.com/attendance",
  })
  entryUrl!: string;

  @ApiPropertyOptional({
    type: String,
    description: "最低客户端版本",
    nullable: true,
    example: "1.0.0",
  })
  minClientVersion?: string | null;

  @ApiProperty({ type: Boolean, description: "是否启用", example: true })
  enabled!: boolean;
}

/** 评审记录。 */
export class ReviewDto {
  @ApiProperty({ type: String, description: "评审 ID" })
  reviewId!: string;

  @ApiProperty({ type: String, description: "应用 ID" })
  applicationId!: string;

  @ApiProperty({ type: String, description: "应用版本 ID" })
  applicationVersionId!: string;

  @ApiProperty({
    type: String,
    description: "评审人员工工号",
    example: "DEMO-INNOVATION",
  })
  reviewerEmployeeId!: string;

  @ApiProperty({
    type: String,
    description: "应用所有员工工号",
    example: "DEMO-APP-ADMIN",
  })
  applicationOwnerEmployeeId!: string;

  @ApiProperty({
    description: "评审结论",
    enum: ["approve", "reject", "request_changes"],
  })
  decision!: "approve" | "reject" | "request_changes";

  @ApiProperty({
    type: String,
    description: "评审意见",
    example: "版本通过，可以发布。",
  })
  comment!: string;

  @ApiProperty({
    description: "创建时间（ISO 8601）",
    type: String,
    format: "date-time",
  })
  createdAt!: string;
}

/** 评审队列记录。 */
export class ReviewQueueDto {
  @ApiProperty({ type: String, description: "评审队列 ID" })
  reviewQueueId!: string;

  @ApiProperty({ type: String, description: "应用 ID" })
  applicationId!: string;

  @ApiProperty({ type: String, description: "应用版本 ID" })
  applicationVersionId!: string;

  @ApiProperty({ description: "队列状态", enum: ["available", "claimed"] })
  status!: "available" | "claimed";

  @ApiPropertyOptional({
    type: String,
    description: "认领人员工工号",
    nullable: true,
    example: "DEMO-INNOVATION",
  })
  claimedByEmployeeId?: string | null;

  @ApiPropertyOptional({
    description: "认领时间（ISO 8601）",
    type: String,
    format: "date-time",
    nullable: true,
  })
  claimedAt?: string | null;

  @ApiProperty({
    description: "SLA 截止时间（ISO 8601）",
    type: String,
    format: "date-time",
  })
  slaDueAt!: string;

  @ApiProperty({
    description: "创建时间（ISO 8601）",
    type: String,
    format: "date-time",
  })
  createdAt!: string;

  @ApiProperty({ description: "SLA 状态", enum: ["on_time", "overdue"] })
  slaStatus!: "on_time" | "overdue";
}
