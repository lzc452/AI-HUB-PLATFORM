import type { DeliveryTarget } from "@ai-hub/contracts";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  ValidateIf,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { PaginationQueryDto } from "../system/http/pagination.dto.js";

/** 创建应用请求。 */
export class CreateApplicationRequestDto {
  @ApiProperty({
    type: String,
    description: "应用名称",
    example: "智能考勤助手",
  })
  @IsString()
  name!: string;

  @ApiProperty({
    type: String,
    description: "应用简介",
    example: "面向研发团队的智能考勤与排班应用",
  })
  @IsString()
  summary!: string;

  @ApiPropertyOptional({
    type: String,
    description: "维护人员工工号，缺省为当前调用者",
    example: "DEMO-APP-ADMIN",
  })
  @IsOptional()
  @IsString()
  maintainerEmployeeId?: string;

  @ApiPropertyOptional({
    type: String,
    description: "所属部门 ID",
    example: "demo-rnd",
  })
  @IsOptional()
  @IsString()
  departmentId?: string;
}

/** 创建应用版本请求。 */
export class CreateVersionRequestDto {
  @ApiProperty({ type: String, description: "版本号", example: "1.0.0" })
  @IsString()
  version!: string;

  @ApiProperty({ type: String, description: "变更说明", example: "首次发布" })
  @IsString()
  changelog!: string;

  @ApiProperty({
    type: String,
    description: "制品对象存储键",
    example: "apps/app-1/1.0.0.zip",
  })
  @IsString()
  artifactKey!: string;

  @ApiProperty({
    type: String,
    description: "制品 SHA-256",
    example: "a".repeat(64),
  })
  @IsString()
  artifactSha256!: string;

  @ApiProperty({
    type: String,
    description: "制品签名",
    example: "signature-base64",
  })
  @IsString()
  artifactSignature!: string;

  @ApiProperty({ type: String, description: "扫描状态", enum: ["passed"] })
  @IsIn(["passed"])
  scanStatus!: "passed";

  @ApiPropertyOptional({
    type: Boolean,
    description:
      "制品未签名（signed=false）时是否已显式确认接受风险；未确认则拒绝创建版本",
  })
  @IsOptional()
  @IsBoolean()
  acceptUnsigned?: boolean;
}

/** 提交版本审核请求（未签名制品需显式确认风险）。 */
export class SubmitReviewRequestDto {
  @ApiPropertyOptional({
    type: Boolean,
    description:
      "版本制品未签名（signed=false）时是否已显式确认接受风险；未确认则拒绝提交审核",
  })
  @IsOptional()
  @IsBoolean()
  acceptUnsigned?: boolean;
}

/** 交付目标（desktop/mobile/mini_program 渠道的 OS/平台与小程序二维码）。 */
export class DeliveryTargetDto {
  @ApiProperty({
    type: String,
    description: "目标类型",
    enum: ["desktop", "mobile", "miniprogram"],
  })
  @IsIn(["desktop", "mobile", "miniprogram"])
  kind!: "desktop" | "mobile" | "miniprogram";

  @ApiPropertyOptional({
    type: String,
    description: "桌面端目标 OS",
    enum: ["windows", "macos"],
  })
  @IsOptional()
  @IsIn(["windows", "macos"])
  os?: "windows" | "macos";

  @ApiPropertyOptional({
    type: String,
    description: "移动端/小程序平台",
    enum: ["android", "ios", "wechat", "dingtalk", "alipay"],
  })
  @IsOptional()
  @IsIn(["android", "ios", "wechat", "dingtalk", "alipay"])
  platform?: "android" | "ios" | "wechat" | "dingtalk" | "alipay";

  @ApiPropertyOptional({
    type: String,
    description: "架构（如 x64 / arm64）",
    nullable: true,
  })
  @IsOptional()
  @IsString()
  arch?: string | null;

  @ApiPropertyOptional({
    type: String,
    description: "小程序 appId（为空时以二维码解析出的目标标识回填）",
  })
  @IsOptional()
  @IsString()
  appId?: string;

  @ApiPropertyOptional({
    type: String,
    description: "小程序二维码资产 ID（unified-upload 完成态资产）",
  })
  @IsOptional()
  @IsString()
  qrCodeAssetId?: string;

  @ApiPropertyOptional({
    type: String,
    description: "版本说明",
    nullable: true,
  })
  @IsOptional()
  @IsString()
  versionNote?: string | null;

