export type EmployeeId = string;
export type ResourceId = string;

export interface ActorContext {
  employeeId: EmployeeId;
  roleCodes: readonly string[];
  departmentIds: readonly string[];
  primaryDepartmentId: string;
  sessionId: string;
}

export interface AuthorizationRequest {
  actor: ActorContext;
  action: string;
  resourceType: string;
  resourceId?: ResourceId;
  audience?: {
    departmentId?: string;
  };
}

export interface AuthorizationDecision {
  allowed: boolean;
  reasonCode: string;
}

export interface EmployeeSummary {
  employeeId: EmployeeId;
  displayName: string;
  status: "pending_binding" | "active" | "disabled" | "archived";
  primaryDepartmentId: string;
}

export interface DepartmentSummary {
  departmentId: string;
  name: string;
  parentDepartmentId: string | null;
  source: "local" | "dingtalk";
}
