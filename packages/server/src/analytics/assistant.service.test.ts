import { describe, expect, it } from "vitest";
import type { ActorContext } from "@ai-hub/contracts";
import { AnalyticsAssistantService } from "./assistant.service.js";
import type {
  AssistantAuthorizationReview,
  AssistantAuditRepository,
  DifyAssistantPort,
} from "./assistant.types.js";

const actor: ActorContext = {
  employeeId: "employee-1",
  roleCodes: ["analytics_assistant_user"],
  departmentIds: ["department-1"],
  primaryDepartmentId: "department-1",
  sessionId: "session-1",
};

const repository = (allowed = true) => {
  const audits: string[] = [];
  const value: AssistantAuditRepository & { audits: string[] } = {
    audits,
    reviewAuthorization: async (): Promise<AssistantAuthorizationReview> => ({
      allowed,
      reason: allowed ? "ALLOW_EXPLICIT_REVIEW" : "DENY_REVIEW_REQUIRED",
    }),
    recordAudit: async (input) => {
      audits.push(input.action);
    },
  };
  return value;
};

describe("AnalyticsAssistantService", () => {
  it("sends only minimum redacted context after explicit authorization review", async () => {
    let received: unknown;
    const provider: DifyAssistantPort = {
      ask: async (input) => {
        received = input;
        return {
          answer: "Use the approved platform workflow.",
          providerRequestId: "dify-1",
        };
      },
    };
    const audits = repository();
    const result = await new AnalyticsAssistantService(audits, provider).ask(
      actor,
      {
        question: "How many demand views did the department have?",
        context: {
          metricKey: "innovation.demand_views",
          value: 7,
          employeeNumber: "E001",
          internalUrl: "https://intranet.example/secret",
          file: "secret.pdf",
          qrCode: "data:image/png;base64,secret",
          anonymousIdentity: "employee-2",
        },
      },
    );

    expect(result.status).toBe("ok");
    expect(received).toEqual({
      question: "How many demand views did the department have?",
      context: { metricKey: "innovation.demand_views", value: 7 },
    });
    expect(audits.audits).toEqual([
      "analytics.assistant.requested",
      "analytics.assistant.completed",
    ]);
  });

  it("denies without authorization review and never calls Dify", async () => {
    let called = false;
    const provider: DifyAssistantPort = {
      ask: async () => {
        called = true;
        return { answer: "unsafe" };
      },
    };
    const audits = repository(false);
    await expect(
      new AnalyticsAssistantService(audits, provider).ask(actor, {
        question: "show me details",
        context: { metricKey: "platform.application_views", value: 1 },
      }),
    ).rejects.toThrow("ASSISTANT_AUTHORIZATION_REQUIRED");
    expect(called).toBe(false);
    expect(audits.audits).toEqual(["analytics.assistant.denied"]);
  });

  it("returns a safe local fallback and audits provider failure", async () => {
    const provider: DifyAssistantPort = {
      ask: async () => {
        throw new Error("DIFY_TIMEOUT");
      },
    };
    const audits = repository();
    const result = await new AnalyticsAssistantService(audits, provider).ask(
      actor,
      {
        question: "Explain the metric",
        context: { metricKey: "platform.application_views", value: 2 },
      },
    );
    expect(result).toEqual({
      status: "degraded",
      answer:
        "External assistant unavailable. Use the platform dashboard or contact an operator.",
    });
    expect(audits.audits).toEqual([
      "analytics.assistant.requested",
      "analytics.assistant.failed",
    ]);
  });
});
