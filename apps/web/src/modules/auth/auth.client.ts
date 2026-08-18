import type {
  ActorContext,
  ChallengeResponse,
  DepartmentSummary,
  EmployeeSummary,
  LoginOptions,
  LoginSession,
} from "@ai-hub/contracts";

import { apiFetch, apiUploadMultipart } from "../../shared/api/client";

export interface LoginResponse {
  actor: ActorContext;
  session?: LoginSession;
}

/** Fetch available login methods. */
export function fetchLoginOptions(): Promise<LoginOptions> {
  return apiFetch<LoginOptions>("/internal/identity/login/options");
}

/** Fetch an encryption challenge (RSA public key + nonce). */
export function fetchLoginChallenge(): Promise<ChallengeResponse> {
  return apiFetch<ChallengeResponse>("/internal/identity/login/challenge");
}

/**
 * Login with an encrypted envelope.
 * Call `buildLoginEnvelope()` first to construct the envelope from a challenge.
 */
export function loginWithEnvelope(
  employeeId: string,
  envelope: unknown,
): Promise<LoginResponse> {
  return apiFetch<LoginResponse>("/internal/identity/login/password", {
    method: "POST",
    body: JSON.stringify({ employeeId, envelope }),
  });
}

/** Legacy plaintext login (backward compatible, deprecated). */
export function loginWithPassword(
  employeeId: string,
  password: string,
): Promise<LoginResponse> {
  return apiFetch<LoginResponse>("/internal/identity/login/password", {
    method: "POST",
    body: JSON.stringify({ employeeId, password }),
  });
}

/** Start DingTalk SSO flow. Returns redirect URL. */
export function startDingTalkSso(
  returnTo: string,
): Promise<{ redirectUrl: string }> {
  return apiFetch<{ redirectUrl: string }>(
    `/internal/identity/login/dingtalk/start?returnTo=${encodeURIComponent(returnTo)}`,
  );
}

/** Complete DingTalk SSO after OAuth callback. */
export function completeDingTalkSso(): Promise<LoginResponse> {
  return apiFetch<LoginResponse>("/internal/identity/login/dingtalk/complete", {
    method: "POST",
  });
}

export function logoutSession(): Promise<void> {
  return apiFetch<void>("/internal/identity/logout", {
    method: "POST",
  });
}

export function fetchActor(): Promise<ActorContext> {
  return apiFetch<ActorContext>("/internal/identity/actor");
}

export function listEmployees(): Promise<EmployeeSummary[]> {
  return apiFetch<EmployeeSummary[]>("/internal/identity/employees");
}

export function listDepartments(): Promise<DepartmentSummary[]> {
  return apiFetch<DepartmentSummary[]>("/internal/identity/departments");
}

export interface IdentityRoleSummary {
  roleId: string;
  roleName: string;
  roleType: "system" | "custom";
  scope: string;
  memberCount: number;
  creator: string | null;
  status: "active" | "disabled";
  updatedAt: string;
}

export function listRoles(): Promise<IdentityRoleSummary[]> {
  return apiFetch<IdentityRoleSummary[]>("/internal/identity/roles");
}

