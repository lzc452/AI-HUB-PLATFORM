import type { ActorContext } from "@ai-hub/contracts";
import type {
  AssistantAuditRepository,
  AssistantRequest,
  AssistantResult,
  DifyAssistantPort,
  DifyRequest,
} from "./assistant.types.js";
import { metricDefinitions } from "./metric-dictionary.js";
import type { AnalyticsBehaviorEventRecorder } from "./analytics.types.js";

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

function sanitizeQuestion(question: string): string {
  return question
    .replace(/\bE\d{3,}\b/giu, "[REDACTED]")
    .replace(/https?:\/\/[^\s]+/giu, "[REDACTED]")
    .replace(/\b[^\s]+\.(?:pdf|docx?|xlsx?|png|jpe?g|zip)\b/giu, "[REDACTED]")
    .replace(/\b(?:qr\s*code|anonymous\s+identity)\b/giu, "[REDACTED]");
}

export class AnalyticsAssistantService {
  constructor(
    private readonly audit: AssistantAuditRepository,
    private readonly provider: DifyAssistantPort,
    private readonly analyticsEvents?: AnalyticsBehaviorEventRecorder,
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
    const metricKey = request.context.metricKey;
    if (
      typeof metricKey !== "string" ||
      !metricDefinitions.some(
        (definition) => definition.metricKey === metricKey,
      )
    ) {
      await this.audit.recordAudit({
        actorEmployeeId: actor.employeeId,
        action: "analytics.assistant.denied",
        details: { reason: "METRIC_AUDIENCE_NOT_AUTHORIZED" },
      });
      throw new Error("ASSISTANT_AUDIENCE_NOT_AUTHORIZED");
    }
    const providerRequest: DifyRequest = {
      question: sanitizeQuestion(request.question).slice(0, 2000),
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
    await this.analyticsEvents?.record(actor, {
      eventName: "assistant_requested",
      aggregateType: "assistant",
      aggregateId: actor.sessionId,
      occurredAt: new Date().toISOString(),
      idempotencyKey: `assistant-requested:${actor.sessionId}:${Date.now()}`,
      metadata: { metricKey: String(providerRequest.context.metricKey ?? "") },
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
      await this.analyticsEvents?.record(actor, {
        eventName: "assistant_failed",
        aggregateType: "assistant",
        aggregateId: actor.sessionId,
        occurredAt: new Date().toISOString(),
        idempotencyKey: `assistant-failed:${actor.sessionId}:${Date.now()}`,
        metadata: {
          code: error instanceof Error ? error.message : "DIFY_FAILED",
        },
      });
      return { status: "degraded", answer: FALLBACK_ANSWER };
    }
  }
}
