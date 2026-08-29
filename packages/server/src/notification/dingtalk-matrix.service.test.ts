import { describe, expect, it, vi } from "vitest";
import type { ActorContext } from "@ai-hub/contracts";
import {
  DINGTALK_NOTIFICATION_MATRIX,
  DingTalkNotificationMatrixService,
} from "./dingtalk-matrix.service.js";

const actor: ActorContext = {
  employeeId: "employee-1",
  roleCodes: ["employee"],
  departmentIds: ["department-1"],
  primaryDepartmentId: "department-1",
  sessionId: "session-1",
};

const EMITTED_EVENTS = [
  "application.review.requested",
  "application.review.decided",
  "application.review.sla.reminder",
  "application.review.sla.overdue",
  "application.published",
  "application.withdrawn",
  "application.withdraw.requested",
  "artifact.verification.failed",
  "demand.submitted",
  "demand.reviewed",
  "demand.claimed",
  "demand.collaborator_assigned",
  "demand.progress_updated",
  "demand.pilot_started",
  "demand.closed",
  "demand.merged",
  "analytics.export.completed",
  "analytics.export.failed",
  "analytics.assistant.failed",
  "interaction.report.resolved",
];

describe("DingTalk notification matrix", () => {
  it("matrix keys match emitted outbox event names", () => {
    for (const event of EMITTED_EVENTS) {
      expect(DINGTALK_NOTIFICATION_MATRIX).toHaveProperty(event);
    }
  });

  it("defines every fixed Phase 3-6 work notification scenario", () => {
    expect(Object.keys(DINGTALK_NOTIFICATION_MATRIX)).toEqual([
      "application.review.requested",
      "application.review.decided",
      "application.review.claim_expired",
      "application.review.sla.reminder",
      "application.review.sla.overdue",
      "application.published",
      "application.withdrawn",
      "application.withdraw.requested",
      "demand.submitted",
      "demand.reviewed",
      "demand.claimed",
      "demand.collaborator_assigned",
      "demand.progress_updated",
      "demand.pilot_started",
      "demand.closed",
      "demand.merged",
      "artifact.verification.failed",
      "analytics.export.completed",
      "analytics.export.failed",
      "analytics.assistant.failed",
      "interaction.report.resolved",
    ]);
    for (const entry of Object.values(DINGTALK_NOTIFICATION_MATRIX)) {
      expect(entry.recipientRole.length).toBeGreaterThan(0);
      expect(entry.messageTemplate).not.toMatch(
        /employeeNumber|internalUrl|file|qrCode|anonymousIdentity/u,
      );
    }
  });

  it("queues each scenario through the notification service boundary", async () => {
    const createForEvent = vi.fn().mockResolvedValue({
      notificationId: "notification-1",
    });
    const service = new DingTalkNotificationMatrixService(
      {
        createForEvent,
      },
      async () => true,
    );

    for (const scenario of Object.keys(DINGTALK_NOTIFICATION_MATRIX)) {
      await service.queue(
        actor,
        scenario as keyof typeof DINGTALK_NOTIFICATION_MATRIX,
        {
          recipientEmployeeId: "employee-2",
          aggregateId: `aggregate-${scenario}`,
          variables: { title: "Phase 6", count: 2, target: "platform" },
        },
      );
    }

    expect(createForEvent).toHaveBeenCalledTimes(
      Object.keys(DINGTALK_NOTIFICATION_MATRIX).length,
    );
    expect(createForEvent).toHaveBeenNthCalledWith(
      18,
      actor,
      expect.objectContaining({
        recipientEmployeeId: "employee-2",
        eventType: "analytics.export.completed",
        aggregateId: "aggregate-analytics.export.completed",
        message: expect.stringContaining("platform"),
        metadata: {
          notificationScenario: "analytics.export.completed",
          recipientRole: "export_requester",
          actorEmployeeId: "employee-1",
        },
      }),
    );
  });

  it("rejects missing recipients and sensitive template variables before queueing", async () => {
    const createForEvent = vi.fn();
    const service = new DingTalkNotificationMatrixService(
      { createForEvent },
      async () => true,
    );

    await expect(
      service.queue(actor, "analytics.export.completed", {
        recipientEmployeeId: "",
        aggregateId: "export-1",
      }),
    ).rejects.toThrow("NOTIFICATION_RECIPIENT_REQUIRED");
    await expect(
      service.queue(actor, "analytics.export.completed", {
        recipientEmployeeId: "employee-2",
        aggregateId: "export-1",
        variables: { internalUrl: "http://internal" },
      }),
    ).rejects.toThrow("NOTIFICATION_TEMPLATE_VARIABLE_FORBIDDEN");
    expect(createForEvent).not.toHaveBeenCalled();
  });

  it("passes an optional payload through to createForEvent", async () => {
    const createForEvent = vi.fn().mockResolvedValue({
      notificationId: "notification-1",
    });
    const service = new DingTalkNotificationMatrixService(
      { createForEvent },
      async () => true,
    );
    const payload = {
      title: "导出完成",
      body: "平台分析导出已就绪",
      detail: { rowCount: 3 },
      deepLink: "/analytics/exports/export-1",
    };

    await service.queue(actor, "analytics.export.completed", {
      recipientEmployeeId: "employee-2",
      aggregateId: "export-1",
      payload,
    });

    expect(createForEvent).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({
        recipientEmployeeId: "employee-2",
        eventType: "analytics.export.completed",
        aggregateId: "export-1",
        payload,
      }),
    );
  });

  it("omits payload from createForEvent when not provided (service default applies)", async () => {
    const createForEvent = vi.fn().mockResolvedValue({
      notificationId: "notification-1",
    });
    const service = new DingTalkNotificationMatrixService(
      { createForEvent },
      async () => true,
    );

    await service.queue(actor, "application.published", {
      recipientEmployeeId: "employee-2",
      aggregateId: "app-1",
    });

    const [, input] = createForEvent.mock.calls[0] as [
      unknown,
      Record<string, unknown>,
    ];
    expect(input.payload).toBeUndefined();
  });
});
