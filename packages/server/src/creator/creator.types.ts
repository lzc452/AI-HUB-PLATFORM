import type {
  ActorContext,
  ApplicationStatus,
  AuthorizationDecision,
} from "@ai-hub/contracts";

/** 创作者视角的应用记录。 */
export interface CreatorApplicationRecord {
  applicationId: string;
  name: string;
  status: ApplicationStatus;
  categoryId: string;
  tagIds: readonly string[];
  publishedAt: string | null;
  ratingAverage: number | null;
  likeCount: number;
  /** 审核中的待生效版本（仅 status=in_review 时非空，供创作者撤回审核）。 */
  pendingVersionId: string | null;
}

/** 我的应用列表结果（预留分页结构）。 */
export interface CreatorApplicationListResult {
  items: readonly CreatorApplicationRecord[];
  page: number;
  pageSize: number;
  total: number;
}

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
    /** 无任何检查点时为 no_record，绝不虚构通过/失败。 */
    status: "passed" | "no_record";
    checks: readonly {
      code: string;
      label: string;
      status: "passed" | "safe" | "warning" | "info" | "failed";
      detail: string | null;
    }[];
  }>;
  getAggregateMetrics(applicationId: string): Promise<{
    redirectCount: number;
    downloadCount: number;
    qrDisplayCount: number;
    likeCount: number;
    ratingAverage: number | null;
    reviewCount: number;
  }>;
  listByEmployee(
    employeeId: string,
  ): Promise<readonly CreatorApplicationRecord[]>;
}

export interface CreatorAuthorizationPort {
  authorize(request: {
    actor: ActorContext;
    action: string;
    resourceType: string;
  }): Promise<AuthorizationDecision>;
}
