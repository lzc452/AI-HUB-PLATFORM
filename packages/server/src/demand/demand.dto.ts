import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsArray,
  IsBoolean,
  IsIn,
  ValidateIf,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";
import { PaginationQueryDto } from "../system/http/pagination.dto.js";

const DEMAND_STATUS = [
  "draft",
  "pending_review",
  "rejected",
  "pending_claim",
  "claimed",
  "validating",
  "pilot",
  "converted",
  "closed",
  "merged",
] as const;

const AUDIENCE_TYPE = ["all", "department", "employee"] as const;

const COLLABORATOR_ROLE = ["owner", "collaborator", "operator"] as const;

const APPLICATION_ROLE = ["candidate", "pilot", "solution"] as const;

const REPORT_STATUS = ["open", "dismissed", "hidden", "restored"] as const;

const PILOT_STATUS = ["planned", "running", "completed", "cancelled"] as const;

const PRIORITY_LEVEL = ["high", "medium", "low"] as const;

const CLAIM_PROPOSAL_STATUS = [
  "proposed",
  "selected",
  "rejected",
  "withdrawn",
] as const;

/** 创建需求草稿请求。 */
export class DemandDraftRequestDto {
  @ApiProperty({
    type: String,
    description: "需求标题",
    example: "统一研发效能数据看板",
  })
  @IsString()
  title!: string;

  @ApiProperty({
    type: String,
    description: "问题陈述",
    example: "当前研发数据分散在多个系统，缺少统一视图。",
  })
  @IsString()
  problemStatement!: string;

  @ApiProperty({
    type: String,
    description: "业务场景与当前流程",
    example: "研发团队每周人工汇总多个系统的效能数据，形成周报。",
  })
  @IsString()
  businessScenario!: string;

  @ApiProperty({
    type: String,
    description: "影响对象、发生频率与耗时",
    example: "研发经理，每周一次，每次约 3 小时。",
  })
  @IsString()
  impact!: string;

  @ApiProperty({
    type: String,
    description: "期望结果",
    example: "一个可配置的研发效能看板",
  })
  @IsString()
  desiredOutcome!: string;

  @ApiProperty({
    type: String,
    description: "当前替代方案",
    example: "手工拼装 Excel，或用多个工具分别查看。",
  })
  @IsString()
  currentWorkaround!: string;

  @ApiProperty({
    type: String,
    description: "数据类型与敏感程度",
    example: "研发过程数据，涉及少量员工绩效，中等敏感。",
  })
  @IsString()
  dataSensitivity!: string;

  @ApiPropertyOptional({
    type: String,
    description: "AI 方案设想",
    example: "用大模型自动汇总并生成自然语言周报。",
  })
  @IsOptional()
  @IsString()
  aiSolutionIdea?: string;

