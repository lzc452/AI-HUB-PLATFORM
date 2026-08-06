import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  ForbiddenException,
  UnauthorizedException,
} from "@nestjs/common";
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
export class IdentityController {
  constructor(
    @Inject(IdentityService) private readonly identity: IdentityService,
  ) {}

  @Get("/employees")
  @ApiOperation({ summary: "员工列表" })
  @ApiIdentityHeaders()
  @ApiOkResponse({
    description: "员工列表",
    type: EmployeeSummaryDto,
    isArray: true,
  })
  @ApiProblemResponses([400, 401, 403])
  async listEmployees(
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
  ) {
    await this.requirePermission(employeeId, sessionId, "read");
    return this.identity.listEmployees();
  }

  @Get("/departments")
  @ApiOperation({ summary: "部门列表" })
  @ApiIdentityHeaders()
  @ApiOkResponse({
    description: "部门列表",
    type: DepartmentSummaryDto,
    isArray: true,
  })
  @ApiProblemResponses([400, 401, 403])
  async listDepartments(
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
  ) {
    await this.requirePermission(employeeId, sessionId, "read");
    return this.identity.listDepartments();
  }

  @Get("/employees/:employeeId/roles")
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
  async listEmployeeRoles(
    @Param("employeeId") employeeId: string,
    @Headers("x-employee-id") actorEmployeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
  ) {
    await this.requirePermission(actorEmployeeId, sessionId, "read");
    return this.identity.listEmployeeRoles(employeeId);
  }

  @Post("/employees/:employeeId/revoke-sessions")
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
    @Headers("x-actor-id") actorEmployeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
    @Body() body: RevokeSessionsRequestDto,
  ) {
    if (actorEmployeeId === undefined) {
      throw new BadRequestException("ACTOR_ID_REQUIRED");
    }
    await this.requirePermission(actorEmployeeId, sessionId, "manage");
    const revoked = await this.identity.revokeEmployeeSessions(
      actorEmployeeId,
      employeeId,
      body.reason ?? "admin_action",
    );
    return { revoked };
  }

  @Get("/actor")
  @ApiOperation({ summary: "获取调用者上下文" })
  @ApiIdentityHeaders()
  @ApiOkResponse({ description: "调用者上下文", type: ActorContextDto })
  @ApiProblemResponses([400, 401, 403])
  getActor(
    @Headers("x-employee-id") employeeId: string | undefined,
    @Headers("x-session-id") sessionId: string | undefined,
  ) {
    if (employeeId === undefined || sessionId === undefined) {
      throw new BadRequestException("IDENTITY_HEADERS_REQUIRED");
    }
    return this.identity.getActorContext(employeeId, sessionId);
  }

  @Post("/logout")
  @HttpCode(204)
  @ApiOperation({ summary: "注销会话" })
  @ApiBody({ type: LogoutRequestDto })
  @ApiResponse({ status: 204, description: "注销成功" })
  @ApiProblemResponses([400])
  async logout(@Body() body: LogoutRequestDto): Promise<void> {
    if (body.sessionId === undefined) {
      throw new BadRequestException("SESSION_ID_REQUIRED");
    }
    await this.identity.revokeSession(body.sessionId);
  }

  @Post("/login/password")
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

  private async requirePermission(
    employeeId: string | undefined,
    sessionId: string | undefined,
    action: "read" | "manage",
  ): Promise<void> {
    if (employeeId === undefined || sessionId === undefined) {
      throw new BadRequestException("IDENTITY_HEADERS_REQUIRED");
    }
    const actor = await this.identity.getActorContext(employeeId, sessionId);
    const decision = await this.identity.authorize({
      actor,
      action,
      resourceType: "identity",
    });
    if (!decision.allowed) {
      throw new ForbiddenException("NOT_AUTHORIZED");
    }
  }
}