export function createRole(input: {
  roleCode?: string;
  name: string;
  permissions: string[];
}): Promise<{ created: boolean }> {
  return apiFetch("/internal/identity/roles", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateRole(
  roleId: string,
  input: {
    name?: string;
    permissions?: string[];
    status?: "active" | "disabled";
  },
): Promise<{ updated: boolean }> {
  return apiFetch(`/internal/identity/roles/${encodeURIComponent(roleId)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function disableRole(roleId: string): Promise<{ disabled: boolean }> {
  return apiFetch(`/internal/identity/roles/${encodeURIComponent(roleId)}/disable`, {
    method: "POST",
  });
}

export function deleteRole(roleId: string): Promise<{ deleted: boolean }> {
  return apiFetch(`/internal/identity/roles/${encodeURIComponent(roleId)}`, {
    method: "DELETE",
  });
}

export interface PermissionNode {
  key: string;
  title: string;
  children: string[];
}

export interface RoleTemplate {
  roleCode: string;
  name: string;
  permissions: string[];
}

export interface RoleDetail extends IdentityRoleSummary {
  permissions: string[];
}

export function listPermissionCatalog(): Promise<PermissionNode[]> {
  return apiFetch<PermissionNode[]>("/internal/identity/roles/permission-catalog");
}

export function listRoleTemplates(): Promise<RoleTemplate[]> {
  return apiFetch<RoleTemplate[]>("/internal/identity/roles/templates");
}

export function getRoleDetail(roleId: string): Promise<RoleDetail> {
  return apiFetch<RoleDetail>(
    `/internal/identity/roles/${encodeURIComponent(roleId)}`,
  );
}

export function copyRole(
  roleId: string,
  input: { roleCode: string; name: string },
): Promise<{ created: boolean }> {
  return apiFetch(
    `/internal/identity/roles/${encodeURIComponent(roleId)}/copy`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function bulkDisableRoles(
  roleIds: string[],
): Promise<{ disabled: number }> {
  return apiFetch("/internal/identity/roles/bulk-disable", {
    method: "POST",
    body: JSON.stringify({ roleIds }),
  });
}

// ---------------------------------------------------------------------------
// 组织管理（批次 3）：员工分页/更新、部门 CRUD、角色分配、同步记录
// ---------------------------------------------------------------------------

export interface EmployeePageResult {
  items: EmployeeSummary[];
  total: number;
}

export function listEmployeesPage(input?: {
  keyword?: string;
  page?: number;
  pageSize?: number;
}): Promise<EmployeePageResult> {
  const search = new URLSearchParams();
  if (input?.keyword) search.set("keyword", input.keyword);
  search.set("page", String(input?.page ?? 1));
  search.set("pageSize", String(input?.pageSize ?? 20));
  return apiFetch<EmployeePageResult>(
    `/internal/identity/employees/page?${search.toString()}`,
  );
}

export function updateEmployee(
  employeeId: string,
  input: {
    displayName?: string;
    status?: "active" | "disabled" | "pending_binding";
    primaryDepartmentId?: string;
    roleCodes?: string[];
  },
): Promise<{ updated: boolean }> {
  return apiFetch(
    `/internal/identity/employees/${encodeURIComponent(employeeId)}`,
    { body: JSON.stringify(input), method: "PATCH" },
  );
}

export interface CreateEmployeeInput {
  employeeId: string;
  displayName: string;
  primaryDepartmentId: string;
  roleCodes?: string[];
  password: string;
  status?: "active" | "disabled" | "pending_binding";
}

export function createEmployee(
  input: CreateEmployeeInput,
): Promise<{ created: boolean }> {
  return apiFetch("/internal/identity/employees", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function archiveEmployee(
  employeeId: string,
): Promise<{ archived: boolean }> {
  return apiFetch(
    `/internal/identity/employees/${encodeURIComponent(employeeId)}`,
    { method: "DELETE" },
  );
}

export function bulkDisableEmployees(
  employeeIds: string[],
): Promise<{ disabled: number }> {
  return apiFetch("/internal/identity/employees/bulk-disable", {
    method: "POST",
    body: JSON.stringify({ employeeIds }),
  });
}

export function resetEmployeePassword(
  employeeId: string,
  newPassword: string,
): Promise<{ reset: boolean }> {
  return apiFetch(
    `/internal/identity/employees/${encodeURIComponent(employeeId)}/reset-password`,
    { method: "POST", body: JSON.stringify({ newPassword }) },
  );
}

export interface EmployeeImportPreviewRow {
  employeeId: string;
  displayName: string;
  primaryDepartmentId: string;
  roleCodes: string[];
  status: "active" | "disabled" | "pending_binding";
  passwordProvided: boolean;
  password?: string | null;
  exists: boolean;
  conflicts: Record<string, { current: string; incoming: string }>;
}

export interface EmployeeImportPreview {
  rows: EmployeeImportPreviewRow[];
  summary: { total: number; create: number; update: number; invalid: number };
  errors: string[];
}

export function previewEmployeeImport(
  file: File,
): Promise<EmployeeImportPreview> {
  const form = new FormData();
  form.append("file", file);
  return apiUploadMultipart<EmployeeImportPreview>(
    "/internal/identity/employees/imports/preview",
    form,
  );
}

export function applyEmployeeImport(
  rows: Array<{
    employeeId: string;
    displayName: string;
    primaryDepartmentId: string;
    roleCodes?: string[];
    password?: string | null;
    status?: "active" | "disabled" | "pending_binding";
  }>,
): Promise<{ created: number; updated: number; failed: number; errors: string[] }> {
  return apiFetch("/internal/identity/employees/imports", {
    method: "POST",
    body: JSON.stringify({ rows }),
  });
}

export function assignEmployeeRoles(
  employeeId: string,
  roleCodes: string[],
): Promise<{ assigned: boolean }> {
  return apiFetch(
    `/internal/identity/employees/${encodeURIComponent(employeeId)}/roles`,
    { body: JSON.stringify({ roleCodes }), method: "PUT" },
  );
}

export function createDepartment(input: {
  departmentId?: string;
  name: string;
  parentDepartmentId?: string | null;
  managerEmployeeId?: string | null;
  status?: "active" | "disabled";
}): Promise<{ created: boolean }> {
  return apiFetch("/internal/identity/departments", {
    body: JSON.stringify(input),
    method: "POST",
  });
}

export function updateDepartment(
  departmentId: string,
  input: {
    name?: string;
    parentDepartmentId?: string | null;
    managerEmployeeId?: string | null;
    status?: "active" | "disabled";
  },
): Promise<{ updated: boolean }> {
  return apiFetch(
    `/internal/identity/departments/${encodeURIComponent(departmentId)}`,
    { body: JSON.stringify(input), method: "PATCH" },
  );
}

export function deleteDepartment(
  departmentId: string,
): Promise<{ deleted: boolean }> {
  return apiFetch(
    `/internal/identity/departments/${encodeURIComponent(departmentId)}`,
    { method: "DELETE" },
  );
}

export function listDepartmentMembers(
  departmentId: string,
): Promise<EmployeeSummary[]> {
  return apiFetch<EmployeeSummary[]>(
    `/internal/identity/departments/${encodeURIComponent(departmentId)}/members`,
  );
}

export function syncDepartment(
  departmentId: string,
): Promise<{ syncRunId: string }> {
  return apiFetch(
    `/internal/identity/departments/${encodeURIComponent(departmentId)}/sync`,
    { method: "POST" },
  );
}

export interface DepartmentImportPreviewRow {
  departmentId: string;
  name: string;
  parentDepartmentId: string | null;
  managerEmployeeId: string | null;
  status: "active" | "disabled";
  exists: boolean;
  conflicts: Record<string, { current: string; incoming: string }>;
}

export interface DepartmentImportPreview {
  rows: DepartmentImportPreviewRow[];
  summary: { total: number; create: number; update: number; invalid: number };
  errors: string[];
}

export function previewDepartmentImport(
  file: File,
): Promise<DepartmentImportPreview> {
  const form = new FormData();
  form.append("file", file);
  return apiUploadMultipart<DepartmentImportPreview>(
    "/internal/identity/departments/imports/preview",
    form,
  );
}

export function applyDepartmentImport(
  rows: Array<{
    departmentId: string;
    name: string;
    parentDepartmentId?: string | null;
    managerEmployeeId?: string | null;
    status?: "active" | "disabled";
  }>,
): Promise<{ created: number; updated: number; failed: number; errors: string[] }> {
  return apiFetch("/internal/identity/departments/imports", {
    method: "POST",
    body: JSON.stringify({ rows }),
  });
}

export interface SyncRunRecord {
  syncRunId: string;
  mode: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  summary: unknown;
}

export function listSyncRuns(limit = 20): Promise<SyncRunRecord[]> {
  return apiFetch<SyncRunRecord[]>(
    `/internal/identity/sync-runs?limit=${limit}`,
  );
}

export function triggerSync(): Promise<{ syncRunId: string }> {
  return apiFetch("/internal/identity/sync/run", { method: "POST" });
}

export function retrySyncRun(
  runId: string,
): Promise<{ syncRunId: string }> {
  return apiFetch(
    `/internal/identity/sync-runs/${encodeURIComponent(runId)}/retry`,
    { method: "POST" },
  );
}

export function cancelSyncRun(
  runId: string,
): Promise<{ cancelled: boolean }> {
  return apiFetch(
    `/internal/identity/sync-runs/${encodeURIComponent(runId)}/cancel`,
    { method: "POST" },
  );
}

export interface SyncRunItem {
  syncRunItemId: string;
  syncRunId: string;
  objectType: string;
  objectId: string;
  status: string;
  processedCount: number;
  successCount: number;
  failureCount: number;
  errorCode: string | null;
  startedAt: string | null;
  finishedAt: string | null;
}

export function getSyncRun(runId: string): Promise<SyncRunRecord> {
  return apiFetch<SyncRunRecord>(
    `/internal/identity/sync-runs/${encodeURIComponent(runId)}`,
  );
}

export function listSyncRunItems(runId: string): Promise<SyncRunItem[]> {
  return apiFetch<SyncRunItem[]>(
    `/internal/identity/sync-runs/${encodeURIComponent(runId)}/items`,
  );
}

export interface SyncConfigRecord {
  enabled: boolean;
  schedule: string | null;
  externalOrgId: string | null;
  lastUpdatedByEmployeeId: string | null;
  updatedAt: string;
}

export function getSyncConfig(): Promise<SyncConfigRecord | null> {
  return apiFetch<SyncConfigRecord | null>("/internal/identity/sync/config");
}

export function updateSyncConfig(input: {
  enabled?: boolean;
  schedule?: string | null;
  externalOrgId?: string | null;
}): Promise<SyncConfigRecord> {
  return apiFetch<SyncConfigRecord>("/internal/identity/sync/config", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}
