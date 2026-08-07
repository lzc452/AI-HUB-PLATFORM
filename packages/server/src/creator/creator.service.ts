import type { ActorContext } from "@ai-hub/contracts";
import type {
  CreatorApplicationListResult,
  CreatorAuthorizationPort,
  CreatorRepository,
} from "./creator.types.js";

/** 我的应用列表默认分页大小（本期整页返回，仅预留分页结构）。 */
const DEFAULT_PAGE_SIZE = 20;

export class CreatorService {
  constructor(
    private readonly repository: CreatorRepository,
    private readonly authorization: CreatorAuthorizationPort,
  ) {}

  async getApplicationSummary(actor: ActorContext, applicationId: string) {
    const decision = await this.authorization.authorize({
      actor,
      action: "read",
      resourceType: "creator",
    });
    if (!decision.allowed) throw new Error("NOT_AUTHORIZED");
    const team = await this.repository.findTeam(applicationId);
    if (
      team === null ||
      (team.ownerEmployeeId !== actor.employeeId &&
        team.maintainerEmployeeId !== actor.employeeId)
    ) {
      throw new Error("CREATOR_ACCESS_FORBIDDEN");
    }
    const [versionDiff, validationReport, metrics] = await Promise.all([
      this.repository.getVersionDiff(applicationId),
      this.repository.getValidationReport(applicationId),
      this.repository.getAggregateMetrics(applicationId),
    ]);
    return { versionDiff, validationReport, metrics };
  }

  async listMyApplications(
    actor: ActorContext,
  ): Promise<CreatorApplicationListResult> {
    const decision = await this.authorization.authorize({
      actor,
      action: "read",
      resourceType: "creator",
    });
    if (!decision.allowed) throw new Error("NOT_AUTHORIZED");
    const items = await this.repository.listByEmployee(actor.employeeId);
    return {
      items,
      page: 1,
      pageSize: items.length > 0 ? items.length : DEFAULT_PAGE_SIZE,
      total: items.length,
    };
  }
}
