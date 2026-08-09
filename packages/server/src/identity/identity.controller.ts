import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  UnauthorizedException,
} from "@nestjs/common";
import { PERMISSIONS, type ActorContext } from "@ai-hub/contracts";
import {
  Authenticated,
  CurrentActor,
  Public,
  RequiresPermissions,
} from "../authorization/authorization.decorator.js";
import {
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { IdentityService } from "./identity.service.js";
import {
  ActorContextDto,
  DepartmentSummaryDto,
  EmployeeSummaryDto,
  LoginRequestDto,
  LoginResponseDto,
  LogoutRequestDto,
  RevokeSessionsRequestDto,
  RevokeSessionsResultDto,
  RoleRecordDto,
} from "./identity.dto.js";
import {
  ApiIdentityHeaders,
  ApiProblemResponses,
} from "../system/http/api-docs.decorator.js";

@ApiTags("身份与组织")
@Controller("/internal/identity")
@Authenticated()
export class IdentityController {
  constructor(
    @Inject(IdentityService) private readonly identity: IdentityService,
  ) {}

  @Get("/employees")
  @RequiresPermissions(PERMISSIONS.IDENTITY_EMPLOYEE_READ)
  @ApiOperation({ summary: "员工列表" })
  @ApiIdentityHeaders()
  @ApiOkResponse({
    description: "员工列表",
    type: EmployeeSummaryDto,
    isArray: true,
  })
  @ApiProblemResponses([400, 401, 403])
  async listEmployees() {
    return this.identity.listEmployees();
  }

  @Get("/departments")
  @RequiresPermissions(PERMISSIONS.IDENTITY_DEPARTMENT_READ)
  @ApiOperation({ summary: "部门列表" })
  @ApiIdentityHeaders()
  @ApiOkResponse({
    description: "部门列表",
    type: DepartmentSummaryDto,
    isArray: true,
  })
  @ApiProblemResponses([400, 401, 403])
  async listDepartments() {
    return this.identity.listDepartments();
  }

  @Get("/employees/:employeeId/roles")
  @RequiresPermissions(PERMISSIONS.IDENTITY_ROLE_READ)
  @ApiOperation({ summary: "员工角色列表" })
  @ApiIdentityHeaders()
  @ApiParam({
    name: "employeeId",
    description: "员工工号",
    example: "DEMO-EMPLOYEE",
  })
  @ApiOkResponse({
    description: "角色列表",
    type: RoleRecordDto,
    isArray: true,
  })
  @ApiProblemResponses([400, 401, 403])
  async listEmployeeRoles(@Param("employeeId") employeeId: string) {
    return this.identity.listEmployeeRoles(employeeId);
  }

  @Post("/employees/:employeeId/revoke-sessions")
  @RequiresPermissions(PERMISSIONS.IDENTITY_SESSION_MANAGE)
  @HttpCode(200)
  @ApiOperation({ summary: "撤销员工会话" })
  @ApiIdentityHeaders()
  @ApiParam({
    name: "employeeId",
    description: "目标员工工号",
    example: "DEMO-EMPLOYEE",
  })
  @ApiBody({ type: RevokeSessionsRequestDto })
  @ApiOkResponse({ description: "撤销结果", type: RevokeSessionsResultDto })
  @ApiProblemResponses([400, 401, 403])
  async revokeEmployeeSessions(
    @Param("employeeId") employeeId: string,
    @CurrentActor() actor: ActorContext,
    @Body() body: RevokeSessionsRequestDto,
  ) {
    const revoked = await this.identity.revokeEmployeeSessions(
      actor.employeeId,
      employeeId,
      body.reason ?? "admin_action",
    );
    return { revoked };
  }

  @Get("/actor")
  @Authenticated()
  @ApiOperation({ summary: "获取调用者上下文" })
  @ApiIdentityHeaders()
  @ApiOkResponse({ description: "调用者上下文", type: ActorContextDto })
  @ApiProblemResponses([400, 401, 403])
  getActor(@CurrentActor() actor: ActorContext) {
    return actor;
  }

  @Post("/logout")
  @Authenticated()
  @HttpCode(204)
  @ApiOperation({ summary: "注销会话" })
  @ApiIdentityHeaders()
  @ApiBody({ type: LogoutRequestDto })
  @ApiResponse({ status: 204, description: "注销成功" })
  @ApiProblemResponses([400, 401, 403])
  async logout(
    @CurrentActor() actor: ActorContext,
    @Body() body?: LogoutRequestDto,
  ): Promise<void> {
    if (body?.sessionId !== undefined && body.sessionId !== actor.sessionId) {
      throw new BadRequestException("SESSION_ID_MISMATCH");
    }
    await this.identity.logout(actor);
  }

  @Post("/login/password")
  @Public()
  @ApiOperation({
    summary: "密码登录",
    description: "使用员工工号与密码登录并创建会话。",
  })
  @ApiBody({ type: LoginRequestDto })
  @ApiCreatedResponse({
    description: "登录结果（调用者上下文与会话）",
    type: LoginResponseDto,
  })
  @ApiProblemResponses([400, 401])
  loginWithPassword(@Body() body: LoginRequestDto) {
    return this.identity
      .loginWithPassword({
        employeeId: body.employeeId,
        password: body.password,
        deviceLabel: body.deviceLabel ?? "browser",
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.message === "INVALID_CREDENTIALS") {
          throw new UnauthorizedException("INVALID_CREDENTIALS");
        }
        throw error;
      });
  }
}
