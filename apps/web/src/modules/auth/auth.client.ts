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
