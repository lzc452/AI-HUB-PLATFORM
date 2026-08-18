import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Optional,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
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
import { IdentityService, parseCsv } from "./identity.service.js";
import { DingTalkSsoService } from "./dingtalk-sso.service.js";
import {
  buildSessionCookieAttributes,
  shouldSecureSessionCookie,
} from "./session-cookie.js";
import {
  ActorContextDto,
  AssignRolesRequestDto,
  BulkDisableEmployeesRequestDto,
  BulkDisableRolesRequestDto,
  CopyRoleRequestDto,
  CreateEmployeeRequestDto,
  DepartmentImportCommitRequestDto,
  DepartmentSummaryDto,
  EmployeeImportCommitRequestDto,
  EmployeePageResultDto,
  EmployeeSummaryDto,
  CreateRoleRequestDto,
  IdentityRoleSummaryDto,
  LoginRequestDto,
  LoginResponseDto,
  LogoutRequestDto,
  ResetPasswordRequestDto,
  RevokeSessionsRequestDto,
  RevokeSessionsResultDto,
  RoleDetailDto,
  RoleRecordDto,
  RoleTemplateDto,
  SyncConfigDto,
  SyncRunDto,
  SyncRunItemDto,
  UpdateDepartmentRequestDto,
  UpdateEmployeeRequestDto,
  UpdateRoleRequestDto,
  UpdateSyncConfigRequestDto,
  UpsertDepartmentRequestDto,
  ListEmployeesQueryDto,
  ListSyncRunsQueryDto,
  DingTalkSsoStartQueryDto,
  DingTalkSsoCallbackQueryDto,
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

  @Get("/organization-overview")
  @RequiresPermissions(PERMISSIONS.IDENTITY_EMPLOYEE_READ)
  @ApiOperation({ summary: "组织管理概览" })
  @ApiIdentityHeaders()
  @ApiOkResponse({ description: "组织管理概览" })
  @ApiProblemResponses([400, 401, 403])
  async organizationOverview() {
    return this.identity.getOrganizationOverview();
  }

  @Post("/employees")
  @RequiresPermissions(PERMISSIONS.IDENTITY_EMPLOYEE_MANAGE)
  @HttpCode(200)
  @ApiOperation({ summary: "创建本地员工" })
  @ApiIdentityHeaders()
  @ApiBody({ type: CreateEmployeeRequestDto })
  @ApiOkResponse({ description: "员工已创建" })
  @ApiProblemResponses([400, 401, 403])
  async createEmployee(
    @CurrentActor() actor: ActorContext,
    @Body() body: CreateEmployeeRequestDto,
  ) {
    await this.call(() =>
      this.identity.createEmployeeByAdmin(actor, {
        employeeId: body.employeeId,
        displayName: body.displayName,
        primaryDepartmentId: body.primaryDepartmentId,
        ...(body.roleCodes === undefined ? {} : { roleCodes: body.roleCodes }),
        password: body.password ?? "",
        ...(body.status === undefined ? {} : { status: body.status }),
      }),
    );
    return { created: true };
  }

  @Post("/employees/imports/preview")
  @RequiresPermissions(PERMISSIONS.IDENTITY_EMPLOYEE_MANAGE)
  @UseInterceptors(FileInterceptor("file"))
  @ApiOperation({ summary: "解析员工 CSV 导入文件并预览差异" })
  @ApiIdentityHeaders()
  @ApiProblemResponses([400, 401, 403])
  async previewEmployeeImport(
    @UploadedFile() file?: { buffer: Buffer },
  ) {
    if (file === undefined) throw new BadRequestException("IMPORT_FILE_REQUIRED");
    const records = recordsFromCsv(file.buffer.toString("utf8"));
    return this.identity.previewEmployeeImport(records);
  }

  @Post("/employees/imports")
  @RequiresPermissions(PERMISSIONS.IDENTITY_EMPLOYEE_MANAGE)
  @HttpCode(200)
  @ApiOperation({ summary: "确认并写入员工 CSV 导入" })
  @ApiIdentityHeaders()
  @ApiBody({ type: EmployeeImportCommitRequestDto })
  @ApiProblemResponses([400, 401, 403])
  async applyEmployeeImport(
    @CurrentActor() actor: ActorContext,
    @Body() body: EmployeeImportCommitRequestDto,
  ) {
    return this.identity.applyEmployeeImport(actor, body.rows);
  }

  @Post("/employees/bulk-disable")
  @RequiresPermissions(PERMISSIONS.IDENTITY_EMPLOYEE_MANAGE)
  @ApiOperation({ summary: "批量停用员工" })
  @ApiIdentityHeaders()
  @ApiBody({ type: BulkDisableEmployeesRequestDto })
  @ApiOkResponse({ description: "员工已停用" })
  @ApiProblemResponses([400, 401, 403])
  async bulkDisableEmployees(
    @CurrentActor() actor: ActorContext,
    @Body() body: BulkDisableEmployeesRequestDto,
  ) {
    const disabled = await this.identity.bulkDisableEmployees(
      actor,
      body.employeeIds,
    );
    return { disabled };
  }

  @Delete("/employees/:employeeId")
  @RequiresPermissions(PERMISSIONS.IDENTITY_EMPLOYEE_MANAGE)
  @ApiOperation({ summary: "归档员工" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "employeeId", description: "员工工号" })
  @ApiOkResponse({ description: "员工已归档" })
  @ApiProblemResponses([400, 401, 403, 404])
  async archiveEmployee(
    @Param("employeeId") employeeId: string,
    @CurrentActor() actor: ActorContext,
  ) {
    await this.call(() => this.identity.archiveEmployee(actor, employeeId));
    return { archived: true };
  }

  @Post("/employees/:employeeId/reset-password")
  @RequiresPermissions(PERMISSIONS.IDENTITY_EMPLOYEE_MANAGE)
  @ApiOperation({ summary: "管理员重置员工密码" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "employeeId", description: "员工工号" })
  @ApiBody({ type: ResetPasswordRequestDto })
  @ApiOkResponse({ description: "密码已重置" })
  @ApiProblemResponses([400, 401, 403, 404])
  async resetEmployeePassword(
    @Param("employeeId") employeeId: string,
    @CurrentActor() actor: ActorContext,
    @Body() body: ResetPasswordRequestDto,
  ) {
    await this.call(() =>
      this.identity.resetEmployeePassword(actor, employeeId, body.newPassword),
    );
    return { reset: true };
  }

  @Get("/roles")
  @RequiresPermissions(PERMISSIONS.IDENTITY_ROLE_READ)
  @ApiOperation({ summary: "角色列表" })
  @ApiIdentityHeaders()
  @ApiOkResponse({
    description: "角色列表",
    type: IdentityRoleSummaryDto,
    isArray: true,
  })
  @ApiProblemResponses([400, 401, 403])
  async listRoles() {
    const roles = await this.identity.listRoles();
    return roles.map((role) => ({
      roleId: role.roleCode,
      roleName: role.name,
      roleType: role.isSystem ? "system" : "custom",
      scope: role.permissions.includes("*") ? "全局" : "按权限授权",
      memberCount: role.memberCount,
      creator: role.creatorName,
      status: role.status,
      updatedAt: role.updatedAt.toISOString(),
    }));
  }

  @Get("/roles/permission-catalog")
  @RequiresPermissions(PERMISSIONS.IDENTITY_ROLE_READ)
  @ApiOperation({ summary: "角色权限目录" })
  @ApiIdentityHeaders()
  @ApiOkResponse({ description: "按模块分组的权限节点" })
  @ApiProblemResponses([400, 401, 403])
  async permissionCatalog() {
    return this.identity.getPermissionCatalog();
  }

  @Get("/roles/templates")
  @RequiresPermissions(PERMISSIONS.IDENTITY_ROLE_READ)
  @ApiOperation({ summary: "角色权限模板" })
  @ApiIdentityHeaders()
  @ApiOkResponse({ type: RoleTemplateDto, isArray: true })
  @ApiProblemResponses([400, 401, 403])
  async roleTemplates() {
    return this.identity.listRoleTemplates();
  }

  @Get("/roles/:roleId")
  @RequiresPermissions(PERMISSIONS.IDENTITY_ROLE_READ)
  @ApiOperation({ summary: "角色详情" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "roleId", description: "角色编码" })
  @ApiOkResponse({ type: RoleDetailDto })
  @ApiProblemResponses([400, 401, 403, 404])
  async getRole(@Param("roleId") roleCode: string) {
    const role = await this.call(() => this.identity.getRoleDetail(roleCode));
    return {
      roleId: role.roleCode,
      roleName: role.name,
      roleType: role.isSystem ? "system" : "custom",
      permissions: [...role.permissions],
      memberCount: role.memberCount,
      creator: role.creatorName,
      status: role.status,
      updatedAt: role.updatedAt.toISOString(),
    };
  }

  @Post("/roles")
  @RequiresPermissions(PERMISSIONS.IDENTITY_ROLE_MANAGE)
  @HttpCode(200)
  @ApiOperation({ summary: "创建角色" })
  @ApiIdentityHeaders()
  @ApiBody({ type: CreateRoleRequestDto })
  @ApiOkResponse({ description: "角色已创建" })
  @ApiProblemResponses([400, 401, 403])
  async createRole(
    @CurrentActor() actor: ActorContext,
    @Body() body: CreateRoleRequestDto,
  ) {
    await this.call(() =>
      this.identity.createRole(actor, {
        ...(body.roleCode === undefined ? {} : { roleCode: body.roleCode }),
        name: body.name,
        permissions: body.permissions,
      }),
    );
    return { created: true };
  }

  @Patch("/roles/:roleId")
  @RequiresPermissions(PERMISSIONS.IDENTITY_ROLE_MANAGE)
  @ApiOperation({ summary: "更新角色" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "roleId", description: "角色编码" })
  @ApiBody({ type: UpdateRoleRequestDto })
  @ApiOkResponse({ description: "角色已更新" })
  @ApiProblemResponses([400, 401, 403, 404])
  async updateRole(
    @Param("roleId") roleCode: string,
    @CurrentActor() actor: ActorContext,
    @Body() body: UpdateRoleRequestDto,
  ) {
    await this.call(() => this.identity.updateRole(actor, roleCode, body));
    return { updated: true };
  }

  @Post("/roles/:roleId/disable")
  @RequiresPermissions(PERMISSIONS.IDENTITY_ROLE_MANAGE)
  @HttpCode(200)
  @ApiOperation({ summary: "停用角色" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "roleId", description: "角色编码" })
  @ApiOkResponse({ description: "角色已停用" })
  @ApiProblemResponses([400, 401, 403, 404])
  async disableRole(
    @Param("roleId") roleCode: string,
    @CurrentActor() actor: ActorContext,
  ) {
    await this.call(() =>
      this.identity.updateRole(actor, roleCode, { status: "disabled" }),
    );
    return { disabled: true };
  }

  @Post("/roles/:roleId/copy")
  @RequiresPermissions(PERMISSIONS.IDENTITY_ROLE_MANAGE)
  @ApiOperation({ summary: "复制角色" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "roleId", description: "源角色编码" })
  @ApiBody({ type: CopyRoleRequestDto })
  @ApiOkResponse({ description: "角色已复制" })
  @ApiProblemResponses([400, 401, 403, 404])
  async copyRole(
    @Param("roleId") roleCode: string,
    @CurrentActor() actor: ActorContext,
    @Body() body: CopyRoleRequestDto,
  ) {
    await this.call(() =>
      this.identity.copyRole(actor, roleCode, body),
    );
    return { created: true };
  }

  @Post("/roles/bulk-disable")
  @RequiresPermissions(PERMISSIONS.IDENTITY_ROLE_MANAGE)
  @ApiOperation({ summary: "批量停用角色" })
  @ApiIdentityHeaders()
  @ApiBody({ type: BulkDisableRolesRequestDto })
  @ApiOkResponse({ description: "角色已停用" })
  @ApiProblemResponses([400, 401, 403])
  async bulkDisableRoles(
    @CurrentActor() actor: ActorContext,
    @Body() body: BulkDisableRolesRequestDto,
  ) {
    const disabled = await this.identity.bulkDisableRoles(actor, body.roleIds);
    return { disabled };
  }

  @Delete("/roles/:roleId")
  @RequiresPermissions(PERMISSIONS.IDENTITY_ROLE_MANAGE)
  @ApiOperation({ summary: "删除角色（须无成员）" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "roleId", description: "角色编码" })
  @ApiOkResponse({ description: "角色已删除" })
  @ApiProblemResponses([400, 401, 403, 404])
  async deleteRole(
    @Param("roleId") roleCode: string,
    @CurrentActor() actor: ActorContext,
  ) {
    await this.call(() => this.identity.deleteRoleIfUnused(actor, roleCode));
    return { deleted: true };
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

  @Get("/employees/page")
  @RequiresPermissions(PERMISSIONS.IDENTITY_EMPLOYEE_READ)
  @ApiOperation({ summary: "员工分页列表（关键词搜索）" })
  @ApiIdentityHeaders()
  @ApiOkResponse({ description: "分页结果", type: EmployeePageResultDto })
  @ApiProblemResponses([400, 401, 403])
  async listEmployeesPage(
    @Query() query: ListEmployeesQueryDto,
  ) {
    return this.identity.listEmployeesPage({
      ...(query.keyword === undefined ? {} : { keyword: query.keyword }),
      page: query.page ?? 1,
      pageSize: Math.min(100, query.pageSize ?? 20),
    });
  }

  @Patch("/employees/:employeeId")
  @RequiresPermissions(PERMISSIONS.IDENTITY_EMPLOYEE_MANAGE)
  @ApiOperation({ summary: "更新员工信息" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "employeeId", description: "员工工号" })
  @ApiBody({ type: UpdateEmployeeRequestDto })
  @ApiOkResponse({ description: "更新完成" })
  @ApiProblemResponses([400, 401, 403, 404])
  async updateEmployee(
    @Param("employeeId") employeeId: string,
    @CurrentActor() actor: ActorContext,
    @Body() body: UpdateEmployeeRequestDto,
  ) {
    await this.call(() =>
      this.identity.updateEmployee(actor, employeeId, body),
    );
    return { updated: true };
  }

  @Put("/employees/:employeeId/roles")
  @RequiresPermissions(PERMISSIONS.IDENTITY_ROLE_MANAGE)
  @ApiOperation({ summary: "分配员工角色（原子替换）" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "employeeId", description: "员工工号" })
  @ApiBody({ type: AssignRolesRequestDto })
  @ApiOkResponse({ description: "分配完成" })
  @ApiProblemResponses([400, 401, 403, 404])
  async assignRoles(
    @Param("employeeId") employeeId: string,
    @CurrentActor() actor: ActorContext,
    @Body() body: AssignRolesRequestDto,
  ) {
    await this.call(() =>
      this.identity.setEmployeeRoles(actor, employeeId, body.roleCodes),
    );
    return { assigned: true };
  }

  @Post("/departments")
  @RequiresPermissions(PERMISSIONS.IDENTITY_DEPARTMENT_MANAGE)
  @HttpCode(200)
  @ApiOperation({ summary: "创建部门" })
  @ApiIdentityHeaders()
  @ApiBody({ type: UpsertDepartmentRequestDto })
  @ApiOkResponse({ description: "创建完成" })
  @ApiProblemResponses([400, 401, 403])
  async createDepartment(
    @CurrentActor() actor: ActorContext,
    @Body() body: UpsertDepartmentRequestDto,
  ) {
    await this.call(() =>
      this.identity.createDepartment(actor, {
        ...(body.departmentId === undefined
          ? {}
          : { departmentId: body.departmentId }),
        name: body.name,
        parentDepartmentId: body.parentDepartmentId ?? null,
        source: "local",
        ...(body.managerEmployeeId === undefined
          ? {}
          : { managerEmployeeId: body.managerEmployeeId }),
        ...(body.status === undefined ? {} : { status: body.status }),
      }),
    );
    return { created: true };
  }

  @Post("/departments/imports/preview")
  @RequiresPermissions(PERMISSIONS.IDENTITY_DEPARTMENT_MANAGE)
  @UseInterceptors(FileInterceptor("file"))
  @ApiOperation({ summary: "解析部门 CSV 导入文件并预览差异" })
  @ApiIdentityHeaders()
  @ApiProblemResponses([400, 401, 403])
  async previewDepartmentImport(
    @UploadedFile() file?: { buffer: Buffer },
  ) {
    if (file === undefined) throw new BadRequestException("IMPORT_FILE_REQUIRED");
    const records = recordsFromCsv(file.buffer.toString("utf8"));
    return this.identity.previewDepartmentImport(records);
  }

  @Post("/departments/imports")
  @RequiresPermissions(PERMISSIONS.IDENTITY_DEPARTMENT_MANAGE)
  @ApiOperation({ summary: "确认并写入部门 CSV 导入" })
  @ApiIdentityHeaders()
  @ApiBody({ type: DepartmentImportCommitRequestDto })
  @ApiProblemResponses([400, 401, 403])
  async applyDepartmentImport(
    @CurrentActor() actor: ActorContext,
    @Body() body: DepartmentImportCommitRequestDto,
  ) {
    return this.identity.applyDepartmentImport(actor, body.rows);
  }

  @Patch("/departments/:departmentId")
  @RequiresPermissions(PERMISSIONS.IDENTITY_DEPARTMENT_MANAGE)
  @ApiOperation({ summary: "更新部门" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "departmentId", description: "部门 ID" })
  @ApiBody({ type: UpdateDepartmentRequestDto })
  @ApiOkResponse({ description: "更新完成" })
  @ApiProblemResponses([400, 401, 403, 404])
  async updateDepartment(
    @Param("departmentId") departmentId: string,
    @CurrentActor() actor: ActorContext,
    @Body() body: UpdateDepartmentRequestDto,
  ) {
    await this.call(() =>
      this.identity.updateDepartment(actor, departmentId, body),
    );
    return { updated: true };
  }

  @Get("/departments/:departmentId/members")
  @RequiresPermissions(PERMISSIONS.IDENTITY_DEPARTMENT_READ)
  @ApiOperation({ summary: "部门成员列表" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "departmentId", description: "部门 ID" })
  @ApiOkResponse({ type: EmployeeSummaryDto, isArray: true })
  @ApiProblemResponses([400, 401, 403, 404])
  async listDepartmentMembers(@Param("departmentId") departmentId: string) {
    return this.identity.listDepartmentMembers(departmentId);
  }

  @Post("/departments/:departmentId/sync")
  @RequiresPermissions(PERMISSIONS.IDENTITY_SYNC_RUN)
  @ApiOperation({ summary: "立即同步指定部门" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "departmentId", description: "部门 ID" })
  @ApiOkResponse({ description: "同步任务已创建" })
  @ApiProblemResponses([400, 401, 403, 404])
  async syncDepartment(@Param("departmentId") departmentId: string) {
    return this.identity.runLocalSync("manual", departmentId);
  }

  @Delete("/departments/:departmentId")
  @RequiresPermissions(PERMISSIONS.IDENTITY_DEPARTMENT_MANAGE)
  @ApiOperation({ summary: "删除部门（须为空部门）" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "departmentId", description: "部门 ID" })
  @ApiOkResponse({ description: "删除完成" })
  @ApiProblemResponses([400, 401, 403, 404])
  async deleteDepartment(
    @Param("departmentId") departmentId: string,
    @CurrentActor() actor: ActorContext,
  ) {
    await this.call(() => this.identity.deleteDepartment(actor, departmentId));
    return { deleted: true };
  }

  @Get("/sync-runs")
  @RequiresPermissions(PERMISSIONS.IDENTITY_SYNC_RUN)
  @ApiOperation({ summary: "组织同步运行记录" })
  @ApiIdentityHeaders()
  @ApiOkResponse({
    description: "同步记录列表",
    type: SyncRunDto,
    isArray: true,
  })
  @ApiProblemResponses([400, 401, 403])
  async listSyncRuns(@Query() query: ListSyncRunsQueryDto) {
    return this.identity.listSyncRuns(Math.min(100, query.limit ?? 20));
  }

  @Get("/sync/overview")
  @RequiresPermissions(PERMISSIONS.IDENTITY_SYNC_MANAGE)
  @ApiOperation({ summary: "组织同步概览" })
  @ApiIdentityHeaders()
  @ApiOkResponse({ description: "同步概览" })
  @ApiProblemResponses([400, 401, 403])
  async syncOverview() {
    const [config, runs] = await Promise.all([
      this.identity.getSyncConfig(),
      this.identity.listSyncRuns(5),
    ]);
    return {
      config: config === null ? null : this.toSyncConfig(config),
      recentRuns: runs,
    };
  }

  @Get("/sync/config")
  @RequiresPermissions(PERMISSIONS.IDENTITY_SYNC_MANAGE)
  @ApiOperation({ summary: "读取组织同步配置" })
  @ApiIdentityHeaders()
  @ApiOkResponse({ description: "同步配置", type: SyncConfigDto })
  @ApiProblemResponses([400, 401, 403])
  async getSyncConfig() {
    const config = await this.identity.getSyncConfig();
    return config === null ? null : this.toSyncConfig(config);
  }

  @Put("/sync/config")
  @RequiresPermissions(PERMISSIONS.IDENTITY_SYNC_MANAGE)
  @ApiOperation({ summary: "更新组织同步配置" })
  @ApiIdentityHeaders()
  @ApiBody({ type: UpdateSyncConfigRequestDto })
  @ApiOkResponse({ description: "同步配置已更新", type: SyncConfigDto })
  @ApiProblemResponses([400, 401, 403])
  async updateSyncConfig(
    @CurrentActor() actor: ActorContext,
    @Body() body: UpdateSyncConfigRequestDto,
  ) {
    const config = await this.call(() =>
      this.identity.updateSyncConfig(actor, body),
    );
    return this.toSyncConfig(config);
  }

  @Get("/sync-runs/:runId")
  @RequiresPermissions(PERMISSIONS.IDENTITY_SYNC_RUN)
  @ApiOperation({ summary: "同步运行详情" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "runId", description: "同步运行 ID" })
  @ApiOkResponse({ description: "同步运行详情", type: SyncRunDto })
  @ApiProblemResponses([400, 401, 403, 404])
  async getSyncRun(@Param("runId") runId: string) {
    const run = await this.identity.getSyncRun(runId);
    if (run === null) throw new NotFoundException("SYNC_RUN_NOT_FOUND");
    return run;
  }

  @Get("/sync-runs/:runId/items")
  @RequiresPermissions(PERMISSIONS.IDENTITY_SYNC_RUN)
  @ApiOperation({ summary: "同步运行明细" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "runId", description: "同步运行 ID" })
  @ApiOkResponse({
    description: "同步明细",
    type: SyncRunItemDto,
    isArray: true,
  })
  @ApiProblemResponses([400, 401, 403, 404])
  async listSyncRunItems(@Param("runId") runId: string) {
    const run = await this.identity.getSyncRun(runId);
    if (run === null) throw new NotFoundException("SYNC_RUN_NOT_FOUND");
    const items = await this.identity.listSyncRunItems(runId);
    return items.map((item) => ({
      ...item,
      startedAt: item.startedAt?.toISOString() ?? null,
      finishedAt: item.finishedAt?.toISOString() ?? null,
    }));
  }

  @Post("/sync/run")
  @RequiresPermissions(PERMISSIONS.IDENTITY_SYNC_RUN)
  @HttpCode(200)
  @ApiOperation({ summary: "触发本地组织同步并入库" })
  @ApiIdentityHeaders()
  @ApiOkResponse({ description: "同步任务已创建" })
  @ApiProblemResponses([400, 401, 403])
  async triggerSync() {
    return this.identity.runLocalSync("manual");
  }

  @Post("/sync-runs/:runId/retry")
  @RequiresPermissions(PERMISSIONS.IDENTITY_SYNC_RUN)
  @HttpCode(200)
  @ApiOperation({ summary: "重试同步运行" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "runId", description: "同步运行 ID" })
  @ApiOkResponse({ description: "重试结果" })
  @ApiProblemResponses([400, 401, 403, 404])
  async retrySync(@Param("runId") runId: string) {
    return this.call(() => this.identity.retryLocalSync(runId));
  }

  @Post("/sync-runs/:runId/cancel")
  @RequiresPermissions(PERMISSIONS.IDENTITY_SYNC_RUN)
  @ApiOperation({ summary: "取消待执行同步运行" })
  @ApiIdentityHeaders()
  @ApiParam({ name: "runId", description: "同步运行 ID" })
  @ApiOkResponse({ description: "同步运行已取消" })
  @ApiProblemResponses([400, 401, 403, 404])
  async cancelSyncRun(@Param("runId") runId: string) {
    await this.call(() => this.identity.cancelSyncRun(runId));
    return { cancelled: true };
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
    @Res({ passthrough: true }) res: Response,
    @CurrentActor() actor: ActorContext,
    @Body() body?: LogoutRequestDto,
  ): Promise<void> {
    if (body?.sessionId !== undefined && body.sessionId !== actor.sessionId) {
      throw new BadRequestException("SESSION_ID_MISMATCH");
    }
    this.clearSessionCookies(res);
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
  loginWithPassword(
    @Res({ passthrough: true }) res: Response,
    @Body() body: LoginRequestDto,
  ) {
    if (body.envelope === undefined || typeof body.envelope !== "object") {
      throw new BadRequestException("LOGIN_ENCRYPTION_INVALID_ENVELOPE");
    }

    return this.identity
      .loginWithEncryptedPassword(body.envelope as EncryptedLoginEnvelope)
      .then((result) => {
        this.setSessionCookies(res, result.session, result.actor.employeeId);
        return result;
      })
      .catch((error: unknown) => {
        const msg = error instanceof Error ? error.message : "LOGIN_FAILED";
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
    @Query() query: DingTalkSsoStartQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (this.dingtalkSso === undefined) {
      throw new BadRequestException("DINGTALK_SSO_DISABLED");
    }
    const result = await this.dingtalkSso.startSso(query.returnTo ?? "/");
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
    @Query() query: DingTalkSsoCallbackQueryDto,
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
        query.state,
        query.code,
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
  async completeDingTalkSso(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
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

    try {
      const result = await this.dingtalkSso.completeSso(handoffToken);
      res.setHeader("Set-Cookie", [
        "dingtalk_handoff=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0",
        ...this.sessionCookieHeaders(result.session, result.actor.employeeId),
      ]);
      return result;
    } catch (error: unknown) {
      if (error instanceof Error) {
        if (error.message === "INVALID_CREDENTIALS") {
          throw new UnauthorizedException("INVALID_CREDENTIALS");
        }
        if (error.message.startsWith("DINGTALK_SSO_")) {
          throw new BadRequestException(error.message);
        }
      }
      throw error;
    }
  }

  private sessionCookieHeaders(
    session: { sessionId: string; expiresAt: string | Date },
    employeeId: string,
  ): string[] {
    const expires =
      session.expiresAt instanceof Date
        ? session.expiresAt
        : new Date(session.expiresAt);
    const maxAge = Math.max(
      0,
      Math.floor((expires.getTime() - Date.now()) / 1000),
    );
    // HttpOnly 防止 XSS 读取；SameSite=Lax 缓解 CSRF；Secure 防止明文 HTTP 降级泄露，
    // 仅在 HTTPS 环境（生产或显式覆盖）开启，以免影响本地 http 开发。
    const flags = buildSessionCookieAttributes(shouldSecureSessionCookie());
    return [
      `aihub_sid=${session.sessionId}; ${flags}; Max-Age=${maxAge}`,
      `aihub_eid=${employeeId}; ${flags}; Max-Age=${maxAge}`,
    ];
  }

  private setSessionCookies(
    res: Response,
    session: { sessionId: string; expiresAt: string | Date },
    employeeId: string,
  ): void {
    res.setHeader("Set-Cookie", this.sessionCookieHeaders(session, employeeId));
  }

  private clearSessionCookies(res: Response): void {
    const flags = "Path=/; HttpOnly; SameSite=Lax; Max-Age=0";
    res.setHeader("Set-Cookie", [
      `aihub_sid=; ${flags}`,
      `aihub_eid=; ${flags}`,
    ]);
  }

  private toSyncConfig(config: {
    enabled: boolean;
    schedule: string | null;
    externalOrgId: string | null;
    lastUpdatedByEmployeeId: string | null;
    updatedAt: Date;
  }) {
    return {
      enabled: config.enabled,
      schedule: config.schedule,
      externalOrgId: config.externalOrgId,
      lastUpdatedByEmployeeId: config.lastUpdatedByEmployeeId,
      updatedAt: config.updatedAt.toISOString(),
    };
  }

  private async call<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      this.rethrow(error);
    }
  }

  private rethrow(error: unknown): never {
    const code =
      error instanceof Error ? error.message : "IDENTITY_REQUEST_FAILED";
    if (code.endsWith("_NOT_FOUND")) throw new NotFoundException(code);
    if (code.endsWith("_NOT_EMPTY")) throw new BadRequestException(code);
    throw new BadRequestException(code);
  }
}

/** Simple cookie reader — mirrors the pattern in csrf.ts. */
function readCookie(cookieHeader: string, name: string): string | undefined {
  for (const part of cookieHeader.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=") || undefined;
  }
  return undefined;
}

function recordsFromCsv(text: string): Record<string, string>[] {
  const rows = parseCsv(text.replace(/^\uFEFF/, ""));
  if (rows.length === 0) return [];
  const headers = rows[0]!.map((header) => header.trim());
  return rows.slice(1).map((values) => {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = values[index]?.trim() ?? "";
    });
    return record;
  });
}
