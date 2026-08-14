import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/** 登录加密信封。 */
export class EncryptedLoginEnvelopeDto {
  @ApiProperty({ type: String })
  encryptedPayload!: string;

  @ApiProperty({ type: String })
  wrappedKey!: string;

  @ApiProperty({ type: String })
  iv!: string;

  @ApiProperty({ type: String })
  aad!: string;

  @ApiProperty({ type: String })
  keyId!: string;

  @ApiProperty({ type: String })
  nonce!: string;
}

/** 密码登录请求。 */
export class LoginRequestDto {
  @ApiProperty({
    type: String,
    description: "员工工号",
    example: "DEMO-EMPLOYEE",
  })
  employeeId!: string;

  @ApiProperty({
    type: EncryptedLoginEnvelopeDto,
    description: "一次性登录加密信封",
  })
  envelope!: EncryptedLoginEnvelopeDto;

  @ApiPropertyOptional({
    type: String,
    description: "设备标识",
    example: "browser",
  })
  deviceLabel?: string;
}

/** 注销请求。 */
export class LogoutRequestDto {
  @ApiPropertyOptional({
    type: String,
    description: "会话 ID",
    example: "00000000-0000-0000-0000-000000000000",
  })
  sessionId?: string;
}

/** 撤销员工会话请求。 */
export class RevokeSessionsRequestDto {
  @ApiPropertyOptional({
    type: String,
    description: "撤销原因",
    example: "admin_action",
  })
  reason?: string;
}

/** 调用者上下文。 */
export class ActorContextDto {
  @ApiProperty({
    type: String,
    description: "员工工号",
    example: "DEMO-EMPLOYEE",
  })
  employeeId!: string;

  @ApiProperty({ description: "角色编码列表", type: [String] })
  roleCodes!: string[];

  @ApiProperty({ description: "聚合后的权限编码列表", type: [String] })
  permissions!: string[];

  @ApiProperty({ description: "所属部门 ID 列表", type: [String] })
  departmentIds!: string[];

  @ApiProperty({ type: String, description: "主部门 ID", example: "demo-rnd" })
  primaryDepartmentId!: string;

  @ApiProperty({
    type: String,
    description: "会话 ID",
    example: "00000000-0000-0000-0000-000000000000",
  })
  sessionId!: string;
}

/** 会话记录。 */
export class SessionDto {
  @ApiProperty({
    type: String,
    description: "会话 ID",
    example: "00000000-0000-0000-0000-000000000000",
  })
  sessionId!: string;

  @ApiProperty({
    type: String,
    description: "员工工号",
    example: "DEMO-EMPLOYEE",
  })
  employeeId!: string;

  @ApiProperty({ type: String, description: "设备标识", example: "browser" })
  deviceLabel!: string;

  @ApiProperty({
    description: "过期时间（ISO 8601）",
    type: String,
    format: "date-time",
  })
  expiresAt!: string;

  @ApiPropertyOptional({
    description: "撤销时间（ISO 8601），未撤销为 null",
    type: String,
    format: "date-time",
    nullable: true,
  })
  revokedAt?: string | null;
}

/** 密码登录响应。 */
export class LoginResponseDto {
  @ApiProperty({ description: "调用者上下文", type: () => ActorContextDto })
  actor!: ActorContextDto;

  @ApiProperty({ description: "会话记录", type: () => SessionDto })
  session!: SessionDto;
}

/** 员工摘要。 */
export class EmployeeSummaryDto {
  @ApiProperty({
    type: String,
    description: "员工工号",
    example: "DEMO-EMPLOYEE",
  })
  employeeId!: string;

  @ApiProperty({
    type: String,
    description: "展示名称",
    example: "演示普通员工",
  })
  displayName!: string;

  @ApiProperty({
    type: String,
    description: "员工状态",
    enum: ["pending_binding", "active", "disabled", "archived"],
  })
  status!: "pending_binding" | "active" | "disabled" | "archived";

  @ApiProperty({ type: String, description: "主部门 ID", example: "demo-rnd" })
  primaryDepartmentId!: string;
}

/** 部门摘要。 */
export class DepartmentSummaryDto {
  @ApiProperty({ type: String, description: "部门 ID", example: "demo-rnd" })
  departmentId!: string;

  @ApiProperty({ type: String, description: "部门名称", example: "研发中心" })
  name!: string;

  @ApiPropertyOptional({
    type: String,
    description: "父部门 ID",
    example: "demo-company",
    nullable: true,
  })
  parentDepartmentId?: string | null;

  @ApiProperty({
    type: String,
    description: "数据来源",
    enum: ["local", "dingtalk"],
  })
  source!: "local" | "dingtalk";

  @ApiPropertyOptional({ enum: ["active", "disabled"] })
  status?: "active" | "disabled";

  @ApiPropertyOptional({ type: String, nullable: true })
  managerEmployeeId?: string | null;

  @ApiPropertyOptional({ type: String, format: "date-time", nullable: true })
  lastSyncedAt?: string | null;
}