  @ApiPropertyOptional({
    type: Boolean,
    description: "小程序目标是否启用",
  })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

/** 配置交付渠道请求。 */
export class ConfigureDeliveryRequestDto {
  @ApiProperty({
    type: String,
    description: "入口地址",
    example: "https://apps.example.com/attendance",
  })
  @IsString()
  entryUrl!: string;

  @ApiPropertyOptional({
    type: String,
    description: "最低客户端版本",
    example: "1.0.0",
  })
  @IsOptional()
  @IsString()
  minClientVersion?: string;

  @ApiProperty({ type: Boolean, description: "是否启用", example: true })
  @IsBoolean()
  enabled!: boolean;

  @ApiPropertyOptional({
    type: DeliveryTargetDto,
    isArray: true,
    description: "交付目标（web 渠道不支持）",
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DeliveryTargetDto)
  targets?: DeliveryTarget[];
}

/** 提交评审结论请求。 */
export class ReviewRequestDto {
  @ApiProperty({
    type: String,
    description: "评审结论",
    enum: ["approve", "reject", "request_changes"],
  })
  @IsIn(["approve", "reject", "request_changes"])
  decision!: "approve" | "reject" | "request_changes";

  @ApiProperty({
    type: String,
    description: "评审意见",
    example: "版本通过，可以发布。",
  })
  // 驳回（reject / request_changes）必须有原因；批准也要求非空，
  // request_changes 语义等同驳回，同样需要原因（规格 §5.5）。
  @IsNotEmpty()
  @IsString()
  comment!: string;
}

/** 转交评审任务请求。 */
export class TransferReviewRequestDto {
  @ApiProperty({
    type: String,
    description: "新认领人员工工号",
    example: "DEMO-INNOVATION",
  })
  @IsString()
  claimedByEmployeeId!: string;
}

/** 发布应用请求。 */
export class PublishRequestDto {
  @ApiProperty({ type: String, description: "待发布的应用版本 ID" })
  @IsString()
  applicationVersionId!: string;
}

/** 撤回应用请求。 */
export class WithdrawRequestDto {
  @ApiProperty({
    type: String,
    description: "撤回原因",
    example: "版本存在兼容性问题",
  })
  @IsString()
  reason!: string;
}

/** 申请下架应用请求（责任人或维护人发起，通知责任人确认执行）。 */
export class RequestWithdrawRequestDto {
  @ApiProperty({
    type: String,
    description: "申请下架原因",
    example: "应用已停止维护",
  })
  @IsString()
  reason!: string;
}

/** 回滚应用请求。 */
export class RollbackRequestDto {
  @ApiProperty({ type: String, description: "回滚目标版本 ID" })
  @IsString()
  applicationVersionId!: string;
}

/** 撤回待审核版本请求（当前无请求体，预留为扩展点）。 */
export class ReviewWithdrawRequestDto {}

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

  @ApiPropertyOptional({
    type: String,
    description: "已发布应用正在审核的待生效版本 ID",
    nullable: true,
  })
  pendingVersionId?: string | null;
}

/** 移交责任人请求。 */
export class TransferOwnerRequestDto {
  @ApiProperty({
    type: String,
    description: "新责任人工号",
    example: "DEMO-EMPLOYEE",
  })
  ownerEmployeeId!: string;
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
    type: Boolean,
    nullable: true,
    description:
      "制品是否已签名（源自关联已验证 upload 记录；无制品或查不到关联上传时为 null）",
    example: true,
  })
  signed!: boolean | null;

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

/** 版本快照记录（版本提交时持久化的完整草稿内容）。 */
export class VersionSnapshotDto {
  @ApiProperty({
    description: "快照创建时间（ISO 8601）",
    type: String,
    format: "date-time",
  })
  createdAt!: string;

  @ApiProperty({
    description: "版本提交时的完整草稿内容（ApplicationDraft 顶层字段）",
    type: Object,
    additionalProperties: true,
  })
  payload!: Record<string, unknown>;
}

/** 差异中的单个字段变化。 */
export class VersionDiffChangeDto {
  @ApiProperty({ type: String, description: "字段名" })
  field!: string;

  @ApiProperty({
    description: "from 版本的值",
    type: Object,
    additionalProperties: true,
  })
  from!: unknown;

  @ApiProperty({
    description: "to 版本的值",
    type: Object,
    additionalProperties: true,
  })
  to!: unknown;
}

/** 差异中的新增/移除字段。 */
export class VersionDiffEntryDto {
  @ApiProperty({ type: String, description: "字段名" })
  field!: string;

  @ApiProperty({
    description: "字段值",
    type: Object,
    additionalProperties: true,
  })
  value!: unknown;
}

