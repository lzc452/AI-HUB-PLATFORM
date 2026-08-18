import { describe, expect, it, vi } from "vitest";
import {
  createArtifactVerificationFailedNotificationHandler,
  createOutboxHandlers,
  outboxHandlers,
  systemProbeRequestedHandler,
} from "./worker.module.js";

describe("worker outbox handlers", () => {
  it("registers the infrastructure probe handler and it resolves", async () => {
    expect(Object.keys(outboxHandlers)).toEqual(["system.probe.requested"]);
    expect(outboxHandlers["system.probe.requested"]).toBe(
      systemProbeRequestedHandler,
    );

    await expect(
      systemProbeRequestedHandler({
        id: "event-1",
        eventType: "system.probe.requested",
        aggregateType: "system",
        aggregateId: "probe",
        payload: {},
        idempotencyKey: "probe-1",
        attempts: 1,
      }),
    ).resolves.toBeUndefined();
  });

  it("registers the post-Outbox DingTalk notification handler", () => {
    const handlers = createOutboxHandlers({} as never);
    expect(handlers["notification.created"]).toBeTypeOf("function");
  });

  it("notifies the uploader when artifact verification fails", async () => {
    const createForEvent = vi.fn().mockResolvedValue({ notificationId: "n-1" });
    const handler = createArtifactVerificationFailedNotificationHandler(
      { createForEvent } as never,
      {
        findArtifactUpload: async () => ({
          applicationId: "app-1",
          uploadedByEmployeeId: "E100",
        }),
      } as never,
    );

    await handler({
      id: "event-1",
      eventType: "artifact.verification.failed",
      aggregateType: "application",
      aggregateId: "app-1",
      payload: {
        applicationId: "app-1",
        details: { uploadId: "upload-1", errorCode: "MALWARE_DETECTED" },
      },
      idempotencyKey: "artifact.verification.failed:app-1",
      attempts: 1,
    });

    expect(createForEvent).toHaveBeenCalledWith(
      expect.objectContaining({ employeeId: "system-artifact-verification" }),
      expect.objectContaining({
        recipientEmployeeId: "E100",
        eventType: "artifact.verification.failed",
        aggregateId: "app-1",
        message: "安装包 app-1 校验失败：MALWARE_DETECTED。",
        metadata: {
          notificationScenario: "artifact.verification.failed",
          recipientRole: "artifact_uploader",
          actorEmployeeId: "system-artifact-verification",
        },
      }),
    );
  });

  it("skips the notification when the upload id is missing or the upload is gone", async () => {
    const createForEvent = vi.fn();
    const handler = createArtifactVerificationFailedNotificationHandler(
      { createForEvent } as never,
      {
        findArtifactUpload: async () => null,
      } as never,
    );
    const base = {
      eventType: "artifact.verification.failed",
      aggregateType: "application",
      aggregateId: "app-1",
      attempts: 1,
    };

    await handler({ ...base, id: "e-1", payload: {}, idempotencyKey: "k-1" });
    await handler({
      ...base,
      id: "e-2",
      payload: { details: { uploadId: "upload-missing", errorCode: "X" } },
      idempotencyKey: "k-2",
    });

    expect(createForEvent).not.toHaveBeenCalled();
  });

  it("registers the artifact failure notification handler when provided", () => {
    const handlers = createOutboxHandlers(
      {} as never,
      undefined,
      undefined,
      async () => undefined,
    );
    expect(handlers["artifact.verification.failed"]).toBeTypeOf("function");
  });

  it("exposes a retention runner for the worker schedule", async () => {
    const { createRetentionRunner } = await import("./worker.module.js");
    let calls = 0;
    const runner = createRetentionRunner({
      run: async () => {
        calls += 1;
        return { deleted: 2 };
      },
    });
    await expect(runner()).resolves.toEqual({ deleted: 2 });
    expect(calls).toBe(1);
  });
});