  @ApiPropertyOptional({
    type: [String],
    description: "附件 ID 列表",
    example: ["attachment-1"],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachmentIds?: string[];

  @ApiProperty({ type: String, description: "受众类型", enum: AUDIENCE_TYPE })
  @IsIn(AUDIENCE_TYPE)
  audienceType!: (typeof AUDIENCE_TYPE)[number];

  @ApiPropertyOptional({
    type: String,
    description: "受众部门 ID",
    example: "demo-rnd",
  })
  @IsOptional()
  @IsString()
  departmentId?: string;

  @ApiPropertyOptional({
    type: String,
    description: "受众员工工号",
    example: "DEMO-EMPLOYEE",
  })
  @IsOptional()
  @IsString()
  employeeId?: string;

  @ApiPropertyOptional({
    type: Boolean,
    description: "是否包含子部门",
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  includeChildren?: boolean;

  @ApiPropertyOptional({
    type: Boolean,
    description: "是否匿名展示",
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  displayAnonymously?: boolean;
}

/** 保存需求草稿请求。 */
export class SaveDemandDraftRequestDto extends DemandDraftRequestDto {
  @ApiProperty({
    type: Number,
    description: "期望版本号（乐观锁）",
    example: 1,
  })
  @IsNumber()
  expectedVersion!: number;
}

/** 需求评审请求。 */
export class DemandReviewRequestDto {
  @ApiProperty({
    type: String,
    description: "评审结论",
    enum: ["publish", "reject"],
  })
  @IsIn(["publish", "reject"])
  decision!: "publish" | "reject";

  @ApiPropertyOptional({
    type: String,
    description: "评审原因",
    example: "内容完整，准予发布。",
  })
  @IsOptional()
  @IsString()
  reason?: string;
}

/** 认领需求请求。 */
export class DemandClaimRequestDto {
  @ApiProperty({
    type: Number,
    description: "期望版本号（乐观锁）",
    example: 1,
  })
  @IsNumber()
  expectedVersion!: number;
}

/** 添加协作成员请求。 */
export class DemandCollaboratorRequestDto {
  @ApiProperty({
    type: String,
    description: "员工工号",
    example: "DEMO-EMPLOYEE",
  })
  @IsString()
  employeeId!: string;

  @ApiProperty({
    type: String,
    description: "协作角色",
    enum: COLLABORATOR_ROLE,
  })
  @IsIn(COLLABORATOR_ROLE)
  role!: (typeof COLLABORATOR_ROLE)[number];

  @ApiProperty({
    type: Number,
    description: "期望版本号（乐观锁）",
    example: 1,
  })
  @IsNumber()
  expectedVersion!: number;
}

/** 调整协作成员角色请求。 */
export class DemandCollaboratorRoleUpdateRequestDto {
  @ApiProperty({
    type: String,
    description: "协作角色",
    enum: COLLABORATOR_ROLE,
  })
  @IsIn(COLLABORATOR_ROLE)
  role!: (typeof COLLABORATOR_ROLE)[number];

  @ApiProperty({
    type: Number,
    description: "期望版本号（乐观锁）",
    example: 1,
  })
  @IsNumber()
  expectedVersion!: number;
}

/** 设置需求优先级请求。 */
export class DemandPriorityRequestDto {
  @ApiProperty({
    type: Number,
    description: "期望版本号（乐观锁）",
    example: 1,
  })
  @IsNumber()
  expectedVersion!: number;

  @ApiProperty({ type: Number, description: "业务价值（1-5）", example: 5 })
  @IsNumber()
  businessValue!: number;

  @ApiProperty({ type: Number, description: "影响人数（1-5）", example: 4 })
  @IsNumber()
  impactedHeadcount!: number;

  @ApiProperty({ type: Number, description: "使用频率（1-5）", example: 3 })
  @IsNumber()
  usageFrequency!: number;

  @ApiProperty({ type: Number, description: "战略匹配度（1-5）", example: 4 })
  @IsNumber()
  strategicFit!: number;

  @ApiProperty({ type: Number, description: "技术可行性（1-5）", example: 4 })
  @IsNumber()
  technicalFeasibility!: number;

  @ApiProperty({
    type: Number,
    description: "数据与合规风险（1-5，反向）",
    example: 2,
  })
  @IsNumber()
  dataComplianceRisk!: number;

  @ApiProperty({
    type: Number,
    description: "预计实施成本（1-5，反向）",
    example: 3,
  })
  @IsNumber()
  implementationCost!: number;
}

/** 确认需求优先级（高/中/低）请求。 */
export class DemandPriorityConfirmRequestDto {
  @ApiProperty({
    type: Number,
    description: "期望版本号（乐观锁）",
    example: 1,
  })
  @IsNumber()
  expectedVersion!: number;

  @ApiProperty({
    type: String,
    description: "确认后的优先级",
    enum: PRIORITY_LEVEL,
  })
  @IsIn(PRIORITY_LEVEL)
  confirmedPriority!: (typeof PRIORITY_LEVEL)[number];

  @ApiPropertyOptional({
    type: String,
    description: "调整原因",
    example: "与年度战略高度一致，上调为高优先级。",
  })
  @IsOptional()
  @IsString()
  adjustmentReason?: string;
}

/** 推进需求状态请求。 */
export class DemandStatusRequestDto {
  @ApiProperty({
    type: Number,
    description: "期望版本号（乐观锁）",
    example: 1,
  })
  @IsNumber()
  expectedVersion!: number;

  @ApiProperty({ type: String, description: "下一状态", enum: DEMAND_STATUS })
  @IsIn(DEMAND_STATUS)
  nextStatus!: (typeof DEMAND_STATUS)[number];

  @ApiPropertyOptional({
    type: String,
    description: "变更原因",
    example: "已完成认领",
  })
  @IsOptional()
  @IsString()
  reason?: string;
}

/** 新增进度更新请求。 */
export class DemandProgressRequestDto {
  @ApiProperty({
    type: String,
    description: "进度标题",
    example: "完成需求评审",
  })
  @IsString()
  title!: string;

  @ApiProperty({
    type: String,
    description: "进度详情",
    example: "已通过内部评审，准备发布。",
  })
  @IsString()
  body!: string;
}

/** 创建试点请求。 */
export class DemandPilotRequestDto {
  @ApiPropertyOptional({ type: String, description: "试点应用 ID" })
  @IsOptional()
  @IsString()
  applicationId?: string;

  @ApiProperty({
    type: String,
    description: "试点名称",
    example: "研发中心试点",
  })
  @IsString()
  name!: string;

  @ApiProperty({
    description: "开始时间（ISO 8601）",
    type: String,
    format: "date-time",
  })
  @IsString()
  startsAt!: string;

  @ApiPropertyOptional({
    description: "结束时间（ISO 8601）",
    type: String,
    format: "date-time",
  })
  @IsOptional()
  @IsString()
  endsAt?: string;
}

/** 更新试点请求。 */
export class DemandPilotUpdateRequestDto {
  @ApiPropertyOptional({
    description: "结束时间（ISO 8601），null 表示清除",
    type: String,
    format: "date-time",
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  endsAt?: string | null;

  @ApiPropertyOptional({
    type: String,
    description: "试点结论",
    nullable: true,
    example: "试点效果良好",
  })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  outcome?: string | null;

  @ApiPropertyOptional({ description: "试点状态", enum: PILOT_STATUS })
  @IsOptional()
  @IsIn(PILOT_STATUS)
  status?: (typeof PILOT_STATUS)[number];
}

/** 合并需求请求。 */
export class DemandMergeRequestDto {
  @ApiProperty({ type: String, description: "目标需求 ID（合并方向）" })
  @IsString()
  targetDemandId!: string;

  @ApiProperty({ type: Number, description: "源需求期望版本号", example: 1 })
  @IsNumber()
  sourceExpectedVersion!: number;

  @ApiProperty({ type: Number, description: "目标需求期望版本号", example: 1 })
  @IsNumber()
  targetExpectedVersion!: number;
}

/** 关联应用到需求请求。 */
export class DemandLinkApplicationRequestDto {
  @ApiProperty({ type: String, description: "应用 ID" })
  @IsString()
  applicationId!: string;

  @ApiProperty({
    type: String,
    description: "关联角色",
    enum: APPLICATION_ROLE,
  })
  @IsIn(APPLICATION_ROLE)
  role!: (typeof APPLICATION_ROLE)[number];

  @ApiPropertyOptional({
    type: Boolean,
    description: "是否主解决方案",
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @ApiProperty({
    type: Number,
    description: "期望版本号（乐观锁）",
    example: 1,
  })
  @IsNumber()
  expectedVersion!: number;
}

/** 从需求创建应用请求。 */
export class DemandCreateApplicationRequestDto {
  @ApiProperty({
    type: String,
    description: "应用名称",
    example: "研发效能看板",
  })
  @IsString()
  name!: string;

  @ApiProperty({
    type: String,
    description: "应用简介",
    example: "面向研发团队的效能数据看板",
  })
  @IsString()
  summary!: string;

  @ApiPropertyOptional({
    type: String,
    description: "维护人员工工号",
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

  @ApiProperty({
    type: String,
    description: "关联角色",
    enum: APPLICATION_ROLE,
  })
  @IsIn(APPLICATION_ROLE)
  role!: (typeof APPLICATION_ROLE)[number];

  @ApiPropertyOptional({
    type: Boolean,
    description: "是否主解决方案",
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @ApiProperty({
    type: Number,
    description: "期望版本号（乐观锁）",
    example: 1,
  })
  @IsNumber()
  expectedVersion!: number;
}

/** 需求评论请求。 */
export class DemandCommentRequestDto {
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
    example: "这个需求很重要，建议优先排期。",
  })
  @IsString()
  body!: string;

  @ApiPropertyOptional({
    type: Boolean,
    description: "是否匿名展示",
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  displayAnonymously?: boolean;
}

/** 举报需求请求。 */
export class DemandReportRequestDto {
  @ApiProperty({
    type: String,
    description: "被举报评论 ID，举报需求本身为 null",
    nullable: true,
  })
  @IsString()
  @ValidateIf((_o, v) => v !== null)
  commentId!: string | null;

  @ApiProperty({
    type: String,
    description: "举报原因",
    example: "内容涉嫌违规",
  })
  @IsString()
  reason!: string;
}

/** 处理需求举报请求。 */
export class DemandReportResolveRequestDto {
  @ApiProperty({ type: String, description: "处理结果", enum: REPORT_STATUS })
  @IsIn(REPORT_STATUS)
  status!: (typeof REPORT_STATUS)[number];
}

/** 需求条目。 */
export class DemandEntryDto {
  @ApiProperty({ type: String, description: "需求 ID" })
  demandId!: string;

  @ApiPropertyOptional({
    type: String,
    description: "需求发起员工工号",
    nullable: true,
    example: "DEMO-EMPLOYEE",
  })
  requesterEmployeeId?: string | null;

  @ApiPropertyOptional({
    type: String,
    description: "发起人主部门 ID",
    nullable: true,
  })
  requesterDepartmentId?: string | null;

  @ApiPropertyOptional({
    type: String,
    description: "发起人展示名称",
    nullable: true,
  })
  requesterDisplayName?: string | null;

  @ApiProperty({
    type: String,
    description: "需求标题",
    example: "统一研发效能数据看板",
  })
  title!: string;

  @ApiProperty({
    type: String,
    description: "问题陈述",
    example: "当前研发数据分散在多个系统，缺少统一视图。",
  })
  problemStatement!: string;

  @ApiPropertyOptional({
    type: String,
    description: "业务场景与当前流程",
    nullable: true,
  })
  businessScenario?: string | null;

  @ApiPropertyOptional({
    type: String,
    description: "影响对象、发生频率与耗时",
    nullable: true,
  })
  impact?: string | null;

  @ApiProperty({
    type: String,
    description: "期望结果",
    example: "一个可配置的研发效能看板",
  })
  desiredOutcome!: string;

  @ApiPropertyOptional({
    type: String,
    description: "当前替代方案",
    nullable: true,
  })
  currentWorkaround?: string | null;

  @ApiPropertyOptional({
    type: String,
    description: "数据类型与敏感程度",
    nullable: true,
  })
  dataSensitivity?: string | null;

  @ApiPropertyOptional({
    type: String,
    description: "AI 方案设想",
    nullable: true,
  })
  aiSolutionIdea?: string | null;

  @ApiProperty({ type: String, description: "需求状态", enum: DEMAND_STATUS })
  status!: (typeof DEMAND_STATUS)[number];

  @ApiProperty({ type: String, description: "受众类型", enum: AUDIENCE_TYPE })
  audienceType!: (typeof AUDIENCE_TYPE)[number];

  @ApiPropertyOptional({
    type: String,
    description: "受众部门 ID",
    nullable: true,
    example: "demo-rnd",
  })
  audienceDepartmentId?: string | null;

  @ApiPropertyOptional({
    type: String,
    description: "受众员工工号",
    nullable: true,
  })
  audienceEmployeeId?: string | null;

  @ApiPropertyOptional({
    type: Boolean,
    description: "是否包含子部门",
    example: false,
  })
  includeChildren?: boolean;

  @ApiProperty({ type: Boolean, description: "是否匿名展示", example: false })
  displayAnonymously!: boolean;

  @ApiPropertyOptional({
    type: String,
    description: "评审原因",
    nullable: true,
  })
  reviewReason?: string | null;

  @ApiProperty({ type: Number, description: "点赞数", example: 2 })
  likeCount!: number;

  @ApiProperty({ type: Number, description: "评论数", example: 3 })
  commentCount!: number;

  @ApiProperty({ type: Boolean, description: "当前用户是否已点赞" })
  likedByCurrentActor!: boolean;

  @ApiPropertyOptional({
    description: "业务价值（1-5）",
    type: Number,
    nullable: true,
  })
  businessValue?: number | null;

  @ApiPropertyOptional({
    description: "影响人数（1-5）",
    type: Number,
    nullable: true,
  })
  impactedHeadcount?: number | null;

  @ApiPropertyOptional({
    description: "使用频率（1-5）",
    type: Number,
    nullable: true,
  })
  usageFrequency?: number | null;

  @ApiPropertyOptional({
    description: "战略匹配度（1-5）",
    type: Number,
    nullable: true,
  })
  strategicFit?: number | null;

  @ApiPropertyOptional({
    description: "技术可行性（1-5）",
    type: Number,
    nullable: true,
  })
  technicalFeasibility?: number | null;

  @ApiPropertyOptional({
    description: "数据与合规风险（1-5，反向）",
    type: Number,
    nullable: true,
  })
  dataComplianceRisk?: number | null;

  @ApiPropertyOptional({
    description: "预计实施成本（1-5，反向）",
    type: Number,
    nullable: true,
  })
  implementationCost?: number | null;

  @ApiPropertyOptional({
    description: "优先级得分",
    type: Number,
    nullable: true,
  })
  priorityScore?: number | null;

  @ApiPropertyOptional({
    type: String,
    description: "优先级说明",
    nullable: true,
  })
  priorityExplanation?: string | null;

  @ApiPropertyOptional({
    description: "确认后的优先级（高/中/低）",
    enum: PRIORITY_LEVEL,
    nullable: true,
  })
  confirmedPriority?: (typeof PRIORITY_LEVEL)[number] | null;

  @ApiPropertyOptional({
    type: String,
    description: "优先级调整原因",
    nullable: true,
  })
  priorityAdjustmentReason?: string | null;

  @ApiPropertyOptional({
    type: String,
    description: "认领员工工号",
    nullable: true,
    example: "DEMO-INNOVATION",
  })
  ownerEmployeeId?: string | null;

  @ApiPropertyOptional({
    type: String,
    description: "负责人展示名称",
    nullable: true,
  })
  ownerDisplayName?: string | null;

  @ApiPropertyOptional({
    type: String,
    description: "主解决方案应用 ID",
    nullable: true,
  })
  primarySolutionApplicationId?: string | null;

  @ApiProperty({ type: Number, description: "版本号（乐观锁）", example: 1 })
  version!: number;

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

/** 需求列表结果。 */
export class DemandListResultDto {
  @ApiProperty({
    description: "条目列表",
    type: () => DemandEntryDto,
    isArray: true,
  })
  items!: DemandEntryDto[];

  @ApiProperty({ type: Number, description: "符合条件的总数", example: 4 })
  total!: number;

  @ApiProperty({ type: Number, description: "当前页码", example: 1 })
  page!: number;

  @ApiProperty({ type: Number, description: "每页数量", example: 20 })
  pageSize!: number;
}

/** 协作成员记录。 */
export class DemandCollaboratorDto {
  @ApiProperty({ type: String, description: "需求 ID" })
  demandId!: string;

  @ApiProperty({
    type: String,
    description: "员工工号",
    example: "DEMO-EMPLOYEE",
  })
  employeeId!: string;

  @ApiProperty({
    type: String,
    description: "协作角色",
    enum: COLLABORATOR_ROLE,
  })
  role!: (typeof COLLABORATOR_ROLE)[number];

  @ApiProperty({
    description: "创建时间（ISO 8601）",
    type: String,
    format: "date-time",
  })
  createdAt!: string;
}

/** 进度更新记录。 */
export class DemandProgressDto {
  @ApiProperty({ type: String, description: "进度 ID" })
  progressId!: string;

  @ApiProperty({ type: String, description: "需求 ID" })
  demandId!: string;

  @ApiProperty({
    type: String,
    description: "作者员工工号",
    example: "DEMO-INNOVATION",
  })
  authorEmployeeId!: string;

  @ApiProperty({
    type: String,
    description: "进度对应状态",
    enum: DEMAND_STATUS,
  })
  status!: (typeof DEMAND_STATUS)[number];

  @ApiProperty({
    type: String,
    description: "进度标题",
    example: "完成需求评审",
  })
  title!: string;

  @ApiProperty({
    type: String,
    description: "进度详情",
    example: "已通过内部评审，准备发布。",
  })
  body!: string;

  @ApiProperty({
    description: "创建时间（ISO 8601）",
    type: String,
    format: "date-time",
  })
  createdAt!: string;
}

/** 试点记录。 */
export class DemandPilotDto {
  @ApiProperty({ type: String, description: "试点 ID" })
  pilotId!: string;

  @ApiProperty({ type: String, description: "需求 ID" })
  demandId!: string;

  @ApiPropertyOptional({
    type: String,
    description: "试点应用 ID",
    nullable: true,
  })
  applicationId?: string | null;

  @ApiProperty({
    type: String,
    description: "试点名称",
    example: "研发中心试点",
  })
  name!: string;

  @ApiProperty({
    description: "开始时间（ISO 8601）",
    type: String,
    format: "date-time",
  })
  startsAt!: string;

  @ApiPropertyOptional({
    description: "结束时间（ISO 8601）",
    type: String,
    format: "date-time",
    nullable: true,
  })
  endsAt?: string | null;

  @ApiPropertyOptional({
    type: String,
    description: "试点结论",
    nullable: true,
  })
  outcome?: string | null;

  @ApiProperty({ type: String, description: "试点状态", enum: PILOT_STATUS })
  status!: (typeof PILOT_STATUS)[number];

  @ApiProperty({
    type: String,
    description: "创建员工工号",
    example: "DEMO-INNOVATION",
  })
  createdByEmployeeId!: string;

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

/** 需求-应用关联记录。 */
export class DemandApplicationLinkDto {
  @ApiProperty({ type: String, description: "需求 ID" })
  demandId!: string;

  @ApiProperty({ type: String, description: "应用 ID" })
  applicationId!: string;

  @ApiProperty({
    type: String,
    description: "关联角色",
    enum: APPLICATION_ROLE,
  })
  role!: (typeof APPLICATION_ROLE)[number];

  @ApiProperty({ type: Boolean, description: "是否主解决方案", example: false })
  isPrimary!: boolean;

  @ApiProperty({
    type: String,
    description: "关联创建员工工号",
    example: "DEMO-INNOVATION",
  })
  linkedByEmployeeId!: string;

  @ApiProperty({
    description: "创建时间（ISO 8601）",
    type: String,
    format: "date-time",
  })
  createdAt!: string;
}

/** 需求评论记录。 */
export class DemandCommentDto {
  @ApiProperty({ type: String, description: "评论 ID" })
  commentId!: string;

  @ApiProperty({ type: String, description: "需求 ID" })
  demandId!: string;

  @ApiPropertyOptional({
    type: String,
    description: "父评论 ID，根评论为 null",
    nullable: true,
  })
  parentCommentId?: string | null;

  @ApiPropertyOptional({
    type: String,
    description: "作者员工工号",
    example: "DEMO-EMPLOYEE",
    nullable: true,
  })
  authorEmployeeId?: string | null;

  @ApiPropertyOptional({
    type: String,
    description: "作者展示名称",
    nullable: true,
  })
  authorDisplayName?: string | null;

  @ApiPropertyOptional({
    type: String,
    description: "作者主部门 ID",
    nullable: true,
  })
  authorDepartmentId?: string | null;

  @ApiProperty({
    type: String,
    description: "评论内容",
    example: "这个需求很重要，建议优先排期。",
  })
  body!: string;

  @ApiProperty({ type: Boolean, description: "是否匿名展示", example: false })
  displayAnonymously!: boolean;

  @ApiProperty({ type: Number, description: "评论点赞数", example: 3 })
  likeCount!: number;

  @ApiProperty({ type: Boolean, description: "当前用户是否已点赞" })
  likedByCurrentActor!: boolean;

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

/** 需求举报记录。 */
export class DemandReportDto {
  @ApiProperty({ type: String, description: "举报 ID" })
  reportId!: string;

  @ApiProperty({ type: String, description: "需求 ID" })
  demandId!: string;

  @ApiPropertyOptional({
    type: String,
    description: "被举报评论 ID",
    nullable: true,
  })
  commentId?: string | null;

  @ApiProperty({
    type: String,
    description: "举报人员工工号",
    example: "DEMO-EMPLOYEE",
  })
  reporterEmployeeId!: string;

  @ApiProperty({
    type: String,
    description: "举报原因",
    example: "内容涉嫌违规",
  })
  reason!: string;

  @ApiProperty({ type: String, description: "处理状态", enum: REPORT_STATUS })
  status!: (typeof REPORT_STATUS)[number];

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

/** 合并需求结果。 */
export class DemandMergeResultDto {
  @ApiProperty({ description: "源需求", type: () => DemandEntryDto })
  source!: DemandEntryDto;

  @ApiProperty({ description: "目标需求", type: () => DemandEntryDto })
  target!: DemandEntryDto;
}

/** 提交认领方案请求。 */
export class DemandClaimProposalRequestDto {
  @ApiProperty({
    type: String,
    description: "拟定负责人员工工号",
    example: "DEMO-INNOVATION",
  })
  @IsString()
  ownerEmployeeId!: string;

  @ApiProperty({
    type: [String],
    description: "拟定协作者员工工号列表",
    example: ["DEMO-EMPLOYEE"],
  })
  @IsArray()
  @IsString({ each: true })
  collaboratorEmployeeIds!: string[];

  @ApiProperty({
    type: String,
    description: "初步思路",
    example: "先基于现有数据中台做原型，验证自动汇总可行性。",
  })
  @IsString()
  approach!: string;

  @ApiProperty({
    type: String,
    description: "预计验证时间",
    example: "4 周",
  })
  @IsString()
  estimatedValidationDuration!: string;

  @ApiProperty({
    type: String,
    description: "资源需求",
    example: "2 名后端 + 1 名前端，0.5 个数据接口资源。",
  })
  @IsString()
  resourceNeeds!: string;

  @ApiPropertyOptional({
    type: String,
    description: "提交人偏好说明",
    example: "希望优先验证自动汇总这一最小闭环。",
  })
  @IsOptional()
  @IsString()
  preference?: string;
}

/** 认领方案记录。 */
export class DemandClaimProposalDto {
  @ApiProperty({ type: String, description: "方案 ID" })
  proposalId!: string;

  @ApiProperty({ type: String, description: "需求 ID" })
  demandId!: string;

  @ApiProperty({
    type: String,
    description: "方案提交人",
    example: "DEMO-EMPLOYEE",
  })
  proposerEmployeeId!: string;

  @ApiProperty({
    type: String,
    description: "拟定负责人",
    example: "DEMO-INNOVATION",
  })
  ownerEmployeeId!: string;

  @ApiProperty({ type: [String], description: "拟定协作者" })
  collaboratorEmployeeIds!: string[];

  @ApiProperty({ type: String, description: "初步思路" })
  approach!: string;

  @ApiProperty({ type: String, description: "预计验证时间" })
  estimatedValidationDuration!: string;

  @ApiProperty({ type: String, description: "资源需求" })
  resourceNeeds!: string;

  @ApiPropertyOptional({
    type: String,
    description: "提交人偏好说明",
    nullable: true,
  })
  preference?: string | null;

  @ApiProperty({
    type: String,
    description: "方案状态",
    enum: CLAIM_PROPOSAL_STATUS,
  })
  status!: (typeof CLAIM_PROPOSAL_STATUS)[number];

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

/** 确认认领方案请求。 */
export class DemandClaimConfirmRequestDto {
  @ApiProperty({
    type: Number,
    description: "期望版本号（乐观锁）",
    example: 1,
  })
  @IsNumber()
  expectedVersion!: number;
}

/** 解除认领请求。 */
export class DemandReleaseRequestDto {
  @ApiProperty({
    type: Number,
    description: "期望版本号（乐观锁）",
    example: 1,
  })
  @IsNumber()
  expectedVersion!: number;

  @ApiPropertyOptional({
    type: String,
    description: "解除原因",
    example: "长期无进展，重新开放认领。",
  })
  @IsOptional()
  @IsString()
  reason?: string;
}

/** 需求附件记录。 */
export class DemandAttachmentDto {
  @ApiProperty({ type: String, description: "附件 ID" })
  attachmentId!: string;

  @ApiPropertyOptional({
    type: String,
    description: "所属需求 ID，未提交前为 null",
    nullable: true,
  })
  demandId?: string | null;

  @ApiProperty({ type: String, description: "文件名" })
  fileName!: string;

  @ApiProperty({ type: String, description: "MIME 类型" })
  mimeType!: string;

  @ApiProperty({ type: Number, description: "大小（字节）" })
  sizeBytes!: number;

  @ApiProperty({ type: String, description: "上传员工工号" })
  uploadedByEmployeeId!: string;

  @ApiProperty({
    description: "创建时间（ISO 8601）",
    type: String,
    format: "date-time",
  })
  createdAt!: string;
}

/** 需求列表查询参数。 */
export class ListDemandsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    type: String,
    description: "需求状态",
    enum: DEMAND_STATUS,
  })
  @IsOptional()
  @IsIn(DEMAND_STATUS)
  status?: (typeof DEMAND_STATUS)[number];

  @ApiPropertyOptional({ type: String, description: "关键词搜索" })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  query?: string;

  @ApiPropertyOptional({ type: String, description: "发起部门 ID" })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  requesterDepartmentId?: string;

  @ApiPropertyOptional({
    type: String,
    description: "受众类型",
    enum: AUDIENCE_TYPE,
  })
  @IsOptional()
  @IsIn(AUDIENCE_TYPE)
  audienceType?: (typeof AUDIENCE_TYPE)[number];

  @ApiPropertyOptional({
    type: String,
    description: "排序方式",
    enum: ["recent", "priority", "hot"],
  })
  @IsOptional()
  @IsIn(["recent", "priority", "hot"])
  sort?: "recent" | "priority" | "hot";
}

/** 乐观锁版本查询参数（移除协作成员 / 解除应用关联）。 */
export class DemandVersionQueryDto {
  @ApiPropertyOptional({
    type: String,
    description: "期望版本号（乐观锁），缺省视为忽略版本校验",
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  expectedVersion?: string;
}
