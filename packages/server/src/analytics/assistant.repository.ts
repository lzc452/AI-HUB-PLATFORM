import type { ActorContext } from "@ai-hub/contracts";
import { OutboxStore, type DatabaseSchema } from "@ai-hub/database";
import type { Kysely } from "kysely";
import type {
  AssistantAuditRecord,
  AssistantAuthorizationReview,
  AssistantAuditRepository,
  AssistantRequest,
} from "./assistant.types.js";
import { metricDefinitions } from "./metric-dictionary.js";

export class KyselyAssistantAuditRepository
  implements AssistantAuditRepository
{
  constructor(private readonly db: Kysely<DatabaseSchema>) {}

  async reviewAuthorization(
    actor: ActorContext,
    _request: AssistantRequest,
  ): Promise<AssistantAuthorizationReview> {
    void _request;
    const metricKey = _request.context.metricKey;
    const metric = metricDefinitions.find(
      (definition) => definition.metricKey === metricKey,
    );
    const segment =
      typeof metricKey === "string" ? metricKey.split(".")[0] : "";
    const segmentRole = `analytics_${segment}_reader`;
    const allowed =
      metric !== undefined &&
      [
        "analytics_assistant_user",
        "analytics_operator",
        "super_admin",
        segmentRole,
        ...(segment === "innovation" ? ["demand_operator"] : []),
      ].some((role) => actor.roleCodes.includes(role));
    return {
      allowed,
      reason: allowed
        ? "ALLOW_EXPLICIT_REVIEW"
        : metric === undefined
          ? "DENY_METRIC_AUDIENCE"
          : "DENY_REVIEW_REQUIRED",
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

  appendOutbox(input: Parameters<OutboxStore["append"]>[0]): Promise<boolean> {
    return new OutboxStore(this.db).append(input);
  }
}
