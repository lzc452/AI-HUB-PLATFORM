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
    .replace(
      /\b(?:E\d{3,}|employee[-_ ]?(?:number|id)?[-_ ]?\d+|staff[-_ ]?(?:number|id)?[-_ ]?\d+|user[-_ ]?(?:number|id)?[-_ ]?\d+)\b/giu,
      "[REDACTED]",
    )
    .replace(
      /(?:employee|staff|user)\s*(?:number|id)?\s*[:#-]?\s*[A-Z]?\d{2,}/giu,
      "[REDACTED]",
    )
    .replace(/(?:https?|ftp|data):[^\s]+/giu, "[REDACTED]")
    .replace(/(?:[A-Z]:\\|\\\\|\/)[^\s]+/gu, "[REDACTED]")
    .replace(/\b[^\s]+\.(?:pdf|docx?|xlsx?|png|jpe?g|zip)\b/giu, "[REDACTED]")
    .replace(
      /\b(?:[a-z0-9-]+\.)*(?:intranet|internal|corp|localhost|local)(?:\.[a-z]{2,})?\b/giu,
      "[REDACTED]",
    )
    .replace(
      /\u5de5\u53f7|\u5458\u5de5\u53f7|\u4e8c\u7ef4\u7801|\u533f\u540d\u8eab\u4efd|\u5185\u7f51|\u6587\u4ef6/gu,
      "[REDACTED]",
    )
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
    try {
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
    } catch {
      // 遥测不可用时，提供商仍保持在授权边界之后。
    }
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
      // 遥测不得阻止已授权请求到达 Dify。
    }
    try {
      const response = await this.provider.ask(providerRequest);
      try {
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
      } catch {
        // 本地遥测不可用时，提供商的成功响应仍保持成功。
      }
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
        // 审计存储不可用时保留本地降级。
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
        // 失败后边界不可用时保留本地降级。
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
        // 即使遥测不可用也保留本地降级。
      }
      return { status: "degraded", answer: FALLBACK_ANSWER };
    }
  }
}
