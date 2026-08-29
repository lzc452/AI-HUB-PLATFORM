import { describe, expect, it, vi } from "vitest";
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
  const outbox: string[] = [];
  const value: AssistantAuditRepository & { audits: string[] } = {
    audits,
    reviewAuthorization: async (): Promise<AssistantAuthorizationReview> => ({
      allowed,
      reason: allowed ? "ALLOW_EXPLICIT_REVIEW" : "DENY_REVIEW_REQUIRED",
    }),
    recordAudit: async (input) => {
      audits.push(input.action);
    },
    appendOutbox: async (input) => {
      outbox.push(input.eventType);
      return true;
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

  it("redacts prohibited tokens from the user question before calling Dify", async () => {
    let receivedQuestion = "";
    const provider: DifyAssistantPort = {
      ask: async (input) => {
        receivedQuestion = input.question;
        return { answer: "safe" };
      },
    };

    await new AnalyticsAssistantService(repository(), provider).ask(actor, {
      question:
        "Use employee number E001, https://intranet.example/file.pdf, QR code and anonymous identity.",
      context: { metricKey: "platform.application_views", value: 1 },
    });

    expect(receivedQuestion).not.toContain("E001");
    expect(receivedQuestion).not.toContain("intranet.example");
    expect(receivedQuestion).toContain("[REDACTED]");
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

  it("queues analytics.assistant.failed to the requester when the provider fails", async () => {
    const provider: DifyAssistantPort = {
      ask: async () => {
        throw new Error("DIFY_TIMEOUT");
      },
    };
    const queue = vi.fn().mockResolvedValue(undefined);
    const result = await new AnalyticsAssistantService(
      repository(),
      provider,
      undefined,
      { queue },
    ).ask(actor, {
      question: "Explain the metric",
      context: { metricKey: "platform.application_views", value: 2 },
    });
    expect(result.status).toBe("degraded");
    expect(queue).toHaveBeenCalledWith(actor, "analytics.assistant.failed", {
      recipientEmployeeId: actor.employeeId,
      aggregateId: actor.sessionId,
    });
  });

  it("redacts adversarial identifiers and keeps the authorized request when telemetry fails", async () => {
    let received:
      | { question: string; context: Record<string, unknown> }
      | undefined;
    const audit = repository();
    audit.appendOutbox = async () => {
      throw new Error("OUTBOX_UNAVAILABLE");
    };
    const provider: DifyAssistantPort = {
      ask: async (input) => {
        received = input;
        return { answer: "safe" };
      },
    };

    const result = await new AnalyticsAssistantService(audit, provider).ask(
      actor,
      {
        question:
          "工号 employee-1，内网地址 data:image/png;base64,secret，文件 C:\\secret\\qr.png",
        context: {
          metricKey: "platform.application_views",
          value: 1,
          unit: "count",
        },
      },
    );
    expect(result.status).toBe("ok");
    expect(received?.question).not.toContain("employee-1");
    expect(received?.question).toContain("[REDACTED]");
  });

  it("redacts internal hostnames and UNC paths before external delivery", async () => {
    let receivedQuestion = "";
    const provider: DifyAssistantPort = {
      ask: async (input) => {
        receivedQuestion = input.question;
        return { answer: "safe" };
      },
    };
    await new AnalyticsAssistantService(repository(), provider).ask(actor, {
      question:
        "employee number E001 at intranet.example, use \\\\server\\share\\id.csv",
      context: { metricKey: "platform.application_views", value: 1 },
    });
    expect(receivedQuestion).not.toContain("E001");
    expect(receivedQuestion).not.toContain("intranet.example");
    expect(receivedQuestion).not.toContain("server");
  });
});