/** 两版本快照的顶层字段级差异（from → to）。 */
export class VersionDiffDto {
  @ApiProperty({
    type: VersionDiffChangeDto,
    isArray: true,
    description: "值发生变化的字段",
  })
  changed!: VersionDiffChangeDto[];

  @ApiProperty({
    type: VersionDiffEntryDto,
    isArray: true,
    description: "to 版本新增的字段",
  })
  added!: VersionDiffEntryDto[];

  @ApiProperty({
    type: VersionDiffEntryDto,
    isArray: true,
    description: "from 版本有、to 版本移除的字段",
  })
  removed!: VersionDiffEntryDto[];
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

  @ApiPropertyOptional({
    type: DeliveryTargetDto,
    isArray: true,
    description: "交付目标（desktop/mobile/mini_program 渠道）",
  })
  targets?: DeliveryTargetDto[];
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

/** 待审自定义分类/标签项（审核员查看/删除）。 */
export class PendingCatalogItemDto {
  @ApiProperty({ type: String, description: "待审项 ID" })
  itemId!: string;

  @ApiProperty({
    type: String,
    description: "类型",
    enum: ["category", "tag"],
  })
  kind!: "category" | "tag";

  @ApiProperty({ type: String, description: "名称" })
  name!: string;

  @ApiProperty({
    description: "创建时间（ISO 8601）",
    type: String,
    format: "date-time",
  })
  createdAt!: string;
}

/** 应用管理四个工作台共用的聚合视图。 */
export class ApplicationWorkspaceDto {
  @ApiProperty({ type: ApplicationDto })
  application!: ApplicationDto;

  @ApiProperty({
    type: String,
    nullable: true,
    description: "应用类型（application_catalog_metadata；存量应用可能缺失）",
  })
  applicationType!: string | null;

  @ApiProperty({ type: String, description: "责任人姓名" })
  ownerName!: string;

  @ApiProperty({ type: String, description: "维护人姓名" })
  maintainerName!: string;

  @ApiProperty({ type: String, description: "所属部门名称" })
  departmentName!: string;

  @ApiProperty({ type: String, description: "应用最近更新时间（ISO）" })
  updatedAt!: string;

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
  @IsString()
  fileName!: string;

  @ApiProperty({
    type: String,
    description: "MIME 类型",
    example: "application/zip",
  })
  @IsString()
  mimeType!: string;

  @ApiProperty({ type: Number, description: "文件大小（字节）" })
  @IsNumber()
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

  @ApiProperty({
    type: Boolean,
    description: "制品是否已签名（未签名制品需人工确认风险）",
  })
  signed!: boolean;

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
  @IsString()
  signature!: string;
}

/** 应用资产。 */
export class AssetDto {
  @ApiProperty({ type: String, description: "资产 ID" })
  assetId!: string;

  @ApiProperty({ type: String, description: "资产类型" })
  assetType!: "icon" | "screenshot" | "cover" | "attachment" | "qr";

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
  @IsIn(["icon", "screenshot", "cover", "attachment", "qr"])
  assetType!: "icon" | "screenshot" | "cover" | "attachment" | "qr";

  @ApiProperty({ type: String, description: "资产名称" })
  @IsString()
  name!: string;

  @ApiProperty({ type: String, description: "存储键（已上传至存储的对象键）" })
  @IsString()
  storageKey!: string;

  @ApiProperty({ type: String, description: "MIME 类型" })
  @IsString()
  mimeType!: string;

  @ApiProperty({ type: Number, description: "大小（字节）" })
  @IsNumber()
  sizeBytes!: number;

  @ApiProperty({ type: String, nullable: true, description: "SHA-256" })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  sha256?: string | null;

  @ApiPropertyOptional({ type: Number, description: "排序" })
  @IsOptional()
  @IsNumber()
  sortOrder?: number;
}

/** 关联资产到交付渠道请求。 */
export class LinkDeliveryAssetRequestDto {
  @ApiProperty({
    type: String,
    description: "资产 ID（须属于该应用）",
  })
  @IsString()
  assetId!: string;

  @ApiPropertyOptional({
    type: Number,
    description: "排序（值越小越靠前）",
  })
  @IsOptional()
  @IsNumber()
  sortOrder?: number;

  @ApiPropertyOptional({
    type: String,
    description: "关联版本号（如 1.0.0），缺省关联到最新发布版本",
  })
  @IsOptional()
  @IsString()
  version?: string;
}

/** 关联资产到交付渠道结果。 */
export class LinkDeliveryAssetResponseDto {
  @ApiProperty({ type: Boolean, description: "是否已关联", example: true })
  linked!: boolean;
}

/** AI 风险声明（6 项）。 */
export class AiRiskDeclarationDto {
  @ApiProperty({
    type: Boolean,
    description: "是否处理员工个人信息/企业敏感数据",
  })
  @IsBoolean()
  handlesSensitiveData!: boolean;

