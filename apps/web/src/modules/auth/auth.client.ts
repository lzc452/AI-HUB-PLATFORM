import type {
  ActorContext,
  DepartmentSummary,
  EmployeeSummary,
} from "@ai-hub/contracts";

import { apiFetch } from "../../shared/api/client";

export interface LoginResponse {
  actor: ActorContext;
}

export function loginWithPassword(
  employeeId: string,
  password: string,
): Promise<LoginResponse> {
  return apiFetch<LoginResponse>("/internal/identity/login/password", {
    method: "POST",
    body: JSON.stringify({ employeeId, password }),
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
