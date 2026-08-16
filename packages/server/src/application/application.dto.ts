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

  @ApiProperty({ type: String, description: "扫描状态", enum: ["passed"] })
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
    type: String,
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

/** 应用管理列表行。 */
export class ApplicationAdminListRowDto {
  @ApiProperty({ type: String }) applicationId!: string;
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ type: String }) summary!: string;
  @ApiProperty({ type: String }) categoryId!: string;
  @ApiProperty({
    type: String,
    enum: [
      "draft",
      "in_review",
      "approved",
      "published",
      "withdrawn",
      "archived",
    ],
  })
  status!: string;
  @ApiProperty({ type: String }) currentVersion!: string;
  @ApiProperty({ type: String, nullable: true }) currentVersionId!:
    | string
    | null;
  @ApiProperty({ type: String }) ownerName!: string;
  @ApiProperty({ type: String }) departmentName!: string;
  @ApiProperty({ type: String, isArray: true }) deliveryChannels!: string[];
  @ApiProperty({ type: String }) updatedAt!: string;
  @ApiProperty({ type: Boolean }) isMine!: boolean;
  @ApiProperty({ type: Boolean }) needsMyReview!: boolean;
}

/** 应用管理分页结果。 */
export class ApplicationAdminListResultDto {
  @ApiProperty({ type: ApplicationAdminListRowDto, isArray: true })
  items!: ApplicationAdminListRowDto[];
  @ApiProperty({ type: Number }) page!: number;
  @ApiProperty({ type: Number }) pageSize!: number;
  @ApiProperty({ type: Number }) total!: number;
}

export class ApplicationAdminKpisDto {
  @ApiProperty({ type: Number }) deliveryFailed!: number;
  @ApiProperty({ type: Number }) pendingReview!: number;
  @ApiProperty({ type: Number }) published!: number;
  @ApiProperty({ type: Number }) total!: number;
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
    type: String,
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
    type: String,
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
    type: String,
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

  @ApiProperty({
    type: String,
    description: "队列状态",
    enum: ["available", "claimed"],
  })
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

  @ApiProperty({
    type: String,
    description: "SLA 状态",
    enum: ["on_time", "overdue"],
  })
  slaStatus!: "on_time" | "overdue";
}

/** 应用管理四个工作台共用的聚合视图。 */
export class ApplicationWorkspaceDto {
  @ApiProperty({ type: ApplicationDto })
  application!: ApplicationDto;

  @ApiProperty({ type: ApplicationVersionDto, isArray: true })
  versions!: ApplicationVersionDto[];

  @ApiProperty({ type: DeliveryDto, isArray: true })
  deliveries!: DeliveryDto[];

  @ApiProperty({ type: ReviewDto, isArray: true })
  reviews!: ReviewDto[];

  @ApiProperty({ type: ReviewQueueDto, nullable: true })
  reviewQueue!: ReviewQueueDto | null;

  @ApiProperty({ type: () => AssetDto, isArray: true })
  assets!: AssetDto[];
}

/** 创建 artifact 上传会话请求。 */
export class ArtifactUploadInitRequestDto {
  @ApiProperty({
    type: String,
    description: "文件名",
    example: "smart-attendance-1.0.0.zip",
  })
  fileName!: string;

  @ApiProperty({
    type: String,
    description: "MIME 类型",
    example: "application/zip",
  })
  mimeType!: string;

  @ApiProperty({ type: Number, description: "文件大小（字节）" })
  sizeBytes!: number;
}

/** artifact 上传会话。 */
export class ArtifactUploadDto {
  @ApiProperty({ type: String, description: "上传会话 ID" })
  uploadId!: string;

  @ApiProperty({ type: String, description: "临时对象键" })
  objectKey!: string;

  @ApiProperty({ type: String, description: "文件名" })
  fileName!: string;

  @ApiProperty({ type: String, description: "MIME 类型" })
  mimeType!: string;

  @ApiProperty({ type: Number, description: "文件大小（字节）" })
  sizeBytes!: number;

  @ApiProperty({
    type: String,
    description: "上传状态",
    enum: ["uploading", "verifying", "completed", "failed"],
  })
  uploadStatus!: "uploading" | "verifying" | "completed" | "failed";

  @ApiProperty({
    type: String,
    description: "扫描状态",
    enum: ["pending", "passed", "failed"],
  })
  scanStatus!: "pending" | "passed" | "failed";

  @ApiProperty({
    type: String,
    nullable: true,
    description: "SHA-256（complete 后返回）",
  })
  sha256!: string | null;

  @ApiProperty({ type: String, nullable: true, description: "错误码" })
  errorCode!: string | null;

  @ApiProperty({ type: String, nullable: true, description: "服务端签名" })
  signature!: string | null;

  @ApiProperty({ type: Number, description: "校验尝试次数" })
  verificationAttempts!: number;

  @ApiProperty({ type: String, description: "过期时间（ISO 8601）" })
  expiresAt!: string;
}

/** 完成上传请求。 */
export class CompleteArtifactUploadRequestDto {
  @ApiProperty({
    type: String,
    description: "制品签名（V1 可为空字符串，走 Noop 校验）",
    example: "",
  })
  signature!: string;
}

/** 应用资产。 */
export class AssetDto {
  @ApiProperty({ type: String, description: "资产 ID" })
  assetId!: string;

  @ApiProperty({ type: String, description: "资产类型" })
  assetType!: "icon" | "screenshot" | "attachment";

  @ApiProperty({ type: String, description: "资产名称" })
  name!: string;

  @ApiProperty({ type: String, description: "存储键" })
  storageKey!: string;

  @ApiProperty({ type: String, description: "MIME 类型" })
  mimeType!: string;

  @ApiProperty({ type: Number, description: "大小（字节）" })
  sizeBytes!: number;

  @ApiProperty({ type: String, nullable: true, description: "SHA-256" })
  sha256!: string | null;

  @ApiProperty({ type: String, description: "扫描状态" })
  scanStatus!: "pending" | "passed" | "failed";

  @ApiProperty({ type: String, description: "创建时间（ISO 8601）" })
  createdAt!: string;
}

/** 创建资产请求。 */
export class CreateAssetRequestDto {
  @ApiProperty({ type: String, description: "资产类型" })
  assetType!: "icon" | "screenshot" | "attachment";

  @ApiProperty({ type: String, description: "资产名称" })
  name!: string;

  @ApiProperty({ type: String, description: "存储键（已上传至存储的对象键）" })
  storageKey!: string;

  @ApiProperty({ type: String, description: "MIME 类型" })
  mimeType!: string;

  @ApiProperty({ type: Number, description: "大小（字节）" })
  sizeBytes!: number;

  @ApiProperty({ type: String, nullable: true, description: "SHA-256" })
  sha256?: string | null;

  @ApiPropertyOptional({ type: Number, description: "排序" })
  sortOrder?: number;
}

/** 关联资产到交付渠道请求。 */
export class LinkDeliveryAssetRequestDto {
  @ApiProperty({
    type: String,
    description: "资产 ID（须属于该应用）",
  })
  assetId!: string;

  @ApiPropertyOptional({
    type: Number,
    description: "排序（值越小越靠前）",
  })
  sortOrder?: number;

  @ApiPropertyOptional({
    type: String,
    description: "关联版本号（如 1.0.0），缺省关联到最新发布版本",
  })
  version?: string;
}

/** 关联资产到交付渠道结果。 */
export class LinkDeliveryAssetResponseDto {
  @ApiProperty({ type: Boolean, description: "是否已关联", example: true })
  linked!: boolean;
}
