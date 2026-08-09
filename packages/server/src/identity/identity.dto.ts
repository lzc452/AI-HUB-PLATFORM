import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/** 密码登录请求。 */
export class LoginRequestDto {
  @ApiProperty({
    type: String,
    description: "员工工号",
    example: "DEMO-EMPLOYEE",
  })
  employeeId!: string;

  @ApiProperty({
    type: String,
    description: "登录密码",
    example: "Demo-Employee-2026!",
  })
  password!: string;

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

  @ApiProperty({ description: "数据来源", enum: ["local", "dingtalk"] })
  source!: "local" | "dingtalk";
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

/** 撤销会话结果。 */
export class RevokeSessionsResultDto {
  @ApiProperty({ type: Number, description: "撤销的会话数量", example: 2 })
  revoked!: number;
}
