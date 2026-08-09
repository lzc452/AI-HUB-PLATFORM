import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

const DEMAND_STATUS = [
  "draft",
  "pending_review",
  "rejected",
  "published",
  "in_progress",
  "pilot",
  "completed",
  "closed",
  "merged",
] as const;

const AUDIENCE_TYPE = ["all", "department", "employee"] as const;

const COLLABORATOR_ROLE = ["owner", "collaborator", "operator"] as const;

const APPLICATION_ROLE = ["candidate", "pilot", "solution"] as const;

const REPORT_STATUS = ["open", "dismissed", "hidden", "restored"] as const;

const PILOT_STATUS = ["planned", "running", "completed", "cancelled"] as const;

/** 创建需求草稿请求。 */
export class DemandDraftRequestDto {
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

  @ApiProperty({
    type: String,
    description: "期望结果",
    example: "一个可配置的研发效能看板",
  })
  desiredOutcome!: string;

  @ApiProperty({ description: "受众类型", enum: AUDIENCE_TYPE })
  audienceType!: (typeof AUDIENCE_TYPE)[number];

  @ApiPropertyOptional({
    type: String,
    description: "受众部门 ID",
    example: "demo-rnd",
  })
  departmentId?: string;

  @ApiPropertyOptional({
    type: String,
    description: "受众员工工号",
    example: "DEMO-EMPLOYEE",
  })
  employeeId?: string;

  @ApiPropertyOptional({
    type: Boolean,
    description: "是否包含子部门",
    example: false,
  })
  includeChildren?: boolean;

  @ApiPropertyOptional({
    type: Boolean,
    description: "是否匿名展示",
    example: false,
  })
  displayAnonymously?: boolean;
}

/** 保存需求草稿请求。 */
export class SaveDemandDraftRequestDto extends DemandDraftRequestDto {
  @ApiProperty({
    type: Number,
    description: "期望版本号（乐观锁）",
    example: 1,
  })
  expectedVersion!: number;
}

/** 需求评审请求。 */
export class DemandReviewRequestDto {
  @ApiProperty({ description: "评审结论", enum: ["publish", "reject"] })
  decision!: "publish" | "reject";

  @ApiPropertyOptional({
    type: String,
    description: "评审原因",
    example: "内容完整，准予发布。",
  })
  reason?: string;
}

/** 认领需求请求。 */
export class DemandClaimRequestDto {
  @ApiProperty({
    type: Number,
    description: "期望版本号（乐观锁）",
    example: 1,
  })
  expectedVersion!: number;
}

/** 添加协作成员请求。 */
export class DemandCollaboratorRequestDto {
  @ApiProperty({
    type: String,
    description: "员工工号",
    example: "DEMO-EMPLOYEE",
  })
  employeeId!: string;

  @ApiProperty({ description: "协作角色", enum: COLLABORATOR_ROLE })
  role!: (typeof COLLABORATOR_ROLE)[number];

  @ApiProperty({
    type: Number,
    description: "期望版本号（乐观锁）",
    example: 1,
  })
  expectedVersion!: number;
}

/** 调整协作成员角色请求。 */
export class DemandCollaboratorRoleUpdateRequestDto {
  @ApiProperty({ description: "协作角色", enum: COLLABORATOR_ROLE })
  role!: (typeof COLLABORATOR_ROLE)[number];

  @ApiProperty({ type: Number, description: "期望版本号（乐观锁）", example: 1 })
  expectedVersion!: number;
}

/** 设置需求优先级请求。 */
export class DemandPriorityRequestDto {
  @ApiProperty({
    type: Number,
    description: "期望版本号（乐观锁）",
    example: 1,
  })
  expectedVersion!: number;

  @ApiProperty({ type: Number, description: "业务价值（1-5）", example: 5 })
  businessValue!: number;

  @ApiProperty({ type: Number, description: "实施成本（1-5）", example: 3 })
  implementationCost!: number;

  @ApiProperty({ type: Number, description: "风险等级（1-5）", example: 2 })
  riskLevel!: number;

  @ApiProperty({ type: Number, description: "管理员优先级（1-5）", example: 4 })
  adminPriority!: number;
}

/** 推进需求状态请求。 */
export class DemandStatusRequestDto {
  @ApiProperty({
    type: Number,
    description: "期望版本号（乐观锁）",
    example: 1,
  })
  expectedVersion!: number;

  @ApiProperty({ description: "下一状态", enum: DEMAND_STATUS })
  nextStatus!: (typeof DEMAND_STATUS)[number];

  @ApiPropertyOptional({
    type: String,
    description: "变更原因",
    example: "已完成认领",
  })
  reason?: string;
}

/** 新增进度更新请求。 */
export class DemandProgressRequestDto {
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
}

/** 创建试点请求。 */
export class DemandPilotRequestDto {
  @ApiPropertyOptional({ type: String, description: "试点应用 ID" })
  applicationId?: string;

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
  })
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
  endsAt?: string | null;

  @ApiPropertyOptional({
    type: String,
    description: "试点结论",
    nullable: true,
    example: "试点效果良好",
  })
  outcome?: string | null;

  @ApiPropertyOptional({ description: "试点状态", enum: PILOT_STATUS })
  status?: (typeof PILOT_STATUS)[number];
}