/** 角色记录。 */
export class RoleRecordDto {
  @ApiProperty({
    type: String,
    description: "角色编码",
    example: "application_admin",
  })
  roleCode!: string;

  @ApiProperty({ description: "权限列表", type: [String] })
  permissions!: string[];
}

export class IdentityRoleSummaryDto {
  @ApiProperty({ type: String })
  roleId!: string;

  @ApiProperty({ type: String })
  roleName!: string;

  @ApiProperty({ enum: ["system", "custom"] })
  roleType!: "system" | "custom";

  @ApiProperty({ type: String })
  scope!: string;

  @ApiProperty({ type: Number })
  memberCount!: number;

  @ApiProperty({ type: String, nullable: true })
  creator!: string | null;

  @ApiProperty({ enum: ["active", "disabled"] })
  status!: "active" | "disabled";

  @ApiProperty({ type: String, format: "date-time" })
  updatedAt!: string;
}

export class CreateRoleRequestDto {
  @ApiProperty({ type: String, example: "catalog_operator" })
  roleCode!: string;

  @ApiProperty({ type: String, example: "目录运营" })
  name!: string;

  @ApiProperty({ type: [String] })
  permissions!: string[];
}

export class UpdateRoleRequestDto {
  @ApiPropertyOptional({ type: String })
  name?: string;

  @ApiPropertyOptional({ type: [String] })
  permissions?: string[];

  @ApiPropertyOptional({ enum: ["active", "disabled"] })
  status?: "active" | "disabled";
}

/** 撤销会话结果。 */
export class RevokeSessionsResultDto {
  @ApiProperty({ type: Number, description: "撤销的会话数量", example: 2 })
  revoked!: number;
}

/** 员工分页列表结果。 */
export class EmployeePageResultDto {
  @ApiProperty({ type: EmployeeSummaryDto, isArray: true })
  items!: EmployeeSummaryDto[];

  @ApiProperty({ type: Number })
  total!: number;
}

/** 更新员工请求。 */
export class UpdateEmployeeRequestDto {
  @ApiPropertyOptional({ type: String, description: "显示名" })
  displayName?: string;

  @ApiPropertyOptional({
    description: "状态",
    enum: ["active", "disabled", "pending_binding"],
  })
  status?: "active" | "disabled" | "pending_binding";

  @ApiPropertyOptional({ type: String, description: "主部门 ID" })
  primaryDepartmentId?: string;
}

/** 创建/更新部门请求。 */
export class UpsertDepartmentRequestDto {
  @ApiProperty({ type: String, description: "部门 ID" })
  departmentId!: string;

  @ApiProperty({ type: String, description: "部门名称" })
  name!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: "父部门 ID",
  })
  parentDepartmentId?: string | null;
}

/** 更新部门请求。 */
export class UpdateDepartmentRequestDto {
  @ApiPropertyOptional({ type: String, description: "部门名称" })
  name?: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: "父部门 ID",
  })
  parentDepartmentId?: string | null;
}

/** 分配员工角色请求。 */
export class AssignRolesRequestDto {
  @ApiProperty({ type: [String], description: "角色编码列表" })
  roleCodes!: string[];
}

/** 同步记录。 */
export class SyncRunDto {
  @ApiProperty({ type: String })
  syncRunId!: string;

  @ApiProperty({ type: String })
  mode!: string;

  @ApiProperty({ type: String })
  status!: string;

  @ApiProperty({ type: String, description: "开始时间（ISO 8601）" })
  startedAt!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  completedAt?: string | null;

  @ApiPropertyOptional({ type: Object, description: "同步摘要" })
  summary?: unknown;
}

export class SyncConfigDto {
  @ApiProperty({ type: Boolean })
  enabled!: boolean;

  @ApiPropertyOptional({ type: String, nullable: true })
  schedule?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  externalOrgId?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  lastUpdatedByEmployeeId?: string | null;

  @ApiProperty({ type: String, format: "date-time" })
  updatedAt!: string;
}

export class UpdateSyncConfigRequestDto {
  @ApiPropertyOptional({ type: Boolean })
  enabled?: boolean;

  @ApiPropertyOptional({ type: String, nullable: true })
  schedule?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  externalOrgId?: string | null;
}

export class SyncRunItemDto {
  @ApiProperty({ type: String })
  syncRunItemId!: string;

  @ApiProperty({ type: String })
  syncRunId!: string;

  @ApiProperty({ type: String })
  objectType!: string;

  @ApiProperty({ type: String })
  objectId!: string;

  @ApiProperty({ type: String })
  status!: string;

  @ApiProperty({ type: Number })
  processedCount!: number;

  @ApiProperty({ type: Number })
  successCount!: number;

  @ApiProperty({ type: Number })
  failureCount!: number;

  @ApiPropertyOptional({ type: String, nullable: true })
  errorCode?: string | null;

  @ApiPropertyOptional({ type: String, format: "date-time", nullable: true })
  startedAt?: string | null;

  @ApiPropertyOptional({ type: String, format: "date-time", nullable: true })
  finishedAt?: string | null;
}
