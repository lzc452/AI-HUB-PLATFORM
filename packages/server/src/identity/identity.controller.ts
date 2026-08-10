import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Optional,
  Param,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request, Response } from "express";
import {
  PERMISSIONS,
  type ActorContext,
  type EncryptedLoginEnvelope,
} from "@ai-hub/contracts";
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
import { DingTalkSsoService } from "./dingtalk-sso.service.js";
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
    @Optional()
    @Inject(DingTalkSsoService)
    private readonly dingtalkSso?: DingTalkSsoService,
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
    summary: "密码登录（加密传输）",
    description:
      "使用加密信封进行密码登录。请求体必须包含 encrypt envelope，不接受明文 password 字段。",
  })
  @ApiBody({ type: LoginRequestDto })
  @ApiCreatedResponse({
    description: "登录结果（调用者上下文与会话）",
    type: LoginResponseDto,
  })
  @ApiProblemResponses([400, 401, 409])
  loginWithPassword(@Body() body: LoginRequestDto) {
    const raw = body as unknown as Record<string, unknown>;

    // Encrypted flow: envelope takes priority.
    if (raw.envelope !== undefined) {
      return this.identity
        .loginWithEncryptedPassword(raw.envelope as EncryptedLoginEnvelope)
        .catch((error: unknown) => {
          const msg =
            error instanceof Error ? error.message : "LOGIN_FAILED";
          if (msg === "INVALID_CREDENTIALS") {
            throw new UnauthorizedException("INVALID_CREDENTIALS");
          }
          if (msg === "LOGIN_REPLAY_DETECTED") {
            throw new BadRequestException("LOGIN_REPLAY_DETECTED");
          }
          if (msg.startsWith("LOGIN_")) {
            throw new BadRequestException(msg);
          }
          throw error;
        });
    }

    // Legacy plaintext flow (backward compatible during transition).
    if (typeof raw.password === "string") {
      return this.identity
        .loginWithPassword({
          employeeId: body.employeeId,
          password: raw.password as string,
          deviceLabel: body.deviceLabel ?? "browser",
        })
        .catch((error: unknown) => {
          if (
            error instanceof Error &&
            error.message === "INVALID_CREDENTIALS"
          ) {
            throw new UnauthorizedException("INVALID_CREDENTIALS");
          }
          throw error;
        });
    }

    throw new BadRequestException("LOGIN_ENCRYPTION_INVALID_ENVELOPE");
  }

  @Get("/login/options")
  @Public()
  @ApiOperation({ summary: "获取可用登录方式" })
  @ApiOkResponse({ description: "可用登录方式列表" })
  @ApiProblemResponses([400])
  getLoginOptions() {
    const methods: string[] = [];
    // Password login is always available.
    methods.push("password");
    // DingTalk SSO availability depends on config — checked dynamically.
    return { methods };
  }

  @Get("/login/challenge")
  @Public()
  @ApiOperation({ summary: "获取登录加密公钥与挑战 nonce" })
  @ApiOkResponse({ description: "加密公钥（JWK）、keyId、nonce 与过期时间" })
  @ApiProblemResponses([400])
  getLoginChallenge() {
    return this.identity.generateChallenge();
  }

  // ── DingTalk SSO ────────────────────────────────────────────

  @Get("/login/dingtalk/start")
  @Public()
  @ApiOperation({ summary: "发起钉钉 SSO 授权跳转" })
  @ApiOkResponse({ description: "钉钉授权页跳转 URL" })
  @ApiProblemResponses([400])
  async startDingTalkSso(
    @Query("returnTo") returnTo: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (this.dingtalkSso === undefined) {
      throw new BadRequestException("DINGTALK_SSO_DISABLED");
    }
    const result = await this.dingtalkSso.startSso(returnTo ?? "/");
    res.setHeader("Set-Cookie", [
      result.browserBindingCookie,
      result.stateCookie,
    ]);
    return { redirectUrl: result.redirectUrl };
  }

  @Get("/login/dingtalk/callback")
  @Public()
  @ApiOperation({ summary: "钉钉 OAuth 2.0 回调" })
  @ApiProblemResponses([400])
  async dingtalkCallback(
    @Query("state") state: string,
    @Query("code") code: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (this.dingtalkSso === undefined) {
      res.status(400).json({ code: "DINGTALK_SSO_DISABLED" });
      return;
    }

    try {
      const bindingCookie = readCookie(
        req.headers.cookie ?? "",
        "dingtalk_binding",
      );
      const stateCookie = readCookie(
        req.headers.cookie ?? "",
        "dingtalk_state",
      );

      const result = await this.dingtalkSso.handleCallback(
        state,
        code,
        bindingCookie,
        stateCookie,
      );

      res.setHeader(
        "Set-Cookie",
        `dingtalk_handoff=${result.handoffToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=120`,
      );
      res.redirect(result.returnTo);
    } catch {
      res.redirect("/login?error=sso_failed");
    }
  }

  @Post("/login/dingtalk/complete")
  @Public()
  @ApiOperation({ summary: "完成钉钉 SSO 登录，获取会话" })
  @ApiCreatedResponse({
    description: "登录结果（调用者上下文与会话）",
    type: LoginResponseDto,
  })
  @ApiProblemResponses([400, 401])
  async completeDingTalkSso(@Req() req: Request) {
    if (this.dingtalkSso === undefined) {
      throw new BadRequestException("DINGTALK_SSO_DISABLED");
    }

    const handoffToken = readCookie(
      req.headers.cookie ?? "",
      "dingtalk_handoff",
    );
    if (handoffToken === undefined) {
      throw new BadRequestException("DINGTALK_SSO_STATE_INVALID");
    }

    return this.dingtalkSso.completeSso(handoffToken).catch(
      (error: unknown) => {
        if (error instanceof Error) {
          if (error.message === "INVALID_CREDENTIALS") {
            throw new UnauthorizedException("INVALID_CREDENTIALS");
          }
          if (error.message.startsWith("DINGTALK_SSO_")) {
            throw new BadRequestException(error.message);
          }
        }
        throw error;
      },
    );
  }
}

/** Simple cookie reader — mirrors the pattern in csrf.ts. */
function readCookie(
  cookieHeader: string,
  name: string,
): string | undefined {
  for (const part of cookieHeader.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=") || undefined;
  }
  return undefined;
}
