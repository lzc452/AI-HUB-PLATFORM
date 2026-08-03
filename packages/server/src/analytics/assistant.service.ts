import type { ActorContext } from "@ai-hub/contracts";
import type {
  AssistantAuditRepository,
  AssistantRequest,
  AssistantResult,
  DifyAssistantPort,
  DifyRequest,
} from "./assistant.types.js";

const SAFE_CONTEXT_KEYS = new Set(["metricKey", "value", "day", "unit"]);
const FALLBACK_ANSWER =
  "External assistant unavailable. Use the platform dashboard or contact an operator.";

function minimumContext(
  context: Readonly<Record<string, unknown>>,
): DifyRequest["context"] {
  const output: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(context)) {
    if (!SAFE_CONTEXT_KEYS.has(key)) continue;
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      output[key] = value;
    }
  }
  return output;
}

export class AnalyticsAssistantService {
  constructor(
    private readonly audit: AssistantAuditRepository,
    private readonly provider: DifyAssistantPort,
  ) {}

  async ask(
    actor: ActorContext,
    request: AssistantRequest,
  ): Promise<AssistantResult> {
    const review = await this.audit.reviewAuthorization(actor, request);
    if (!review.allowed) {
      await this.audit.recordAudit({
        actorEmployeeId: actor.employeeId,
        action: "analytics.assistant.denied",
        details: { reason: review.reason },
      });
      throw new Error("ASSISTANT_AUTHORIZATION_REQUIRED");
    }
    const providerRequest: DifyRequest = {
      question: request.question.slice(0, 2000),
      context: minimumContext(request.context),
    };
    await this.audit.recordAudit({
      actorEmployeeId: actor.employeeId,
      action: "analytics.assistant.requested",
      details: {
        questionLength: providerRequest.question.length,
        contextKeys: Object.keys(providerRequest.context),
      },
    });
    try {
      const response = await this.provider.ask(providerRequest);
      await this.audit.recordAudit({
        actorEmployeeId: actor.employeeId,
        action: "analytics.assistant.completed",
        details: { providerRequestId: response.providerRequestId ?? null },
      });
      return { status: "ok", answer: response.answer };
    } catch (error) {
      await this.audit.recordAudit({
        actorEmployeeId: actor.employeeId,
        action: "analytics.assistant.failed",
        details: {
          code: error instanceof Error ? error.message : "DIFY_FAILED",
        },
      });
      return { status: "degraded", answer: FALLBACK_ANSWER };
    }
  }
}
