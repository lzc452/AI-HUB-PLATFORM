import type { ActorContext } from "@ai-hub/contracts";
import type {
  CreatorAuthorizationPort,
  CreatorRepository,
} from "./creator.types.js";

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
}
