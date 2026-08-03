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

describe("DingTalk notification matrix", () => {
  it("defines every fixed Phase 3-6 work notification scenario", () => {
    expect(Object.keys(DINGTALK_NOTIFICATION_MATRIX)).toEqual([
      "application.review_requested",
      "application.review_decided",
      "application.published",
      "application.withdrawn",
      "demand.submitted",
      "demand.claimed",
      "demand.collaborator_assigned",
      "demand.progress_updated",
      "demand.pilot_started",
      "demand.closed",
      "demand.merged",
      "analytics.export.completed",
      "analytics.export.failed",
      "analytics.assistant.failed",
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
      12,
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
});