  @ApiProperty({
    type: Boolean,
    description: "是否发送至企业外部/第三方模型供应商",
  })
  @IsBoolean()
  sendsDataExternally!: boolean;

  @ApiProperty({ type: Boolean, description: "是否保存输入/文件/对话" })
  @IsBoolean()
  retainsConversations!: boolean;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: "保留周期",
  })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  retentionPeriod?: string | null;

  @ApiProperty({
    type: [String],
    description: "模型 / AI 提供方",
    example: ["deepseek"],
  })
  @IsArray()
  @IsString({ each: true })
  modelProviders!: string[];

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: "提供方补充说明",
  })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  providerNote?: string | null;

  @ApiProperty({
    type: Boolean,
    description: "是否影响人事/财务/法务等高风险决策",
  })
  @IsBoolean()
  affectsHighRiskDecisions!: boolean;

  @ApiProperty({ type: String, description: "用户输入限制与免责声明" })
  @IsString()
  inputRestrictionDisclaimer!: string;
}

/** 保存应用草稿请求（整表单一份 draft）。 */
export class SaveApplicationDraftRequestDto {
  @ApiProperty({
    type: String,
    description: "应用名称",
    example: "智能考勤助手",
  })
  @IsString()
  name!: string;

  @ApiProperty({ type: String, description: "归属部门 ID" })
  @IsString()
  departmentId!: string;

  @ApiProperty({ type: [String], description: "维护人工号列表" })
  @IsArray()
  @IsString({ each: true })
  maintainerEmployeeIds!: string[];

  @ApiProperty({ type: String, description: "分类 ID" })
  @IsString()
  categoryId!: string;

  @ApiProperty({
    type: String,
    description: "应用类型",
    enum: ["web_app", "desktop_app", "mobile_app", "mini_program"],
  })
  @IsIn(["web_app", "desktop_app", "mobile_app", "mini_program"])
  applicationType!: string;

  @ApiProperty({ type: [String], description: "标签 ID 列表" })
  @IsArray()
  @IsString({ each: true })
  tagIds!: string[];

  @ApiPropertyOptional({
    type: String,
    description:
      "自定义分类名称（未匹配现有分类时；提交后进入待审，审核通过生效）",
  })
  @IsOptional()
  @IsString()
  customCategoryName?: string;

  @ApiPropertyOptional({
    type: [String],
    description:
      "自定义标签名称列表（未匹配现有标签的部分；提交后进入待审，审核通过生效）",
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  customTagNames?: string[];

  @ApiProperty({
    type: "object",
    description:
      "应用图标（mode: auto|upload；auto 需 backgroundColor+text，upload 需 assetId）",
  })
  @IsObject()
  icon!: object;

  @ApiProperty({ type: [String], description: "截图资产 ID（1–6）" })
  @IsArray()
  @IsString({ each: true })
  screenshotAssetIds!: string[];

  @ApiProperty({ type: String, description: "简介富文本（已受限白名单）" })
  @IsString()
  summaryHtml!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: "操作手册富文本",
  })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  manualHtml?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: "操作手册附件资产 ID",
  })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  manualAssetId?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: "使用示例富文本",
  })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  examplesHtml?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: "使用示例附件资产 ID",
  })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  examplesAssetId?: string | null;

  @ApiProperty({ type: "array", description: "常见问题列表（选填）" })
  @IsArray()
  faq!: object[];

  @ApiProperty({ type: "array", description: "受众规则列表" })
  @IsArray()
  audience!: object[];

  @ApiProperty({ type: () => AiRiskDeclarationDto, description: "AI 风险声明" })
  @ValidateNested()
  @Type(() => AiRiskDeclarationDto)
  risk!: AiRiskDeclarationDto;

  @ApiProperty({ type: "array", description: "交付配置列表" })
  @IsArray()
  deliveries!: object[];

  @ApiProperty({ type: String, description: "版本号", example: "1.0.0" })
  @IsString()
  version!: string;

  @ApiProperty({ type: String, description: "变更说明", example: "首次发布" })
  @IsString()
  changelog!: string;
}

/** 应用草稿回显。 */
export class ApplicationDraftRecordDto {
  @ApiProperty({ type: String, description: "应用 ID" })
  applicationId!: string;

  @ApiProperty({ type: String, description: "应用状态" })
  status!: string;

  @ApiProperty({ type: String, description: "责任人员工工号" })
  ownerEmployeeId!: string;