/** 合并需求请求。 */
export class DemandMergeRequestDto {
  @ApiProperty({ type: String, description: "目标需求 ID（合并方向）" })
  targetDemandId!: string;

  @ApiProperty({ type: Number, description: "源需求期望版本号", example: 1 })
  sourceExpectedVersion!: number;

  @ApiProperty({ type: Number, description: "目标需求期望版本号", example: 1 })
  targetExpectedVersion!: number;
}

/** 关联应用到需求请求。 */
export class DemandLinkApplicationRequestDto {
  @ApiProperty({ type: String, description: "应用 ID" })
  applicationId!: string;

  @ApiProperty({ description: "关联角色", enum: APPLICATION_ROLE })
  role!: (typeof APPLICATION_ROLE)[number];

  @ApiPropertyOptional({
    type: Boolean,
    description: "是否主解决方案",
    example: false,
  })
  isPrimary?: boolean;

  @ApiProperty({
    type: Number,
    description: "期望版本号（乐观锁）",
    example: 1,
  })
  expectedVersion!: number;
}

/** 从需求创建应用请求。 */
export class DemandCreateApplicationRequestDto {
  @ApiProperty({
    type: String,
    description: "应用名称",
    example: "研发效能看板",
  })
  name!: string;

  @ApiProperty({
    type: String,
    description: "应用简介",
    example: "面向研发团队的效能数据看板",
  })
  summary!: string;

  @ApiPropertyOptional({
    type: String,
    description: "维护人员工工号",
    example: "DEMO-APP-ADMIN",
  })
  maintainerEmployeeId?: string;

  @ApiPropertyOptional({
    type: String,
    description: "所属部门 ID",
    example: "demo-rnd",
  })
  departmentId?: string;

  @ApiProperty({ description: "关联角色", enum: APPLICATION_ROLE })
  role!: (typeof APPLICATION_ROLE)[number];

  @ApiPropertyOptional({
    type: Boolean,
    description: "是否主解决方案",
    example: false,
  })
  isPrimary?: boolean;

  @ApiProperty({
    type: Number,
    description: "期望版本号（乐观锁）",
    example: 1,
  })
  expectedVersion!: number;
}

/** 需求评论请求。 */
export class DemandCommentRequestDto {
  @ApiProperty({
    type: String,
    description: "父评论 ID，根评论为 null",
    nullable: true,
  })
  parentCommentId!: string | null;

  @ApiProperty({
    type: String,
    description: "评论内容",
    example: "这个需求很重要，建议优先排期。",
  })
  body!: string;

  @ApiPropertyOptional({
    type: Boolean,
    description: "是否匿名展示",
    example: false,
  })
  displayAnonymously?: boolean;
}

/** 举报需求请求。 */
export class DemandReportRequestDto {
  @ApiProperty({
    type: String,
    description: "被举报评论 ID，举报需求本身为 null",
    nullable: true,
  })
  commentId!: string | null;

  @ApiProperty({
    type: String,
    description: "举报原因",
    example: "内容涉嫌违规",
  })
  reason!: string;
}

/** 处理需求举报请求。 */
export class DemandReportResolveRequestDto {
  @ApiProperty({ description: "处理结果", enum: REPORT_STATUS })
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

  @ApiPropertyOptional({ type: String, description: "发起人主部门 ID", nullable: true })
  requesterDepartmentId?: string | null;

  @ApiPropertyOptional({ type: String, description: "发起人展示名称", nullable: true })
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

  @ApiProperty({
    type: String,
    description: "期望结果",
    example: "一个可配置的研发效能看板",
  })
  desiredOutcome!: string;

  @ApiProperty({ description: "需求状态", enum: DEMAND_STATUS })
  status!: (typeof DEMAND_STATUS)[number];

  @ApiProperty({ description: "受众类型", enum: AUDIENCE_TYPE })
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
    description: "实施成本（1-5）",
    type: Number,
    nullable: true,
  })
  implementationCost?: number | null;

  @ApiPropertyOptional({
    description: "风险等级（1-5）",
    type: Number,
    nullable: true,
  })
  riskLevel?: number | null;

  @ApiPropertyOptional({
    description: "管理员优先级（1-5）",
    type: Number,
    nullable: true,
  })
  adminPriority?: number | null;

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
    type: String,
    description: "认领员工工号",
    nullable: true,
    example: "DEMO-INNOVATION",
  })
  ownerEmployeeId?: string | null;

  @ApiPropertyOptional({ type: String, description: "负责人展示名称", nullable: true })
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

  @ApiProperty({ description: "协作角色", enum: COLLABORATOR_ROLE })
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

  @ApiProperty({ description: "进度对应状态", enum: DEMAND_STATUS })
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

  @ApiProperty({ description: "试点状态", enum: PILOT_STATUS })
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

  @ApiProperty({ description: "关联角色", enum: APPLICATION_ROLE })
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

  @ApiPropertyOptional({ type: String, description: "作者展示名称", nullable: true })
  authorDisplayName?: string | null;

  @ApiPropertyOptional({ type: String, description: "作者主部门 ID", nullable: true })
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

  @ApiProperty({ description: "处理状态", enum: REPORT_STATUS })
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
