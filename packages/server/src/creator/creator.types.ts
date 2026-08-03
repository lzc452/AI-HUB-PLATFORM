import type { ActorContext, AuthorizationDecision } from "@ai-hub/contracts";

export interface CreatorRepository {
  findTeam(applicationId: string): Promise<{
    ownerEmployeeId: string;
    maintainerEmployeeId: string;
  } | null>;
  getVersionDiff(applicationId: string): Promise<{
    fromVersion: string;
    toVersion: string;
    changedFields: readonly string[];
  }>;
  getValidationReport(applicationId: string): Promise<{
    status: "passed" | "failed";
    checks: readonly { name: string; status: "passed" | "failed" }[];
  }>;
  getAggregateMetrics(applicationId: string): Promise<{
    redirectCount: number;
    downloadCount: number;
    qrDisplayCount: number;
    likeCount: number;
    ratingAverage: number | null;
    reviewCount: number;
  }>;
}

export interface CreatorAuthorizationPort {
  authorize(request: {
    actor: ActorContext;
    action: string;
    resourceType: string;
  }): Promise<AuthorizationDecision>;
}
