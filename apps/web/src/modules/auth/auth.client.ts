import type {
  ActorContext,
  ChallengeResponse,
  DepartmentSummary,
  EmployeeSummary,
  LoginOptions,
  LoginSession,
} from "@ai-hub/contracts";

import { apiFetch } from "../../shared/api/client";

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

export function logoutSession(sessionId: string): Promise<void> {
  return apiFetch<void>("/internal/identity/logout", {
    method: "POST",
    body: JSON.stringify({ sessionId }),
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
  },
): Promise<{ updated: boolean }> {
  return apiFetch(
    `/internal/identity/employees/${encodeURIComponent(employeeId)}`,
    { body: JSON.stringify(input), method: "PATCH" },
  );
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
  departmentId: string;
  name: string;
  parentDepartmentId?: string | null;
}): Promise<{ created: boolean }> {
  return apiFetch("/internal/identity/departments", {
    body: JSON.stringify({ ...input, source: "local" }),
    method: "POST",
  });
}

export function updateDepartment(
  departmentId: string,
  input: { name?: string; parentDepartmentId?: string | null },
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

export function triggerSync(): Promise<{ accepted: boolean }> {
  return apiFetch("/internal/identity/sync/run", { method: "POST" });
}