  @ApiProperty({
    type: () => SaveApplicationDraftRequestDto,
    description: "草稿内容",
  })
  draft!: SaveApplicationDraftRequestDto;

  @ApiProperty({ type: String, description: "最后更新时间（ISO 8601）" })
  updatedAt!: string;
}

/** 统一上传会话初始化请求。 */
export class UnifiedUploadInitRequestDto {
  @ApiProperty({
    type: String,
    description: "上传类型",
    enum: ["icon", "screenshot", "cover", "attachment", "qr", "artifact"],
  })
  @IsIn(["icon", "screenshot", "cover", "attachment", "qr", "artifact"])
  kind!: string;

  @ApiProperty({ type: String, description: "文件名", example: "icon.png" })
  @IsString()
  fileName!: string;

  @ApiProperty({ type: String, description: "MIME 类型", example: "image/png" })
  @IsString()
  mimeType!: string;

  @ApiProperty({ type: Number, description: "文件大小（字节）" })
  @IsNumber()
  sizeBytes!: number;
}

/** 统一上传会话。 */
export class UnifiedUploadDto {
  @ApiProperty({ type: String, description: "上传会话 ID" })
  uploadId!: string;

  @ApiProperty({ type: String, description: "上传类型" })
  kind!: string;

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
    enum: ["uploading", "completed", "failed"],
  })
  uploadStatus!: string;

  @ApiProperty({
    type: String,
    description: "扫描状态",
    enum: ["pending", "passed", "failed"],
  })
  scanStatus!: string;

  @ApiProperty({ type: String, nullable: true, description: "SHA-256" })
  sha256!: string | null;

  @ApiProperty({ type: String, nullable: true, description: "错误码" })
  errorCode!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: "关联资产 ID（complete 后返回）",
  })
  assetId!: string | null;
}

export class ValidationCheckDto {
  @ApiProperty({ type: String, description: "校验记录 ID" })
  validationCheckId!: string;

  @ApiProperty({ type: String, description: "应用版本 ID" })
  applicationVersionId!: string;

  @ApiProperty({ type: String, description: "校验点代码" })
  checkCode!: string;

  @ApiProperty({ type: String, description: "校验点名称" })
  label!: string;

  @ApiProperty({
    type: String,
    description: "校验状态",
    enum: ["passed", "safe", "warning", "info", "failed"],
  })
  status!: "passed" | "safe" | "warning" | "info" | "failed";

  @ApiProperty({ type: String, nullable: true, description: "校验详情" })
  detail!: string | null;

  @ApiProperty({ type: String, description: "记录时间（ISO）" })
  createdAt!: string;
}

const APPLICATION_STATUSES = [
  "draft",
  "in_review",
  "approved",
  "published",
  "withdrawn",
  "archived",
] as const;

const APPLICATION_MODES = ["all", "review", "owned"] as const;

const DELIVERY_CHANNELS = ["web", "desktop", "mobile", "mini_program"] as const;

/** 应用管理列表查询参数。 */
export class ListApplicationsAdminQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ type: String, description: "关键词搜索" })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  keyword?: string;

  @ApiPropertyOptional({
    type: String,
    description: "列表模式",
    enum: APPLICATION_MODES,
  })
  @IsOptional()
  @IsIn(APPLICATION_MODES)
  mode?: (typeof APPLICATION_MODES)[number];

  @ApiPropertyOptional({
    type: String,
    description: "应用状态",
    enum: APPLICATION_STATUSES,
  })
  @IsOptional()
  @IsIn(APPLICATION_STATUSES)
  status?: (typeof APPLICATION_STATUSES)[number];

  @ApiPropertyOptional({ type: String, description: "所属部门 ID" })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  departmentId?: string;

  @ApiPropertyOptional({ type: String, description: "应用类型" })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  applicationType?: string;

  @ApiPropertyOptional({
    type: String,
    description: "交付渠道",
    enum: DELIVERY_CHANNELS,
  })
  @IsOptional()
  @IsIn(DELIVERY_CHANNELS)
  channel?: (typeof DELIVERY_CHANNELS)[number];

  @ApiPropertyOptional({
    type: String,
    description: "排序方式",
    enum: ["recent", "name", "status"],
  })
  @IsOptional()
  @IsIn(["recent", "name", "status"])
  sort?: "recent" | "name" | "status";
}

/** 完成上传请求体（统一上传通道）。 */
export class CompleteUnifiedUploadBodyDto {
  @ApiPropertyOptional({
    type: String,
    description: "内容签名，缺省为空字符串",
  })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  signature?: string;
}
