import type { ActorContext } from "@ai-hub/contracts";
import type { DatabaseSchema } from "@ai-hub/database";
import type { Kysely } from "kysely";
import type {
  AssistantAuditRecord,
  AssistantAuthorizationReview,
  AssistantAuditRepository,
  AssistantRequest,
} from "./assistant.types.js";

export class KyselyAssistantAuditRepository implements AssistantAuditRepository {
  constructor(private readonly db: Kysely<DatabaseSchema>) {}

  async reviewAuthorization(
    actor: ActorContext,
    _request: AssistantRequest,
  ): Promise<AssistantAuthorizationReview> {
    void _request;
    const allowed = [
      "analytics_assistant_user",
      "analytics_operator",
      "super_admin",
    ].some((role) => actor.roleCodes.includes(role));
    return {
      allowed,
      reason: allowed ? "ALLOW_EXPLICIT_REVIEW" : "DENY_REVIEW_REQUIRED",
    };
  }

  async recordAudit(input: AssistantAuditRecord): Promise<void> {
    await this.db
      .insertInto("analytics_audit_events")
      .values({
        actor_employee_id: input.actorEmployeeId,
        action: input.action,
        aggregate_type: "assistant",
        aggregate_id: input.actorEmployeeId,
        details: input.details,
      })
      .execute();
  }
}
