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
const SAFE_UNITS = new Set(["count", "ratio", "milliseconds"]);
const FALLBACK_ANSWER =
  "External assistant unavailable. Use the platform dashboard or contact an operator.";

function minimumContext(
  context: Readonly<Record<string, unknown>>,
): DifyRequest["context"] {
  const output: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(context)) {
    if (!SAFE_CONTEXT_KEYS.has(key)) continue;
    if (typeof value === "number" || typeof value === "boolean") {
      output[key] = value;
    } else if (
      key === "metricKey" &&
      typeof value === "string" &&
      /^[a-z]+\.[a-z_]+$/u.test(value)
    ) {
      output[key] = value;
    } else if (
      key === "day" &&
      typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}$/u.test(value)
    ) {
      output[key] = value;
    } else if (
      key === "unit" &&
      typeof value === "string" &&
      SAFE_UNITS.has(value)
    ) {
      output[key] = value;
    }
  }
  return output;
}

function sanitizeQuestion(question: string): string {
  return question
    .replace(/\b(?:E\d{3,}|employee[-_ ]?\d+)\b/giu, "[REDACTED]")
    .replace(/(?:https?|ftp|data):[^\s]+/giu, "[REDACTED]")
    .replace(/(?:[A-Z]:\\|\/)[^\s]+/gu, "[REDACTED]")
    .replace(/\b[^\s]+\.(?:pdf|docx?|xlsx?|png|jpe?g|zip)\b/giu, "[REDACTED]")
    .replace(
      /\b(?:qr\s*code|anonymous\s+identity)\b|工号|二维码|匿名身份|内网|文件/giu,
      "[REDACTED]",
    );
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
    await this.audit.appendOutbox({
      eventType: "analytics.assistant.requested",
      aggregateType: "assistant",
      aggregateId: actor.sessionId,
      payload: { metricKey: providerRequest.context.metricKey ?? null },
      idempotencyKey: `analytics.assistant.requested:${actor.sessionId}:${Date.now()}`,
    });
    try {
      await this.analyticsEvents?.record(actor, {
        eventName: "assistant_requested",
        aggregateType: "assistant",
        aggregateId: actor.sessionId,
        occurredAt: new Date().toISOString(),
        idempotencyKey: `assistant-requested:${actor.sessionId}:${Date.now()}`,
        metadata: {
          metricKey: String(providerRequest.context.metricKey ?? ""),
        },
      });
    } catch {
      // Telemetry must not prevent an authorized request from reaching Dify.
    }
    try {
      const response = await this.provider.ask(providerRequest);
      await this.audit.recordAudit({
        actorEmployeeId: actor.employeeId,
        action: "analytics.assistant.completed",
        details: { providerRequestId: response.providerRequestId ?? null },
      });
      await this.audit.appendOutbox({
        eventType: "analytics.assistant.completed",
        aggregateType: "assistant",
        aggregateId: actor.sessionId,
        payload: { providerRequestId: response.providerRequestId ?? null },
        idempotencyKey: `analytics.assistant.completed:${actor.sessionId}:${Date.now()}`,
      });
      return { status: "ok", answer: response.answer };
    } catch (error) {
      try {
        await this.audit.recordAudit({
          actorEmployeeId: actor.employeeId,
          action: "analytics.assistant.failed",
          details: {
            code: error instanceof Error ? error.message : "DIFY_FAILED",
          },
        });
      } catch {
        // Preserve the local fallback when audit storage is unavailable.
      }
      try {
        await this.audit.appendOutbox({
          eventType: "analytics.assistant.failed",
          aggregateType: "assistant",
          aggregateId: actor.sessionId,
          payload: {
            code: error instanceof Error ? error.message : "DIFY_FAILED",
          },
          idempotencyKey: `analytics.assistant.failed:${actor.sessionId}:${Date.now()}`,
        });
      } catch {
        // Preserve the local fallback when the post-failure boundary is down.
      }
      try {
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
      } catch {
        // Preserve the local fallback even when telemetry is unavailable.
      }
      return { status: "degraded", answer: FALLBACK_ANSWER };
    }
  }
}
